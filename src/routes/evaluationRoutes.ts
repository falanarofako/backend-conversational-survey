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
 * @note    User must have at least one survey session (IN_PROGRESS or COMPLETED) 
 *          before creating an evaluation. If session_id is provided, it must exist 
 *          and belong to the authenticated user.
 * @returns 201: Evaluation created successfully
 *          400: User has no survey sessions
 *          403: Survey session does not belong to user
 *          404: Survey session not found
 *          500: Server error
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