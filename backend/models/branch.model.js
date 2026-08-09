import mongoose from "mongoose";

const branchSchema = new mongoose.Schema(
  {
    storeId:        { type: mongoose.Schema.Types.ObjectId, ref: "Store", required: true, index: true },
    branchName:     { type: String, required: true, trim: true },

    assignedState:  { type: String, enum: ["Ado bayero mall", "Tafawa balewa refinery", "Sardauna market"], required: true },
    buildingFloor:  { type: String, enum: ["LEVEL_1", "LEVEL_2"], required: true },

    managerId:      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    stockManagerId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    isActive:       { type: Boolean, default: true },
  },
  { timestamps: true }
);

branchSchema.index({ storeId: 1, assignedState: 1 });

export const Branch = mongoose.model("Branch", branchSchema);
