// src/config/llmConfig.ts

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import dotenv from "dotenv";
import { getKeyManager } from "../utils/apiKeyRotation";
import { ServiceResponse } from "../types/intentTypes";

dotenv.config();

// Output schema for classification
export const classificationSchema = z.object({
  intent: z
    .enum(["question", "expected_answer", "unexpected_answer", "other"])
    .describe(
      "Klasifikasi respons pengguna:\n" +
        "- question: Pertanyaan terkait pertanyaan survei yang ditanyakan atau permintaan klarifikasi.\n" +
        "- expected_answer: Jawaban yang memenuhi salah satu kriteria berikut:\n" +
        "1. Menjawab pertanyaan secara langsung walaupun format jawaban tidak sesuai. Misalnya: format jawaban adalah angka tetapi pengguna menjawab dengan teks tetapi menyatakan jumlah atau nilai yang pasti bukan 'lebih dari' atau 'kurang dari'\n" +
        "2. Menggunakan kata/frasa yang sama atau sinonim dari opsi jawaban yang tersedia\n" +
        "3. Dapat dipetakan secara langsung ke salah satu opsi jawaban berdasarkan maknanya\n" +
        "- unexpected_answer: Jawaban yang memenuhi semua kriteria berikut:\n" +
        "1. Merespons pertanyaan yang diajukan\n" +
        "2. Mengandung informasi yang relevan\n" +
        "3. Menyatakan nilai baik dalam angka atau teks yang tidak pasti atau spesifik. Misalnya kurang dari satu juta atau lebih dari satu juta\n" + 
        "4. Tidak memenuhi validasi jawaban seperti nilai minimum dan maksimum jika pertanyaan menanyakan angka kemudian berikan sedikit penjelasan pada property 'follow_up_question' bahwa jawaban tidak memenuhi validasi\n" +
        "5. Tidak dapat langsung dipetakan ke format atau opsi jawaban yang tersedia\n" +
        "6. Memiliki ambiguitas yang dapat mengarah ke lebih dari satu opsi jawaban\n" +
        "7. Memerlukan klarifikasi atau konversi lebih lanjut\n" +
        "- other:  Respons yang tidak termasuk kategori di atas, seperti:\n" +
        "1. Tidak relevan dengan pertanyaan\n" +
        "2. Bukan pertanyaan maupun jawaban\n" +
        "3. Respons kosong atau tidak bermakna"
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Tingkat keyakinan klasifikasi dari 0 sampai 1"),
  explanation: z
    .string()
    .describe(
      "Penjelasan mengapa respons diklasifikasikan demikian. Jika pertanyaan memiliki opsi jawaban, maka sebutkan juga opsi jawaban mana yang paling mendekati dengan maksud pengguna."
    ),
  clarification_reason: z
    .string()
    .optional()
    .describe(
      "Penjelasan singkat (hanya dalam satu kalimat) kepada pengguna mengapa jawaban mereka memerlukan klarifikasi untuk intent unexpected_answer atau perlu dijawab ulang untuk intent other dan pastikan penjelasannya sejalan dengan penjelasan pada properti 'explanation' dan dituliskan secara singkat hanya 1 kalimat saja (hanya ada jika intent adalah unexpected_answer atau other). Dalam penjelasannya, Anda jangan meminta pengguna memilih opsi jawaban yang tersedia karena opsi jawaban memang tidak ditunjukkan kepada pengguna."
    ),
  follow_up_question: z
    .string()
    .optional()
    .describe(
      "Kalimat pertanyaan untuk mendapatkan jawaban spesifik (hanya ada jika intent adalah unexpected_answer atau other) dengan meminta pengguna merespons dengan jawaban yang diharapkan atau meminta pengguna untuk memilih opsi jawaban yang tersedia jika pertanyaan merupakan pertanyaan dengan opsi jawaban."
    ),
});

export const informationExtractionSchema = z.object({
  extracted_information: z
    .string()
    .describe("Informasi yang telah diextrak dari jawaban pengguna berdasarkan pertanyaan yang terkait."),
    explanation: z
    .string()
    .describe("Penjelasan mengapa informasi tersebut telah diekstrak dari jawaban pengguna berdasarkan pertanyaan yang terkait."),
});

// LLM Configuration
interface LLMConfig {
  model: string;
  temperature: number;
  maxRetries: number;
  timeout: number;
}

const defaultConfig: LLMConfig = {
  model: "gemini-2.0-flash",
  temperature: 0,
  maxRetries: 2,
  timeout: 30000,
};

// State flag
let isInitialized = false;

// Initialize the LLM system
export const initializeLLM = async (): Promise<ServiceResponse<void>> => {
  try {
    if (isInitialized) {
      return {
        success: true,
        metadata: {
          processing_time: 0,
          api_key_used: -1,
          timestamp: new Date().toISOString(),
        },
      };
    }

    // Initialize key manager (will throw if no keys are configured)
    getKeyManager();
    isInitialized = true;

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
      error:
        error instanceof Error
          ? error.message
          : "Unknown error during LLM initialization",
    };
  }
};

