import mongoose, { Schema, Document } from "mongoose";

export interface IUniqueSurveyCode extends Document {
  nama_responden: string;
  kode_unik: string;
  created_at?: Date;
}

const UniqueSurveyCodeSchema = new Schema<IUniqueSurveyCode>({
  nama_responden: { type: String, required: true },
  kode_unik: { type: String, required: true, unique: true },
  created_at: { type: Date, default: Date.now },
});

const UniqueSurveyCode = mongoose.model<IUniqueSurveyCode>(
  "UniqueSurveyCode",
  UniqueSurveyCodeSchema
);

export default UniqueSurveyCode; 