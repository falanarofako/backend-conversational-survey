import mongoose, { Schema, Document } from "mongoose";

export interface IntentClassificationEvaluationItem {
  evaluation_item_index: number;
  question: any;
  response: string;
  actual_intent: string;
  predicted_intent: string;
  confidence: number;
  explanation: string;
  clarification_reason?: string;
  follow_up_question?: string;
  timestamp: Date;
}

export interface IntentClassificationEvaluationBundle extends Document {
  items: IntentClassificationEvaluationItem[];
  metadata: {
    total_items: number;
    correct: number;
    accuracy: number;
    created_at: Date;
  };
}

const ItemSchema = new Schema<IntentClassificationEvaluationItem>({
  evaluation_item_index: { type: Number, required: true },
  question: { type: Schema.Types.Mixed, required: true },
  response: { type: String, required: true },
  actual_intent: { type: String, required: true },
  predicted_intent: { type: String, required: true },
  confidence: { type: Number, required: true },
  explanation: { type: String, required: true },
  clarification_reason: { type: String },
  follow_up_question: { type: String },
  timestamp: { type: Date, default: Date.now },
});

const BundleSchema = new Schema<IntentClassificationEvaluationBundle>({
  items: [ItemSchema],
  metadata: {
    total_items: { type: Number, default: 0 },
    correct: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    created_at: { type: Date, default: Date.now },
  },
});

export default mongoose.model<IntentClassificationEvaluationBundle>(
  "IntentClassificationEvaluationBundle",
  BundleSchema
);