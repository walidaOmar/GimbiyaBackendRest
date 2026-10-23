import crypto from "crypto";
import { User } from "../models/user.model.js";

/**
 * Generates a collision-safe Gimbiya Public ID in the format GM-XXXXXXXX
 * (8 digits, zero-padded). Retries on the rare collision instead of trusting
 * randomness alone — required since this is a user-facing identifier.
 */
export const generatePublicId = async () => {
  const MAX_ATTEMPTS = 5;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const randomDigits = crypto.randomInt(10000000, 100000000);
    const candidate = `GM-${randomDigits}`;

    const existing = await User.exists({ publicId: candidate });
    if (!existing) return candidate;
  }

  throw new Error("Failed to generate a unique Public ID after multiple attempts");
};
