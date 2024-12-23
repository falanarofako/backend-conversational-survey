// src/models/EvaluationMetric.ts

import mongoose, { Schema, Document } from "mongoose";

interface EvaluationMetric extends Document {
  accuracy: number;
  precision: Record<string, number>;
  recall: Record<string, number>;
  f1Score: Record<string, number>;
  timestamp: Date;
}

const EvaluationMetricSchema = new Schema<EvaluationMetric>({
  accuracy: { type: Number, required: true },
  precision: { type: Map, of: Number, required: true },
  recall: { type: Map, of: Number, required: true },
  f1Score: { type: Map, of: Number, required: true },
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.model<EvaluationMetric>("EvaluationMetric", EvaluationMetricSchema);
