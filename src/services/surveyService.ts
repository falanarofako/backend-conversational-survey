// src/services/surveyService.ts

import SurveySession, {
  IResponse,
  ISurveySession,
} from "../models/SurveySession";
import User from "../models/User";
import { classifyIntent } from "../services/intentClassificationService";
import { extractInformation } from "../services/informationExtractionService";
import {
  getProvinceNames,
  getRegencyNamesByProvinceName,
} from "./provincesAndRegenciesService";
import mongoose from "mongoose";
import SurveyMessage from "../models/SurveyMessage";
import QuestionnaireModel from "../models/Questionnaire";

// Start a new survey session for a user
export const startSurveySession = async (userId: string, survey: any) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if the user already has an active session
    if (user.activeSurveySessionId) {
      // Return the existing session instead of creating a new one
      const existingSession = await SurveySession.findById(
        user.activeSurveySessionId
      );
      if (existingSession && existingSession.status === "IN_PROGRESS") {
        await session.abortTransaction();
        session.endSession();
        return existingSession;
      }
    }

    // Create a new survey session
    const newSession = new SurveySession({
      user_id: new mongoose.Types.ObjectId(userId),
      responses: [],
    });

    // Save the new session
    await newSession.save({ session });

    // Update the user's active session reference
    user.activeSurveySessionId = newSession._id as mongoose.Types.ObjectId;
    await user.save({ session });

    // Get the latest questionnaire
    const latestQuestionnaire = await QuestionnaireModel.findOne()
      .sort({
        createdAt: -1,
      })
      .session(session); // Use the same session for this query
    if (!latestQuestionnaire) {
      throw new Error("Questionnaire not found");
    }

    const system_response = {
      initial_message:
        "Selamat datang! Survei ini bertujuan untuk mengumpulkan informasi tentang proﬁl wisatawan nusantara, maksud perjalanan, akomodasi yang digunakan, lama perjalanan, dan rata-rata pengeluaran terkait perjalanan yang dilakukan oleh penduduk Indonesia di dalam wilayah teritorial Indonesia. Apakah Anda siap memulai?",
      first_question: latestQuestionnaire.survey.categories[0].questions[0],
    };

    await SurveyMessage.create(
      [
        {
          session_id: newSession._id,
          user_message: null,
          system_response: system_response,
        },
      ],
      { session } // Use the same session for this operation
    );

    await session.commitTransaction();
    session.endSession();

    return newSession;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error starting survey session:", error);
    throw error;
  }
};

// Complete a survey session
export const completeSurveySession = async (
  sessionId: string
): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Update the survey session status to completed
    const surveySession = await SurveySession.findById(sessionId);
    if (!surveySession) {
      throw new Error("Survey session not found");
    }

    surveySession.status = "COMPLETED";
    await surveySession.save({ session });

    // Remove the active session reference from the user
    await User.findByIdAndUpdate(
      surveySession.user_id,
      { $unset: { activeSurveySessionId: 1 } },
      { session }
    );

    await session.commitTransaction();
    session.endSession();
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error completing survey session:", error);
    throw error;
  }
};

// Get valid response for a question from a session
async function getValidResponse(
  sessionId: string,
  questionCode: string
): Promise<any | null> {
  try {
    // Find the SurveySession by sessionId
    const session = await SurveySession.findById(sessionId);

    if (!session) {
      throw new Error("Survey session not found");
    }

    // Find response by question_code
    const response = session.responses.find(
      (resp: IResponse) => resp.question_code === questionCode
    );

    if (response) {
      return response.valid_response;
    }

    // If response not found
    return null;
  } catch (error) {
    console.error("Error fetching valid response:", error);
    throw error;
  }
}

