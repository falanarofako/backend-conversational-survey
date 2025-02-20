// src/models/SurveySession.ts

import mongoose from 'mongoose';

export interface IResponse {
  question_code: string;
  valid_response: string | number | string[];
}

const ResponseSchema = new mongoose.Schema({
  question_code: String,
  valid_response: mongoose.Schema.Types.Mixed,
});

const SurveySessionSchema = new mongoose.Schema({
  user_id: String,
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
});

const SurveySession = mongoose.model('SurveySession', SurveySessionSchema);
export default SurveySession;