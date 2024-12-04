// src/config/llmConfig.ts

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { z } from "zod";
import dotenv from "dotenv";
import { initializeKeyState, getCurrentKey, handleError, resetCounters } from "../utils/apiKeyRotation";
import { KeyState, ServiceResponse } from '../types/intentTypes';

dotenv.config();

// Output schema for classification
export const classificationSchema = z.object({
  intent: z
    .enum(["expected_answer", "unexpected_answer", "question", "other"])
    .describe(
      "Klasifikasi respons pengguna:\n" +
      "- expected_answer: Jawaban yang sesuai konteks pertanyaan. Jika maksud jawaban bisa dipetakan ke opsi jawaban dan jawaban tidak harus eksplisit atau jawaban menggunakan kata-kata yang persis dengan opsi jawaban, maka langsung klasifikasikan sebagai 'expected_answer' dan tidak perlu klarifikasi.\n" +
      "- unexpected_answer: Jawaban yang tidak termasuk kategori 'expected_answer', tetapi masih sesuai dengan format dan konteks pertanyaan.\n" +
      "- question: pertanyaan terkait pertanyaan survei.\n" +
      "- other: respons tidak relevan atau tidak termasuk jawaban/pertanyaan."
    ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Tingkat keyakinan klasifikasi dari 0 sampai 1"),
  explanation: z
    .string()
    .describe("Penjelasan mengapa respons diklasifikasikan demikian"),
  followUpQuestion: z
    .string()
    .optional()
    .describe("Kalimat klarifikasi untuk mendapatkan jawaban spesifik (hanya ada jika intent adalah unexpected_answer)")
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
  timeout: 30000
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
          processingTime: 0,
          apiKeyUsed: -1,
          timestamp: new Date().toISOString()
        }
      };
    }

    keyState = await initializeKeyState();
    isInitialized = true;

    return {
      success: true,
      metadata: {
        processingTime: 0,
        apiKeyUsed: keyState.currentIndex,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during LLM initialization'
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
      throw new Error(keyResponse.error || 'Failed to get API key');
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
        processingTime: 0,
        apiKeyUsed: keyState.currentIndex,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error getting LLM instance'
    };
  }
};

// Handle LLM errors
export const handleLLMError = async (error: any): Promise<ServiceResponse<void>> => {
  try {
    if (!isInitialized) {
      throw new Error('LLM system not initialized');
    }

    const errorResponse = await handleError(keyState, error);
    if (!errorResponse.success || !errorResponse.data) {
      throw new Error(errorResponse.error || 'Failed to handle error');
    }

    const [_, newState] = errorResponse.data;
    keyState = newState;

    return {
      success: true,
      metadata: {
        processingTime: 0,
        apiKeyUsed: keyState.currentIndex,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error handling LLM error'
    };
  }
};

// Reset LLM state
export const resetLLMState = async (): Promise<ServiceResponse<void>> => {
  try {
    if (!isInitialized) {
      throw new Error('LLM system not initialized');
    }

    const resetResponse = await resetCounters(keyState);
    if (!resetResponse.success || !resetResponse.data) {
      throw new Error(resetResponse.error || 'Failed to reset counters');
    }

    keyState = resetResponse.data;

    return {
      success: true,
      metadata: {
        processingTime: 0,
        apiKeyUsed: keyState.currentIndex,
        timestamp: new Date().toISOString()
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error resetting LLM state'
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
      keyState: isInitialized ? keyState : null
    },
    metadata: {
      processingTime: 0,
      apiKeyUsed: isInitialized ? keyState.currentIndex : -1,
      timestamp: new Date().toISOString()
    }
  };
};

// Custom LLM builder with specific configurations
export const createCustomLLM = async (
  config: Partial<LLMConfig>
): Promise<ServiceResponse<ChatGoogleGenerativeAI>> => {
  return getCurrentLLM(config);
};

// Ensure LLM is initialized when module is imported
initializeLLM().catch(error => {
  console.error('Failed to initialize LLM system:', error);
});