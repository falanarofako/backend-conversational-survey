// src/models/SurveyMessage.ts

import mongoose, { Schema, Document } from 'mongoose';

interface ISurveyMessage extends Document {
  user_id: mongoose.Types.ObjectId;
  session_id?: mongoose.Types.ObjectId;
  user_message: string | null;
  system_response: any;
  mode: "survey" | "qa";
  timestamp: Date;
}

const SurveyMessageSchema = new Schema({
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
  user_message: {
    type: String,
    // required: true,
  },
  system_response: {
    type: Schema.Types.Mixed,
    required: true,
  },
  mode: {
    type: String,
    enum: ["survey", "qa"],
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model<ISurveyMessage>('SurveyMessage', SurveyMessageSchema);