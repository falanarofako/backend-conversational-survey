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
import SurveyMessageBundle from "../models/SurveyMessageBundle";
import QuestionnaireModel from "../models/Questionnaire";
import { analyzeSurveyIntent } from "./surveyIntentService";
import { classifyIntentWithContext } from "./enhancedIntentClassificationService";
import { classifyOtherResponseClassification } from "./otherResponseClassificationService";
import { response } from "express";

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
      metrics: { is_breakoff: true },
      last_question_timestamp: new Date(),
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
        "Terima kasih sudah bersedia mengikuti survei ini! Silakan jawab pertanyaan berikut dengan jujur dan sesuai pengalaman Anda. Apakah Anda siap memulai?",
      first_question: latestQuestionnaire.survey.categories[0].questions[0],
    };

    await addSurveyMessage(
      userId,
      null,
      system_response,
      (newSession._id as mongoose.Types.ObjectId).toString(),
      "survey"
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

    // Hitung metrik respons
    const totalQuestions = surveySession.responses.length;
    const item_nonresponse = surveySession.responses.filter(
      (r) =>
        r.valid_response === "" ||
        r.valid_response === null ||
        r.valid_response === undefined
    ).length;
    const dont_know_response = surveySession.responses.filter(
      (r) =>
        typeof r.valid_response === "string" &&
        r.valid_response.toLowerCase() === "tidak tahu"
    ).length;
    const response_times = surveySession.responses
      .map((r) => (typeof r.response_time === "number" ? r.response_time : 0))
      .filter((rt) => rt > 0);
    const avg_response_time =
      response_times.length > 0
        ? response_times.reduce((a, b) => a + b, 0) / response_times.length
        : 0;
    const is_breakoff = item_nonresponse > 0;

    surveySession.status = "COMPLETED";
    updateSessionMetrics(surveySession);
    
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

// Helper to update metrics on a session
export function updateSessionMetrics(session: any) {
  const dont_know_response = session.responses.filter(
    (r: any) =>
      typeof r.valid_response === "string" &&
      r.valid_response.toLowerCase() === "tidak tahu"
  ).length;
  const response_times = session.responses
    .map((r: any) => (typeof r.response_time === "number" ? r.response_time : 0))
    .filter((rt: number) => rt > 0);
  const avg_response_time =
    response_times.length > 0
      ? response_times.reduce((a: number, b: number) => a + b, 0) / response_times.length
      : 0;
  // is_breakoff true jika status session bukan COMPLETED
  const is_breakoff = session.status !== "COMPLETED";
  session.metrics = {
    is_breakoff,
    avg_response_time,
    item_nonresponse: session.responses.filter(
      (r: any) =>
        r.valid_response === "" ||
        r.valid_response === null ||
        r.valid_response === undefined
    ).length,
    dont_know_response,
  };
}

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
export const updateQuestionOptions = async (
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
export const replacePlaceholders = async (
  currentQuestion: any,
  sessionId: string
): Promise<any> => {
  const placeholders = ["${S005}", "${S007}", "${currentMonth}"];

  for (const placeholder of placeholders) {
    if (currentQuestion.text.includes(placeholder)) {
      console.log(
        "Current question text before replacement:",
        currentQuestion.text
      );
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
          console.log(
            "Current question text after replacement:",
            currentQuestion.text
          );
        }
      }
    }
  }

  return currentQuestion;
};

