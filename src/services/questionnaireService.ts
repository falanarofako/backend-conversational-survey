// src/services/questionnaireService.ts

import Questionnaire from "../models/Questionnaire";

export const saveQuestionnaire = async (data: typeof Questionnaire) => {
  try {
    // Save data to MongoDB
    const questionnaire = new Questionnaire(data);
    await questionnaire.save();
    return { success: true, data: questionnaire };
  } catch (error) {
    return { success: false, error: (error as Error).message };
  }
};
