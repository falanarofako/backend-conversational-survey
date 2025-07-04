import { z } from "zod";
import { getCurrentLLM, handleLLMError } from "../config/llmConfig";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Question, ServiceResponse } from "../types/intentTypes";

// Output schema for special response classification
export const otherResponseClassificationSchema = z.object({
  category: z.enum(["tidak_tahu", "tidak_mau_menjawab", "lainnya"]).describe(
    `Kategori klasifikasi respons khusus:
- tidak_tahu: Responden menyatakan tidak tahu, tidak ingat, atau tidak yakin.
- tidak_mau_menjawab: Responden menolak menjawab, ingin melewati, atau menyatakan privasi.
- lainnya: Respons lain di luar dua kategori di atas.`
  ),
  confidence: z
    .number()
    .min(0)
    .max(1)
    .describe("Tingkat keyakinan klasifikasi dari 0 sampai 1"),
  explanation: z
    .string()
    .describe("Penjelasan mengapa respons dikategorikan demikian."),
});

export type OtherResponseClassificationCategory =
  | "tidak_tahu"
  | "tidak_mau_menjawab"
  | "lainnya";
export type OtherResponseClassificationClassificationOutput = z.infer<
  typeof otherResponseClassificationSchema
>;

export interface OtherResponseClassificationClassificationContext {
  question: Question;
  response: string;
}

// Prompt template for LLM
const otherResponseClassificationPrompt = ChatPromptTemplate.fromTemplate(`
Anda adalah sistem klasifikasi respons survei.
Analisis respons pengguna terhadap pertanyaan berikut dan klasifikasikan ke dalam salah satu kategori berikut:
- tidak_tahu: Responden menyatakan tidak tahu, tidak ingat, atau tidak yakin.
- tidak_mau_menjawab: Responden menolak menjawab, ingin melewati, atau menyatakan privasi.
- lainnya: Respons lain di luar dua kategori di atas.

KONTEKS PERTANYAAN:
{questionContext}

RESPONS PENGGUNA:
{response}

Klasifikasikan respons pengguna ke dalam salah satu kategori di atas dan berikan tingkat keyakinan (confidence) serta penjelasan singkat.
`);

// Service function
export const classifyOtherResponseClassification = async (
  params: OtherResponseClassificationClassificationContext,
  attempt = 0
): Promise<ServiceResponse<OtherResponseClassificationClassificationOutput>> => {
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
      const questionContext =
        typeof params.question === "string"
          ? params.question
          : JSON.stringify(params.question, null, 2);

      // Create LLM with structured output
      const llmWithStructuredOutput = llm.withStructuredOutput(
        otherResponseClassificationSchema,
        {
          name: "klasifikasi_respons_khusus",
        }
      );

      // Create and invoke classification chain
      const chain = otherResponseClassificationPrompt.pipe(llmWithStructuredOutput);
      const result = (await chain.invoke({
        questionContext,
        response: params.response,
      })) as OtherResponseClassificationClassificationOutput;

      // Validate result
      const validatedResult = otherResponseClassificationSchema.parse(result);

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
      await handleLLMError(String(llmResponse.metadata?.api_key_used ?? ''), error);
      if (attempt < 2) {
        return classifyOtherResponseClassification(params, attempt + 1);
      }
      throw error;
    }
  } catch (error) {
    return {
      success: false,
      error: `Error dalam klasifikasi respons khusus: ${
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
