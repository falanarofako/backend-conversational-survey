import mongoose, { Schema, Document } from "mongoose";

interface ClassificationResultData extends Document {
  evaluationDataId: mongoose.Types.ObjectId;
  predictedIntent: string;
  confidence: number;
  explanation: string;
  clarificationReason?: string;
  followUpQuestion?: string;
  timestamp: Date;
}

const ClassificationResultDataSchema = new Schema<ClassificationResultData>({
  evaluationDataId: { type: Schema.Types.ObjectId, ref: "EvaluationData", required: true },
  predictedIntent: { type: String, required: true },
  confidence: { type: Number, required: true },
  explanation: { type: String, required: true },
  clarificationReason: { type: String },
  followUpQuestion: { type: String },
  timestamp: { type: Date, default: Date.now },
});

export default mongoose.model<ClassificationResultData>("ClassificationResultData", ClassificationResultDataSchema);
