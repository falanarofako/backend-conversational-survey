// src/routes/surveyRoutes.ts

import SurveySession, { IResponse } from "../models/SurveySession";
import { classifyIntent } from "../services/intentClassificationService";
import { extractInformation } from "../services/informationExtractionService";
import {
  getProvinceNames,
  getRegencyNamesByProvinceName,
} from "./provincesAndRegenciesService";

export const startSurveySession = async (userId: string, survey: any) => {
  const session = new SurveySession({
    user_id: userId,
    responses: [],
  });
  await session.save();
  return session;
};

async function getValidResponse(
  sessionId: string,
  questionCode: string
): Promise<any | null> {
  try {
    // Mencari SurveySession berdasarkan sessionId
    const session = await SurveySession.findById(sessionId);

    if (!session) {
      throw new Error("Survey session not found");
    }

    // Mencari response berdasarkan question_code
    const response = session.responses.find(
      (resp: any) => resp.question_code === questionCode
    );

    if (response) {
      return response.valid_response;
    }

    // Jika response tidak ditemukan
    return null;
  } catch (error) {
    console.error("Error fetching valid response:", error);
    throw error;
  }
}

const updateQuestionOptions = async (
  currentQuestion: any,
  sessionId: string,
  questionCode: string
): Promise<any> => {
  // Ensure the function returns a promise that resolves to the updated question
  if (currentQuestion.code === "S002" || currentQuestion.code === "S004") {
    currentQuestion.options = getProvinceNames();
    console.log(`Current question ${currentQuestion.code}:`, currentQuestion);
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
      console.log(`Current question ${currentQuestion.code}:`, currentQuestion);
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
      console.log(`Current question ${currentQuestion.code}:`, currentQuestion);
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

  console.log(`Current question ${currentQuestion.code}:`, currentQuestion);

  return currentQuestion;
};

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

  if (["S002", "S004", "S003", "S005", "S007"].includes(currentQuestion.code)) {
    currentQuestion = await updateQuestionOptions(
      currentQuestion,
      sessionId,
      currentQuestion.code
    );
  }

  currentQuestion = await replacePlaceholders(currentQuestion, sessionId);

  if (currentQuestion.code === "S006") {
    const timestamp = new Date().toLocaleString();
    userResponse = `${userResponse} (Dikirim pada ${timestamp})`;
  }

  const classificationResult = await classifyIntent({
    question: currentQuestion,
    response: userResponse,
  });

  if (!classificationResult.success) {
    throw new Error(classificationResult.error);
  }

  console.log("Classification result:", classificationResult);

  if (
    classificationResult.data?.intent === "unexpected_answer" ||
    classificationResult.data?.intent === "other"
  ) {
    return {
      additional_info: null,
      next_question: null,
      clarification_reason: classificationResult.data?.clarification_reason,
      follow_up_question: classificationResult.data?.follow_up_question,
    };
  }

  if (classificationResult.data?.intent === "question") {
    return {
      additional_info:
        "Maaf, sistem belum dapat menjawab pertanyaan Anda. Mohon jawab pertanyaan sebelumnya.",
      next_question: null,
      clarification_reason: null,
      follow_up_question: null,
    };
  }

  if (classificationResult.data?.intent === "expected_answer") {
    const extractionResult = await extractInformation({
      question: currentQuestion,
      response: userResponse,
    });

    if (!extractionResult.success) {
      throw new Error(extractionResult.error);
    }

    session.responses.push({
      question_code: currentQuestion.code,
      valid_response: extractionResult.data?.extracted_information,
    });

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

    if (
      session.current_question_index >=
      survey.categories.flatMap((cat: any) => cat.questions).length
    ) {
      session.status = 'COMPLETED';
      await session.save();
      return {
        additional_info: 'Survei telah berakhir, terima kasih telah menyelesaikan survei!',
        next_question: null,
        clarification_reason: null,
        follow_up_question: null,
      };
    }


    await session.save();

    let nextQuestion = survey.categories.flatMap((cat: any) => cat.questions)[
      session.current_question_index
    ];

    nextQuestion = await replacePlaceholders(nextQuestion, sessionId);

    return {
      additional_info: null,
      next_question: nextQuestion.text || null,
      clarification_reason: null,
      follow_up_question: null,
    };
  }
};
