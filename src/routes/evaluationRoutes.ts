// src/routes/evaluationRoutes.ts

import { Router } from 'express';
import { 
  handleInitializeEvaluation,
  handleSubmitAnswer,
  handleCompleteEvaluation,
  handleGetEvaluation,
  handleGetUserLatestEvaluation
} from '../controllers/evaluationController';
import { protect } from '../middleware/authMiddleware';

const router = Router();

/**
 * @route   POST /api/evaluation/initialize
 * @desc    Initialize a new survey evaluation
 * @access  Private
 * @body    {
 *            session_id?: string  // Optional survey session ID to link with
 *          }
 */
router.post('/initialize', protect, handleInitializeEvaluation);

/**
 * @route   POST /api/evaluation/submit-answer
 * @desc    Submit an answer for a specific question
 * @access  Private
 * @body    {
 *            evaluation_id: string,
 *            question_id: string,
 *            value: number
 *          }
 */
router.post('/submit-answer', protect, handleSubmitAnswer);

/**
 * @route   POST /api/evaluation/complete
 * @desc    Complete a survey evaluation
 * @access  Private
 * @body    {
 *            evaluation_id: string
 *          }
 */
router.post('/complete', protect, handleCompleteEvaluation);

/**
 * @route   GET /api/evaluation/:id
 * @desc    Get evaluation by ID
 * @access  Private
 */
router.get('/:id', protect, handleGetEvaluation);

/**
 * @route   GET /api/evaluation/user/latest
 * @desc    Get user's latest evaluation
 * @access  Private
 */
router.get('/user/latest', protect, handleGetUserLatestEvaluation);

export default router;