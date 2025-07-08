// src/controllers/surveyController.ts

import { Request, Response } from "express";
import {
  startSurveySession,
  processSurveyResponse,
  getUserActiveSurveySession,
  completeSurveySession,
  getSurveySessionStatus,
  getSurveySessionMessages,
  replacePlaceholders,
  updateQuestionOptions,
  // updateQuestionOptions,
  // replacePlaceholders,
  addSurveyMessage,
} from "../services/surveyService";
import QuestionnaireModel from "../models/Questionnaire";
import { IUser } from "../models/User";
import mongoose from "mongoose";
import SurveySession from "../models/SurveySession";
import { classifyIntentWithContext } from "../services/enhancedIntentClassificationService";
import { classifyOtherResponseClassification } from "../services/otherResponseClassificationService";
import { extractInformation } from "../services/informationExtractionService";

export const handleStartSurvey = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Get user ID from authenticated request
    const userId = req.user._id;
    if (!userId) {
      res.status(400).json({ success: false, message: "User ID is required" });
      return;
    }

    // Get the latest questionnaire
    const latestQuestionnaire = await QuestionnaireModel.findOne().sort({
      createdAt: -1,
    });
    if (!latestQuestionnaire) {
      res
        .status(404)
        .json({ success: false, message: "Questionnaire not found" });
      return;
    }

    // Check if user already has an active session
    const existingSession = await getUserActiveSurveySession(userId);
    if (existingSession) {
      // Get the current question from the session's progress
      const currentQuestionIndex = existingSession.current_question_index;
      let currentQuestion = latestQuestionnaire.survey.categories.flatMap(
        (category: any) => category.questions
      )[currentQuestionIndex];

      res.status(200).json({
        success: true,
        message: "Resuming existing survey session",
        additional_info:
          "Anda sudah memiliki sesi survei yang aktif. Melanjutkan sesi tersebut.",
        session_id: existingSession._id,
        current_question_index: currentQuestionIndex,
        next_question: currentQuestion.text,
      });
      return;
    }

    // Start a new survey session
    const session = await startSurveySession(
      userId,
      latestQuestionnaire.survey
    );

    res.status(201).json({
      success: true,
      additional_info: `Terima kasih sudah bersedia mengikuti survei ini! Silakan jawab pertanyaan berikut dengan jujur dan sesuai pengalaman Anda.`,
      next_question: latestQuestionnaire.survey.categories[0].questions[0].text,
      session_id: session._id,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: (error as Error).message,
    });
  }
};

export const handleProcessSurveyResponse = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    let { session_id, user_response } = req.body;
    const userId = req.user._id;

    // Validate user response
    if (user_response === undefined) {
      res.status(400).json({
        success: false,
        message: "User response is required",
      });
      return;
    }

    // Treat empty string as undefined for session_id
    if (session_id === "") {
      session_id = undefined;
    }

    // Get latest questionnaire
    const latestQuestionnaire = await QuestionnaireModel.findOne().sort({
      createdAt: -1,
    });
    if (!latestQuestionnaire) {
      res.status(404).json({
        success: false,
        message: "Questionnaire not found",
      });
      return;
    }

    // Process the response with the unified function
    const response = await processSurveyResponse(
      userId,
      user_response,
      session_id,
      latestQuestionnaire.survey
    );

    // Return the response
    res.json({
      success: true,
      ...response,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Manually complete a survey session
export const handleCompleteSurvey = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { session_id } = req.body;

    if (!session_id) {
      res.status(400).json({
        success: false,
        message: "Session ID is required",
      });
      return;
    }

    // Verify the session belongs to the authenticated user
    const userId = req.user._id;
    const userSession = await getUserActiveSurveySession(userId);

    if (!userSession || (userSession as any)._id.toString() !== session_id) {
      res.status(403).json({
        success: false,
        message:
          "Unauthorized: This survey session does not belong to the authenticated user",
      });
      return;
    }

    await completeSurveySession(session_id);

    res.json({
      success: true,
      message: "Survey completed successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: (error as Error).message,
    });
  }
};

