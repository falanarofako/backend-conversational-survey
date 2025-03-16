// src/services/surveyIntentService.ts

import { z } from "zod";
import { getCurrentLLM, handleLLMError } from "../config/llmConfig";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ServiceResponse } from "../types/intentTypes";

// Define schema for analysis response
const surveyIntentSchema = z.object({
  wants_to_start: z.boolean().describe("Whether the user wants to start the survey"),
  confidence: z.number().min(0).max(1).describe("Confidence level of the prediction"),
  explanation: z.string().describe("Brief explanation for the decision")
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
  console.log("SURVEY_INTENT_DEBUG: Starting analyzeSurveyIntent with message:", message);
  
  try {
    const startTime = Date.now();
    console.log("SURVEY_INTENT_DEBUG: Start time:", startTime);

    // Get LLM instance
    console.log("SURVEY_INTENT_DEBUG: About to call getCurrentLLM");
    const llmResponse = await getCurrentLLM();
    console.log("SURVEY_INTENT_DEBUG: getCurrentLLM response:", JSON.stringify({
      success: llmResponse.success,
      error: llmResponse.error,
      hasData: !!llmResponse.data
    }));
    
    if (!llmResponse.success || !llmResponse.data) {
      console.log("SURVEY_INTENT_DEBUG: LLM response unsuccessful");
      throw new Error(llmResponse.error || "Failed to get LLM instance");
    }
    
    console.log("SURVEY_INTENT_DEBUG: LLM response successful, got LLM instance");
    const llm = llmResponse.data;

    try {
      // Create LLM chain with structured output
      console.log("SURVEY_INTENT_DEBUG: Creating structured output LLM");
      const llmWithStructuredOutput = llm.withStructuredOutput(surveyIntentSchema, {
        name: "analisis_intent_survei"
      });
      
      // Create and invoke chain
      console.log("SURVEY_INTENT_DEBUG: Creating and invoking chain");
      const chain = surveyIntentPrompt.pipe(llmWithStructuredOutput);
      const result = await chain.invoke({ message });
      console.log("SURVEY_INTENT_DEBUG: Chain invocation successful, got result");

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
      console.log("SURVEY_INTENT_DEBUG: Error in chain invocation:", error);
      console.log("SURVEY_INTENT_DEBUG: Calling handleLLMError");
      await handleLLMError(error);

      if (attempt < MAX_RETRIES) {
        console.log(`SURVEY_INTENT_DEBUG: Retrying survey intent analysis (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
        return analyzeSurveyIntent(message, attempt + 1);
      }

      console.log("SURVEY_INTENT_DEBUG: Max retries exceeded, throwing error");
      throw error;
    }
  } catch (error) {
    console.log("SURVEY_INTENT_DEBUG: Caught error in main try block:", error);
    console.log("SURVEY_INTENT_DEBUG: Error type:", typeof error);
    console.log("SURVEY_INTENT_DEBUG: Error message:", error instanceof Error ? error.message : "Unknown error");
    console.log("SURVEY_INTENT_DEBUG: Error stack:", error instanceof Error ? error.stack : "No stack trace");
    
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