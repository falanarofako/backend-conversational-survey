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
import ExtractionEvaluationBundle, {
  ExtractionEvaluationItem,
} from "../models/ExtractionEvaluationBundle";
import ExtractionEvaluationResult from "../models/ExtractionEvaluationResult";

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

      // Deklarasikan tipe eksplisit untuk extractedInformation
      let extractedInformation: string | number | string[] =
        parsedResult.extracted_information;

      // Periksa jika extracted_information adalah string berbentuk array dan ubah menjadi array asli
      if (
        typeof extractedInformation === "string" &&
        extractedInformation.startsWith("[") &&
        extractedInformation.endsWith("]")
      ) {
        try {
          extractedInformation = JSON.parse(
            extractedInformation.replace(/\\\"/g, '"')
          ) as string[];
        } catch (error) {
          console.warn(
            "Gagal memparse extracted_information sebagai array:",
            (error as Error).message
          );
        }
      }
      // Konversi menjadi angka jika diperlukan
      if (
        input.question.validation?.input_type === "number" &&
        typeof extractedInformation === "string"
      ) {
        extractedInformation = Number(extractedInformation);
      }

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

export const evaluateInformationExtraction = async (evaluationData: any[]) => {
  let results = {};
  let bundle;

  // Simpan data evaluasi ke dalam bundle jika belum ada
  if (!bundle) {
    bundle = new ExtractionEvaluationBundle({ items: evaluationData });
    await bundle.save();
  }

  // Proses evaluasi untuk setiap item dalam bundle
  for (const [index, item] of evaluationData.entries()) {
    const { question, response, ground_truth } = item;

    // Ekstraksi informasi menggunakan modul extractInformation
    const extractionResult = await extractInformation({
      question,
      response,
    });

    console.log("Extraction ke-", index, ":", extractionResult);

    if (!extractionResult.success) {
      throw new Error(extractionResult.error || "Ekstraksi informasi gagal");
    }

    const extractedInformation = extractionResult.data?.extracted_information;

    // Exact matching case insensitive
    const isMatch =
      String(extractedInformation).toLowerCase() ===
      String(ground_truth).toLowerCase();

    // Mencari dokumen ExtractionEvaluationResult berdasarkan bundle_id
    let resultBundle = await ExtractionEvaluationResult.findOne({
      evaluation_bundle_id: bundle._id,
    });

    // Jika tidak ada dokumen, buat yang baru
    if (!resultBundle) {
      resultBundle = new ExtractionEvaluationResult({
        evaluation_bundle_id: bundle._id,
        items: [],
        created_at: new Date(),
        updated_at: new Date(),
        metadata: {
          total_items: 0,
          matched_items: 0,
          match_percentage: 0,
        },
      });
    }

    // Menambahkan item evaluasi ke dalam array items dari resultBundle
    resultBundle.items.push({
      evaluation_item_index: index,
      extracted_information: extractedInformation ?? [], // Jika undefined, gunakan array kosong
      is_match: isMatch,
      timestamp: new Date(),
    });

    // Update waktu perubahan dan simpan
    resultBundle.updated_at = new Date();

    // Update metadata
    resultBundle.metadata.total_items = resultBundle.items.length;
    resultBundle.metadata.matched_items = resultBundle.items.filter(
      (item) => item.is_match
    ).length;
    resultBundle.metadata.match_percentage =
      (resultBundle.metadata.matched_items /
        resultBundle.metadata.total_items) *
      100;

    await resultBundle.save();
    
    results = resultBundle;
  }

  return {
    results,
  };
};