// Get current LLM instance
export const getCurrentLLM = async (
  config: Partial<LLMConfig> = {}
): Promise<ServiceResponse<ChatGoogleGenerativeAI>> => {
  try {
    // Ensure system is initialized
    if (!isInitialized) {
      const initResult = await initializeLLM();
      if (!initResult.success) {
        throw new Error(initResult.error || "Failed to initialize LLM system");
      }
    }

    // Get API key
    const keyManager = getKeyManager();
    const keyResponse = keyManager.getCurrentKey();
    
    if (!keyResponse.success || !keyResponse.data) {
      throw new Error(keyResponse.error || "Failed to get API key");
    }

    const apiKey = keyResponse.data;
    const keyIndex = keyResponse.metadata?.api_key_used || 0;

    // Create LLM instance
    const llmConfig = { ...defaultConfig, ...config };
    const llm = new ChatGoogleGenerativeAI({
      modelName: llmConfig.model,
      temperature: llmConfig.temperature,
      maxRetries: llmConfig.maxRetries,
      apiKey: apiKey,
    });

    return {
      success: true,
      data: llm,
      metadata: {
        processing_time: 0,
        api_key_used: keyIndex,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error getting LLM instance",
    };
  }
};

// Handle LLM errors
export const handleLLMError = async (error: any): Promise<ServiceResponse<void>> => {
  try {
    if (!isInitialized) {
      throw new Error("LLM system not initialized");
    }

    // Simply rotate the key on error
    const keyManager = getKeyManager();
    keyManager.handleError();

    return {
      success: true,
      metadata: {
        processing_time: 0,
        api_key_used: -1,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : "Unknown error handling LLM error",
    };
  }
};

// Reset LLM state
export const resetLLMState = async (): Promise<ServiceResponse<void>> => {
  try {
    if (!isInitialized) {
      throw new Error("LLM system not initialized");
    }

    const keyManager = getKeyManager();
    const resetResponse = keyManager.resetCounters();
    
    if (!resetResponse.success) {
      throw new Error(resetResponse.error || "Failed to reset counters");
    }

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
      error:
        error instanceof Error
          ? error.message
          : "Unknown error resetting LLM state",
    };
  }
};

// Get system status
export const getLLMStatus = (): ServiceResponse<{
  initialized: boolean;
  currentConfig: LLMConfig;
  keyStatus?: {
    currentKeyIndex: number;
    totalKeys: number;
    usageCounts: number[];
    timeSinceLastRotation: number;
  };
}> => {
  try {
    const status = {
      initialized: isInitialized,
      currentConfig: defaultConfig,
    };

    if (isInitialized) {
      const keyManager = getKeyManager();
      const keyStatus = keyManager.getStatus();
      
      if (keyStatus.success && keyStatus.data) {
        return {
          success: true,
          data: {
            ...status,
            keyStatus: keyStatus.data,
          },
          metadata: {
            processing_time: 0,
            api_key_used: keyStatus.data.currentKeyIndex,
            timestamp: new Date().toISOString(),
          },
        };
      }
    }

    return {
      success: true,
      data: status,
      metadata: {
        processing_time: 0,
        api_key_used: -1,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: true,
      data: {
        initialized: isInitialized,
        currentConfig: defaultConfig,
      },
      metadata: {
        processing_time: 0,
        api_key_used: -1,
        timestamp: new Date().toISOString(),
      },
    };
  }
};

// Custom LLM builder with specific configurations
export const createCustomLLM = async (
  config: Partial<LLMConfig>
): Promise<ServiceResponse<ChatGoogleGenerativeAI>> => {
  return getCurrentLLM(config);
};

// Ensure LLM is initialized when module is imported
initializeLLM().catch((error) => {
  console.error("Failed to initialize LLM system:", error);
});