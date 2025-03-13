// src/models/SurveyMessage.ts

import mongoose, { Schema, Document } from 'mongoose';

interface ISurveyMessage extends Document {
  session_id: mongoose.Types.ObjectId;
  user_message: string;
  system_response: any;
  timestamp: Date;
}

const SurveyMessageSchema = new Schema({
  session_id: {
    type: Schema.Types.ObjectId,
    ref: 'SurveySession',
    required: true,
  },
  user_message: {
    type: String,
    // required: true,
  },
  system_response: {
    type: Schema.Types.Mixed,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model<ISurveyMessage>('SurveyMessage', SurveyMessageSchema);