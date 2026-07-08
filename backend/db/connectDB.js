import mongoose from "mongoose";

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set in environment variables");

  const MAX_RETRIES  = 5;
  const RETRY_DELAY  = 3000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 8000,
        socketTimeoutMS: 45000,
      });
      console.log("[MongoDB] Connected successfully to Atlas.");
      return;
    } catch (err) {
      if (attempt === MAX_RETRIES) {
        console.error(`[MongoDB] Failed after ${MAX_RETRIES} attempts. Exiting.`);
        process.exit(1);
      }
      console.warn(`[MongoDB] Attempt ${attempt} failed. Retrying in ${RETRY_DELAY}ms...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY));
    }
  }
}
