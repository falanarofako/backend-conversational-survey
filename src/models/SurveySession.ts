// src/models/SurveySession.ts

import mongoose, { Schema, Document } from 'mongoose';

export interface IResponse {
  question_code: string;
  valid_response: string | number | string[];
}

export interface ISurveySession extends Document {
  user_id: mongoose.Types.ObjectId;
  status: 'IN_PROGRESS' | 'COMPLETED';
  responses: IResponse[];
  current_question_index: number;
  createdAt: Date;
  updatedAt: Date;
}

const ResponseSchema = new Schema({
  question_code: String,
  valid_response: Schema.Types.Mixed,
});

const SurveySessionSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['IN_PROGRESS', 'COMPLETED'],
      default: 'IN_PROGRESS',
    },
    responses: [ResponseSchema],
    current_question_index: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

// Index to ensure each user can only have one IN_PROGRESS session
SurveySessionSchema.index({ user_id: 1, status: 1 }, { 
  unique: true, 
  partialFilterExpression: { status: 'IN_PROGRESS' } 
});

const SurveySession = mongoose.model<ISurveySession>('SurveySession', SurveySessionSchema);
export default SurveySession;