// src/services/surveyService.ts

import SurveySession, { IResponse, ISurveySession } from "../models/SurveySession";
import User from "../models/User";
import { classifyIntent } from "../services/intentClassificationService";
import { extractInformation } from "../services/informationExtractionService";
import {
  getProvinceNames,
  getRegencyNamesByProvinceName,
} from "./provincesAndRegenciesService";
import mongoose from "mongoose";

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
      const existingSession = await SurveySession.findById(user.activeSurveySessionId);
      if (existingSession && existingSession.status === 'IN_PROGRESS') {
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
export const completeSurveySession = async (sessionId: string): Promise<void> => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Update the survey session status to completed
    const surveySession = await SurveySession.findById(sessionId);
    if (!surveySession) {
      throw new Error("Survey session not found");
    }
    
    surveySession.status = 'COMPLETED';
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
  // Ensure the function returns a promise that resolves to the updated question
  if (currentQuestion.code === "S002" || currentQuestion.code === "S004") {
    currentQuestion.options = getProvinceNames();
  } else if (currentQuestion.code === "S003") {
    const provinceName = await getValidResponse(sessionId, "S002");
    if (provinceName) {
      currentQuestion.options = getRegencyNamesByProvinceName(provinceName);
      if (currentQuestion.system_guidelines.length > 0) {
        for (let i = 0; i < currentQuestion.system_guidelines.length; i++) {
          if (currentQuestion.system_guidelines[i].includes("${choosenProvince}")) {
            currentQuestion.system_guidelines[i] = currentQuestion.system_guidelines[i].replace("${choosenProvince}", provinceName);
          }
        }
      }
    } else {
      console.error(
        `Province name not found for question ${currentQuestion.code}`
      );
      currentQuestion.options = []; // or handle as needed
    }
  } else if (currentQuestion.code === "S005") {
    const provinceName = await getValidResponse(sessionId, "S004");
    if (provinceName) {
      currentQuestion.options = getRegencyNamesByProvinceName(provinceName);
      if (currentQuestion.system_guidelines.length > 0) {
        for (let i = 0; i < currentQuestion.system_guidelines.length; i++) {
          if (currentQuestion.system_guidelines[i].includes("${choosenProvince}")) {
            currentQuestion.system_guidelines[i] = currentQuestion.system_guidelines[i].replace("${choosenProvince}", provinceName);
          }
        }
      }
    } else {
      console.error(
        `Province name not found for question ${currentQuestion.code}`
      );
      currentQuestion.options = []; // or handle as needed
    }
  } else if (currentQuestion.code === "S007") {
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
    currentQuestion = await updateQuestionOptions(
      currentQuestion,
      sessionId
    );
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
    return {
      currentQuestion: currentQuestion.text,
      clarification_reason: classificationResult.data?.clarification_reason,
      follow_up_question: classificationResult.data?.follow_up_question,
    };
  }

  // Handle question intent (user asked a question)
  if (classificationResult.data?.intent === "question") {
    try {
      // Call RAG API to get answer for the question
      const response = await fetch("http://localhost:8000/api/rag/ask", {
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
      
      // Return the answer from RAG API
      return {
        currentQuestion: currentQuestion.text,
        answer: ragResult.answer || ragResult,
      };
    } catch (error) {
      console.error("Error calling RAG API:", error);
      // Fallback to original behavior if RAG API call fails
      return {
        additional_info: "Maaf, sistem belum dapat menjawab pertanyaan Anda. Mohon jawab pertanyaan sebelumnya.",
        currentQuestion: currentQuestion.text,
      };
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
      valid_response: extractionResult.data?.extracted_information ?? '',
    });

    // Handle skiplogic
    const skipMapping: Record<string, Record<string, number>> = {
      S008: { Ya: 14, Tidak: 15 },
      S012: { Ya: 18, Tidak: 25 },
    };

    if (skipMapping[currentQuestion.code] && typeof extractionResult.data?.extracted_information === 'string') {
      session.current_question_index =
        skipMapping[currentQuestion.code][extractionResult.data?.extracted_information] ||
        session.current_question_index + 1;
    } else {
      session.current_question_index += 1;
    }

    // Check if survey is complete
    if (
      session.current_question_index >=
      survey.categories.flatMap((cat: any) => cat.questions).length
    ) {
      session.status = 'COMPLETED';
      
      // Remove the active session reference from the user
      await User.findByIdAndUpdate(
        session.user_id,
        { $unset: { activeSurveySessionId: 1 } }
      );
      
      await session.save();
      return {
        additional_info: 'Survei telah berakhir, terima kasih telah menyelesaikan survei!',
      };
    }

    await session.save();

    // Prepare next question
    let nextQuestion = survey.categories.flatMap((cat: any) => cat.questions)[
      session.current_question_index
    ];

    nextQuestion = await replacePlaceholders(nextQuestion, sessionId);

    return {
      next_question: nextQuestion.text || null,
    };
  }
};

// Get user's active session
export const getUserActiveSurveySession = async (userId: string): Promise<ISurveySession | null> => {
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