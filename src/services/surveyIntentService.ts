// src/services/surveyIntentService.ts

import { z } from "zod";
import { getCurrentLLM, handleLLMError } from "../config/llmConfig";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ServiceResponse } from "../types/intentTypes";

// Define schema for analysis response
const surveyIntentSchema = z.object({
  wants_to_start: z.boolean().describe("Whether the user wants to start the survey"),
  confidence: z.number().min(0).max(1).describe("Confidence level of the prediction"),
  explanation: z.string().describe("Brief explanation for the decision"),
  system_message: z.string().optional().describe("System message from the analysis")
});

export type SurveyIntentResponse = z.infer<typeof surveyIntentSchema>;

// Create prompt template
const surveyIntentPrompt = ChatPromptTemplate.fromTemplate(`
  Analisis pesan berikut dan tentukan apakah pengguna ingin memulai survei atau tidak.
  Pesan: {message}
  
  Berikan jawaban dalam format berikut:
  - wants_to_start: true jika pengguna ingin memulai survei, false jika tidak
  - confidence: tingkat keyakinan prediksi (0-1)
  - explanation: penjelasan singkat mengapa Anda membuat keputusan tersebut
  - system_message: jika nilai 'wants_to_start' false, parafrasekan pesan ini "Tidak masalah jika Anda belum siap untuk memulai survei. Silakan kirim pesan yang menunjukkan kesiapan Anda kapan saja jika Anda ingin memulai." dengan panjang kalimat yang sama tetapi diksi yang berbeda.'
`);

const RETRY_DELAY = 5000;
const MAX_RETRIES = 3;

/**
 * Analyzes if a user wants to start a survey based on their message
 * @param message The user's message
 * @returns Analysis result indicating if user wants to start survey
 */
export const analyzeSurveyIntent = async (
  message: string,
  attempt = 0
): Promise<ServiceResponse<SurveyIntentResponse>> => {
  try {
    const startTime = Date.now();

    // Get LLM instance
    const llmResponse = await getCurrentLLM();
    
    if (!llmResponse.success || !llmResponse.data) {
      throw new Error(llmResponse.error || "Failed to get LLM instance");
    }
    
    const llm = llmResponse.data;

    try {
      // Create LLM chain with structured output
      const llmWithStructuredOutput = llm.withStructuredOutput(surveyIntentSchema, {
        name: "analisis_intent_survei"
      });
      
      // Create and invoke chain
      const chain = surveyIntentPrompt.pipe(llmWithStructuredOutput);
      const result = await chain.invoke({ message });

      return {
        success: true,
        data: result,
        metadata: {
          processing_time: Date.now() - startTime,
          api_key_used: llmResponse.metadata?.api_key_used || -1,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      // Handle error and retry if needed
      await handleLLMError(String(llmResponse.metadata?.api_key_used ?? ''), error);

      if (attempt < MAX_RETRIES) {
        console.log(`Retrying survey intent analysis (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return analyzeSurveyIntent(message, attempt + 1);
      }

      throw error;
    }
  } catch (error) {
    return {
      success: false,
      error: `Error analyzing survey intent: ${error instanceof Error ? error.message : "Unknown error"}`,
      metadata: {
        processing_time: 0,
        api_key_used: -1,
        timestamp: new Date().toISOString()
      }
    };
  }
};