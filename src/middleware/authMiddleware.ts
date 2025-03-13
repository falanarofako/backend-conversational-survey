// src/middleware/authMiddleware.ts

import { Request, Response, NextFunction } from 'express';
import { verifyToken, extractTokenFromHeader } from '../services/tokenService';

// Extend Express Request type to include user property
declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export const protect = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Check for token in Authorization header
    const token = req.headers.authorization ? 
      extractTokenFromHeader(req.headers.authorization) : null;

    if (!token) {
      res.status(401).json({ success: false, message: 'Not authorized, no token' });
      return;
    }

    // Verify token and get user
    const result = await verifyToken(token);

    if (!result.success) {
      res.status(401).json({ success: false, message: result.message });
      return;
    }

    // Set user in request object
    req.user = result.user;
    next();
  } catch (error) {
    console.error('Error in auth middleware:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error in authentication',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};