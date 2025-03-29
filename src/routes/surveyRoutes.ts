// src/routes/surveyRoutes.ts

import { Router } from "express";
import {
  handleStartSurvey,
  handleProcessSurveyResponse,
  handleCompleteSurvey,
  handleGetSurveyStatus,
  handleGetSurveyMessages,
  handleAddSurveyMessage,
  handleGetCurrentQuestion,
} from "../controllers/surveyController";
import { analyzeSurveyIntentController } from "../controllers/surveyIntentController";
import { protect } from "../middleware/authMiddleware";

const router = Router();

/**
 * @route   GET /api/survey/current-question
 * @desc    Get the current question from user's active survey session
 * @access  Private
 */
router.get("/current-question", protect, handleGetCurrentQuestion);

/**
 * @route   GET /api/survey/status/:id
 * @desc    Get the status of a survey session
 * @access  Private
 */
router.get("/status/:id", protect, handleGetSurveyStatus);

/**
 * @route   GET /api/survey/messages/:id
 * @desc    Get all messages for a survey session
 * @access  Private
 */
router.get("/messages/:id", protect, handleGetSurveyMessages);

/**
 * @route   POST /api/survey/messages
 * @desc    Add a new survey message
 * @access  Private
 */
router.post("/messages", protect, handleAddSurveyMessage);

/**
 * @route   POST /api/survey/analyze-intent
 * @desc    Analyze if user wants to start the survey
 * @access  Public
 */
router.post("/analyze-intent", protect, analyzeSurveyIntentController);

/**
 * @route   POST /api/survey/start
 * @desc    Start a survey session
 * @access  Private
 */
router.post("/start", protect, handleStartSurvey);

/**
 * @route   POST /api/survey/respond
 * @desc    Process a survey response
 * @access  Private
 */
router.post("/respond", protect, handleProcessSurveyResponse);

/**
 * @route   POST /api/survey/complete
 * @desc    Manually complete a survey
 * @access  Private
 */
router.post("/complete", protect, handleCompleteSurvey);

export default router;
