import { Request, Response } from 'express';
import { startSurveySession, processSurveyResponse } from '../services/surveyService';
import QuestionnaireModel from '../models/Questionnaire';

export const handleStartSurvey = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = req.body.user_id;
    if (!userId) {
      res.status(400).json({ success: false, message: 'User ID is required' });
      return;
    }

    const latestQuestionnaire = await QuestionnaireModel.findOne().sort({ createdAt: -1 });

    if (!latestQuestionnaire) {
      res.status(404).json({ success: false, message: 'Questionnaire not found' });
      return;
    }

    const session = await startSurveySession(userId, latestQuestionnaire.survey);

    res.status(201).json({
      success: true,
      additional_info: `Selamat datang! Survei ini bertujuan untuk ${latestQuestionnaire.survey.description}. Apakah Anda siap memulai?`,
      next_question: latestQuestionnaire.survey.categories[0].questions[0],
      clarification_reason: null,
      follow_up_question: null,
      session_id: session._id,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};

export const handleProcessSurveyResponse = async (req: Request, res: Response): Promise<void> => {
  try {
    const { session_id, user_response } = req.body;
    if (!session_id || user_response === undefined) {
      res.status(400).json({ success: false, message: 'Session ID and response are required' });
      return;
    }

    const latestQuestionnaire = await QuestionnaireModel.findOne().sort({ createdAt: -1 });

    if (!latestQuestionnaire) {
      res.status(404).json({ success: false, message: 'Questionnaire not found' });
      return;
    }

    const response = await processSurveyResponse(session_id, user_response, latestQuestionnaire.survey);
    res.json({ success: true, ...response });
  } catch (error) {
    res.status(500).json({ success: false, message: (error as Error).message });
  }
};
