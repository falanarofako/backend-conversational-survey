// src/services/enhancedIntentClassificationService.ts
// Updating the function to support dynamic model selection

import { ChatPromptTemplate } from "@langchain/core/prompts";
import { setTimeout } from "timers/promises";
import {
  ClassificationContext,
  ClassificationOutput,
  Question,
  ServiceResponse,
} from "../types/intentTypes";
import { getCurrentLLM, handleLLMError, createCustomLLM } from "../config/llmConfig";
import SurveyMessage from "../models/SurveyMessage";
import SurveySession from "../models/SurveySession";
import { z } from "zod";

const RETRY_DELAY = 5000;
const MAX_RETRIES = 3;

// Enhanced schema that includes improved response
const enhancedClassificationSchema = z.object({
  intent: z
    .enum(["question", "expected_answer", "unexpected_answer", "other"])
    .describe(
      "Klasifikasi respons pengguna:\n" +
        "- question: Pertanyaan terkait pertanyaan survei yang ditanyakan atau permintaan klarifikasi.\n" +
        "- expected_answer: Jawaban yang memenuhi salah satu kriteria berikut:\n" +
        "- unexpected_answer: Jawaban yang memenuhi semua kriteria berikut:\n" +
        "- other:  Respons yang tidak termasuk kategori di atas, seperti:\n"
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
      "Penjelasan singkat kepada pengguna mengapa jawaban memerlukan klarifikasi (hanya ada jika intent adalah unexpected_answer atau other)."
    ),
  follow_up_question: z
    .string()
    .optional()
    .describe(
      "Kalimat pertanyaan untuk mendapatkan jawaban spesifik (hanya ada jika intent adalah unexpected_answer atau other)."
    ),
  improved_response: z
    .string()
    .describe(
      "Versi jawaban pengguna yang sudah distandarisasi, diperbaiki, dan disesuaikan dengan format yang diharapkan, berdasarkan konteks pertanyaan dan riwayat percakapan."
    ),
});

// Type for enhanced output
export interface EnhancedClassificationOutput extends ClassificationOutput {
  improved_response: string;
}

/**
 * Formats previous messages as context for improved classification
 */
const formatPreviousMessages = (messages: any[]): string => {
  if (!messages || messages.length === 0) return "Tidak ada riwayat pesan.";

  // Get the last 3 message pairs maximum (to keep context manageable)
  const recentMessages = messages.slice(-6);

  let formattedContext = "RIWAYAT PESAN TERKINI:\n";

  recentMessages.forEach((message, index) => {
    // User message
    if (message.user_message) {
      formattedContext += `Pengguna: ${message.user_message}\n`;
    }

    // System response - extract only relevant parts
    if (message.system_response) {
      const sr = message.system_response;

      // Extract question if available
      let systemMessage = "";

      if (sr.next_question && sr.next_question.text) {
        systemMessage = `Sistem: ${sr.next_question.text}\n`;
      } else if (sr.currentQuestion && sr.currentQuestion.text) {
        systemMessage = `Sistem: ${sr.currentQuestion.text}\n`;
      } else if (sr.follow_up_question) {
        systemMessage = `Sistem: ${sr.follow_up_question}\n`;
      } else if (sr.clarification_reason) {
        systemMessage = `Sistem: ${sr.clarification_reason}\n`;
      } else if (sr.system_message) {
        systemMessage = `Sistem: ${sr.system_message}\n`;
      } else if (sr.additional_info) {
        systemMessage = `Sistem: ${sr.additional_info}\n`;
      }

      formattedContext += systemMessage;
    }
  });

  return formattedContext;
};

/**
 * Get previous answers from the current survey session
 */
const getPreviousAnswers = async (sessionId: string): Promise<string> => {
  try {
    if (!sessionId) return "Tidak ada jawaban sebelumnya.";

    const session = await SurveySession.findById(sessionId);
    if (!session || session.responses.length === 0) {
      return "Tidak ada jawaban sebelumnya.";
    }

    // Format responses
    let formattedResponses = "JAWABAN SEBELUMNYA:\n";
    session.responses.forEach((response, index) => {
      formattedResponses += `- Pertanyaan kode ${response.question_code}: ${response.valid_response}\n`;
    });

    return formattedResponses;
  } catch (error) {
    console.error("Error fetching previous answers:", error);
    return "Gagal mengambil jawaban sebelumnya.";
  }
};

/**
 * Determine which LLM model to use based on the question
 * @param question The question object or string
 * @returns Model name to use
 */
