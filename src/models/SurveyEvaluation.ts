// src/models/SurveyEvaluation.ts

import mongoose, { Schema, Document } from 'mongoose';

export interface ISurveyEvaluation extends Document {
  user_id: mongoose.Types.ObjectId;
  session_id?: mongoose.Types.ObjectId;
  answers: {
    ease_of_use?: number;
    participation_ease?: number;
    enjoyment?: number;
    data_security?: number;
    privacy_safety?: number;
    mental_effort?: number;
    overall_experience?: string;
    [key: string]: number | string | undefined;
  };
  completed: boolean;
  created_at: Date;
}

const SurveyEvaluationSchema = new Schema({
  user_id: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  session_id: {
    type: Schema.Types.ObjectId,
    ref: 'SurveySession',
    index: true
  },
  answers: {
    ease_of_use: { type: Number, min: 1, max: 7 },
    participation_ease: { type: Number, min: 1, max: 7 },
    enjoyment: { type: Number, min: 1, max: 7 },
    data_security: { type: Number, min: 1, max: 7 },
    privacy_safety: { type: Number, min: 1, max: 7 },
    mental_effort: { type: Number, min: 1, max: 9 },
    overall_experience: { 
      type: String, 
      maxlength: 1000 // Batasi panjang respons terbuka
    }
  },
  completed: {
    type: Boolean,
    default: false
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

export default mongoose.model<ISurveyEvaluation>('SurveyEvaluation', SurveyEvaluationSchema);