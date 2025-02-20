import { Router } from 'express';
import { handleStartSurvey, handleProcessSurveyResponse } from '../controllers/surveyController';

const router = Router();

/**
 * @route   POST /api/survey/start
 * @desc    Start a survey session
 * @access  Public
 */
router.post('/start', handleStartSurvey);

/**
 * @route   POST /api/survey/respond
 * @desc    Process a survey response
 * @access  Public
 */
router.post('/respond', handleProcessSurveyResponse);

export default router;
