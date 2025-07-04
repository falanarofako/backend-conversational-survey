import mongoose, { Schema, Document } from "mongoose";

export interface IMessage {
  user_message: string | null;
  system_response: any;
  mode: "survey" | "qa";
  timestamp: Date;
}

export interface ISurveyMessageBundle extends Document {
  user_id: mongoose.Types.ObjectId;
  messages: IMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// Sub-schema representing a single message inside the bundle
const MessageSchema = new Schema<IMessage>(
  {
    user_message: { type: String },
    system_response: { type: Schema.Types.Mixed, required: true },
    mode: {
      type: String,
      enum: ["survey", "qa"],
      default: "survey",
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const SurveyMessageBundleSchema = new Schema<ISurveyMessageBundle>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    messages: {
      type: [MessageSchema],
      default: [],
    },
  },
  { timestamps: true }
);

// Ensure one bundle per user
SurveyMessageBundleSchema.index({ user_id: 1 }, { unique: true });

export default mongoose.model<ISurveyMessageBundle>(
  "SurveyMessageBundle",
  SurveyMessageBundleSchema
); 