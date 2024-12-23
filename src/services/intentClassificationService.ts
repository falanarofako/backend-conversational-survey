// src/services/intentClassificationService.ts

import { ChatPromptTemplate } from "@langchain/core/prompts";
import { setTimeout } from "timers/promises";
import path from "path";
import fs from "fs/promises";
import fsOnly from "fs";
import {
  classificationSchema,
  getCurrentLLM,
  handleLLMError,
} from "../config/llmConfig";
import {
  ClassificationContext,
  ClassificationOutput,
  ClassificationResult,
  Question,
  EvaluationMetrics,
  EvaluationResults,
  EvaluationProgress,
  ClassificationProgress,
  ServiceResponse,
} from "../types/intentTypes";
import EvaluationData from "../models/EvaluationData";
import mongoose from "mongoose";
import ClassificationResultData from "../models/ClassificationResultData";

// Constants
const PROGRESS_FILE = path.join(
  __dirname,
  "../data/validation_evaluation_progress.json"
);
const RESULTS_FILE = path.join(
  __dirname,
  "../data/validation_evaluation_results.json"
);
const RETRY_DELAY = 5000;
const MAX_RETRIES = 3;
const BATCH_SIZE = 5;

// Tambahkan fungsi untuk menyimpan data evaluasi ke database
const saveEvaluationData = async (question: string, response: string, intent: string) => {
  const evaluationData = new EvaluationData({ question, response, intent });
  await evaluationData.save();
  return evaluationData;
};

// Tambahkan fungsi untuk menyimpan hasil klasifikasi ke database
const saveClassificationResult = async (
  evaluationDataId: mongoose.Types.ObjectId,
  predictedIntent: string,
  confidence: number,
  explanation: string,
  clarificationReason?: string,
  followUpQuestion?: string
) => {
  const classificationResult = new ClassificationResultData({
    evaluationDataId,
    predictedIntent,
    confidence,
    explanation,
    clarificationReason,
    followUpQuestion,
  });
  await classificationResult.save();
};

// Helper function to format question for prompt
const formatQuestionContext = (question: Question): string => {
  let context = `${question.code ? `[${question.code}] ` : ""}${
    question.text
  }\n`;

  if (question.type === "select") {
    context += `Tipe: Pilihan\n`;
    if (question.options && question.options.length > 0) {
      context += `Pilihan jawaban yang valid:\n`;

      question.options.forEach((opt) => {
        if (typeof opt === "string") {
          context += `- ${opt}\n`;
        } else {
          context += `- ${opt.text}`;
          if (opt.additional_info) {
            context += ` (${opt.additional_info})`;
          }
          context += "\n";
        }
      });
    }

    if (question.multiple) {
      context += `(Boleh memilih lebih dari satu)\n`;
    }
    if (question.allow_other) {
      context += `(Boleh memberikan jawaban lain)\n`;
    }
  } else {
    context += `Tipe: ${question.type === "text" ? "Teks" : "Tanggal"}\n`;
    if (question.unit) {
      context += `Satuan: ${question.unit}\n`;
    }
    if (question.validation) {
      // Handle number input type
      if (question.validation.input_type === "number") {
        context += `Format: Angka`;
        if (question.validation.min !== undefined) {
          context += ` (minimum: ${question.validation.min})`;
        }
        if (question.validation.max !== undefined) {
          context += ` (maksimum: ${question.validation.max})`;
        }
        context += "\n";
      }

      // Handle pattern validation
      if (question.validation.pattern) {
        let patternDesc = "";

        // Common pattern interpretations
        if (question.validation.pattern === "^[0-9]{7,15}$") {
          patternDesc = "Hanya angka, panjang 7-15 digit";
        } else if (question.validation.pattern === "^[0-9]+$") {
          patternDesc = "Hanya angka";
        } else if (question.validation.pattern === "^[A-Za-z]+$") {
          patternDesc = "Hanya huruf";
        } else if (question.validation.pattern === "^[A-Za-z0-9]+$") {
          patternDesc = "Huruf dan angka";
        } else {
          patternDesc = "Format khusus diperlukan";
        }

        context += `Format: ${patternDesc}\n`;
      }
    }
  }

  if (question.additional_info) {
    context += `Informasi tambahan: ${question.additional_info}\n`;
  }

  return context;
};

