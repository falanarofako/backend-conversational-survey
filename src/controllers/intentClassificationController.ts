// src/controllers/intentClassificationController.ts

import { Request, Response } from 'express';
import { 
  classifyIntent, 
  evaluateIntentClassification,
  fetchAllClassificationResults,
  getEvaluationProgress,
  resetEvaluationProgress 
} from '../services/intentClassificationService';
import { getLLMStatus, resetLLMState } from '../config/llmConfig';
import { ClassificationContext, Question } from '../types/intentTypes';
import fs from 'fs/promises';
import path from 'path';

interface ClassifyIntentRequest {
  question: Question;
  response: string;
}

export const handleClassifyIntent = async (
  req: Request<{}, {}, ClassifyIntentRequest>,
  res: Response
): Promise<void> => {
  try {
    const { question, response } = req.body;

    // Validate required fields
    if (!question || !response) {
      res.status(400).json({
        success: false,
        message: 'Pertanyaan dan respons wajib diisi'
      });
      return;
    }

    // Validate question object structure
    if (!question.text || !question.type || !question.validation) {
      res.status(400).json({
        success: false,
        message: 'Format objek pertanyaan tidak valid. Harus memiliki text, type, dan validation.'
      });
      return;
    }

    const context: ClassificationContext = {
      question,
      response
    };

    const result = await classifyIntent(context);

    if (!result.success) {
      res.status(500).json({
        success: false,
        message: result.error,
        timestamp: new Date().toISOString()
      });
      return;
    }

    // Add request context to response for debugging
    const response_data = {
      ...result,
      request_context: {
        question_text: question.text,
        question_type: question.type,
        response: response
      }
    };

    res.json(response_data);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error dalam klasifikasi intent',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
};

export const handleStartEvaluation = async (req: Request, res: Response) => {
  try {
    const datasetPath = path.join(__dirname, "../data/intent-classification-validation-lite.json");
    const rawData = await fs.readFile(datasetPath, "utf-8");
    const data = JSON.parse(rawData);

    const result = await evaluateIntentClassification(data.dataset);

    if (!result.success) {
      res.status(500).json({ success: false, message: result.error });
      return;
    }

    res.json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error memulai evaluasi",
      error: (error as Error).message,
    });
  }
};


