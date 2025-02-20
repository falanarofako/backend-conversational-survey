// src/models/Questionnaire.ts

import mongoose, { Document, Schema } from "mongoose";

// Option interface for multiple choice options
interface Option {
  text: string;
  additional_info: string;
}

// Validation interface
interface Validation {
  required: boolean;
  input_type: string;
  min?: number;
  max?: number;
  pattern?: string;
}

// Question interface
interface Question {
  code: string;
  text: string;
  type: string;
  unit: string;
  multiple: boolean;
  options: Option[];
  system_guidelines: string[];
  allow_other: boolean;
  additional_info: string;
  instruction: string;
  validation: Validation;
}

// Category interface
interface Category {
  name: string;
  questions: Question[];
}

// Survey interface
interface Survey {
  title: string;
  description: string;
  categories: Category[];
}

// Questionnaire interface
export interface Questionnaire extends Document {
  survey: Survey;
}

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
  code: { type: String, required: true, unique: true },
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
});

const CategorySchema: Schema = new Schema<Category>({
  name: { type: String, required: true },
  questions: [QuestionSchema],
});

const SurveySchema: Schema = new Schema<Survey>({
  title: { type: String, required: true },
  description: { type: String, required: true },
  categories: [CategorySchema],
});

const QuestionnaireSchema: Schema = new Schema<Questionnaire>({
  survey: SurveySchema,
});

// Create and export the model
const QuestionnaireModel = mongoose.model<Questionnaire>(
  "Questionnaire",
  QuestionnaireSchema
);

export default QuestionnaireModel;