// Updated classification prompt template
const classificationPrompt = ChatPromptTemplate.fromTemplate(`
  Anda adalah sistem klasifikasi intent untuk survei digital.
  Analisis respons pengguna terhadap pertanyaan berikut dan klasifikasikan dengan tepat.
  
  KONTEKS PERTANYAAN:
  {questionContext}
  
  RESPONS PENGGUNA:
  {response}
  
  Hal yang perlu diperhatikan:
  - Jika pertanyaan memiliki format jawaban berupa angka tetapi pengguna menjawab dengan teks dan relevan dengan pertanyaan, maka klasifikasi sebagai "expected_answer".
  - Jika pertanyaan memiliki jawaban "Ya" atau "Tidak", pengguna tidak harus secara eksplisit menyebutkan "Ya" atau "Tidak" untuk diklasifikasikan sebagai "expected_answer" sehingga Anda perlu menganalisis mendalam maksud pengguna.
  - Jika respons diklasifikasikan sebagai "unexpected_answer" atau "other", maka berikan alasan pada properti 'clarification_reason' tetapi jangan lupa untuk memberikan penjelasan Anda dalam melakukan klasifikasi pada properti 'explanation'.
  - Jika respons diklasifikasikan sebagai "unexpected_answer", berikan kalimat singkat yang menjelaskan mengapa jawaban pengguna harus diklarifikasi kemudian dilanjutkan dengan pertanyaan klarifikasi yang memandu pengguna untuk memberikan jawaban sesuai format yang diharapkan.
  - Jika respons diklasifikasikan sebagai "other", berikan kalimat singkat yang menjelaskan mengapa pengguna harus menjawab ulang pertanyaan karena jawaban tidak relevan dengan pertanyaan.
  - Jika pertanyaan memiliki opsi jawaban dan respons diklasifikasikan sebagai "expected_answer", maka sebutkan juga opsi jawaban mana yang paling mendekati dengan maksud pengguna pada properti 'explanation'.
  - Jika pertanyaan tidak mempersilahkan pengguna menuliskan sendiri secara terbuka, maka Anda jangan meminta pengguna menulis jawaban secara terbuka.

  Berikan penjelasan detail mengapa respons diklasifikasikan demikian dengan mempertimbangkan:
  - Kesesuaian dengan tipe pertanyaan (text/select)
  - Kelengkapan informasi dalam jawaban
  - Relevansi dengan konteks pertanyaan
  - Validasi jawaban seperti nilai minimum dan maksimum yang valid
  `);

// Create classification chain
const createClassificationChain = (llm: any) => {
  // Create a version of the LLM that outputs structured data according to our schema
  const llmWithStructuredOutput = llm.withStructuredOutput(
    classificationSchema,
    {
      name: "klasifikasi_intent",
      description: "Mengklasifikasikan intent dari respons pengguna",
      responseFormat: "json",
    }
  );

  // Create and return the chain by connecting the prompt template to the structured LLM
  return classificationPrompt.pipe(llmWithStructuredOutput);
};

