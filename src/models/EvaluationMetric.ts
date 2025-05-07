// src/models/EvaluationMetric.ts

import mongoose, { Schema, Document } from "mongoose";

interface ConfusionMatrix {
  matrix: number[][];
  labels: string[];
}

interface EvaluationMetric extends Document {
  accuracy: number;
  precision: Record<string, number>;
  recall: Record<string, number>;
  f1Score: Record<string, number>;
  confusionMatrix: ConfusionMatrix; // Tambahkan field confusionMatrix
  timestamp: Date;
}

const ConfusionMatrixSchema = new Schema<ConfusionMatrix>({
  matrix: { type: [[Number]], required: true },
  labels: { type: [String], required: true },
});

const EvaluationMetricSchema = new Schema<EvaluationMetric>({
  accuracy: { type: Number, required: true },
  precision: { type: Map, of: Number, required: true },
  recall: { type: Map, of: Number, required: true },
  f1Score: { type: Map, of: Number, required: true },
  confusionMatrix: { type: ConfusionMatrixSchema, required: true }, // Tambahkan schema confusionMatrix
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.model<EvaluationMetric>("EvaluationMetric", EvaluationMetricSchema);