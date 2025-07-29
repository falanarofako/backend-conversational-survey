// src/services/evaluationService.ts

import SurveyEvaluation, { ISurveyEvaluation } from '../models/SurveyEvaluation';
import User from '../models/User';
import SurveySession from '../models/SurveySession';
import mongoose from 'mongoose';

/**
 * Initialize a new survey evaluation for a user
 * @param userId The user's ID
 * @param sessionId Optional survey session ID to link the evaluation to
 * @returns The created evaluation object
 */
export const initializeEvaluation = async (
  userId: string,
  sessionId?: string
): Promise<ISurveyEvaluation> => {
  // Start a mongoose transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Find the user
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error('User not found');
    }

    // VALIDASI: Pastikan user memiliki setidaknya satu sesi survei
    let surveySessionExists = false;
    
    if (sessionId) {
      // Jika sessionId diberikan, validasi bahwa sesi survei tersebut ada
      const surveySession = await SurveySession.findById(sessionId).session(session);
      if (!surveySession) {
        throw new Error('Survey session not found');
      }
      // if (surveySession.user_id.toString() !== userId) {
      //   throw new Error('Survey session does not belong to this user');
      // }
      surveySessionExists = true;
    } else {
      // Jika tidak ada sessionId, cek apakah user memiliki sesi survei apapun
      const surveySessionCount = await SurveySession.countDocuments({
        user_id: new mongoose.Types.ObjectId(userId)
      }).session(session);
      
      if (surveySessionCount === 0) {
        throw new Error('Cannot create evaluation: User must have at least one survey session before creating an evaluation');
      }
      surveySessionExists = true;
    }

    // Check if the user already has an active evaluation in their reference
    if (user.activeEvaluationSessionId) {
      // Look up the evaluation
      const existingEvaluation = await SurveyEvaluation.findById(user.activeEvaluationSessionId).session(session);
      
      // If it exists and is not completed, return it
      if (existingEvaluation && !existingEvaluation.completed) {
        await session.abortTransaction();
        session.endSession();
        return existingEvaluation;
      }
      
      // If the evaluation doesn't exist, clear the reference
      // But if it's completed, keep the reference since we want to maintain
      // completed evaluation references
      if (!existingEvaluation) {
        user.activeEvaluationSessionId = undefined;
        await user.save({ session });
      }
    }

    // Alternative check: look for any incomplete evaluation for this user
    let evaluation = await SurveyEvaluation.findOne({
      user_id: userId,
      completed: false
    }).session(session);

    // If found, update the user reference and return the existing evaluation
    if (evaluation) {
      user.activeEvaluationSessionId = evaluation._id as mongoose.Types.ObjectId;
      await user.save({ session });
      
      await session.commitTransaction();
      session.endSession();
      return evaluation;
    }

    // Create a new evaluation
    const newEvaluation = new SurveyEvaluation({
      user_id: new mongoose.Types.ObjectId(userId),
      session_id: sessionId ? new mongoose.Types.ObjectId(sessionId) : undefined,
      answers: {},
      completed: false
    });

    await newEvaluation.save({ session });
    
    // Update the user's reference
    user.activeEvaluationSessionId = newEvaluation._id as mongoose.Types.ObjectId;
    await user.save({ session });

    await session.commitTransaction();
    session.endSession();
    return newEvaluation;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error initializing survey evaluation:', error);
    throw error;
  }
};

/**
 * Submit an answer for a specific evaluation question
 * @param evaluationId The evaluation ID
 * @param questionId The question identifier
 * @param value The answer value (numeric)
 * @returns The updated evaluation object
 */
export const submitAnswer = async (
  evaluationId: string,
  questionId: string,
  value: number | string
): Promise<ISurveyEvaluation> => {
  try {
    // Find the evaluation
    const evaluation = await SurveyEvaluation.findById(evaluationId);
    
    if (!evaluation) {
      throw new Error('Survey evaluation not found');
    }
    
    if (evaluation.completed) {
      throw new Error('Cannot modify a completed evaluation');
    }

    // Validate the question ID
    const validQuestionIds = [
      'ease_of_use', 
      'usefulness', 
      'enjoyment', 
      'data_security', 
      'privacy_safety',
      'mental_effort',
      'overall_experience' // Tambahkan pertanyaan terbuka
    ];
    
    if (!validQuestionIds.includes(questionId)) {
      throw new Error(`Invalid question ID: ${questionId}`);
    }

    // Validasi untuk pertanyaan numerik
    if (typeof value === 'number') {
      const maxValue = questionId === 'mental_effort' ? 9 : 7;
      if (value < 1 || value > maxValue) {
        throw new Error(`Value must be between 1 and ${maxValue} for ${questionId}`);
      }
    } 
    // Validasi untuk pertanyaan terbuka
    else if (questionId === 'overall_experience') {
      if (typeof value !== 'string') {
        throw new Error('Overall experience must be a string');
      }
      
      // Validasi panjang respons
      if (value.trim().length > 1000) {
        throw new Error('Overall experience response is too long (max 1000 characters)');
      }

      // Trim respons untuk menghilangkan spasi berlebih
      value = value.trim();
    } else {
      throw new Error(`Unexpected value type for question ${questionId}`);
    }

    // Update the answer
    evaluation.answers = {
      ...evaluation.answers,
      [questionId]: value
    };

    await evaluation.save();
    return evaluation;
  } catch (error) {
    console.error('Error submitting answer:', error);
    throw error;
  }
};

/**
 * Complete a survey evaluation
 * @param evaluationId The evaluation ID
 * @returns The completed evaluation object
 */
export const completeEvaluation = async (
  evaluationId: string
): Promise<ISurveyEvaluation> => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Find the evaluation
    const evaluation = await SurveyEvaluation.findById(evaluationId).session(session);
    
    if (!evaluation) {
      throw new Error('Survey evaluation not found');
    }
    
    if (evaluation.completed) {
      await session.abortTransaction();
      session.endSession();
      return evaluation; // Already completed
    }

    // Verify all questions are answered
    const requiredQuestions = [
      'ease_of_use', 
      'participation_ease', 
      'enjoyment', 
      'data_security', 
      'privacy_safety',
      'mental_effort'
    ];
    
    const missingQuestions = requiredQuestions.filter(question => 
      !evaluation.answers.hasOwnProperty(question)
    );

    if (missingQuestions.length > 0) {
      throw new Error(`Missing answers for questions: ${missingQuestions.join(', ')}`);
    }

    // Mark as completed
    evaluation.completed = true;
    await evaluation.save({ session });
    
    // We no longer remove the activeEvaluationSessionId reference
    // This allows users to maintain a reference to their completed evaluation

    await session.commitTransaction();
    session.endSession();
    
    return evaluation;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Error completing evaluation:', error);
    throw error;
  }
};

/**
 * Get evaluation by ID
 * @param evaluationId The evaluation ID
 * @returns The evaluation object
 */
export const getEvaluationById = async (
  evaluationId: string
): Promise<ISurveyEvaluation | null> => {
  try {
    return await SurveyEvaluation.findById(evaluationId);
  } catch (error) {
    console.error('Error getting evaluation:', error);
    throw error;
  }
};

/**
 * Get user's latest evaluation
 * @param userId The user's ID
 * @returns The latest evaluation object or null
 */
export const getUserLatestEvaluation = async (
  userId: string
): Promise<ISurveyEvaluation | null> => {
  try {
    return await SurveyEvaluation.findOne({ user_id: userId })
      .sort({ created_at: -1 });
  } catch (error) {
    console.error('Error getting user\'s latest evaluation:', error);
    throw error;
  }
};