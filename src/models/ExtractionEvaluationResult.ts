// src/models/ExtractionEvaluationResult.ts

import mongoose, { Schema, Document } from "mongoose";

export interface ExtractionEvaluationResultItem {
  evaluation_item_index: number; // Index item dalam bundle
  extracted_information: string | number | string[]; // Array string atau number
  is_match: boolean;
  timestamp: Date;
}

export interface ExtractionEvaluationResult extends Document {
  evaluation_bundle_id: mongoose.Types.ObjectId; // Referensi ke bundle data evaluasi
  items: ExtractionEvaluationResultItem[]; // Array of ExtractionEvaluationResultItem
  metadata: {
    total_items: number; // Total items dalam bundle
    matched_items: number; // Total item yang is_match == true
    match_percentage: number; // Persentase data yang cocok
  };
  created_at: Date;
  updated_at: Date;
}

const ExtractionEvaluationResultSchema = new Schema<ExtractionEvaluationResult>(
  {
    evaluation_bundle_id: {
      type: Schema.Types.ObjectId,
      ref: "ExtractionEvaluationBundle",
      required: true,
    },
    items: [
      {
        evaluation_item_index: { type: Number, required: true },
        extracted_information: { type: Schema.Types.Mixed, required: true },
        is_match: { type: Boolean, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
    metadata: {
      total_items: { type: Number, default: 0 },
      matched_items: { type: Number, default: 0 },
      match_percentage: { type: Number, default: 0 },
    },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
  }
);

export default mongoose.model<ExtractionEvaluationResult>(
  "ExtractionEvaluationResult",
  ExtractionEvaluationResultSchema
);
