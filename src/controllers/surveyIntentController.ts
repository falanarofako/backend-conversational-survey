// src/controllers/surveyIntentController.ts

import { Request, Response } from "express";
import { analyzeSurveyIntent } from "../services/surveyIntentService";

/**
 * Analyze if the user wants to start a survey based on their message
 */
export const analyzeSurveyIntentController = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { message } = req.body;

    // Validate input
    if (!message || typeof message !== "string") {
      res.status(400).json({
        success: false,
        message: "Message is required and must be a string"
      });
      return;
    }

    // Analyze intent
    const result = await analyzeSurveyIntent(message);

    if (!result.success) {
      res.status(500).json({
        success: false,
        message: result.error || "Failed to analyze survey intent"
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: result.data,
      metadata: result.metadata
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error analyzing survey intent",
      error: error instanceof Error ? error.message : "Unknown error"
    });
  }
};