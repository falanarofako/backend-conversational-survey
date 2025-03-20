// src/services/authService.ts

import jwt, { SignOptions } from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import User, { IUser } from '../models/User';

// Initialize Google OAuth client
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// Generate JWT token
export const generateToken = (id: string): string => {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET is not defined in environment variables');
    }
    
    const secret = process.env.JWT_SECRET;
    const options: SignOptions = {
      expiresIn: process.env.JWT_EXPIRES_IN as SignOptions['expiresIn'] || '30d'
    };
    
    // Menggunakan type assertion untuk memastikan TypeScript memahami tipe parameter
    return jwt.sign({ id }, secret, options);
  };

// Register a new user
export const registerUserService = async (name: string, email: string, password: string) => {
  try {
    // Check if user exists
    const userExists = await User.findOne({ email });

    if (userExists) {
      return {
        success: false,
        message: 'User already exists',
      };
    }

    // Create user
    const user = await User.create({
      name,
      email,
      password,
    });

    if (user) {
      // Generate token
      const token = generateToken((user._id as string).toString());

      return {
        success: true,
        data: {
          _id: user._id,
          name: user.name,
          email: user.email,
          token,
        },
      };
    } else {
      return {
        success: false,
        message: 'Invalid user data',
      };
    }
  } catch (error) {
    console.error('Error in registerUserService:', error);
    return {
      success: false,
      message: 'Error registering user',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Login a user with email and password
export const loginUserService = async (email: string, password: string) => {
  try {
    // Find the user by email
    const user = await User.findOne({ email });

    // Check if user exists and password is correct
    if (!user || !(await user.comparePassword(password))) {
      return {
        success: false,
        message: 'Invalid email or password',
      };
    }

    // Generate token
    const token = generateToken((user._id as string).toString());

    return {
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        activeSurveySessionId: user.activeSurveySessionId,
        activeEvaluationSessionId: user.activeEvaluationSessionId,
        token,
      },
    };
  } catch (error) {
    console.error('Error in loginUserService:', error);
    return {
      success: false,
      message: 'Error logging in',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Google login handler
export const googleLoginService = async (idToken: string) => {
  try {
    // Verify the Google ID token
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    
    if (!payload || !payload.email) {
      return {
        success: false,
        message: 'Invalid Google token',
      };
    }

    // Check if user exists with this email
    let user = await User.findOne({ email: payload.email });

    if (user) {
      // Update Google ID if not already set
      if (!user.googleId && payload.sub) {
        user.googleId = payload.sub;
        await user.save();
      }
    } else {
      // Create new user with Google data
      user = await User.create({
        name: payload.name || 'Google User',
        email: payload.email,
        googleId: payload.sub,
      });
    }

    // Generate token
    const token = generateToken((user._id as string).toString());

    return {
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        activeSurveySessionId: user.activeSurveySessionId,
        token,
      },
    };
  } catch (error) {
    console.error('Error in googleLoginService:', error);
    return {
      success: false,
      message: 'Error with Google login',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};

// Get user profile
export const getUserProfileService = async (userId: string) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      return {
        success: false,
        message: 'User not found',
      };
    }

    return {
      success: true,
      data: {
        _id: user._id,
        name: user.name,
        email: user.email,
        activeSurveySessionId: user.activeSurveySessionId,
      },
    };
  } catch (error) {
    console.error('Error in getUserProfileService:', error);
    return {
      success: false,
      message: 'Error retrieving user profile',
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
};