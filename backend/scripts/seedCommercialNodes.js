import mongoose from "mongoose";
import dotenv from "dotenv";
import { CommercialNode } from "../models/commercialNode.model.js";

dotenv.config();

// Pilot geography. Safe to run more than once: it also corrects nodes created earlier with the wrong city.
const NODES = [
  {
    key: "Ado bayero mall",
    name: "Ado Bayero Mall",
    region: "North West",
    state: "Kano",
    market: "Ado Bayero Mall",
    floors: ["LEVEL_1"],
    industryCategories: ["Premium retail", "Dining", "Professional services"],
  },
  {
    key: "Tafawa balewa refinery",
    name: "Tafawa Balewa Refinery",
    region: "North Central",
    state: "Abuja",
    market: "Tafawa Balewa Refinery",
    floors: ["LEVEL_2"],
    industryCategories: ["Heavy processing", "Logistics hubs", "Energy"],
  },
  {
    key: "Sardauna market",
    name: "Sardauna Market",
    region: "North West",
    state: "Kaduna",
    market: "Sardauna Market",
    floors: ["LEVEL_1", "LEVEL_2"],
    industryCategories: ["High-velocity consumer goods", "Traditional retail", "B2B wholesaling"],
  },
];

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  for (const { key, ...fields } of NODES) {
    await CommercialNode.updateOne({ key }, { $set: fields, $setOnInsert: { key, isActive: true } }, { upsert: true });
    console.log("ensured node:", key, "->", fields.state);
  }
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
