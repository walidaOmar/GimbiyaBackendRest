import mongoose from "mongoose";

const commercialNodeSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    name: { type: String, required: true, trim: true },
    region: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    market: { type: String, required: true, trim: true },
    floors: { type: [String], default: ["LEVEL_1", "LEVEL_2"] },
    industryCategories: { type: [String], default: [] },
    operatingHours: {
      open: { type: String, default: "08:00" },
      close: { type: String, default: "18:00" },
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

commercialNodeSchema.index({ region: 1, state: 1, market: 1 });

export const CommercialNode = mongoose.model("CommercialNode", commercialNodeSchema);
