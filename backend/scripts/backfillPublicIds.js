import mongoose from "mongoose";
import dotenv from "dotenv";
import { User } from "../models/user.model.js";
import { generatePublicId } from "../utils/generatePublicId.js";

dotenv.config();

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);

  const usersWithoutPublicId = await User.find({
    $or: [{ publicId: { $exists: false } }, { publicId: null }],
  });

  console.log(`Found ${usersWithoutPublicId.length} users needing a Public ID`);

  for (const user of usersWithoutPublicId) {
    user.publicId = await generatePublicId();
    await user.save();
    console.log(`  ${user.email} -> ${user.publicId}`);
  }

  console.log("Backfill complete.");
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