const determineModelForQuestion = (question: Question | string): string => {
  // Complex questions that require advanced reasoning use gemini-2.5-pro
  const advancedQuestionCodes = ["S002", "S003", "S004", "S005", "S010"];
  
  // Extract question code if it's an object
  let questionCode = "";
  if (typeof question !== "string") {
    questionCode = question.code || "";
  }
  
  // Use Pro model for complex questions
  if (advancedQuestionCodes.includes(questionCode)) {
    return "gemini-2.5-pro-exp-03-25";
  }
  
  // Default to flash model for simpler questions
  return "gemini-1.5-flash";
};

// Enhanced classification prompt template
const enhancedClassificationPrompt = ChatPromptTemplate.fromTemplate(`
  Anda adalah sistem klasifikasi intent untuk survei digital.
  Analisis respons pengguna terhadap pertanyaan berikut dan klasifikasikan dengan tepat.
  
  KONTEKS PERTANYAAN:
  {questionContext}
  
  RIWAYAT PERCAKAPAN:
  {conversationHistory}
  
  JAWABAN SEBELUMNYA:
  {previousAnswers}
  
  PERTANYAAN SAAT INI:
  {currentQuestion}
  
  RESPONS PENGGUNA:
  {response}

  Klasifikasi respons pengguna:
  - question: Pertanyaan terkait pertanyaan survei yang ditanyakan atau permintaan klarifikasi.
  - expected_answer: Jawaban yang memenuhi salah satu kriteria berikut:
  1. Menjawab pertanyaan secara langsung walaupun format jawaban tidak sesuai. Misalnya: format jawaban adalah angka tetapi pengguna menjawab dengan teks tetapi menyatakan jumlah atau nilai yang pasti bukan 'lebih dari' atau 'kurang dari'
  2. Menggunakan kata/frasa yang sama atau sinonim dari opsi jawaban yang tersedia
  3. Dapat dipetakan secara langsung ke salah satu opsi jawaban berdasarkan maknanya
  - unexpected_answer: Jawaban yang memenuhi semua kriteria berikut:
  1. Merespons pertanyaan yang diajukan
  2. Mengandung informasi yang relevan
  3. Menyatakan nilai baik dalam angka atau teks yang tidak pasti atau spesifik. Misalnya kurang dari satu juta atau lebih dari satu juta
  4. Tidak memenuhi validasi jawaban seperti nilai minimum dan maksimum jika pertanyaan menanyakan angka kemudian berikan sedikit penjelasan pada property 'follow_up_question' bahwa jawaban tidak memenuhi validasi
  5. Tidak dapat langsung dipetakan ke format atau opsi jawaban yang tersedia
  6. Memiliki ambiguitas yang dapat mengarah ke lebih dari satu opsi jawaban
  7. Memerlukan klarifikasi atau konversi lebih lanjut
  - other:  Respons yang tidak termasuk kategori di atas, seperti:
  1. Tidak relevan dengan pertanyaan
  2. Bukan pertanyaan maupun jawaban
  3. Respons kosong atau tidak bermakna
  
  Pastikan Anda benar-benar mengikuti setiap perintah di bawah ini:
  1. Jika respons pengguna merupakan pertanyaan atau permintaan klarifikasi terkait pertanyaan survei, maka klasifikasikan sebagai "question".
  2. Jika pertanyaan memiliki format jawaban berupa angka tetapi pengguna menjawab dengan teks dan relevan dengan pertanyaan, maka klasifikasi sebagai "expected_answer".
  3. Jika pertanyaan memiliki jawaban "Ya" atau "Tidak", pengguna tidak harus secara eksplisit menyebutkan "Ya" atau "Tidak" untuk diklasifikasikan sebagai "expected_answer" sehingga Anda perlu menganalisis mendalam maksud pengguna.
  4. Jika respons diklasifikasikan sebagai "unexpected_answer" atau "other", maka berikan alasan pada properti 'clarification_reason' tetapi jangan lupa untuk memberikan penjelasan Anda dalam melakukan klasifikasi pada properti 'explanation'.
  5. Jika respons diklasifikasikan sebagai "unexpected_answer", berikan kalimat singkat hanya dalam satu kalimat saja yang menjelaskan mengapa jawaban pengguna harus diklarifikasi kemudian dilanjutkan dengan pertanyaan klarifikasi yang memandu pengguna untuk memberikan jawaban yang diharapkan.
  6. Jika respons diklasifikasikan sebagai "other", berikan kalimat singkat yang menjelaskan mengapa pengguna harus menjawab ulang pertanyaan dikarenakan jawaban tidak relevan dengan pertanyaan.
  7. Jika pertanyaan memiliki opsi jawaban dan respons diklasifikasikan sebagai "expected_answer", maka sebutkan juga opsi jawaban mana yang paling mendekati dengan maksud pengguna pada properti 'explanation'.
  8. Jika pertanyaan tidak mempersilahkan pengguna menuliskan sendiri secara terbuka, maka Anda jangan meminta pengguna menulis jawaban secara terbuka.
  9. PENTING: Gunakan riwayat percakapan dan jawaban sebelumnya untuk memahami konteks dan kesinambungan respons pengguna.
  
  TAMBAHAN PENTING:
  - Jika intent adalah "expected_answer", buat 'improved_response' dengan format yang sesuai dengan tipe pertanyaan (contoh: hanya angka untuk pertanyaan numerik, sesuaikan dengan pilihan yang tersedia untuk pertanyaan pilihan ganda, dll).
  - Jika jawaban ambigu atau tersirat, gunakan konteks dari jawaban sebelumnya untuk menyusun jawaban yang lebih lengkap dan presisi.
  - Untuk "question" atau tipe lain, 'improved_response' sebaiknya berupa reformulasi yang lebih jelas dari pertanyaan/respons pengguna.

  Berikan penjelasan detail mengapa respons diklasifikasikan demikian dengan mempertimbangkan:
  - Kesesuaian dengan tipe pertanyaan (text/select)
  - Kelengkapan informasi dalam jawaban
  - Relevansi dengan konteks pertanyaan
  - Validasi jawaban seperti nilai minimum dan maksimum yang valid
  - Koherensi dengan jawaban-jawaban sebelumnya (jika relevan)
`);