// Process a survey response
export const processSurveyResponse = async (
  userId: string,
  userResponse: string,
  sessionId?: string,
  survey?: any
) => {
  // Get the survey if not provided
  if (!survey) {
    const latestQuestionnaire = await QuestionnaireModel.findOne().sort({
      createdAt: -1,
    });
    if (!latestQuestionnaire) {
      throw new Error("Questionnaire not found");
    }
    survey = latestQuestionnaire.survey;
  }

  // If no sessionId, check if user has active session
  let session;
  if (!sessionId) {
    session = await getUserActiveSurveySession(userId);
    if (session) {
      sessionId = (session._id as mongoose.Types.ObjectId).toString();
    }
  } else {
    session = await SurveySession.findById(sessionId);
  }

  // Initialize response
  let system_response: any = {};
  let shouldSaveSession = false;

  // No active session - analyze intent
  if (!session) {
    const intentResult = await analyzeSurveyIntent(userResponse);
    if (!intentResult.success || !intentResult.data) {
      throw new Error(intentResult.error || "Failed to analyze survey intent");
    }

    if (intentResult.data.wants_to_start) {
      // Create new session
      session = await startSurveySessionInternal(userId, survey);
      sessionId = (session._id as mongoose.Types.ObjectId).toString();

      // Prepare response
      system_response = {
        info: "survey_started",
        intent_analysis: {
          wants_to_start: true,
          confidence: intentResult.data.confidence,
          explanation: intentResult.data.explanation,
        },
        additional_info: `Terima kasih sudah bersedia mengikuti survei ini! Silakan jawab pertanyaan berikut dengan jujur dan sesuai pengalaman Anda.`,
        next_question: survey.categories[0].questions[0],
      };
      // Set timestamp untuk pertanyaan pertama
      session.last_question_timestamp = new Date();
      await session.save();

    } else {
      console.log("Test aja");
      // User doesn't want to start survey
      system_response = {
        info: "not_ready_for_survey",
        intent_analysis: {
          wants_to_start: false,
          confidence: intentResult.data.confidence,
          explanation: intentResult.data.explanation,
        },
        system_message:
          intentResult.data.system_message ||
          "Sepertinya Anda belum siap untuk memulai survei. Silakan kirim pesan kapan saja jika Anda ingin memulai.",
      };
    }
  } else {
    // Have active session - process response with enhanced intent classification
    if (session.status !== "IN_PROGRESS") {
      throw new Error("Survey session already completed");
    }

    // Di fungsi processSurveyResponse, tambahkan logging
    console.log("Current responses in session:", session.responses);
    
    if (!sessionId) {
      throw new Error("Session ID not found");
    }
    // Get current question
    let currentQuestion = survey.categories.flatMap(
      (category: any) => category.questions
    )[session.current_question_index];

    // Process the question
    if (
      ["S002", "S004", "S003", "S005", "S007"].includes(currentQuestion.code)
    ) {
      currentQuestion = await updateQuestionOptions(currentQuestion, sessionId);
    }

    currentQuestion = await replacePlaceholders(currentQuestion, sessionId);

    // Special handling for S006 (timestamp)
    const processedUserResponse =
      currentQuestion.code === "S006"
        ? `${userResponse} (Dikirim pada ${new Date().toLocaleString()})`
        : userResponse;

    // Use enhanced context-aware classification that returns improved responses
    const classificationResult = await classifyIntentWithContext({
      question: currentQuestion,
      response: processedUserResponse,
      sessionId: sessionId,
    });

    if (!classificationResult.success) {
      throw new Error(classificationResult.error);
    }

    // Handle different intent types
    const intent = classificationResult.data?.intent;

    if (intent === "unexpected_answer" || intent === "other") {
      // Tambahan: klasifikasi lebih lanjut untuk intent "other"
      // if (intent === "other") {
      const otherClassResult = await classifyOtherResponseClassification({
        question: currentQuestion,
        response: processedUserResponse,
      });

      if (otherClassResult.success && otherClassResult.data) {
        const { category } = otherClassResult.data;

        if (category === "tidak_tahu") {
          // Remove previous response for this question_code if exists
          session.responses = session.responses.filter(r => r.question_code !== currentQuestion.code);
          let response_time = undefined;
          if (session.last_question_timestamp) {
            response_time = Date.now() - new Date(session.last_question_timestamp).getTime(); // ms
          }
          session.responses.push({
            question_code: currentQuestion.code,
            valid_response: "Tidak tahu",
            ...(response_time !== undefined ? { response_time } : {}),
          });

          updateSessionMetrics(session);
          // Lanjutkan ke pertanyaan berikutnya
          session.current_question_index += 1;
          let nextQuestion = survey.categories.flatMap(
            (cat: any) => cat.questions
          )[session.current_question_index];
          nextQuestion = await replacePlaceholders(nextQuestion, sessionId);
          // Set timestamp untuk pertanyaan berikutnya (hanya jika nextQuestion ada)
          if (nextQuestion) {
            session.last_question_timestamp = new Date();
            await session.save();
          }

          system_response = {
            info: "expected_answer",
            next_question: nextQuestion || null,
            improved_response: "Tidak tahu",
          };
          // Return response
          await addSurveyMessage(
            userId,
            userResponse,
            system_response,
            sessionId,
            "survey"
          );
          return {
            ...system_response,
            session_id: sessionId,
          };
        } else if (category === "tidak_mau_menjawab") {
          // Remove previous response for this question_code if exists
          session.responses = session.responses.filter(r => r.question_code !== currentQuestion.code);
          let response_time = undefined;
          if (session.last_question_timestamp) {
            response_time = Date.now() - new Date(session.last_question_timestamp).getTime(); // ms
          }
          session.responses.push({
            question_code: currentQuestion.code,
            valid_response: "",
            ...(response_time !== undefined ? { response_time } : {}),
          });

          updateSessionMetrics(session);
          // Lanjutkan ke pertanyaan berikutnya
          session.current_question_index += 1;
          let nextQuestion = survey.categories.flatMap(
            (cat: any) => cat.questions
          )[session.current_question_index];
          nextQuestion = await replacePlaceholders(nextQuestion, sessionId);
          if (nextQuestion) {
            session.last_question_timestamp = new Date();
            await session.save();
          }

          system_response = {
            info: "expected_answer",
            next_question: nextQuestion || null,
            improved_response: "",
          };
          // Return response
          await addSurveyMessage(
            userId,
            userResponse,
            system_response,
            sessionId,
            "survey"
          );
          return {
            ...system_response,
            session_id: sessionId,
          };
        }
        // Jika "lainnya", teruskan ke flow sebelumnya (default di bawah)
      }
      // }
      // Default/flow sebelumnya untuk "unexpected_answer" atau "other" (lainnya)
      system_response = {
        info: "unexpected_answer_or_other",
        currentQuestion: currentQuestion,
        clarification_reason: classificationResult.data?.clarification_reason,
        follow_up_question: classificationResult.data?.follow_up_question,
        improved_response: classificationResult.data?.improved_response,
      };
    } else if (intent === "question") {
      try {
        // Get the RAG API URL from environment variables
        const ragApiUrl = process.env.RAG_API_URL || "";
        if (!ragApiUrl) {
          throw new Error("RAG API URL is not configured");
        }

        console.log("ragApiUrl", ragApiUrl);

        // Call RAG API - use improved_response if available
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
          currentQuestion: currentQuestion,
          answer: ragResult.answer || ragResult,
          improved_response: classificationResult.data?.improved_response,
        };
      } catch (error) {
        console.error("Error calling RAG API:", error);
        system_response = {
          info: "error",
          additional_info:
            "Maaf, sistem belum dapat menjawab pertanyaan Anda. Mohon jawab pertanyaan sebelumnya.",
          currentQuestion: currentQuestion,
          improved_response: classificationResult.data?.improved_response,
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
      let response_time = undefined;
      if (session.last_question_timestamp) {
        response_time = Date.now() - new Date(session.last_question_timestamp).getTime(); // ms
      }
      session.responses.push({
        question_code: currentQuestion.code,
        valid_response: extractedInfo,
        ...(response_time !== undefined ? { response_time } : {}),
      });

      updateSessionMetrics(session);
      // Handle skiplogic
      const skipMapping: Record<string, Record<string, number>> = {
        S008: { Ya: 14, Tidak: 15 },
        S012: { Ya: 18, Tidak: 25 },
      };

      if (
        skipMapping[currentQuestion.code] &&
        typeof extractedInfo === "string" &&
        skipMapping[currentQuestion.code][extractedInfo]
      ) {
        session.current_question_index =
          skipMapping[currentQuestion.code][extractedInfo];
      } else {
        if (
          currentQuestion.code === "KR004" &&
          extractedInfo === "Tidak Bekerja"
        ) {
          session.current_question_index += 2;
        } else {
          session.current_question_index += 1;
        }
      }

      // Check if survey is complete
      const totalQuestions = survey.categories.flatMap(
        (cat: any) => cat.questions
      ).length;

      if (session.current_question_index >= totalQuestions) {
        session.status = "COMPLETED";
        await User.findByIdAndUpdate(userId, {
          $unset: { activeSurveySessionId: 1 },
        });
        updateSessionMetrics(session);
        await session.save();
        system_response = {
          info: "survey_completed",
          additional_info:
            "Survei telah berakhir, terima kasih telah menyelesaikan survei!",
          improved_response: classificationResult.data?.improved_response,
        };
      } else {
        // Get next question
        let nextQuestion = survey.categories.flatMap(
          (cat: any) => cat.questions
        )[session.current_question_index];
        nextQuestion = await replacePlaceholders(nextQuestion, sessionId);
        // Set timestamp untuk pertanyaan berikutnya
        session.last_question_timestamp = new Date();
        await session.save();
        system_response = {
          info: "expected_answer",
          next_question: nextQuestion || null,
          improved_response: classificationResult.data?.improved_response,
        };
      }

      // shouldSaveSession = true;
    }
  }

  // Store message with user_id directly - include improved_response in the system_response
  await addSurveyMessage(
    userId,
    userResponse,
    system_response,
    sessionId,
    "survey"
  );

  if (!session) {
    if (!sessionId) {
      return {
        ...system_response,
        session_id: "",
      };
    } else {
      throw new Error("Survey session not found");
    }
  }

  if (session.current_question_index === 5) {
    const kr004Response = session.responses.find(
      (response) => response.question_code === "KR004"
    );

    if (kr004Response && kr004Response.valid_response === "Tidak Bekerja") {
      // Update session data
      session.responses.push({
        question_code: "KR005",
        valid_response: "N/A",
      });
      const newSession = await session.save();
      console.log("new session: ", newSession);
    }
  }

  // Return appropriate response
  return {
    ...system_response,
    session_id: sessionId,
  };
};

// Internal function for starting survey session without creating a welcome message
// (the welcome message will be created in processSurveyResponse)
async function startSurveySessionInternal(userId: string, survey: any) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find the user
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    // Check if user already has active session
    if (user.activeSurveySessionId) {
      const existingSession = await SurveySession.findById(
        user.activeSurveySessionId
      );
      if (existingSession && existingSession.status === "IN_PROGRESS") {
        await session.abortTransaction();
        session.endSession();
        return existingSession;
      }
    }

    // Create new session
    const newSession = new SurveySession({
      user_id: new mongoose.Types.ObjectId(userId),
      responses: [],
      metrics: { is_breakoff: true },
      last_question_timestamp: new Date(),
    });

    await newSession.save({ session });

    // Update user reference
    user.activeSurveySessionId = newSession._id as mongoose.Types.ObjectId;
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();

    return newSession;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error("Error starting survey session:", error);
    throw error;
  }
}

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

    // Get bundle for the user (all messages across sessions)
    const userBundle = await SurveyMessageBundle.findOne({ user_id: session.user_id });
    const messages = userBundle ? userBundle.messages : [];

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

export const getSurveySessionMessages = async (userId: string) => {
  try {
    // Fetch all bundles for the user and flatten messages
    const bundles = await SurveyMessageBundle.find({ user_id: userId });
    const allMessages = bundles
      .flatMap((b) => b.messages)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return allMessages;
  } catch (error) {
    console.error("Error getting survey session messages:", error);
    throw error;
  }
};

export const addSurveyMessage = async (
  userId: string,
  userMessage: string | null,
  systemResponse: any,
  sessionId?: string,
  mode: "survey" | "qa" = "survey"
) => {
  try {
    const filter = {
      user_id: new mongoose.Types.ObjectId(userId),
    } as any;

    const update = {
      $push: {
        messages: {
          user_message: userMessage,
          system_response: systemResponse,
          mode,
          timestamp: new Date(),
        },
      },
    };

    const options = { upsert: true, new: true } as any;

    const bundle = await SurveyMessageBundle.findOneAndUpdate(filter, update, options);

    return bundle;
  } catch (error) {
    console.error("Error adding survey message:", error);
    throw error;
  }
};
