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
  handleGetAnsweredQuestions,
  handleUpdateAnswer,
  handleGetAccurateProgress,
  handleGetOutlierResponseTimeSessions,
  handleGetMergedUserSurveyEvaluationData,
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
 * @route   GET /api/survey/accurate-progress/:session_id
 * @desc    Get accurate survey progress considering skipping logic and N/A answers
 * @access  Private
 */
router.get("/accurate-progress/:session_id", protect, handleGetAccurateProgress);

/**
 * @route   GET /api/survey/messages
 * @desc    Get all messages for a survey session
 * @access  Private
 */
router.get("/messages", protect, handleGetSurveyMessages);

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

/**
 * @route   GET /api/survey/answered
 * @desc    Get all answered questions and their answers for the logged-in user
 * @access  Private
 */
router.get("/answered", protect, handleGetAnsweredQuestions);

/**
 * @route   PUT /api/survey/answer/:questionCode
 * @desc    Update an answer for a specific question in the active survey session
 * @access  Private
 */
router.put("/answer/:questionCode", protect, handleUpdateAnswer);

/**
 * @route   GET /api/survey/outlier-response-time
 * @desc    Get survey sessions with outlier response time(s)
 * @access  Private (bisa diubah ke Public jika perlu)
 */
router.get("/outlier-response-time", handleGetOutlierResponseTimeSessions);

/**
 * @route   GET /api/survey/merged-report
 * @desc    Get merged user, survey session, and evaluation data
 * @access  Private
 */
router.get("/merged-report", handleGetMergedUserSurveyEvaluationData);

export default router;
