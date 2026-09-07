import fs from "node:fs/promises";
import path from "node:path";
import { google } from "googleapis";

const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];
const MAX_BATCH_ROWS = 500;
const MIN_REQUEST_INTERVAL_MS = 1000;

const pendingDir = () => process.env.PENDING_SHEETS_SYNC_DIR || "/workspace/scratch/pending_sheets_sync/";

const parseCredentials = () => {
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not configured");
  return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
};

export class GoogleSheetsService {
  constructor({ sheetsClient, clock = () => Date.now(), sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) } = {}) {
    this.sheetsClient = sheetsClient;
    this.clock = clock;
    this.sleep = sleep;
    this.queue = [];
    this.lastRequestAt = 0;
    this.flushing = null;
  }

  getClient() {
    if (this.sheetsClient) return this.sheetsClient;
    const auth = new google.auth.GoogleAuth({ credentials: parseCredentials(), scopes: SCOPES });
    this.sheetsClient = google.sheets({ version: "v4", auth });
    return this.sheetsClient;
  }

  async appendRow(spreadsheetId, range, values) {
    const payload = { spreadsheetId, range, values: [values] };
    this.queue.push(payload);
    await this.flush();
  }

  async flush() {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      try {
        while (this.queue.length) {
          const batch = this.queue.splice(0, MAX_BATCH_ROWS);
          for (const payload of batch) {
            const waitMs = Math.max(0, MIN_REQUEST_INTERVAL_MS - (this.clock() - this.lastRequestAt));
            if (waitMs) await this.sleep(waitMs);
            try {
              await this.getClient().spreadsheets.values.append({
                spreadsheetId: payload.spreadsheetId,
                range: payload.range,
                valueInputOption: "USER_ENTERED",
                insertDataOption: "INSERT_ROWS",
                requestBody: { values: payload.values },
              });
              this.lastRequestAt = this.clock();
            } catch (error) {
              await this.persistPending(payload, error);
              throw error;
            }
          }
        }
      } finally {
        this.flushing = null;
      }
    })();
    return this.flushing;
  }

  async persistPending(payload, error) {
    const directory = pendingDir();
    await fs.mkdir(directory, { recursive: true });
    const filename = `${Date.now()}-${Math.random().toString(16).slice(2)}.json`;
    await fs.writeFile(path.join(directory, filename), JSON.stringify({ ...payload, error: error.message }));
  }

  async recoverPending() {
    const directory = pendingDir();
    let files;
    try { files = await fs.readdir(directory); } catch (error) {
      if (error.code === "ENOENT") return 0;
      throw error;
    }
    let recovered = 0;
    for (const file of files.filter((name) => name.endsWith(".json")).sort()) {
      const filename = path.join(directory, file);
      const payload = JSON.parse(await fs.readFile(filename, "utf8"));
      try {
        await this.appendRow(payload.spreadsheetId, payload.range, payload.values[0]);
        await fs.unlink(filename);
        recovered += 1;
      } catch (error) {
        break;
      }
    }
    return recovered;
  }

  startRecoveryCron(intervalMs = 60_000) {
    const timer = setInterval(() => this.recoverPending().catch((error) => console.error("[GoogleSheets recovery]", error.message)), intervalMs);
    timer.unref?.();
    return timer;
  }
}

export const googleSheetsService = new GoogleSheetsService();
