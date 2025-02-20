// src/routes/questionnaireRoutes.ts

import { Router } from 'express';
import { handleSaveQuestionnaire } from '../controllers/questionnaireController';

const router = Router();

/**
 * @route   POST /api/questionnaire/save
 * @desc    Save questionnaire data to the database
 * @access  Public
 */
router.post('/save', handleSaveQuestionnaire);

export default router;