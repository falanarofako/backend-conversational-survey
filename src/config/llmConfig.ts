// src/config/llmConfig.ts

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import dotenv from "dotenv";
import {
  initializeKeyState,
  getCurrentKey,
  handleError,
  resetCounters,
} from "../utils/apiKeyRotation";
import { KeyState, ServiceResponse } from "../types/intentTypes";

dotenv.config();

// Output schema for classification
export const classificationSchema = z.object({
  intent: z
    .enum(["expected_answer", "unexpected_answer", "question", "other"])
    .describe(
      "Klasifikasi respons pengguna:\n" +
        "- question: Pertanyaan terkait pertanyaan survei atau permintaan klarifikasi.\n" +
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
      "Penjelasan singkat (hanya dalam satu kalimat) kepada pengguna mengapa jawaban mereka memerlukan klarifikasi untuk intent unexpected_answer atau perlu dijawab ulang untuk intent other dan pastikan penjelasannya sejalan dengan penjelasan pada properti 'explanation' dan dituliskan secara singkat hanya 1 kalimat saja (hanya ada jika intent adalah unexpected_answer atau other)"
    ),
  follow_up_question: z
    .string()
    .optional()
    .describe(
      "Kalimat klarifikasi untuk mendapatkan jawaban spesifik (hanya ada jika intent adalah unexpected_answer atau other). Berikan kalimat pertama klarifikasi dengan alasan singkat yang dapat diinformasikan kepada pengguna mengapa respons mereka dikategorikan sebagai unexpected_answer atau other kemudian meminta pengguna merespons dengan jawaban yang diharapkan atau meminta pengguna untuk memilih opsi jawaban yang tersedia jika pertanyaan merupakan pertanyaan dengan opsi jawaban."
    ),
});

// LLM Configuration
interface LLMConfig {
  model: string;
  temperature: number;
  maxRetries: number;
  retryDelay: number;
  timeout: number;
}

const defaultConfig: LLMConfig = {
  model: "gemini-1.5-flash",
  temperature: 0,
  maxRetries: 2,
  retryDelay: 1000,
  timeout: 30000,
};

// State management
let keyState: KeyState;
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

    keyState = await initializeKeyState();
    isInitialized = true;

    return {
      success: true,
      metadata: {
        processing_time: 0,
        api_key_used: keyState.currentIndex,
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
    if (!isInitialized) {
      await initializeLLM();
    }

    const keyResponse = await getCurrentKey(keyState);
    if (!keyResponse.success || !keyResponse.data) {
      throw new Error(keyResponse.error || "Failed to get API key");
    }

    const [apiKey, newState] = keyResponse.data;
    keyState = newState;

    const llmConfig = { ...defaultConfig, ...config };

    const llm = new ChatGoogleGenerativeAI({
      modelName: llmConfig.model,
      temperature: llmConfig.temperature,
      maxRetries: llmConfig.maxRetries,
      apiKey: apiKey,
      // timeout: llmConfig.timeout
    });

    return {
      success: true,
      data: llm,
      metadata: {
        processing_time: 0,
        api_key_used: keyState.currentIndex,
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
export const handleLLMError = async (
  error: any
): Promise<ServiceResponse<void>> => {
  try {
    if (!isInitialized) {
      throw new Error("LLM system not initialized");
    }

    const errorResponse = await handleError(keyState, error);
    if (!errorResponse.success || !errorResponse.data) {
      throw new Error(errorResponse.error || "Failed to handle error");
    }

    const [_, newState] = errorResponse.data;
    keyState = newState;

    return {
      success: true,
      metadata: {
        processing_time: 0,
        api_key_used: keyState.currentIndex,
        timestamp: new Date().toISOString(),
      },
    };
  } catch (error) {
    return {
      success: false,
      error:
        error instanceof Error
          ? error.message
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

    const resetResponse = await resetCounters(keyState);
    if (!resetResponse.success || !resetResponse.data) {
      throw new Error(resetResponse.error || "Failed to reset counters");
    }

    keyState = resetResponse.data;

    return {
      success: true,
      metadata: {
        processing_time: 0,
        api_key_used: keyState.currentIndex,
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
  keyState: KeyState | null;
}> => {
  return {
    success: true,
    data: {
      initialized: isInitialized,
      currentConfig: defaultConfig,
      keyState: isInitialized ? keyState : null,
    },
    metadata: {
      processing_time: 0,
      api_key_used: isInitialized ? keyState.currentIndex : -1,
      timestamp: new Date().toISOString(),
    },
  };
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