export const handleGetEvaluationProgress = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const result = await getEvaluationProgress();

    if (!result.success) {
      res.status(500).json({
        success: false,
        message: result.error
      });
      return;
    }

    if (!result.data) {
      res.json({
        success: true,
        data: {
          message: 'Tidak ada evaluasi yang sedang berjalan'
        }
      });
      return;
    }

    // Calculate additional metrics for response
    const completionPercentage = (result.data.processedSamples / result.data.totalSamples) * 100;
    const failedSamples = result.data.results.filter(r => !r.processed).length;
    const errorRate = (failedSamples / result.data.processedSamples) * 100;

    // Calculate intent distribution
    const intentDistribution = result.data.results
      .filter(r => r.processed && r.predictedIntent)
      .reduce((acc, curr) => {
        const intent = curr.predictedIntent as string;
        acc[intent] = (acc[intent] || 0) + 1;
        return acc;
      }, {} as { [key: string]: number });

    res.json({
      success: true,
      data: {
        ...result.data,
        metrics: {
          completionPercentage: parseFloat(completionPercentage.toFixed(2)),
          errorRate: parseFloat(errorRate.toFixed(2)),
          failedSamples,
          intentDistribution
        },
        timeElapsed: Date.now() - new Date(result.data.startTime).getTime()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error mendapatkan progress evaluasi',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
};

export const handleResetEvaluation = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const result = await resetEvaluationProgress();

    if (!result.success) {
      res.status(500).json({
        success: false,
        message: result.error
      });
      return;
    }

    res.json({
      success: true,
      message: 'Progress evaluasi berhasil direset',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error mereset progress evaluasi',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
};

export const handleGetSystemStatus = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const llmStatus = getLLMStatus();
    const evalProgress = await getEvaluationProgress();

    res.json({
      success: true,
      data: {
        llm: llmStatus.data,
        evaluation: evalProgress.data,
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error mendapatkan status sistem',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
};

export const handleResetSystem = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    // Reset LLM state
    const resetLLMResult = await resetLLMState();
    if (!resetLLMResult.success) {
      res.status(500).json({
        success: false,
        message: resetLLMResult.error
      });
      return;
    }

    // Reset evaluation progress
    const resetEvalResult = await resetEvaluationProgress();
    if (!resetEvalResult.success) {
      res.status(500).json({
        success: false,
        message: resetEvalResult.error
      });
      return;
    }

    res.json({
      success: true,
      message: 'Sistem berhasil direset',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Error mereset sistem',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
};

export const getAllClassificationResults = async (req: Request, res: Response) => {
  try {
    const results = await fetchAllClassificationResults();
    res.status(200).json({
      success: true,
      data: results,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch classification results",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export default {
  handleClassifyIntent,
  handleStartEvaluation,
  handleGetEvaluationProgress,
  handleResetEvaluation,
  handleGetSystemStatus,
  handleResetSystem
};

// import { Request, Response } from 'express';
// import { 
//   classifyIntent, 
//   evaluateIntentClassification,
//   getEvaluationProgress 
// } from '../services/intentClassificationService';
// import { 
//   getLLMStatus, 
//   resetLLMState 
// } from '../config/llmConfig';
// import { ClassificationContext } from '../types/intentTypes';
// import fs from 'fs/promises';
// import path from 'path';

// export const handleClassifyIntent = async (
//   req: Request<{}, {}, ClassificationContext>,
//   res: Response
// ): Promise<void> => {
//   try {
//     const { response, question, expected_answer, rules_validation } = req.body;

//     if (!response || !question) {
//       res.status(400).json({
//         success: false,
//         message: 'response dan question wajib diisi'
//       });
//       return;
//     }

//     const result = await classifyIntent({
//       response,
//       question,
//       expected_answer,
//       rules_validation
//     });

//     if (!result.success) {
//       res.status(500).json({
//         success: false,
//         message: result.error
//       });
//       return;
//     }

//     res.json(result);

//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Error dalam klasifikasi intent',
//       error: error instanceof Error ? error.message : 'Unknown error',
//       timestamp: new Date().toISOString()
//     });
//   }
// };

// export const handleStartEvaluation = async (
//   req: Request,
//   res: Response
// ): Promise<void> => {
//   try {
//     // const datasetPath = path.join(__dirname, '../data/intent-classification-dataset.json');
//     const datasetPath = path.join(__dirname, '../data/intent-classification-validation.json');
//     const rawData = await fs.readFile(datasetPath, 'utf-8');
//     const data = JSON.parse(rawData);
    
//     if (!Array.isArray(data.dataset)) {
//       res.status(400).json({
//         success: false,
//         message: 'Invalid dataset format'
//       });
//       return;
//     }

//     const result = await evaluateIntentClassification(data.dataset);
    
//     if (!result.success) {
//       res.status(500).json({
//         success: false,
//         message: result.error
//       });
//       return;
//     }

//     res.json(result);

//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Error starting evaluation',
//       error: error instanceof Error ? error.message : 'Unknown error',
//       timestamp: new Date().toISOString()
//     });
//   }
// };

// export const handleGetEvaluationProgress = async (
//   req: Request,
//   res: Response
// ): Promise<void> => {
//   try {
//     const result = await getEvaluationProgress();

//     if (!result.success) {
//       res.status(500).json({
//         success: false,
//         message: result.error
//       });
//       return;
//     }

//     if (!result.data) {
//       res.json({
//         success: true,
//         data: {
//           message: 'No evaluation in progress'
//         }
//       });
//       return;
//     }

//     const completionPercentage = (result.data.processedSamples / result.data.totalSamples) * 100;
//     const failedSamples = result.data.results.filter(r => !r.processed).length;
//     const errorRate = (failedSamples / result.data.processedSamples) * 100;

//     res.json({
//       success: true,
//       data: {
//         ...result.data,
//         completionPercentage: parseFloat(completionPercentage.toFixed(2)),
//         errorRate: parseFloat(errorRate.toFixed(2)),
//         failedSamples,
//         timeElapsed: Date.now() - new Date(result.data.startTime).getTime()
//       }
//     });

//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Error getting evaluation progress',
//       error: error instanceof Error ? error.message : 'Unknown error',
//       timestamp: new Date().toISOString()
//     });
//   }
// };

// export const handleGetSystemStatus = async (
//   req: Request,
//   res: Response
// ): Promise<void> => {
//   try {
//     const llmStatus = getLLMStatus();
//     const evalProgress = await getEvaluationProgress();

//     res.json({
//       success: true,
//       data: {
//         llm: llmStatus.data,
//         evaluation: evalProgress.data,
//         timestamp: new Date().toISOString()
//       }
//     });

//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Error getting system status',
//       error: error instanceof Error ? error.message : 'Unknown error',
//       timestamp: new Date().toISOString()
//     });
//   }
// };

// export const handleResetSystem = async (
//   req: Request,
//   res: Response
// ): Promise<void> => {
//   try {
//     const resetResult = await resetLLMState();

//     if (!resetResult.success) {
//       res.status(500).json({
//         success: false,
//         message: resetResult.error
//       });
//       return;
//     }

//     try {
//       await fs.unlink(path.join(__dirname, '../data/evaluation_progress.json'));
//     } catch (error) {
//       // Ignore error if file doesn't exist
//     }

//     res.json({
//       success: true,
//       message: 'System reset successful',
//       timestamp: new Date().toISOString()
//     });

//   } catch (error) {
//     res.status(500).json({
//       success: false,
//       message: 'Error resetting system',
//       error: error instanceof Error ? error.message : 'Unknown error',
//       timestamp: new Date().toISOString()
//     });
//   }
// };