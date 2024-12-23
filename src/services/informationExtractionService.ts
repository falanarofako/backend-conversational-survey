// src/services/informationExtractionService.ts

import { ChatPromptTemplate } from "@langchain/core/prompts";
import {
  getCurrentLLM,
  handleLLMError,
  informationExtractionSchema,
} from "../config/llmConfig";
import {
  InformationExtractionInput,
  InformationExtractionOutput,
} from "../types/infoExtTypes";
import { ServiceResponse } from "../types/intentTypes";
import { setTimeout } from "timers/promises";
import e from "express";
import exp from "constants";

const RETRY_DELAY = 5000;
const MAX_RETRIES = 3;

// Format prompt untuk LLM
const informationExtractionPrompt = ChatPromptTemplate.fromTemplate(`
    Anda adalah sistem ekstraksi informasi untuk survei. 
    Tugas Anda adalah mengekstrak nilai informasi spesifik dari respons pengguna berdasarkan pertanyaan yang diberikan.

    Pertanyaan:
    {question}

    Respons Pengguna:
    {response}

    Hal-hal yang perlu diperhatikan:
    - Pastikan nilai properti 'extracted_information' tidak mengandung petik (') atau petik dua ("). 
    - Jika pertanyaan memiliki opsi jawaban, berikan hasil ekstraksi berupa opsi jawaban yang paling mendekati dengan maksud pengguna.
    - Jika pertanyaan tidak memiliki opsi jawaban, berikan hasil ekstraksi yang mengikuti validasi dan format jawaban pada pertanyaan.
  `);

const createInformationExtractionChain = (llm: any) => {
  const llmWithStructuredOutput = llm.withStructuredOutput(
    informationExtractionSchema,
    {
      name: "ekstraksi_informasi",
      description:
        "Mengekstrak informasi dari respons pengguna berdasarkan pertanyaan yang diberikan.",
      responseFormat: "json",
    }
  );
  return informationExtractionPrompt.pipe(llmWithStructuredOutput);
};

export const extractInformation = async (
  input: InformationExtractionInput,
  attempt: number = 0
): Promise<ServiceResponse<InformationExtractionOutput>> => {
  try {
    const startTime = Date.now();

    // Dapatkan instance LLM
    const llmResponse = await getCurrentLLM();
    if (!llmResponse.success || !llmResponse.data) {
      throw new Error(llmResponse.error || "Failed to get LLM instance");
    }
    const llm = llmResponse.data;

    try {
      // Membuat chain untuk ekstraksi informasi
      const chain = createInformationExtractionChain(llm);
      const result = (await chain.invoke({
        question: input.question,
        response: input.response,
      })) as InformationExtractionOutput;

      // Validasi hasil dengan Zod schema
      const parsedResult = informationExtractionSchema.parse(result);

      // Konversi extracted_information menjadi angka jika diperlukan
      const extractedInformation =
        input.question.validation?.input_type === "number"
          ? Number(parsedResult.extracted_information)
          : parsedResult.extracted_information;

      const validatedResult = {
        extracted_information: extractedInformation,
        explanation: parsedResult.explanation,
      };

      return {
        success: true,
        data: validatedResult,
        metadata: {
          processing_time: Date.now() - startTime,
          api_key_used: llmResponse.metadata?.api_key_used || -1,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (error) {
      // Tangani error dan lakukan retry jika diperlukan
      await handleLLMError(error);

      if (attempt < MAX_RETRIES) {
        console.log(
          `Retrying Extract Information (attempt ${attempt + 1}/${MAX_RETRIES})`
        );
        await setTimeout(RETRY_DELAY);
        return extractInformation(input, attempt + 1);
      }

      throw error;
    }
  } catch (error) {
    return {
      success: false,
      error: `Error dalam ekstraksi informasi: ${
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

export default { extractInformation };