// Classification function with retries
export const classifyIntent = async (
  params: ClassificationContext,
  attempt = 0
): Promise<ServiceResponse<ClassificationOutput>> => {
  try {
    const startTime = Date.now();

    // Get LLM instance
    const llmResponse = await getCurrentLLM();
    if (!llmResponse.success || !llmResponse.data) {
      throw new Error(llmResponse.error || "Failed to get LLM instance");
    }
    const llm = llmResponse.data;

    try {
      // Format question context
      // const questionContext = formatQuestionContext(params.question);
      const questionContext = params.question;

      console.log(
        `Classifying intent for question: ${JSON.stringify(questionContext)}`
      );

      // Create and invoke classification chain
      const chain = createClassificationChain(llm);
      const result = (await chain.invoke({
        questionContext,
        response: params.response,
      })) as ClassificationOutput;

      // Validate result matches expected schema
      const validatedResult = classificationSchema.parse(result);

      return {
        success: true,
        data: validatedResult,
        metadata: {
          processing_time: Date.now() - startTime,
          api_key_used: llmResponse.metadata?.api_key_used ?? -1,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      // Handle API errors and retry if needed
      await handleLLMError(error);

      if (attempt < MAX_RETRIES) {
        console.log(
          `Retrying classification (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await setTimeout(RETRY_DELAY);
        return classifyIntent(params, attempt + 1);
      }

      throw error;
    }
  } catch (error) {
    return {
      success: false,
      error: `Error dalam klasifikasi intent: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      metadata: {
        processing_time: 0,
        api_key_used: -1,
        timestamp: new Date().toISOString(),
      },
    };
  }
};

// Progress tracking utilities
const loadProgress = async (): Promise<EvaluationProgress | null> => {
  try {
    const data = await fs.readFile(PROGRESS_FILE, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    return null;
  }
};

const saveProgress = async (progress: EvaluationProgress): Promise<void> => {
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
};

const initializeProgress = (dataset: any[]): EvaluationProgress => {
  return {
    totalSamples: dataset.length,
    processedSamples: 0,
    lastProcessedIndex: -1,
    startTime: new Date().toISOString(),
    lastUpdateTime: new Date().toISOString(),
    results: [],
    errorRates: {
      total: 0,
      byErrorType: {},
    },
  };
};

// Calculate evaluation metrics
const calculateMetrics = (
  predictions: string[],
  actuals: string[]
): EvaluationMetrics => {
  const uniqueIntents = [
    "expected_answer",
    "unexpected_answer",
    "question",
    "other",
  ];

  // Initialize confusion matrix
  const matrix = Array(uniqueIntents.length)
    .fill(0)
    .map(() => Array(uniqueIntents.length).fill(0));

  // Fill confusion matrix
  for (let i = 0; i < predictions.length; i++) {
    const actualIndex = uniqueIntents.indexOf(actuals[i]);
    const predictedIndex = uniqueIntents.indexOf(predictions[i]);
    matrix[actualIndex][predictedIndex]++;
  }

  // Calculate per-class metrics
  const precision: { [key: string]: number } = {};
  const recall: { [key: string]: number } = {};
  const f1Score: { [key: string]: number } = {};

  uniqueIntents.forEach((intent, i) => {
    const tp = matrix[i][i];
    const fp = matrix.reduce((sum, row, j) => sum + (j !== i ? row[i] : 0), 0);
    const fn = matrix[i].reduce(
      (sum, cell, j) => sum + (j !== i ? cell : 0),
      0
    );

    precision[intent] = tp / (tp + fp) || 0;
    recall[intent] = tp / (tp + fn) || 0;
    f1Score[intent] =
      2 *
        ((precision[intent] * recall[intent]) /
          (precision[intent] + recall[intent])) || 0;
  });

  // Calculate averages
  const classCounts = uniqueIntents.map(
    (intent) => actuals.filter((a) => a === intent).length
  );
  const totalSamples = classCounts.reduce((a, b) => a + b);

  const averageMetrics = {
    macroAveragePrecision:
      Object.values(precision).reduce((a, b) => a + b) / uniqueIntents.length,
    macroAverageRecall:
      Object.values(recall).reduce((a, b) => a + b) / uniqueIntents.length,
    macroAverageF1:
      Object.values(f1Score).reduce((a, b) => a + b) / uniqueIntents.length,
    weightedAveragePrecision: uniqueIntents.reduce(
      (sum, intent, i) =>
        sum + (precision[intent] * classCounts[i]) / totalSamples,
      0
    ),
    weightedAverageRecall: uniqueIntents.reduce(
      (sum, intent, i) =>
        sum + (recall[intent] * classCounts[i]) / totalSamples,
      0
    ),
    weightedAverageF1: uniqueIntents.reduce(
      (sum, intent, i) =>
        sum + (f1Score[intent] * classCounts[i]) / totalSamples,
      0
    ),
  };

  return {
    accuracy:
      predictions.reduce(
        (correct, pred, i) => correct + (pred === actuals[i] ? 1 : 0),
        0
      ) / predictions.length,
    precision,
    recall,
    f1Score,
    confusionMatrix: { matrix, labels: uniqueIntents },
    averageMetrics,
  };
};

// Evaluate intent classification
export const evaluateIntentClassification = async (
  dataset: any[]
): Promise<ServiceResponse<EvaluationResults>> => {
  const startTime = Date.now();
  const errors: string[] = [];
  let processedCount = 0;
  let totalProcessingTime = 0;
  
  try {
    // Track predictions and actuals in fixed-size arrays
    const predictions: string[] = new Array(dataset.length);
    const actuals: string[] = new Array(dataset.length);
    
    // Process samples in very small batches
    const BATCH_SIZE = 2; // Minimal batch size
    const MAX_RETRIES = 2; // Reduced retries
    const RETRY_DELAY = 3000; // Shorter delay

    // Process batches sequentially
    for (let i = 0; i < dataset.length; i += BATCH_SIZE) {
      const batchEndIndex = Math.min(i + BATCH_SIZE, dataset.length);
      
      // Process each sample in current batch
      for (let j = i; j < batchEndIndex; j++) {
        const sample = dataset[j];
        const sampleStartTime = Date.now();
        
        try {
          let retryCount = 0;
          let result = null;

          // Simplified retry logic
          while (!result && retryCount < MAX_RETRIES) {
            try {
              result = await classifyIntent({
                question: sample.question,
                response: sample.response
              });
              
              if (!result.success) {
                throw new Error(result.error || "Classification failed");
              }
            } catch (error) {
              retryCount++;
              if (retryCount < MAX_RETRIES) {
                await setTimeout(RETRY_DELAY); // Menggunakan setTimeout dari timers/promises
              } else {
                throw error;
              }
            }
          }

          if (result?.data) {
            // Store only essential data
            predictions[j] = result.data.intent;
            actuals[j] = sample.intent;
            processedCount++;
            
            // Update processing time
            const sampleProcessingTime = Date.now() - sampleStartTime;
            totalProcessingTime += sampleProcessingTime;
          }

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          errors.push(`Sample ${j}: ${errorMessage}`);
          
          // Still track the attempt
          predictions[j] = "error";
          actuals[j] = sample.intent;
          processedCount++;
        }

        // Log progress sparingly
        if (j % 10 === 0 || j === dataset.length - 1) {
          console.log(`Processed ${j + 1}/${dataset.length} samples`);
        }
      }
    }

    // Filter out error cases before calculating metrics
    const validResults = predictions.reduce((acc, pred, idx) => {
      if (pred && pred !== "error") {
        acc.predictions.push(pred);
        acc.actuals.push(actuals[idx]);
      }
      return acc;
    }, { predictions: [] as string[], actuals: [] as string[] });

    // Use original calculateMetrics function
    const metrics = calculateMetrics(validResults.predictions, validResults.actuals);

    return {
      success: true,
      data: {
        metrics,
        totalSamples: dataset.length,
        errors,
        evaluationTime: Date.now() - startTime
      },
      metadata: {
        processing_time: totalProcessingTime,
        api_key_used: -1,
        timestamp: new Date().toISOString()
      }
    };
    
  } catch (error) {
    return {
      success: false,
      error: `Evaluation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      metadata: {
        processing_time: Date.now() - startTime,
        api_key_used: -1,
        timestamp: new Date().toISOString()
      }
    };
  }
};
// Get evaluation progress
export const getEvaluationProgress = async (): Promise<
  ServiceResponse<EvaluationProgress | null>
> => {
  try {
    const progress = await loadProgress();

    if (!progress) {
      return {
        success: true,
        data: null,
        metadata: {
          processing_time: 0,
          api_key_used: -1,
          timestamp: new Date().toISOString(),
        },
      };
    }

    // Calculate additional metrics
    const completionPercentage =
      (progress.processedSamples / progress.totalSamples) * 100;
    const failedSamples = progress.results.filter((r) => !r.processed).length;
    const errorRate =
      failedSamples > 0 ? (failedSamples / progress.processedSamples) * 100 : 0;

    // Analyze intent distribution
    const intentDistribution = progress.results
      .filter((r) => r.processed && r.predictedIntent)
      .reduce((acc, curr) => {
        const intent = curr.predictedIntent as string;
        acc[intent] = (acc[intent] || 0) + 1;
        return acc;
      }, {} as { [key: string]: number });

    // Calculate average confidence by intent
    const confidenceByIntent = progress.results
      .filter((r) => r.processed && r.predictedIntent && r.confidence)
      .reduce((acc, curr) => {
        const intent = curr.predictedIntent as string;
        if (!acc[intent]) {
          acc[intent] = { sum: 0, count: 0 };
        }
        acc[intent].sum += curr.confidence || 0;
        acc[intent].count += 1;
        return acc;
      }, {} as { [key: string]: { sum: number; count: number } });

    const averageConfidenceByIntent = Object.entries(confidenceByIntent).reduce(
      (acc, [intent, data]) => {
        acc[intent] = data.sum / data.count;
        return acc;
      },
      {} as { [key: string]: number }
    );

    const enrichedProgress = {
      ...progress,
      metrics: {
        completionPercentage: parseFloat(completionPercentage.toFixed(2)),
        errorRate: parseFloat(errorRate.toFixed(2)),
        failedSamples,
        intentDistribution,
        averageConfidenceByIntent,
        timeElapsed: Date.now() - new Date(progress.startTime).getTime(),
        averageprocessing_timePerSample: progress.averageprocessing_time || 0,
      },
    };

    return {
      success: true,
      data: enrichedProgress,
      metadata: {
        processing_time: 0,
        api_key_used: -1,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get evaluation progress: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      metadata: {
        processing_time: 0,
        api_key_used: -1,
        timestamp: new Date().toISOString(),
      },
    };
  }
};

// Create evaluation dataset from test cases
export const createEvaluationDataset = async (
  testCases: Array<{
    question: Question;
    response: string;
    expectedIntent: string;
  }>
): Promise<{ dataset: any[] }> => {
  return {
    dataset: testCases.map((testCase, index) => ({
      id: index,
      question: testCase.question,
      response: testCase.response,
      intent: testCase.expectedIntent,
      timestamp: new Date().toISOString(),
    })),
  };
};

// Reset evaluation progress
export const resetEvaluationProgress = async (): Promise<
  ServiceResponse<void>
> => {
  try {
    await Promise.all([
      fs.unlink(PROGRESS_FILE).catch(() => {}),
      fs.unlink(RESULTS_FILE).catch(() => {}),
    ]);

    return {
      success: true,
      metadata: {
        processing_time: 0,
        api_key_used: -1,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to reset evaluation progress: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
      metadata: {
        processing_time: 0,
        api_key_used: -1,
        timestamp: new Date().toISOString(),
      },
    };
  }
};

// Export helper functions for testing
export const testHelpers = {
  formatQuestionContext,
  calculateMetrics,
  loadProgress,
  saveProgress,
  initializeProgress,
};

export default {
  classifyIntent,
  evaluateIntentClassification,
  getEvaluationProgress,
  createEvaluationDataset,
  resetEvaluationProgress,
  testHelpers,
};

// import { ChatPromptTemplate } from "@langchain/core/prompts";
// import { setTimeout } from 'timers/promises';
// import path from 'path';
// import fs from 'fs/promises';
// import fsOnly from 'fs';
// // import pLimit from 'p-limit';
// import {
//   classificationSchema,
//   getCurrentLLM,
//   handleLLMError
// } from "../config/llmConfig";
// import {
//   ClassificationContext,
//   ClassificationResult,
//   EvaluationMetrics,
//   EvaluationResults,
//   EvaluationProgress,
//   ClassificationProgress,
//   ServiceResponse,
//   ClassificationOutput
// } from "../types/intentTypes";

// // Constants
// const PROGRESS_FILE = path.join(__dirname, '../data/validation_evaluation_progress.json');
// const RESULTS_FILE = path.join(__dirname, '../data/validation_evaluation_results.json');
// const RETRY_DELAY = 5*1000;
// const MAX_RETRIES = 3;

// const CONCURRENT_LIMIT = 5; // Batas paralelisme untuk p-limit
// const RETRY_LIMIT = 3; // Batas maksimum retry untuk API call

// // Classification prompt template
// const classificationPrompt = ChatPromptTemplate.fromTemplate(`
//   Anda adalah sistem klasifikasi intent untuk sistem survei.
//   Analisis interaksi berikut dan klasifikasikan respons pengguna.

//   Pertanyaan Survei: {question}
//   Respons Pengguna: {response}
//   Aturan Validasi: {rules_validation}
//   Format Jawaban yang Diharapkan: {expected_answer}

//   Klasifikasikan respons pengguna ke dalam salah satu kategori berikut:
//   - "answer": Respons yang mencoba menjawab pertanyaan secara langsung yang masuk akal
//   - "question": Pertanyaan atau permintaan klarifikasi tentang pertanyaan survei
//   - "other": Respons yang bukan jawaban maupun pertanyaan berkaitan dengan pertanyaan survei

//   Berikan penjelasan yang jelas mengapa respons diklasifikasikan demikian.
// `);

// // Create classification chain
// const createClassificationChain = (llm: any) => {
//   const llmWithStructuredOutput = llm.withStructuredOutput(classificationSchema, {
//     name: "klasifikasi_intent",
//   });
//   return classificationPrompt.pipe(llmWithStructuredOutput);
// };

// // Progress tracking utilities
// const loadProgress = async (): Promise<EvaluationProgress | null> => {
//   try {
//     const data = await fs.readFile(PROGRESS_FILE, 'utf-8');
//     return JSON.parse(data);
//   } catch (error) {
//     return null;
//   }
// };

// const saveProgress = async (progress: EvaluationProgress): Promise<void> => {
//   await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
// };

// const initializeProgress = (dataset: any[]): EvaluationProgress => {
//   return {
//     totalSamples: dataset.length,
//     processedSamples: 0,
//     lastProcessedIndex: -1,
//     startTime: new Date().toISOString(),
//     lastUpdateTime: new Date().toISOString(),
//     results: [],
//     errorRates: {
//       total: 0,
//       byErrorType: {}
//     }
//   };
// };

// // Classification function with retries
// export const classifyIntent = async (
//   params: ClassificationContext,
//   attempt = 0
// ): Promise<ServiceResponse<ClassificationResult>> => {
//   try {
//     const startTime = Date.now();

//     // Get LLM instance
//     const llmResponse = await getCurrentLLM();
//     if (!llmResponse.success || !llmResponse.data) {
//       throw new Error(llmResponse.error || 'Failed to get LLM instance');
//     }
//     const llm = llmResponse.data;

//     try {
//       // Format expected answer if array
//       const formattedExpectedAnswer = Array.isArray(params.expected_answer)
//         ? params.expected_answer.join(", ")
//         : params.expected_answer;

//       // Create and invoke classification chain
//       const chain = createClassificationChain(llm);
//       const result = (await chain.invoke({
//         question: params.question,
//         response: params.response,
//         rules_validation: params.rules_validation ?? "Tidak ada aturan khusus",
//         expected_answer: formattedExpectedAnswer ?? "Tidak ada format khusus",
//       })) as ClassificationOutput;

//       return {
//         success: true,
//         data: {
//           success: true,
//           data: {
//             intent: result.intent,
//             confidence: result.confidence,
//             explanation: result.explanation,
//           }
//         },
//         metadata: {
//           processing_time: Date.now() - startTime,
//           api_key_used: llmResponse.metadata?.api_key_used ?? -1,
//           timestamp: new Date().toISOString()
//         }
//       };

//     } catch (error) {
//       // Handle API errors and retry if needed
//       await handleLLMError(error);

//       if (attempt < MAX_RETRIES) {
//         console.log(`Retrying classification (attempt ${attempt + 1}/${MAX_RETRIES})`);
//         await setTimeout(RETRY_DELAY);
//         return classifyIntent(params, attempt + 1);
//       }

//       throw error;
//     }
//   } catch (error) {
//     return {
//       success: false,
//       error: `Error dalam klasifikasi intent: ${
//         error instanceof Error ? error.message : "Unknown error"
//       }`,
//       metadata: {
//         processing_time: 0,
//         api_key_used: -1,
//         timestamp: new Date().toISOString()
//       }
//     };
//   }
// };

// // Calculate evaluation metrics
// const calculateMetrics = (predictions: string[], actuals: string[]): EvaluationMetrics => {
//   const uniqueIntents = Array.from(new Set([...predictions, ...actuals])).sort();

//   // Initialize confusion matrix
//   const matrix = Array(uniqueIntents.length).fill(0)
//     .map(() => Array(uniqueIntents.length).fill(0));

//   // Fill confusion matrix
//   for (let i = 0; i < predictions.length; i++) {
//     const actualIndex = uniqueIntents.indexOf(actuals[i]);
//     const predictedIndex = uniqueIntents.indexOf(predictions[i]);
//     matrix[actualIndex][predictedIndex]++;
//   }

//   // Calculate per-class metrics
//   const precision: { [key: string]: number } = {};
//   const recall: { [key: string]: number } = {};
//   const f1Score: { [key: string]: number } = {};

//   uniqueIntents.forEach((intent, i) => {
//     const tp = matrix[i][i];
//     const fp = matrix.reduce((sum, row, j) => sum + (j !== i ? row[i] : 0), 0);
//     const fn = matrix[i].reduce((sum, cell, j) => sum + (j !== i ? cell : 0), 0);

//     precision[intent] = tp / (tp + fp) || 0;
//     recall[intent] = tp / (tp + fn) || 0;
//     f1Score[intent] = 2 * ((precision[intent] * recall[intent]) /
//       (precision[intent] + recall[intent])) || 0;
//   });

//   // Calculate averages
//   const classCounts = uniqueIntents.map(intent =>
//     actuals.filter(a => a === intent).length
//   );
//   const totalSamples = classCounts.reduce((a, b) => a + b);

//   const averageMetrics = {
//     macroAveragePrecision: Object.values(precision).reduce((a, b) => a + b) / uniqueIntents.length,
//     macroAverageRecall: Object.values(recall).reduce((a, b) => a + b) / uniqueIntents.length,
//     macroAverageF1: Object.values(f1Score).reduce((a, b) => a + b) / uniqueIntents.length,
//     weightedAveragePrecision: uniqueIntents.reduce((sum, intent, i) =>
//       sum + (precision[intent] * classCounts[i] / totalSamples), 0),
//     weightedAverageRecall: uniqueIntents.reduce((sum, intent, i) =>
//       sum + (recall[intent] * classCounts[i] / totalSamples), 0),
//     weightedAverageF1: uniqueIntents.reduce((sum, intent, i) =>
//       sum + (f1Score[intent] * classCounts[i] / totalSamples), 0)
//   };

//   return {
//     accuracy: predictions.reduce((correct, pred, i) =>
//       correct + (pred === actuals[i] ? 1 : 0), 0) / predictions.length,
//     precision,
//     recall,
//     f1Score,
//     confusionMatrix: { matrix, labels: uniqueIntents },
//     averageMetrics
//   };
// };

// // Evaluate intent classification
// // export const evaluateIntentClassification = async (
// //   dataset: any[]
// // ): Promise<ServiceResponse<EvaluationResults>> => {
// //   const startTime = Date.now();
// //   const errors: string[] = [];

// //   try {
// //     // Load or initialize progress
// //     let progress = await loadProgress();

// //     if (!progress) {
// //       progress = initializeProgress(dataset);
// //       await saveProgress(progress);
// //     }

// //     // Process remaining samples
// //     for (let i = progress.lastProcessedIndex + 1; i < dataset.length; i++) {
// //       const sample = dataset[i];
// //       console.log(`Processing sample ${i + 1}/${dataset.length}`);

// //       try {
// //         const classificationProgress: ClassificationProgress = {
// //           sampleId: i,
// //           question: sample.question,
// //           response: sample.response,
// //           actualIntent: sample.intent,
// //           processed: false,
// //           timestamp: new Date().toISOString()
// //         };

// //         const result = await classifyIntent({
// //           question: sample.question,
// //           response: sample.response
// //         });

// //         if (result.success && result.data?.success && result.data.data) {
// //           classificationProgress.predictedIntent = result.data.data.intent;
// //           classificationProgress.confidence = result.data.data.confidence;
// //           classificationProgress.explanation = result.data.data.explanation;
// //           classificationProgress.processed = true;
// //           classificationProgress.api_key_used = result.metadata?.api_key_used;
// //           classificationProgress.processing_time = result.metadata?.processing_time;
// //         } else {
// //           classificationProgress.error = result.error;
// //           errors.push(`Error processing sample ${i}: ${result.error}`);
// //         }

// //         progress.results.push(classificationProgress);
// //         progress.processedSamples++;
// //         progress.lastProcessedIndex = i;
// //         progress.lastUpdateTime = new Date().toISOString();

// //         // Update error rates
// //         if (classificationProgress.error) {
// //           progress.errorRates.total++;
// //           progress.errorRates.byErrorType[classificationProgress.error] =
// //             (progress.errorRates.byErrorType[classificationProgress.error] || 0) + 1;
// //         }

// //         // Update averages
// //         if (classificationProgress.processing_time) {
// //           progress.averageprocessing_time = progress.averageprocessing_time
// //             ? (progress.averageprocessing_time + classificationProgress.processing_time) / 2
// //             : classificationProgress.processing_time;
// //         }

// //         await saveProgress(progress);
// //         await setTimeout(500); // Rate limiting delay

// //       } catch (error) {
// //         const errorMessage = `Error processing sample ${i}: ${error instanceof Error ? error.message : 'Unknown error'}`;
// //         errors.push(errorMessage);
// //         continue;
// //       }
// //     }

// //     // Calculate final metrics
// //     const predictions = progress.results
// //       .filter(r => r.processed)
// //       .map(r => r.predictedIntent as string);

// //     const actuals = progress.results
// //       .filter(r => r.processed)
// //       .map(r => r.actualIntent);

// //     const metrics = calculateMetrics(predictions, actuals);

// //     // Prepare final results
// //     const results: EvaluationResults = {
// //       metrics,
// //       totalSamples: dataset.length,
// //       errors,
// //       evaluationTime: Date.now() - startTime
// //     };

// //     // Save final results
// //     await fs.writeFile(RESULTS_FILE, JSON.stringify(results, null, 2));

// //     return {
// //       success: true,
// //       data: results,
// //       metadata: {
// //         processing_time: Date.now() - startTime,
// //         api_key_used: -1,
// //         timestamp: new Date().toISOString()
// //       }
// //     };

// //   } catch (error) {
// //     return {
// //       success: false,
// //       error: `Evaluation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
// //       metadata: {
// //         processing_time: Date.now() - startTime,
// //         api_key_used: -1,
// //         timestamp: new Date().toISOString()
// //       }
// //     };
// //   }
// // };

// const BATCH_SIZE = 5;  // Batas jumlah paralel yang diizinkan

// export const evaluateIntentClassification = async (
//   dataset: any[]
// ): Promise<ServiceResponse<EvaluationResults>> => {
//   const startTime = Date.now();
//   const errors: string[] = [];

//   try {
//     // Load atau inisialisasi progress
//     let progress = await loadProgress();
//     if (!progress) {
//       progress = initializeProgress(dataset);
//       await saveProgress(progress);
//     }

//     // Fungsi untuk memproses sample dengan retry
//     const processSample = async (i: number) => {
//       const sample = dataset[i];
//       console.log(`Processing sample ${i + 1}/${dataset.length}`);
//       const classificationProgress: ClassificationProgress = {
//         sampleId: i,
//         question: sample.question,
//         response: sample.response,
//         actualIntent: sample.intent,
//         processed: false,
//         timestamp: new Date().toISOString(),
//       };

//       let retryCount = 0;
//       let success = false;
//       while (!success && retryCount < RETRY_LIMIT) {
//         try {
//           const result = await classifyIntent({
//             question: sample.question,
//             response: sample.response,
//           });

//           if (result.success && result.data?.success && result.data.data) {
//             classificationProgress.predictedIntent = result.data.data.intent;
//             classificationProgress.confidence = result.data.data.confidence;
//             classificationProgress.explanation = result.data.data.explanation;
//             classificationProgress.processed = true;
//             classificationProgress.api_key_used = result.metadata?.api_key_used;
//             classificationProgress.processing_time = result.metadata?.processing_time;
//           } else {
//             throw new Error(result.error || 'Unknown API error');
//           }

//           success = true;
//         } catch (error) {
//           retryCount++;
//           if (retryCount < RETRY_LIMIT) {
//             console.log(`Retrying sample ${i}, attempt ${retryCount}`);
//             await new Promise((res) => global.setTimeout(res, RETRY_DELAY));
//           } else {
//             classificationProgress.error = error instanceof Error ? error.message : 'Unknown error';
//             errors.push(`Error processing sample ${i}: ${classificationProgress.error}`);
//           }
//         }
//       }

//       // Update progress secara inkremental
//       progress.results.push(classificationProgress);
//       progress.processedSamples++;
//       progress.lastProcessedIndex = i;
//       progress.lastUpdateTime = new Date().toISOString();

//       // Update error rates dan averages
//       if (classificationProgress.error) {
//         progress.errorRates.total++;
//         progress.errorRates.byErrorType[classificationProgress.error] =
//           (progress.errorRates.byErrorType[classificationProgress.error] || 0) + 1;
//       }
//       if (classificationProgress.processing_time) {
//         progress.averageprocessing_time = progress.averageprocessing_time
//           ? (progress.averageprocessing_time + classificationProgress.processing_time) / 2
//           : classificationProgress.processing_time;
//       }
//     };

//     // Fungsi untuk memproses dalam batch dengan batas paralel
//     const processInBatches = async () => {
//       const batches = Math.ceil(dataset.length / BATCH_SIZE);
//       for (let batchIndex = 0; batchIndex < batches; batchIndex++) {
//         const batchStartIndex = batchIndex * BATCH_SIZE;
//         const batchEndIndex = Math.min((batchIndex + 1) * BATCH_SIZE, dataset.length);
//         const batch = dataset.slice(batchStartIndex, batchEndIndex);

//         console.log(`Processing batch ${batchIndex + 1}/${batches}...`);

//         // Proses semua sample dalam batch secara paralel, dengan pembatasan jumlah paralel
//         const batchPromises = batch.map((_, i) => processSample(batchStartIndex + i));
//         await Promise.allSettled(batchPromises); // Menggunakan Promise.allSettled untuk menangani kesalahan batch tanpa menghentikan eksekusi
//       }
//     };

//     // Process samples in batches
//     await processInBatches();

//     // Hitung metrik akhir
//     const predictions = progress.results
//       .filter((r) => r.processed)
//       .map((r) => r.predictedIntent as string);

//     const actuals = progress.results
//       .filter((r) => r.processed)
//       .map((r) => r.actualIntent);

//     const metrics = calculateMetrics(predictions, actuals);

//     // Persiapkan hasil akhir
//     const results: EvaluationResults = {
//       metrics,
//       totalSamples: dataset.length,
//       errors,
//       evaluationTime: Date.now() - startTime,
//     };

//     // Simpan hasil akhir menggunakan streaming
//     const resultsStream = fsOnly.createWriteStream(RESULTS_FILE);
//     resultsStream.write(JSON.stringify(results, null, 2));
//     resultsStream.end();

//     return {
//       success: true,
//       data: results,
//       metadata: {
//         processing_time: Date.now() - startTime,
//         api_key_used: -1,
//         timestamp: new Date().toISOString(),
//       },
//     };
//   } catch (error) {
//     return {
//       success: false,
//       error: `Evaluation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
//       metadata: {
//         processing_time: Date.now() - startTime,
//         api_key_used: -1,
//         timestamp: new Date().toISOString(),
//       },
//     };
//   }
// };

// // Get evaluation progress
// export const getEvaluationProgress = async (): Promise<ServiceResponse<EvaluationProgress | null>> => {
//   try {
//     const progress = await loadProgress();
//     return {
//       success: true,
//       data: progress,
//       metadata: {
//         processing_time: 0,
//         api_key_used: -1,
//         timestamp: new Date().toISOString()
//       }
//     };
//   } catch (error) {
//     return {
//       success: false,
//       error: `Failed to get evaluation progress: ${error instanceof Error ? error.message : "Unknown error"}`,
//       metadata: {
//         processing_time: 0,
//         api_key_used: -1,
//         timestamp: new Date().toISOString()
//       }
//     };
//   }
// };
