// src/models/User.ts

import mongoose, { Schema, Document } from "mongoose";
import bcrypt from "bcryptjs";

export interface IUser extends Document {
  email: string;
  password?: string;
  googleId?: string;
  name: string;
  isActive: boolean;
  activeSurveySessionId?: mongoose.Types.ObjectId;
  activeEvaluationSessionId?: mongoose.Types.ObjectId;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema: Schema = new Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      // Password will be required for local auth but not for Google auth
      required: function (this: IUser) {
        return !this.googleId;
      },
      minlength: 6,
    },
    googleId: {
      type: String,
      sparse: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    activeSurveySessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SurveySession",
      default: null,
    },
    activeEvaluationSessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SurveyEvaluation",
      default: null
    }
  },
  {
    timestamps: true,
  }
);

// Password hashing middleware
UserSchema.pre<IUser>("save", async function (next) {
  const user = this;

  // Only hash the password if it has been modified (or is new)
  if (!user.isModified("password") || !user.password) return next();

  try {
    // Generate a salt
    const salt = await bcrypt.genSalt(10);
    // Hash the password along with the new salt
    const hash = await bcrypt.hash(user.password, salt);
    // Override the plaintext password with the hashed one
    user.password = hash;
    next();
  } catch (error: any) {
    return next(error);
  }
});

// Method to compare password for login
UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  try {
    if (!this.password) return false;
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    return false;
  }
};

const User = mongoose.model<IUser>("User", UserSchema);

export default User;