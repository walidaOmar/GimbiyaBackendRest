import bcryptjs from "bcryptjs";
import { z } from "zod";
import { User } from "../models/user.model.js";
import { Business } from "../models/business.model.js";
import { connectDB } from "../db/connectDB.js";
import { google } from "googleapis";
import dotenv from "dotenv";

dotenv.config();

export const manualOnboardingRowSchema = z.object({
  timestamp: z.string().optional().default(""),
  userId: z.string().optional().default(""),
  email: z.string().email().transform((value) => value.toLowerCase()),
  name: z.string().min(1),
  storeName: z.string().min(1),
  assignedState: z.enum(["Ado bayero mall", "Tafawa balewa refinery", "Sardauna market"]),
  segment: z.string().min(1),
  phone: z.string().optional().default(""),
  onboardedBy: z.string().optional().default("manual"),
  kycStatus: z.string().optional().default("APPROVED"),
});

export const parseManualOnboardingRows = (rows) => rows.map((row, index) => {
  const values = Object.fromEntries(["timestamp", "userId", "email", "name", "storeName", "assignedState", "segment", "phone", "onboardedBy", "kycStatus"].map((key, column) => [key, row[column]]));
  const result = manualOnboardingRowSchema.safeParse(values);
  return result.success ? { index, data: result.data } : { index, error: result.error.flatten() };
});

export async function ingest(rows) {
  const parsed = parseManualOnboardingRows(rows);
  const seen = new Set();
  const results = [];
  for (const item of parsed) {
    if (item.error) { results.push({ index: item.index, status: "invalid", error: item.error }); continue; }
    if (seen.has(item.data.email) || await User.exists({ email: item.data.email })) { results.push({ index: item.index, status: "duplicate" }); continue; }
    const password = await bcryptjs.hash(process.env.DEFAULT_SEED_PASSWORD || "ChangeMe123!", 12);
    const user = await User.create({ email: item.data.email, password, name: item.data.name, phone: item.data.phone, role: "business_owner", assignedState: item.data.assignedState, isVerified: true, isActive: true, kycStatus: item.data.kycStatus, onboardingSource: "manual" });
    await Business.create({ name: item.data.storeName, email: item.data.email, ownerId: user._id, assignedState: item.data.assignedState, segment: item.data.segment, isApproved: true });
    seen.add(item.data.email);
    results.push({ index: item.index, status: "created", email: item.data.email });
  }
  return results;
}

if (process.argv[1]?.endsWith("ingestManualOnboarding.js")) {
  const auth = new google.auth.GoogleAuth({ credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON), scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const sheets = google.sheets({ version: "v4", auth });
  await connectDB();
  const response = await sheets.spreadsheets.values.get({ spreadsheetId: process.env.GOOGLE_SPREADSHEET_ID_ONBOARDING, range: "MasterOnboarding!A2:J" });
  const results = await ingest(response.data.values || []);
  console.log(JSON.stringify(results));
  process.exit(0);
}