export const handleGetSurveyStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const sessionId = req.params.id;

    if (!sessionId) {
      res.status(400).json({
        success: false,
        message: "Session ID is required",
      });
      return;
    }

    // Verify the session belongs to the authenticated user
    const userId = req.user._id;
    const userSession = await getUserActiveSurveySession(userId);

    if (!userSession || (userSession as any)._id.toString() !== sessionId) {
      res.status(403).json({
        success: false,
        message:
          "Unauthorized: This survey session does not belong to the authenticated user",
      });
      return;
    }

    // Get the session status
    const sessionStatus = await getSurveySessionStatus(sessionId);

    res.json({
      success: true,
      data: sessionStatus,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: (error as Error).message,
    });
  }
};

export const handleGetSurveyMessages = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Get user ID from authenticated request
    const userId = req.user._id;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: "User ID is required",
      });
      return;
    }

    // Get all messages for this user
    const messages = await getSurveySessionMessages(userId);

    res.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: (error as Error).message,
    });
  }
};

export const handleAddSurveyMessage = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { session_id, user_message, system_response, mode } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!system_response) {
      res.status(400).json({
        success: false,
        message: "System response are required",
      });
      return;
    }

    // Validate mode if provided
    if (mode && !["survey", "qa"].includes(mode)) {
      res.status(400).json({
        success: false,
        message: "Mode must be either 'survey' or 'qa'",
      });
      return;
    }

    // Create a new survey message via service
    const surveyMessage = await addSurveyMessage(
      userId,
      user_message ?? null,
      system_response,
      session_id,
      mode || "survey"
    );

    res.status(201).json({
      success: true,
      data: surveyMessage,
      message: "Survey message added successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const handleGetCurrentQuestion = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Get user ID from authenticated request
    const userId = req.user._id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "User not authenticated",
      });
      return;
    }

    // Get user's active session
    const session = await getUserActiveSurveySession(userId);
    if (!session) {
      res.status(404).json({
        success: false,
        message: "No active survey session found",
      });
      return;
    }

    // Get the latest questionnaire
    const latestQuestionnaire = await QuestionnaireModel.findOne().sort({
      createdAt: -1,
    });
    if (!latestQuestionnaire) {
      res.status(404).json({
        success: false,
        message: "Questionnaire not found",
      });
      return;
    }

    // Get all questions from the questionnaire
    const allQuestions = latestQuestionnaire.survey.categories.flatMap(
      (category: any) => category.questions
    );

    // Get the current question
    const currentQuestionIndex = session.current_question_index;
    if (currentQuestionIndex >= allQuestions.length) {
      res.status(200).json({
        success: true,
        data: {
          session_id: session._id,
          status: session.status,
          message: "Survey is completed",
        },
      });
      return;
    }

    let currentQuestion = allQuestions[currentQuestionIndex];
    const sessionId = (session._id as mongoose.Types.ObjectId).toString();

    // Update question options and placeholders if needed
    if (
      ["S002", "S004", "S003", "S005", "S007"].includes(currentQuestion.code)
    ) {
      currentQuestion = await updateQuestionOptions(currentQuestion, sessionId);
    }
    currentQuestion = await replacePlaceholders(currentQuestion, sessionId);

    res.status(200).json({
      success: true,
      data: {
        session_id: session._id,
        status: session.status,
        current_question_index: currentQuestionIndex,
        current_question: currentQuestion,
        progress: {
          total_questions: allQuestions.length,
          answered_questions: session.responses.length,
          progress_percentage: Math.round(
            (session.responses.length / allQuestions.length) * 100
          ),
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error retrieving current question",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// Endpoint: GET /api/survey/answered
export const handleGetAnsweredQuestions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.user._id;
    // Find all survey sessions for this user (regardless of status)
    const sessions = await SurveySession.find({ user_id: userId });
    if (!sessions.length) {
      res.json({ success: true, data: [] });
      return;
    }

    // Get the latest questionnaire (assume structure is stable)
    const questionnaire = await QuestionnaireModel.findOne().sort({ createdAt: -1 });
    if (!questionnaire) {
      res.status(404).json({ success: false, message: "Questionnaire not found" });
      return;
    }
    // Flatten all questions by code
    const allQuestions: Record<string, { text: string }> = {};
    questionnaire.survey.categories.forEach(cat => {
      cat.questions.forEach(q => {
        allQuestions[q.code] = { text: q.text };
      });
    });

    // Collect only the latest answer for each question_code (no duplicates)
    const latestAnswers: Record<string, { question_code: string; question_text: string; answer: any; updatedAt: Date }> = {};
    sessions.forEach(session => {
      session.responses.forEach(resp => {
        if (resp.valid_response !== undefined && resp.valid_response !== null) {
          // Use session.updatedAt as the timestamp for the answer
          const key = resp.question_code;
          if (!latestAnswers[key] || session.updatedAt > latestAnswers[key].updatedAt) {
            latestAnswers[key] = {
              question_code: resp.question_code,
              question_text: allQuestions[resp.question_code]?.text || resp.question_code,
              answer: resp.valid_response,
              updatedAt: session.updatedAt,
            };
          }
        }
      });
    });
    // Return as array, sorted by question_code or updatedAt if needed
    const answered = Object.values(latestAnswers).map(({ updatedAt, ...rest }) => rest);
    res.json({ success: true, data: answered });
  } catch (error) {
    res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Unknown error" });
  }
};

// Endpoint: PUT /api/survey/answer/:questionCode
export const handleUpdateAnswer = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { questionCode } = req.params;
    const { answer } = req.body;
    const userId = req.user._id;

    if (!questionCode) {
      res.status(400).json({
        success: false,
        message: "Question code is required",
      });
      return;
    }

    if (answer === undefined || answer === null) {
      res.status(400).json({
        success: false,
        message: "Answer is required",
      });
      return;
    }

    // Get user's active session
    const session = await getUserActiveSurveySession(userId);
    if (!session) {
      res.status(404).json({
        success: false,
        message: "No active survey session found",
      });
      return;
    }

    // Get the latest questionnaire
    const latestQuestionnaire = await QuestionnaireModel.findOne().sort({
      createdAt: -1,
    });
    if (!latestQuestionnaire) {
      res.status(404).json({
        success: false,
        message: "Questionnaire not found",
      });
      return;
    }

    // Find the question by questionCode
    const allQuestions = latestQuestionnaire.survey.categories.flatMap(
      (category: any) => category.questions
    );
    const targetQuestion = allQuestions.find(q => q.code === questionCode);

    if (!targetQuestion) {
      res.status(404).json({
        success: false,
        message: `Question with code ${questionCode} not found`,
      });
      return;
    }

    const sessionId = (session._id as mongoose.Types.ObjectId).toString();

    // Process the question (same as in processSurveyResponse)
    let currentQuestion = targetQuestion;
    if (["S002", "S004", "S003", "S005", "S007"].includes(currentQuestion.code)) {
      currentQuestion = await updateQuestionOptions(currentQuestion, sessionId);
    }
    currentQuestion = await replacePlaceholders(currentQuestion, sessionId);

    // Special handling for S006 (timestamp)
    const processedUserResponse =
      currentQuestion.code === "S006"
        ? `${answer} (Dikirim pada ${new Date().toLocaleString()})`
        : answer;

    // Use enhanced context-aware classification (same as processSurveyResponse)
    const classificationResult = await classifyIntentWithContext({
      question: currentQuestion,
      response: processedUserResponse,
      sessionId: sessionId,
    });

    if (!classificationResult.success) {
      throw new Error(classificationResult.error);
    }

    // Handle different intent types (same logic as processSurveyResponse)
    const intent = classificationResult.data?.intent;
    let system_response: any = {};

    if (intent === "unexpected_answer" || intent === "other") {
      const otherClassResult = await classifyOtherResponseClassification({
        question: currentQuestion,
        response: processedUserResponse,
      });

      if (otherClassResult.success && otherClassResult.data) {
        const { category } = otherClassResult.data;

        if (category === "tidak_tahu") {
          // Remove previous response for this question_code if exists
          session.responses = session.responses.filter(r => r.question_code !== currentQuestion.code);
          session.responses.push({
            question_code: currentQuestion.code,
            valid_response: "Tidak tahu",
          });

          system_response = {
            info: "answer_updated",
            currentQuestion: targetQuestion,
            improved_response: "Tidak tahu",
            message: "Jawaban berhasil diperbarui",
          };
        } else if (category === "tidak_mau_menjawab") {
          // Remove previous response for this question_code if exists
          session.responses = session.responses.filter(r => r.question_code !== currentQuestion.code);
          session.responses.push({
            question_code: currentQuestion.code,
            valid_response: "",
          });

          system_response = {
            info: "answer_updated",
            currentQuestion: targetQuestion,
            improved_response: "",
            message: "Jawaban berhasil diperbarui",
          };
        } else {
          // Default for "lainnya"
          system_response = {
            info: "unexpected_answer_or_other",
            currentQuestion: targetQuestion,
            clarification_reason: classificationResult.data?.clarification_reason,
            follow_up_question: classificationResult.data?.follow_up_question,
            improved_response: classificationResult.data?.improved_response,
            message: "Jawaban memerlukan klarifikasi",
          };
        }
      }
    } else if (intent === "question") {
      try {
        const ragApiUrl = process.env.RAG_API_URL || "";
        if (!ragApiUrl) {
          throw new Error("RAG API URL is not configured");
        }

        const questionToAsk =
          classificationResult.data?.improved_response || processedUserResponse;
        const response = await fetch(`${ragApiUrl}/api/rag/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: questionToAsk }),
        });

        if (!response.ok) {
          throw new Error(`RAG API responded with status: ${response.status}`);
        }

        const ragResult = await response.json();
        system_response = {
          info: "question",
          currentQuestion: targetQuestion,
          answer: ragResult.answer || ragResult,
          improved_response: classificationResult.data?.improved_response,
          message: "Pertanyaan Anda telah dijawab",
        };
      } catch (error) {
        console.error("Error calling RAG API:", error);
        system_response = {
          info: "error",
          currentQuestion: targetQuestion,
          additional_info: "Maaf, sistem belum dapat menjawab pertanyaan Anda.",
          improved_response: classificationResult.data?.improved_response,
          message: "Terjadi kesalahan saat memproses pertanyaan",
        };
      }
    } else if (intent === "expected_answer") {
      // Use the improved response for extraction
      const improvedResponse =
        classificationResult.data?.improved_response || processedUserResponse;

      // Process the answer with improved response
      const extractionResult = await extractInformation({
        question: currentQuestion,
        response: improvedResponse,
      });

      if (!extractionResult.success) {
        throw new Error(extractionResult.error);
      }

      // Prepare response data
      const extractedInfo = extractionResult.data?.extracted_information ?? "";

      // Remove previous response for this question_code if exists
      session.responses = session.responses.filter(r => r.question_code !== currentQuestion.code);
      session.responses.push({
        question_code: currentQuestion.code,
        valid_response: extractedInfo,
      });

      system_response = {
        info: "answer_updated",
        currentQuestion: targetQuestion,
        improved_response: classificationResult.data?.improved_response,
        extracted_answer: extractedInfo,
        message: "Jawaban berhasil diperbarui",
      };
    }

    // Save session
    await session.save();

    res.json({
      success: true,
      ...system_response,
      session_id: sessionId,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
