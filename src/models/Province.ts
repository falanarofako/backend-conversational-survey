// src/models/Province.ts

import mongoose, { Schema, Document } from "mongoose";

// Define interfaces
export interface Regency {
  code: string;
  name: string;
}

export interface IProvince extends Document {
  name: string;
  code: string;
  regencies: Regency[];
}

// Define schema
const RegencySchema = new Schema({
  code: { type: String, required: true },
  name: { type: String, required: true }
});

const ProvinceSchema = new Schema({
  name: { type: String, required: true },
  // Remove "index: true" here since we'll define indexes separately
  code: { type: String, required: true, unique: true },
  regencies: [RegencySchema]
}, { timestamps: true });

// Add indexes - define them only once
// Don't use both schema.index() and index: true in the field definition
ProvinceSchema.index({ name: 1 });
// Don't add this if you have index: true in the code field definition above
// ProvinceSchema.index({ code: 1 });

// Create and export the model
// We use mongoose.models.Province || to handle hot reloading in development
const Province = mongoose.models.Province || mongoose.model<IProvince>('Province', ProvinceSchema);

export default Province;