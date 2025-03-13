// src/routes/authRoutes.ts

import { Router } from 'express';
import { 
  registerUser, 
  loginUser, 
  googleLogin, 
  getUserProfile, 
  logoutUser 
} from '../controllers/authController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', registerUser);

/**
 * @route   POST /api/auth/login
 * @desc    Login a user (email & password)
 * @access  Public
 */
router.post('/login', loginUser);

/**
 * @route   POST /api/auth/google
 * @desc    Login or register with Google
 * @access  Public
 */
router.post('/google', googleLogin);

/**
 * @route   GET /api/auth/profile
 * @desc    Get user profile
 * @access  Private
 */
router.get('/profile', protect, getUserProfile);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side only)
 * @access  Public
 */
router.post('/logout', logoutUser);

export default router;