// src/controllers/evaluationController.ts

import { Request, Response } from 'express';
import {
  initializeEvaluation,
  submitAnswer,
  completeEvaluation,
  getEvaluationById,
  getUserLatestEvaluation
} from '../services/evaluationService';

/**
 * Initialize a new survey evaluation
 */
export const handleInitializeEvaluation = async (
  req: Request, 
  res: Response
): Promise<void> => {
  try {
    const userId = req.user._id;
    const { session_id } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    const evaluation = await initializeEvaluation(userId, session_id);

    res.status(201).json({
      success: true,
      data: evaluation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error initializing evaluation',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Submit an answer for a specific question
 */
export const handleSubmitAnswer = async (
  req: Request, 
  res: Response
): Promise<void> => {
  try {
    const { evaluation_id, question_id, value } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!evaluation_id || !question_id || value === undefined) {
      res.status(400).json({
        success: false,
        message: 'Evaluation ID, question ID, and value are required'
      });
      return;
    }

    // Validate numeric value
    const numericValue = Number(value);
    if (isNaN(numericValue)) {
      res.status(400).json({
        success: false,
        message: 'Value must be a number'
      });
      return;
    }

    // Verify the evaluation belongs to the user
    const evaluation = await getEvaluationById(evaluation_id);
    if (!evaluation || evaluation.user_id.toString() !== userId.toString()) {
      res.status(403).json({
        success: false,
        message: 'Unauthorized: This evaluation does not belong to the authenticated user'
      });
      return;
    }

    // Submit the answer
    const updatedEvaluation = await submitAnswer(evaluation_id, question_id, numericValue);

    res.json({
      success: true,
      data: updatedEvaluation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error submitting answer',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Complete a survey evaluation
 */
export const handleCompleteEvaluation = async (
  req: Request, 
  res: Response
): Promise<void> => {
  try {
    const { evaluation_id } = req.body;
    const userId = req.user._id;

    if (!evaluation_id) {
      res.status(400).json({
        success: false,
        message: 'Evaluation ID is required'
      });
      return;
    }

    // Verify the evaluation belongs to the user
    const evaluation = await getEvaluationById(evaluation_id);
    if (!evaluation || evaluation.user_id.toString() !== userId.toString()) {
      res.status(403).json({
        success: false,
        message: 'Unauthorized: This evaluation does not belong to the authenticated user'
      });
      return;
    }

    // Complete the evaluation
    const completedEvaluation = await completeEvaluation(evaluation_id);

    res.json({
      success: true,
      data: completedEvaluation,
      message: 'Evaluation completed successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error completing evaluation',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get evaluation by ID
 */
export const handleGetEvaluation = async (
  req: Request, 
  res: Response
): Promise<void> => {
  try {
    const evaluationId = req.params.id;
    const userId = req.user._id;

    if (!evaluationId) {
      res.status(400).json({
        success: false,
        message: 'Evaluation ID is required'
      });
      return;
    }

    // Fetch the evaluation
    const evaluation = await getEvaluationById(evaluationId);
    
    if (!evaluation) {
      res.status(404).json({
        success: false,
        message: 'Evaluation not found'
      });
      return;
    }

    // Verify the evaluation belongs to the user
    if (evaluation.user_id.toString() !== userId.toString()) {
      res.status(403).json({
        success: false,
        message: 'Unauthorized: This evaluation does not belong to the authenticated user'
      });
      return;
    }

    res.json({
      success: true,
      data: evaluation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving evaluation',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get user's latest evaluation
 */
export const handleGetUserLatestEvaluation = async (
  req: Request, 
  res: Response
): Promise<void> => {
  try {
    const userId = req.user._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
      return;
    }

    // Fetch the user's latest evaluation
    const evaluation = await getUserLatestEvaluation(userId);
    
    if (!evaluation) {
      res.status(404).json({
        success: false,
        message: 'No evaluation found for this user'
      });
      return;
    }

    res.json({
      success: true,
      data: evaluation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error retrieving latest evaluation',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};