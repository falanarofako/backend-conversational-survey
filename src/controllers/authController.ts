// src/controllers/authController.ts

import { Request, Response } from 'express';
import {
  registerUserService,
  loginUserService,
  googleLoginService,
  getUserProfileService
} from '../services/authService';

// Register a new user
export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;

    // Validate input
    if (!name || !email || !password) {
      res.status(400).json({ success: false, message: 'Please provide all required fields' });
      return;
    }

    const result = await registerUserService(name, email, password);

    if (result.success) {
      res.status(201).json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error in registerUser controller:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during registration',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Login a user
export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Please provide email and password' });
      return;
    }

    const result = await loginUserService(email, password);

    if (result.success) {
      res.json(result);
    } else {
      res.status(401).json(result);
    }
  } catch (error) {
    console.error('Error in loginUser controller:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Google login handler
export const googleLogin = async (req: Request, res: Response): Promise<void> => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      res.status(400).json({ success: false, message: 'ID token is required' });
      return;
    }

    const result = await googleLoginService(idToken);

    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error) {
    console.error('Error in googleLogin controller:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during Google login',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Get user profile
export const getUserProfile = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.user._id;
    const result = await getUserProfileService(userId);

    if (result.success) {
      res.json(result);
    } else {
      res.status(404).json(result);
    }
  } catch (error) {
    console.error('Error in getUserProfile controller:', error);
    res.status(500).json({
      success: false,
      message: 'Server error retrieving user profile',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Logout (no server-side action needed for JWT-based auth)
export const logoutUser = (req: Request, res: Response): void => {
  res.json({ success: true, message: 'Logged out successfully' });
};