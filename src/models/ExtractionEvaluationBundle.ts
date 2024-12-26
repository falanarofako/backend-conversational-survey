// src/models/ExtractionEvaluationBundle.ts

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
  layered_question: { type: [this], default: [] }, // Menggunakan referensi rekursif untuk pertanyaan bertingkat
});

// **Perbaikan Rekursif untuk layered_question**
QuestionSchema.add({
  layered_question: { type: [QuestionSchema], default: [] }, // Gunakan QuestionSchema untuk mendukung nested questions
});

export interface ExtractionEvaluationItem {
  question: typeof QuestionSchema;
  response: string;
  ground_truth: string | number | string[]; // Tambahkan dukungan untuk tipe fleksibel
}

export interface ExtractionEvaluationBundle extends Document {
  items: ExtractionEvaluationItem[];
  timestamp: Date;
}

const ExtractionEvaluationItemSchema = new Schema<ExtractionEvaluationItem>({
  question: { type: QuestionSchema, required: true }, // Menggunakan Object karena Question adalah objek
  response: { type: String, required: true },
  ground_truth: { type: Schema.Types.Mixed, required: true }, // Mendukung string, number, atau array of string
});

const ExtractionEvaluationBundleSchema = new Schema<ExtractionEvaluationBundle>({
  items: { type: [ExtractionEvaluationItemSchema], required: true },
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.model<ExtractionEvaluationBundle>(
  "ExtractionEvaluationBundle",
  ExtractionEvaluationBundleSchema
);