// Update question options based on previous responses
const updateQuestionOptions = async (
  currentQuestion: any,
  sessionId: string
): Promise<any> => {
  try {
    // Handle province questions (S002, S004)
    if (currentQuestion.code === "S002" || currentQuestion.code === "S004") {
      // Get province names from database - async call
      const provinceNames = await getProvinceNames();
      currentQuestion.options = provinceNames;
    }
    // Handle regency questions based on selected province (S003)
    else if (currentQuestion.code === "S003") {
      const provinceName = await getValidResponse(sessionId, "S002");
      if (provinceName) {
        // Get regency names from database - async call
        const regencyNames = await getRegencyNamesByProvinceName(provinceName);
        currentQuestion.options = regencyNames || [];

        // Update system guidelines if needed
        if (
          currentQuestion.system_guidelines &&
          currentQuestion.system_guidelines.length > 0
        ) {
          for (let i = 0; i < currentQuestion.system_guidelines.length; i++) {
            if (
              currentQuestion.system_guidelines[i].includes(
                "${choosenProvince}"
              )
            ) {
              currentQuestion.system_guidelines[i] =
                currentQuestion.system_guidelines[i].replace(
                  "${choosenProvince}",
                  provinceName
                );
            }
          }
        }
      } else {
        console.error(
          `Province name not found for question ${currentQuestion.code}`
        );
        currentQuestion.options = []; // or handle as needed
      }
    }
    // Handle regency questions based on selected province (S005)
    else if (currentQuestion.code === "S005") {
      const provinceName = await getValidResponse(sessionId, "S004");
      if (provinceName) {
        // Get regency names from database - async call
        const regencyNames = await getRegencyNamesByProvinceName(provinceName);
        currentQuestion.options = regencyNames || [];

        // Update system guidelines if needed
        if (
          currentQuestion.system_guidelines &&
          currentQuestion.system_guidelines.length > 0
        ) {
          for (let i = 0; i < currentQuestion.system_guidelines.length; i++) {
            if (
              currentQuestion.system_guidelines[i].includes(
                "${choosenProvince}"
              )
            ) {
              currentQuestion.system_guidelines[i] =
                currentQuestion.system_guidelines[i].replace(
                  "${choosenProvince}",
                  provinceName
                );
            }
          }
        }
      } else {
        console.error(
          `Province name not found for question ${currentQuestion.code}`
        );
        currentQuestion.options = []; // or handle as needed
      }
    }
    // Handle month selection (S007)
    else if (currentQuestion.code === "S007") {
      const monthNamesChosen = await getValidResponse(sessionId, "S006");
      if (monthNamesChosen) {
        currentQuestion.options = monthNamesChosen;
      } else {
        console.error(
          `Month names not found for question ${currentQuestion.code}`
        );
        currentQuestion.options = []; // or handle as needed
      }
    }

    return currentQuestion; // Return the updated question
  } catch (error) {
    console.error(
      `Error updating question options for ${currentQuestion.code}:`,
      error
    );
    // Return the original question if there's an error
    return currentQuestion;
  }
};

// Get current month name
const getCurrentMonthName = (): string => {
  const months = [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember",
  ];

  const currentMonth = new Date().getMonth();
  return months[currentMonth];
};

// Replace placeholders in question text
const replacePlaceholders = async (
  currentQuestion: any,
  sessionId: string
): Promise<any> => {
  const placeholders = ["${S005}", "${S007}", "${currentMonth}"];

  for (const placeholder of placeholders) {
    if (currentQuestion.text.includes(placeholder)) {
      if (placeholder === "${currentMonth}") {
        const currentMonthName = getCurrentMonthName();
        currentQuestion.text = currentQuestion.text.replace(
          placeholder,
          currentMonthName
        );
      } else {
        const questionCode = placeholder === "${S005}" ? "S005" : "S007";
        const validResponse = await getValidResponse(sessionId, questionCode);

        if (validResponse) {
          currentQuestion.text = currentQuestion.text.replace(
            placeholder,
            validResponse
          );
        }
      }
    }
  }

  return currentQuestion;
};

