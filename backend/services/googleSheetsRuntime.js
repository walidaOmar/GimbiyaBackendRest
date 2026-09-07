import fs from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";

const MAX_BATCH_ROWS = 500;
const pendingDir = () => process.env.PENDING_SHEETS_SYNC_DIR || "/workspace/scratch/pending_sheets_sync/";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class GoogleSheetsService {
  constructor({ sheetsClient } = {}) { this.sheetsClient = sheetsClient; this.queue = []; this.flushing = null; this.lastRequestAt = 0; }
  getClient() {
    if (this.sheetsClient) return this.sheetsClient;
    const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "null");
    if (!credentials) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured");
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets"] });
    this.sheetsClient = google.sheets({ version: "v4", auth });
    return this.sheetsClient;
  }
  async appendRow(spreadsheetId, range, values) { this.queue.push({ spreadsheetId, range, values: [values] }); return this.flush(); }
  async flush() {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      try {
        while (this.queue.length) {
          const batch = this.queue.splice(0, MAX_BATCH_ROWS);
          for (const payload of batch) {
            const delay = Math.max(0, 1000 - (Date.now() - this.lastRequestAt));
            if (delay) await sleep(delay);
            try {
              await this.getClient().spreadsheets.values.append({ spreadsheetId: payload.spreadsheetId, range: payload.range, valueInputOption: "USER_ENTERED", insertDataOption: "INSERT_ROWS", requestBody: { values: payload.values } });
              this.lastRequestAt = Date.now();
            } catch (error) {
              await this.persistPending(payload, error);
              throw error;
            }
          }
        }
      } finally { this.flushing = null; }
    })();
    return this.flushing;
  }
  async persistPending(payload, error) {
    const directory = pendingDir();
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, `${Date.now()}-${Math.random().toString(16).slice(2)}.json`), JSON.stringify({ ...payload, error: error.message }));
  }
  async recoverPending() {
    let files;
    try { files = await fs.readdir(pendingDir()); } catch (error) { if (error.code === "ENOENT") return 0; throw error; }
    let count = 0;
    for (const file of files.filter((item) => item.endsWith(".json")).sort()) {
      const filename = path.join(pendingDir(), file);
      const payload = JSON.parse(await fs.readFile(filename, "utf8"));
      try { await this.appendRow(payload.spreadsheetId, payload.range, payload.values[0]); await fs.unlink(filename); count += 1; } catch { break; }
    }
    return count;
  }
  startRecoveryCron(intervalMs = 60_000) { const timer = setInterval(() => this.recoverPending().catch((error) => console.error("[GoogleSheets recovery]", error.message)), intervalMs); timer.unref?.(); return timer; }
}

export const googleSheetsService = new GoogleSheetsService();
