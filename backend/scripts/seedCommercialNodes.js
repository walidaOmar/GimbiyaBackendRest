import mongoose from "mongoose";
import dotenv from "dotenv";
import { CommercialNode } from "../models/commercialNode.model.js";

dotenv.config();

const NODES = [
  {
    key: "Ado bayero mall",
    name: "Ado Bayero Mall",
    region: "North West",
    state: "Kano",
    market: "Ado Bayero Mall",
  },
  {
    key: "Tafawa balewa refinery",
    name: "Tafawa Balewa Refinery",
    region: "North West",
    state: "Kaduna",
    market: "Tafawa Balewa Refinery",
  },
  {
    key: "Sardauna market",
    name: "Sardauna Market",
    region: "North West",
    state: "Kaduna",
    market: "Sardauna Market",
  },
];

const run = async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  for (const node of NODES) {
    await CommercialNode.updateOne({ key: node.key }, { $setOnInsert: node }, { upsert: true });
    console.log("ensured node:", node.key);
  }
  await mongoose.disconnect();
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
