// src/routes/intentClassificationRoutes.ts

import { Router } from "express";
import { 
  handleClassifyIntent,
  handleStartEvaluation,
  handleGetEvaluationProgress,
  handleGetSystemStatus,
  handleResetSystem,
  getAllClassificationResults
} from "../controllers/intentClassificationController";

const router = Router();

/**
 * @route   POST /api/intent/classify
 * @desc    Classify single response intent
 * @access  Public
 * @body    {
 *            response: string,
 *            question: string,
 *            expected_answer?: string | string[],
 *            validation_rules?: string
 *          }
 */
router.post("/classify", handleClassifyIntent);

/**
 * @route   POST /api/intent/evaluate/start
 * @desc    Start evaluation process
 * @access  Public
 */
router.post("/evaluate/start", handleStartEvaluation);

/**
 * @route   GET /api/intent/evaluate/progress
 * @desc    Get evaluation progress
 * @access  Public
 */
router.get("/evaluate/progress", handleGetEvaluationProgress);

/**
 * @route   GET /api/intent/system/status
 * @desc    Get system status including LLM and evaluation state
 * @access  Public
 */
router.get("/system/status", handleGetSystemStatus);

/**
 * @route   POST /api/intent/system/reset
 * @desc    Reset system state including LLM and evaluation progress
 * @access  Public
 */
router.post("/system/reset", handleResetSystem);

/**
 * @route   GET /api/classification-results
 * @desc    Get all classification results with populated evaluationDataId
 * @access  Public
 */
router.get("/get-all-classification-results", getAllClassificationResults);

export default router;