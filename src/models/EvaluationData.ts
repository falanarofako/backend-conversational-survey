// src/models/EvaluationData.ts

import mongoose, { Schema, Document } from "mongoose";

interface EvaluationData extends Document {
  question: string;
  response: string;
  intent: string;
  timestamp: Date;
}

const EvaluationDataSchema = new Schema<EvaluationData>({
  question: { type: String, required: true },
  response: { type: String, required: true },
  intent: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.model<EvaluationData>("EvaluationData", EvaluationDataSchema);
