// src/models/EvaluationData.ts

import mongoose, { Schema, Document } from "mongoose";

// Schema untuk QuestionValidation
const QuestionValidationSchema = new Schema({
  required: { type: Boolean, default: false },
  input_type: { type: String, enum: ["text", "number", "date"] },
  min: { type: Number },
  max: { type: Number },
  pattern: { type: String },
});

// Schema untuk QuestionOption
const QuestionOptionSchema = new Schema({
  text: { type: String, required: true },
  additional_info: { type: String },
});

// Schema untuk Question
const QuestionSchema = new Schema({
  code: { type: String },
  text: { type: String, required: true },
  type: { type: String, enum: ["text", "select", "date"], required: true },
  unit: { type: String },
  multiple: { type: Boolean, default: false },
  options: { type: [Schema.Types.Mixed] }, // Bisa berupa string atau QuestionOption
  system_guidelines: { type: [String] },
  allow_other: { type: Boolean, default: false },
  additional_info: { type: String },
  instruction: { type: String },
  validation: { type: QuestionValidationSchema, required: true },
  modified_question: { type: String },
  layered_question: { type: [this], default: [] }, // Mendukung pertanyaan bertingkat
});

// Model EvaluationData
export interface EvaluationData extends Document {
  question: typeof QuestionSchema;
  response: string;
  intent: string;
  timestamp: Date;
}

const EvaluationDataSchema = new Schema<EvaluationData>({
  question: { type: QuestionSchema, required: true },
  response: { type: String, required: true },
  intent: { type: String, required: true },
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.model<EvaluationData>("EvaluationData", EvaluationDataSchema);
