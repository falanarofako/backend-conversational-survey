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
  updateLLMUsage,
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
import EvaluationMetric from "../models/EvaluationMetric";
import ClassificationEvaluationBundle, { IntentClassificationEvaluationItem } from "../models/ClassificationEvaluationBundle";

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
  
  Pastikan Anda benar-benar mengikuti setiap perintah di bawah ini:
  1. Jika respons pengguna merupakan pertanyaan atau permintaan klarifikasi terkait pertanyaan survei, maka klasifikasikan sebagai "question".
  2. Jika pertanyaan memiliki format jawaban berupa angka tetapi pengguna menjawab dengan teks dan relevan dengan pertanyaan, maka klasifikasi sebagai "expected_answer".
  3. Jika pertanyaan memiliki jawaban "Ya" atau "Tidak", pengguna tidak harus secara eksplisit menyebutkan "Ya" atau "Tidak" untuk diklasifikasikan sebagai "expected_answer" sehingga Anda perlu menganalisis mendalam maksud pengguna.
  4. Jika respons diklasifikasikan sebagai "unexpected_answer" atau "other", maka berikan alasan pada properti 'clarification_reason' tetapi jangan lupa untuk memberikan penjelasan Anda dalam melakukan klasifikasi pada properti 'explanation'.
  5. Jika respons diklasifikasikan sebagai "unexpected_answer", berikan kalimat singkat hanya dalam satu kalimat saja yang menjelaskan mengapa jawaban pengguna harus diklarifikasi kemudian dilanjutkan dengan pertanyaan klarifikasi yang memandu pengguna untuk memberikan jawaban yang diharapkan.
  6. Jika respons diklasifikasikan sebagai "other", berikan kalimat singkat yang menjelaskan mengapa pengguna harus menjawab ulang pertanyaan dikarenakan jawaban tidak relevan dengan pertanyaan.
  7. Jika pertanyaan memiliki opsi jawaban dan respons diklasifikasikan sebagai "expected_answer", maka sebutkan juga opsi jawaban mana yang paling mendekati dengan maksud pengguna pada properti 'explanation'.
  8. Jika pertanyaan tidak mempersilahkan pengguna menuliskan sendiri secara terbuka, maka Anda jangan meminta pengguna menulis jawaban secara terbuka.

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
    const apiKey = llmResponse.metadata?.api_key_used as string;

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

      // Update usage after successful request (estimate tokens)
      const estimatedTokens = Math.ceil((params.response.length + JSON.stringify(questionContext).length) / 4);
      await updateLLMUsage(apiKey, estimatedTokens);

      return {
        success: true,
        data: validatedResult,
        metadata: {
          processing_time: Date.now() - startTime,
          api_key_used: apiKey,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      // Handle API errors and retry if needed
      await handleLLMError(apiKey, error);

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
        api_key_used: "system",
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

/**
 * Hitung metrik evaluasi (accuracy, precision, recall, f1, confusion matrix, macro/micro average)
 */
function calculateMetrics(predictions: string[], actuals: string[]) {
  const uniqueIntents = ["expected_answer", "unexpected_answer", "question", "other"];
  const matrix = Array(uniqueIntents.length).fill(0).map(() => Array(uniqueIntents.length).fill(0));

  for (let i = 0; i < predictions.length; i++) {
    const actualIndex = uniqueIntents.indexOf(actuals[i]);
    const predictedIndex = uniqueIntents.indexOf(predictions[i]);
    if (actualIndex >= 0 && predictedIndex >= 0) {
      matrix[actualIndex][predictedIndex]++;
    }
  }

  const precision: { [key: string]: number } = {};
  const recall: { [key: string]: number } = {};
  const f1Score: { [key: string]: number } = {};

  uniqueIntents.forEach((intent, i) => {
    const tp = matrix[i][i];
    const fp = matrix.reduce((sum, row, j) => sum + (j !== i ? row[i] : 0), 0);
    const fn = matrix[i].reduce((sum, cell, j) => sum + (j !== i ? cell : 0), 0);

    precision[intent] = tp / (tp + fp) || 0;
    recall[intent] = tp / (tp + fn) || 0;
    f1Score[intent] = 2 * ((precision[intent] * recall[intent]) / (precision[intent] + recall[intent]) || 0);
  });

  const classCounts = uniqueIntents.map(intent => actuals.filter(a => a === intent).length);
  const totalSamples = classCounts.reduce((a, b) => a + b, 0);

  const averageMetrics = {
    macroAveragePrecision: Object.values(precision).reduce((a, b) => a + b, 0) / uniqueIntents.length,
    macroAverageRecall: Object.values(recall).reduce((a, b) => a + b, 0) / uniqueIntents.length,
    macroAverageF1: Object.values(f1Score).reduce((a, b) => a + b, 0) / uniqueIntents.length,
    weightedAveragePrecision: uniqueIntents.reduce((sum, intent, i) => sum + (precision[intent] * classCounts[i]) / totalSamples, 0),
    weightedAverageRecall: uniqueIntents.reduce((sum, intent, i) => sum + (recall[intent] * classCounts[i]) / totalSamples, 0),
    weightedAverageF1: uniqueIntents.reduce((sum, intent, i) => sum + (f1Score[intent] * classCounts[i]) / totalSamples, 0),
  };

  return {
    accuracy: predictions.filter((pred, i) => pred === actuals[i]).length / predictions.length,
    precision,
    recall,
    f1Score,
    confusionMatrix: { matrix, labels: uniqueIntents },
    averageMetrics,
  };
}

/**
 * Evaluasi intent classification dan simpan hasil dalam bentuk bundle
 */
export const evaluateIntentClassification = async (dataset: any[]) => {
  const items: IntentClassificationEvaluationItem[] = [];
  let correct = 0;
  const predictions: string[] = [];
  const actuals: string[] = [];

  for (let i = 0; i < dataset.length; i++) {
    const sample = dataset[i];
    const context: ClassificationContext = {
      question: sample.question,
      response: sample.response,
    };

    try {
      const result = await classifyIntent(context);
      if (result.success && result.data) {
        const predicted = result.data.intent;
        const actual = sample.intent;
        predictions.push(predicted);
        actuals.push(actual);

        if (predicted === actual) correct++;

        items.push({
          evaluation_item_index: i,
          question: sample.question,
          response: sample.response,
          actual_intent: actual,
          predicted_intent: predicted,
          confidence: result.data.confidence,
          explanation: result.data.explanation,
          clarification_reason: result.data.clarification_reason,
          follow_up_question: result.data.follow_up_question,
          timestamp: new Date(),
        });
      } else {
        predictions.push("other");
        actuals.push(sample.intent);
        items.push({
          evaluation_item_index: i,
          question: sample.question,
          response: sample.response,
          actual_intent: sample.intent,
          predicted_intent: "other",
          confidence: 0,
          explanation: result.error || "Klasifikasi gagal",
          timestamp: new Date(),
        });
      }
    } catch (err) {
      predictions.push("other");
      actuals.push(sample.intent);
      items.push({
        evaluation_item_index: i,
        question: sample.question,
        response: sample.response,
        actual_intent: sample.intent,
        predicted_intent: "other",
        confidence: 0,
        explanation: (err as Error).message || "Klasifikasi gagal",
        timestamp: new Date(),
      });
    }
  }

  // Hitung metrik
  const metrics = calculateMetrics(predictions, actuals);

  // Simpan bundle ke database
  const bundle = new ClassificationEvaluationBundle({
    items,
    metadata: {
      total_items: items.length,
      correct,
      // accuracy: correct / items.length,
      created_at: new Date(),
      ...metrics,
    },
  });
  await bundle.save();

  return {
    success: true,
    data: {
      bundle,
      metrics,
    },
  };
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
          api_key_used: "system",
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
        api_key_used: "system",
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
        api_key_used: "system",
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
        api_key_used: "system",
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
        api_key_used: "system",
        timestamp: new Date().toISOString(),
      },
    };
  }
};

export const fetchAllClassificationResults = async () => {
  // Populasikan evaluationDataId menjadi data lengkap dari EvaluationData
  const results = await ClassificationResultData.find()
    .populate("evaluationDataId")
    .exec();

  return results;
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
