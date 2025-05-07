// src/models/SurveySession.ts

import mongoose, { Schema, Document } from "mongoose";

export interface IResponse {
  question_code: string;
  valid_response: string | number | string[];
  response_time?: number; // waktu dalam ms
}

export interface IResponseMetrics {
  is_breakoff: boolean; // Apakah responden breakoff (ada pertanyaan yang tidak dijawab)
  avg_response_time: number; // Rata-rata waktu respons per pertanyaan (ms)
  item_nonresponse: number; // Jumlah pertanyaan yang tidak dijawab
  dont_know_response: number; // Jumlah jawaban "tidak tahu"
}

export interface ISurveySession extends Document {
  user_id: mongoose.Types.ObjectId;
  status: "IN_PROGRESS" | "COMPLETED";
  responses: IResponse[];
  current_question_index: number;
  metrics?: IResponseMetrics;
  createdAt: Date;
  updatedAt: Date;
}

const ResponseSchema = new Schema({
  question_code: String,
  valid_response: Schema.Types.Mixed,
  response_time: Number, // waktu dalam ms
});

const SurveySessionSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["IN_PROGRESS", "COMPLETED"],
      default: "IN_PROGRESS",
    },
    responses: [ResponseSchema],
    current_question_index: {
      type: Number,
      default: 0,
    },
    metrics: {
      is_breakoff: { type: Boolean, default: false },
      avg_response_time: { type: Number, default: 0 },
      item_nonresponse: { type: Number, default: 0 },
      dont_know_response: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// Index to ensure each user can only have one IN_PROGRESS session
SurveySessionSchema.index(
  { user_id: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: "IN_PROGRESS" },
  }
);

const SurveySession = mongoose.model<ISurveySession>(
  "SurveySession",
  SurveySessionSchema
);
export default SurveySession;
