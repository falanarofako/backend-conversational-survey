// src/services/tokenService.ts

import jwt from 'jsonwebtoken';
import User from '../models/User';

// Verify JWT token
export const verifyToken = async (token: string) => {
  try {
    // Verify token
    const decoded: any = jwt.verify(token, process.env.JWT_SECRET!);

    // Get user from the token
    const user = await User.findById(decoded.id).select('-password');

    if (!user) {
      return {
        success: false,
        message: 'Not authorized, user not found'
      };
    }

    return {
      success: true,
      user
    };
  } catch (error) {
    return {
      success: false,
      message: 'Not authorized, token failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Extract token from authorization header
export const extractTokenFromHeader = (authHeader: string) => {
  // Check for token in Authorization header
  if (authHeader && authHeader.startsWith('Bearer')) {
    return authHeader.split(' ')[1];
  }
  return null;
};