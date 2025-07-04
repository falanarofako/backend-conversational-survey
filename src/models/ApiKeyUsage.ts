import mongoose, { Document, Schema } from 'mongoose';

export interface ApiKeyUsage extends Document {
  apiKey: string;
  isActive: boolean;
  usage: {
    rpm: number;
    rpd: number;
    tpm: number;
    lastUsed: Date | null;
  };
  errorCount: number;
  deactivatedAt: Date | null;
}

const ApiKeyUsageSchema = new Schema<ApiKeyUsage>({
  apiKey: { type: String, required: true, unique: true },
  isActive: { type: Boolean, default: true },
  usage: {
    rpm: { type: Number, default: 0 },
    rpd: { type: Number, default: 0 },
    tpm: { type: Number, default: 0 },
    lastUsed: { type: Date, default: null },
  },
  errorCount: { type: Number, default: 0 },
  deactivatedAt: { type: Date, default: null },
});

export default mongoose.model<ApiKeyUsage>('ApiKeyUsage', ApiKeyUsageSchema); 