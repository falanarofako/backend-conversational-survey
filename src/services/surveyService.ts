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
        ? Math.round((response_times.reduce((a: number, b: number) => a + b, 0) / response_times.length) * 100) / 100
        : 0;
    const is_breakoff = item_nonresponse > 0;

    surveySession.status = "COMPLETED";
    updateSessionMetrics(surveySession);
    
    // Ensure all skipped questions are filled with "N/A" before completing
    await ensureSkippedQuestionsFilled(surveySession);
    
    await surveySession.save({ session });

    // Remove the active session reference from the user
    // await User.findByIdAndUpdate(
    //   surveySession.user_id,
    //   { $unset: { activeSurveySessionId: 1 } },
    //   { session }
    // );

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
      ? Math.round((response_times.reduce((a: number, b: number) => a + b, 0) / response_times.length) * 100) / 100
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

// Helper diubah menjadi sinkron dan menerima objek session, bukan sessionId
function getValidResponse(
  session: ISurveySession,
  questionCode: string
): any | null {
  if (!session) {
    return null;
  }
  const response = session.responses.find(
    (resp: IResponse) => resp.question_code === questionCode
  );
  return response ? response.valid_response : null;
}

// Update question options based on previous responses
export const updateQuestionOptions = async (
  currentQuestion: any,
  session: ISurveySession
): Promise<any> => {
  try {
    // Add validation to prevent errors when currentQuestion is undefined
    if (!currentQuestion || !currentQuestion.code) {
      return currentQuestion;
    }
    
    // Handle province questions (S002, S004)
    if (currentQuestion.code === "S002" || currentQuestion.code === "S004") {
      // Get province names from database - async call
      const provinceNames = await getProvinceNames();
      currentQuestion.options = provinceNames;
    }
    // Handle regency questions based on selected province (S003)
    else if (currentQuestion.code === "S003") {
      const provinceName = getValidResponse(session, "S002");
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
      const provinceName = getValidResponse(session, "S004");
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
      const monthNamesChosen = getValidResponse(session, "S006");
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

// Replace placeholders in question text (diubah menjadi sinkron)
export const replacePlaceholders = (
  currentQuestion: any,
  session: ISurveySession
): any => {
  // Add validation to prevent errors when currentQuestion is undefined
  if (!currentQuestion || !currentQuestion.text) {
    return currentQuestion;
  }

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
        const validResponse = getValidResponse(session, questionCode);

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

      // Get first question and replace placeholders like ${currentMonth}
      let firstQuestion = survey.categories[0].questions[0];
      firstQuestion = replacePlaceholders(firstQuestion, session);

      // Prepare response
      system_response = {
        info: "survey_started",
        intent_analysis: {
          wants_to_start: true,
          confidence: intentResult.data.confidence,
          explanation: intentResult.data.explanation,
        },
        additional_info: `Terima kasih sudah bersedia mengikuti survei ini! Silakan jawab pertanyaan berikut dengan jujur dan sesuai pengalaman Anda.`,
        next_question: firstQuestion,
      };
      // Set timestamp untuk pertanyaan pertama
      session.last_question_timestamp = new Date();
      await session.save();

    } else {
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
    
    // Get all questions from survey
    const allQuestions = survey.categories.flatMap(
      (category: any) => category.questions
    );
    
    // Check if current question index is valid
    if (session.current_question_index >= allQuestions.length) {
      // Survey is already completed
      system_response = {
        info: "survey_completed",
        additional_info: "Survei telah selesai. Tidak ada pertanyaan lagi yang perlu dijawab.",
      };
      
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
    
    // Get current question
    let currentQuestion = allQuestions[session.current_question_index];

    // Process the question
    if (
      currentQuestion &&
      ["S002", "S004", "S003", "S005", "S007"].includes(currentQuestion.code)
    ) {
      currentQuestion = await updateQuestionOptions(currentQuestion, session);
    }

    currentQuestion = replacePlaceholders(currentQuestion, session);

    // Special handling for S006 (timestamp)
    const processedUserResponse =
      currentQuestion && currentQuestion.code === "S006"
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

        if (category === "tidak_tahu" && currentQuestion) {
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
          
          let nextQuestion = allQuestions[session.current_question_index];

          // Jalankan replace placeholder di sini menggunakan session dari memori
          if (nextQuestion) {
            nextQuestion = replacePlaceholders(nextQuestion, session);
          }
          
          if (nextQuestion) {
            session.last_question_timestamp = new Date();
          }
          await session.save();

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
        } else if (category === "tidak_mau_menjawab" && currentQuestion) {
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
          
          let nextQuestion = allQuestions[session.current_question_index];
          
          // Jalankan replace placeholder di sini menggunakan session dari memori
          if (nextQuestion) {
            nextQuestion = replacePlaceholders(nextQuestion, session);
          }
          
          if (nextQuestion) {
            session.last_question_timestamp = new Date();
          }
          await session.save();

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
        currentQuestion: currentQuestion || null,
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
          currentQuestion: currentQuestion || null,
          answer: ragResult.answer || ragResult,
          improved_response: classificationResult.data?.improved_response,
        };
      } catch (error) {
        console.error("Error calling RAG API:", error);
        system_response = {
          info: "error",
          additional_info:
            "Maaf, sistem belum dapat menjawab pertanyaan Anda. Mohon jawab pertanyaan sebelumnya.",
          currentQuestion: currentQuestion || null,
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
      if (currentQuestion) {
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
      }

      updateSessionMetrics(session);
      // Handle skiplogic
      const skipMapping: Record<string, Record<string, number>> = {
        S008: { Ya: 14, Tidak: 13 }, // S008 = "Ya" skip S009, langsung ke S010 (index 10)
        S012: { Ya: 17, Tidak: 24 }, // S012 = "Tidak" skip S013A-S014, langsung ke S015 (index 22)
      };

      if (
        currentQuestion &&
        skipMapping[currentQuestion.code] &&
        typeof extractedInfo === "string" &&
        skipMapping[currentQuestion.code][extractedInfo]
      ) {
        // Auto-fill skipped questions with "N/A" before jumping to next index
        if (currentQuestion.code === "S008" && extractedInfo === "Ya") {
          // S008 = "Ya" → skip S009, fill with "N/A"
          const existingS009 = session.responses.find(r => r.question_code === "S009");
          if (!existingS009) {
            session.responses.push({
              question_code: "S009",
              valid_response: "N/A",
            });
          }
        } else if (currentQuestion.code === "S012" && extractedInfo === "Tidak") {
          // S012 = "Tidak" → skip S013A-S014, fill with "N/A"
          const skippedQuestions = ["S013A", "S013B", "S013C", "S013D", "S013E", "S013F", "S014"];
          for (const questionCode of skippedQuestions) {
            const existingResponse = session.responses.find(r => r.question_code === questionCode);
            if (!existingResponse) {
              session.responses.push({
                question_code: questionCode,
                valid_response: "N/A",
              });
            }
          }
        }
        
        session.current_question_index =
          skipMapping[currentQuestion.code][extractedInfo];
      } else {
        if (
          currentQuestion &&
          currentQuestion.code === "KR004" &&
          extractedInfo === "Tidak Bekerja"
        ) {
          // KR004 = "Tidak Bekerja" skip KR005, langsung ke KR006
          // Auto-fill KR005 with "N/A" before jumping
          const existingKR005 = session.responses.find(r => r.question_code === "KR005");
          if (!existingKR005) {
            session.responses.push({
              question_code: "KR005",
              valid_response: "N/A",
            });
          }
          session.current_question_index += 2;
        } else {
          session.current_question_index += 1;
        }
      }

      // Check if survey is complete
      const totalQuestions = allQuestions.length;

      if (session.current_question_index >= totalQuestions) {
        session.status = "COMPLETED";
        // await User.findByIdAndUpdate(userId, {
        //   $unset: { activeSurveySessionId: 1 },
        // });
        updateSessionMetrics(session);
        
        // Ensure all skipped questions are filled with "N/A" before completing
        await ensureSkippedQuestionsFilled(session);
        
        await session.save();
        system_response = {
          info: "survey_completed",
          additional_info:
            "Survei telah berakhir, terima kasih telah menyelesaikan survei!",
          improved_response: classificationResult.data?.improved_response,
        };
      } else {
        // Get next question
        let nextQuestion = allQuestions[session.current_question_index];
        
        // JALANKAN REPLACE PLACEHOLDER SEBELUM SAVE
        if (nextQuestion) {
          nextQuestion = replacePlaceholders(nextQuestion, session);
        }
        
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

  // Ensure all skipped questions are filled with "N/A" (backup check)
  await ensureSkippedQuestionsFilled(session);

  // Return appropriate response
  return {
    ...system_response,
    session_id: sessionId,
  };
};

// Helper function to ensure all skipped questions are filled with "N/A"
const ensureSkippedQuestionsFilled = async (session: ISurveySession) => {
  const responses = session.responses;
  
  // Check KR004 = "Tidak Bekerja" → auto-fill KR005 with "N/A"
  const kr004Response = responses.find(r => r.question_code === "KR004");
  if (kr004Response && Array.isArray(kr004Response.valid_response) && kr004Response.valid_response.includes("Tidak Bekerja")) {
    const existingKR005 = responses.find(r => r.question_code === "KR005");
    if (!existingKR005) {
      session.responses.push({
        question_code: "KR005",
        valid_response: "N/A",
      });
    }
  }
  
  // Check S008 = "Ya" → auto-fill S009 with "N/A"
  const s008Response = responses.find(r => r.question_code === "S008");
  if (s008Response && Array.isArray(s008Response.valid_response) && s008Response.valid_response.includes("Ya")) {
    const existingS009 = responses.find(r => r.question_code === "S009");
    if (!existingS009) {
      session.responses.push({
        question_code: "S009",
        valid_response: "N/A",
      });
    }
  }
  
  // Check S012 = "Tidak" → auto-fill S013A-S014 with "N/A"
  const s012Response = responses.find(r => r.question_code === "S012");
  if (s012Response && Array.isArray(s012Response.valid_response) && s012Response.valid_response.includes("Tidak")) {
    const skippedQuestions = ["S013A", "S013B", "S013C", "S013D", "S013E", "S013F", "S014"];
    for (const questionCode of skippedQuestions) {
      const existingResponse = responses.find(r => r.question_code === questionCode);
      if (!existingResponse) {
        session.responses.push({
          question_code: questionCode,
          valid_response: "N/A",
        });
      }
    }
  }
  
  await session.save();
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

// Calculate accurate survey progress considering skipping logic and N/A answers
export const calculateAccurateProgress = async (sessionId: string) => {
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

    const survey = latestQuestionnaire.survey;
    const allQuestions = survey.categories.flatMap(
      (category: any) => category.questions
    );

    // Track which questions are actually applicable for this user
    const applicableQuestions: number[] = [];
    const skippedQuestions: Array<{questionCode: string, reason: string}> = [];
    const naQuestions: Array<{questionCode: string, reason: string}> = [];

    let currentIndex = 0;
    const responses = session.responses;

    while (currentIndex < allQuestions.length) {
      const currentQuestion = allQuestions[currentIndex];
      if (!currentQuestion) break;

      // KR004 = Tidak Bekerja: skip KR005, set N/A, go to KR006
      if (currentQuestion.code === "KR004") {
        const kr004Response = responses.find(r => r.question_code === "KR004");
        if (kr004Response && Array.isArray(kr004Response.valid_response) && kr004Response.valid_response.includes("Tidak Bekerja")) {
          // Skip KR005
          naQuestions.push({ questionCode: "KR005", reason: "Auto-filled N/A karena KR004 = Tidak Bekerja" });
          skippedQuestions.push({ questionCode: "KR005", reason: "Skipped karena KR004 = Tidak Bekerja" });
          currentIndex += 2; // skip to KR006
          continue;
        }
      }

      // S008 = Ya: skip S009, set N/A, go to S010
      if (currentQuestion.code === "S008") {
        const s008Response = responses.find(r => r.question_code === "S008");
        if (s008Response && Array.isArray(s008Response.valid_response) && s008Response.valid_response.includes("Ya")) {
          // Skip S009
          naQuestions.push({ questionCode: "S009", reason: "Auto-filled N/A karena S008 = Ya" });
          skippedQuestions.push({ questionCode: "S009", reason: "Skipped karena S008 = Ya" });
          currentIndex += 2; // skip to S010
          continue;
        }
      }

      // S012 = Tidak: skip S013A-S013F, S014, set N/A, go to S015
      if (currentQuestion.code === "S012") {
        const s012Response = responses.find(r => r.question_code === "S012");
        if (s012Response && Array.isArray(s012Response.valid_response) && s012Response.valid_response.includes("Tidak")) {
          // Skip S013A-S013F, S014
          const skipCodes = ["S013A","S013B","S013C","S013D","S013E","S013F","S014"];
          for (const code of skipCodes) {
            naQuestions.push({ questionCode: code, reason: "Auto-filled N/A karena S012 = Tidak" });
            skippedQuestions.push({ questionCode: code, reason: "Skipped karena S012 = Tidak" });
          }
          currentIndex = allQuestions.findIndex(q => q.code === "S015");
          continue;
        }
      }

      // If not skipped, mark as applicable
      applicableQuestions.push(currentIndex);
      currentIndex += 1;
    }

    // Calculate progress based on applicable questions
    const answeredQuestions = responses.length;
    
    // Count questions that are actually answered (excluding auto-filled N/A)
    const actuallyAnsweredQuestions = responses.filter(response => {
      // Don't count auto-filled N/A answers as progress
      if (["KR005","S009","S013A","S013B","S013C","S013D","S013E","S013F","S014"].includes(response.question_code) && response.valid_response === "N/A") {
        return false;
      }
      return true;
    }).length;
    
    // New formula: total_applicable_questions = responses yang bukan "N/A" + (total_questions - answered_questions)
    const nonNAResponses = responses.filter(response => response.valid_response !== "N/A").length;
    const totalApplicableQuestions = nonNAResponses + (allQuestions.length - answeredQuestions);

    // Calculate accurate progress percentage
    const accurateProgressPercentage = totalApplicableQuestions > 0 
      ? Math.round((actuallyAnsweredQuestions / totalApplicableQuestions) * 100)
      : 0;

    // Get current question info
    let currentQuestion = null;
    if (session.current_question_index < allQuestions.length) {
      currentQuestion = allQuestions[session.current_question_index];
    }

    // Get detailed question status
    const questionStatus = allQuestions.map((question: any, index: number) => {
      const response = responses.find(r => r.question_code === question.code);
      const isApplicable = applicableQuestions.includes(index);
      const isSkipped = skippedQuestions.some(sq => sq.questionCode === question.code);
      const isNA = naQuestions.some(nq => nq.questionCode === question.code);
      return {
        question_code: question.code,
        question_text: question.text,
        index: index,
        is_applicable: isApplicable,
        is_answered: !!response,
        is_skipped: isSkipped,
        is_na: isNA,
        answer: response ? response.valid_response : null,
        skip_reason: skippedQuestions.find(sq => sq.questionCode === question.code)?.reason || null,
        na_reason: naQuestions.find(nq => nq.questionCode === question.code)?.reason || null
      };
    });

    return {
      session_id: sessionId,
      status: session.status,
      current_question_index: session.current_question_index,
      current_question: currentQuestion,
      total_questions: allQuestions.length,
      total_applicable_questions: totalApplicableQuestions,
      answered_questions: answeredQuestions,
      actually_answered_questions: actuallyAnsweredQuestions,
      skipped_questions: skippedQuestions.length,
      na_questions: naQuestions.length,
      basic_progress_percentage: Math.round((answeredQuestions / allQuestions.length) * 100),
      accurate_progress_percentage: accurateProgressPercentage,
      skipped_questions_detail: skippedQuestions,
      na_questions_detail: naQuestions,
      question_status: questionStatus,
      responses_count: responses.length,
      metrics: session.metrics
    };
  } catch (error) {
    console.error("Error calculating accurate progress:", error);
    throw error;
  }
};