// Process a survey response
export const processSurveyResponse = async (
  sessionId: string,
  userResponse: string,
  survey: any
) => {
  // Find the session in one query and ensure it's active
  const session = await SurveySession.findById(sessionId);
  if (!session || session.status !== "IN_PROGRESS") {
    throw new Error("Survey session not found or already completed");
  }

  // Get current question efficiently
  let currentQuestion = survey.categories.flatMap(
    (category: any) => category.questions
  )[session.current_question_index];

  // Handle dynamic question updates in one pass
  if (["S002", "S004", "S003", "S005", "S007"].includes(currentQuestion.code)) {
    currentQuestion = await updateQuestionOptions(currentQuestion, sessionId);
  }
  currentQuestion = await replacePlaceholders(currentQuestion, sessionId);

  // Special handling for S006 (timestamp)
  const processedUserResponse = currentQuestion.code === "S006" 
    ? `${userResponse} (Dikirim pada ${new Date().toLocaleString()})` 
    : userResponse;

  // Classify intent (no change - already efficient)
  const classificationResult = await classifyIntent({
    question: currentQuestion,
    response: processedUserResponse,
  });

  if (!classificationResult.success) {
    throw new Error(classificationResult.error);
  }

  // Create response object first - we'll save it once at the end
  let system_response: any = {};
  let shouldSaveSession = false;
  
  // Handle different intent types more efficiently
  const intent = classificationResult.data?.intent;
  
  if (intent === "unexpected_answer" || intent === "other") {
    system_response = {
      info: "unexpected_answer_or_other",
      currentQuestion: currentQuestion,
      clarification_reason: classificationResult.data?.clarification_reason,
      follow_up_question: classificationResult.data?.follow_up_question,
    };
  } 
  else if (intent === "question") {
    try {
      // Get the RAG API URL from environment variables
      const ragApiUrl = process.env.RAG_API_URL || "";
      if (!ragApiUrl) {
        throw new Error("RAG API URL is not configured");
      }

      // Call RAG API in one request
      const response = await fetch(`${ragApiUrl}/api/rag/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: processedUserResponse }),
      });

      if (!response.ok) {
        throw new Error(`RAG API responded with status: ${response.status}`);
      }

      const ragResult = await response.json();
      system_response = {
        info: "question",
        currentQuestion: currentQuestion,
        answer: ragResult.answer || ragResult,
      };
    } catch (error) {
      console.error("Error calling RAG API:", error);
      system_response = {
        info: "error",
        additional_info: "Maaf, sistem belum dapat menjawab pertanyaan Anda. Mohon jawab pertanyaan sebelumnya.",
        currentQuestion: currentQuestion,
      };
    }
  } 
  else if (intent === "expected_answer") {
    // Process the answer
    const extractionResult = await extractInformation({
      question: currentQuestion,
      response: processedUserResponse,
    });

    if (!extractionResult.success) {
      throw new Error(extractionResult.error);
    }

    // Prepare response data
    const extractedInfo = extractionResult.data?.extracted_information ?? "";
    
    // Update session data efficiently
    session.responses.push({
      question_code: currentQuestion.code,
      valid_response: extractedInfo,
    });

    // Handle skiplogic more efficiently
    const skipMapping: Record<string, Record<string, number>> = {
      S008: { Ya: 14, Tidak: 15 },
      S012: { Ya: 18, Tidak: 25 },
    };

    if (
      skipMapping[currentQuestion.code] &&
      typeof extractedInfo === "string" &&
      skipMapping[currentQuestion.code][extractedInfo]
    ) {
      session.current_question_index = skipMapping[currentQuestion.code][extractedInfo];
    } else {
      session.current_question_index += 1;
    }

    // Check if survey is complete
    const totalQuestions = survey.categories.flatMap((cat: any) => cat.questions).length;
    
    if (session.current_question_index >= totalQuestions) {
      session.status = "COMPLETED";
      
      // Remove the active session reference from the user in a separate operation
      // This is more efficient as it's only needed when completing the survey
      await User.findByIdAndUpdate(session.user_id, {
        $unset: { activeSurveySessionId: 1 },
      });

      system_response = {
        info: "survey_completed",
        additional_info: "Survei telah berakhir, terima kasih telah menyelesaikan survei!",
      };
    } else {
      // Get next question efficiently
      let nextQuestion = survey.categories.flatMap((cat: any) => cat.questions)[
        session.current_question_index
      ];
      nextQuestion = await replacePlaceholders(nextQuestion, sessionId);
      
      system_response = {
        info: "expected_answer",
        next_question: nextQuestion || null,
      };
    }
    
    shouldSaveSession = true;
  }

  // Create survey message
  await SurveyMessage.create({
    session_id: sessionId,
    user_message: processedUserResponse,
    system_response: system_response,
  });

  // Only save session if needed
  if (shouldSaveSession) {
    await session.save();
  }

  return system_response;
};

// Get user's active session
export const getUserActiveSurveySession = async (
  userId: string
): Promise<ISurveySession | null> => {
  try {
    const user = await User.findById(userId);
    if (!user || !user.activeSurveySessionId) {
      return null;
    }

    return await SurveySession.findById(user.activeSurveySessionId);
  } catch (error) {
    console.error("Error getting user's active survey session:", error);
    throw error;
  }
};

export const getSurveySessionStatus = async (sessionId: string) => {
  try {
    // Find the survey session
    const session = await SurveySession.findById(sessionId);

    if (!session) {
      throw new Error("Survey session not found");
    }

    // Get the latest questionnaire
    const latestQuestionnaire = await QuestionnaireModel.findOne().sort({
      createdAt: -1,
    });

    if (!latestQuestionnaire) {
      throw new Error("Questionnaire not found");
    }

    // Get all questions from the questionnaire
    const allQuestions = latestQuestionnaire.survey.categories.flatMap(
      (category: any) => category.questions
    );

    // Get total question count
    const totalQuestions = allQuestions.length;

    // Get current question (or null if survey is completed)
    let currentQuestion = null;
    if (
      session.status === "IN_PROGRESS" &&
      session.current_question_index < totalQuestions
    ) {
      currentQuestion = allQuestions[session.current_question_index];
    }

    // Get all messages for this session
    const messages = await SurveyMessage.find({
      session_id: sessionId,
    }).sort({ timestamp: 1 });

    // Get response statistics
    const answeredQuestions = session.responses.length;
    const progressPercentage = Math.round(
      (answeredQuestions / totalQuestions) * 100
    );

    // Get answered question codes
    const answeredQuestionCodes = session.responses.map(
      (response) => response.question_code
    );

    // Get current question code
    const currentQuestionCode = currentQuestion ? currentQuestion.code : null;

    return {
      session_id: session._id,
      user_id: session.user_id,
      status: session.status,
      started_at: session.createdAt,
      updated_at: session.updatedAt,
      progress: {
        total_questions: totalQuestions,
        answered_questions: answeredQuestions,
        current_question_index: session.current_question_index,
        current_question_code: currentQuestionCode,
        progress_percentage: progressPercentage,
        answered_question_codes: answeredQuestionCodes,
      },
      message_count: messages.length,
      responses: session.responses,
    };
  } catch (error) {
    console.error("Error getting survey session status:", error);
    throw error;
  }
};

export const getSurveySessionMessages = async (sessionId: string) => {
  try {
    // Validate that the survey session exists
    const session = await SurveySession.findById(sessionId);

    if (!session) {
      throw new Error("Survey session not found");
    }

    // Fetch all messages for this session, sorted by timestamp
    const messages = await SurveyMessage.find({
      session_id: sessionId,
    }).sort({ timestamp: 1 });

    return messages;
  } catch (error) {
    console.error("Error getting survey session messages:", error);
    throw error;
  }
};