/**
 * Enhanced classifyIntent function that incorporates conversation history and previous answers
 * Now also provides improved and standardized responses with dynamic model selection
 */
export const classifyIntentWithContext = async (
  params: ClassificationContext & { sessionId?: string },
  attempt = 0
): Promise<ServiceResponse<EnhancedClassificationOutput>> => {
  try {
    const startTime = Date.now();

    // Determine which model to use based on the question
    const modelToUse = determineModelForQuestion(params.question);
    
    // Get LLM instance with appropriate model
    const llmResponse = modelToUse === "gemini-1.5-flash"
      ? await getCurrentLLM() // Use Flash model for simple questions 
      : await createCustomLLM({ model: "gemini-2.5-pro-exp-03-25" }); // Default to Pro model

    if (!llmResponse.success || !llmResponse.data) {
      throw new Error(llmResponse.error || "Failed to get LLM instance");
    }

    const llm = llmResponse.data;
    
    // Log which model is being used for transparency
    console.log(`Using model ${modelToUse} for question`, params.question.code || "unknown");

    try {
      // Format question context
      const questionContext =
        typeof params.question === "string"
          ? params.question
          : JSON.stringify(params.question, null, 2);

      // Get conversation history if sessionId is provided
      let conversationHistory = "Tidak ada riwayat percakapan.";
      let previousAnswers = "Tidak ada jawaban sebelumnya.";

      if (params.sessionId) {
        // Get previous messages for this session
        const messages = await SurveyMessage.find({
          session_id: params.sessionId,
        }).sort({ timestamp: 1 });

        conversationHistory = formatPreviousMessages(messages);
        previousAnswers = await getPreviousAnswers(params.sessionId);
      }

      const currentQuestion =
        typeof params.question === "string"
          ? params.question
          : params.question.text || "";

      // Create LLM with structured output
      const llmWithStructuredOutput = llm.withStructuredOutput(
        enhancedClassificationSchema,
        {
          name: "klasifikasi_intent_dengan_perbaikan",
        }
      );

      // Create and invoke classification chain
      const chain = enhancedClassificationPrompt.pipe(llmWithStructuredOutput);
      const result = (await chain.invoke({
        questionContext,
        conversationHistory,
        previousAnswers,
        currentQuestion,
        response: params.response,
      })) as EnhancedClassificationOutput;

      // Validate result
      const validatedResult = enhancedClassificationSchema.parse(result);

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
          `Retrying enhanced classification (attempt ${
            attempt + 1
          }/${MAX_RETRIES})`
        );
        await setTimeout(RETRY_DELAY);
        return classifyIntentWithContext(params, attempt + 1);
      }

      throw error;
    }
  } catch (error) {
    return {
      success: false,
      error: `Error dalam klasifikasi intent dengan konteks: ${
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