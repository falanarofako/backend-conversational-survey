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
      first_question:
        latestQuestionnaire.survey.categories[0].questions[0].text,
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
  const session = await SurveySession.findById(sessionId);
  if (!session || session.status !== "IN_PROGRESS") {
    throw new Error("Survey session not found or already completed");
  }

  let currentQuestion = survey.categories.flatMap(
    (category: any) => category.questions
  )[session.current_question_index];

  // Update question options if needed
  if (["S002", "S004", "S003", "S005", "S007"].includes(currentQuestion.code)) {
    currentQuestion = await updateQuestionOptions(currentQuestion, sessionId);
  }

  // Replace placeholders in question text
  currentQuestion = await replacePlaceholders(currentQuestion, sessionId);

  // Add timestamp to S006 responses
  if (currentQuestion.code === "S006") {
    const timestamp = new Date().toLocaleString();
    userResponse = `${userResponse} (Dikirim pada ${timestamp})`;
  }

  // Classify the intent of the response
  const classificationResult = await classifyIntent({
    question: currentQuestion,
    response: userResponse,
  });

  if (!classificationResult.success) {
    throw new Error(classificationResult.error);
  }

  // Handle different intent types
  if (
    classificationResult.data?.intent === "unexpected_answer" ||
    classificationResult.data?.intent === "other"
  ) {
    // Save user message and system response
    const system_response = {
      currentQuestion: currentQuestion.text,
      clarification_reason: classificationResult.data?.clarification_reason,
      follow_up_question: classificationResult.data?.follow_up_question,
    };
    await SurveyMessage.create({
      session_id: sessionId,
      user_message: userResponse,
      system_response: system_response,
    });
    return system_response;
  }

  // Handle question intent (user asked a question)
  if (classificationResult.data?.intent === "question") {
    try {
      // Get the RAG API URL from environment variables
      const ragApiUrl = process.env.RAG_API_URL || "";

      if (!ragApiUrl) {
        throw new Error(
          "RAG API URL is not configured in environment variables"
        );
      }

      // Call RAG API to get answer for the question
      const response = await fetch(`${ragApiUrl}/api/rag/ask`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: userResponse,
        }),
      });

      if (!response.ok) {
        throw new Error(`RAG API responded with status: ${response.status}`);
      }

      // Parse the response from the RAG API
      const ragResult = await response.json();

      // Save user message and system response
      const system_response = {
        currentQuestion: currentQuestion.text,
        answer: ragResult.answer || ragResult,
      };
      await SurveyMessage.create({
        session_id: sessionId,
        user_message: userResponse,
        system_response: system_response,
      });
      // Return the answer from RAG API
      return system_response;
    } catch (error) {
      console.error("Error calling RAG API:", error);
      // Fallback to original behavior if RAG API call fails
      // Save user message and system response
      const system_response = {
        additional_info:
          "Maaf, sistem belum dapat menjawab pertanyaan Anda. Mohon jawab pertanyaan sebelumnya.",
        currentQuestion: currentQuestion.text,
      };
      await SurveyMessage.create({
        session_id: sessionId,
        user_message: userResponse,
        system_response: system_response,
      });
      return system_response;
    }
  }

  // Handle expected answer
  if (classificationResult.data?.intent === "expected_answer") {
    const extractionResult = await extractInformation({
      question: currentQuestion,
      response: userResponse,
    });

    if (!extractionResult.success) {
      throw new Error(extractionResult.error);
    }

    // Save the response
    session.responses.push({
      question_code: currentQuestion.code,
      valid_response: extractionResult.data?.extracted_information ?? "",
    });

    // Handle skiplogic
    const skipMapping: Record<string, Record<string, number>> = {
      S008: { Ya: 14, Tidak: 15 },
      S012: { Ya: 18, Tidak: 25 },
    };

    if (
      skipMapping[currentQuestion.code] &&
      typeof extractionResult.data?.extracted_information === "string"
    ) {
      session.current_question_index =
        skipMapping[currentQuestion.code][
          extractionResult.data?.extracted_information
        ] || session.current_question_index + 1;
    } else {
      session.current_question_index += 1;
    }

    // Check if survey is complete
    if (
      session.current_question_index >=
      survey.categories.flatMap((cat: any) => cat.questions).length
    ) {
      session.status = "COMPLETED";

      // Remove the active session reference from the user
      await User.findByIdAndUpdate(session.user_id, {
        $unset: { activeSurveySessionId: 1 },
      });

      await session.save();

      // Save user message and system response
      const system_response = {
        additional_info:
          "Survei telah berakhir, terima kasih telah menyelesaikan survei!",
      };
      await SurveyMessage.create({
        session_id: sessionId,
        user_message: userResponse,
        system_response: system_response,
      });
      return system_response;
    }

    await session.save();

    // Prepare next question
    let nextQuestion = survey.categories.flatMap((cat: any) => cat.questions)[
      session.current_question_index
    ];

    nextQuestion = await replacePlaceholders(nextQuestion, sessionId);
    // Save user message and system response
    const system_response = {
      next_question: nextQuestion.text || null,
    };
    await SurveyMessage.create({
      session_id: sessionId,
      user_message: userResponse,
      system_response: system_response,
    });
    return system_response;
  }
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
