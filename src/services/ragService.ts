// src/services/ragService.ts

import { Annotation, StateGraph } from "@langchain/langgraph";
import { pull } from "langchain/hub";
import { Document } from "@langchain/core/documents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { getCurrentLLM } from "../config/llmConfig";

// Define state for application
const InputStateAnnotation = Annotation.Root({
  question: Annotation<string>,
});

const StateAnnotation = Annotation.Root({
  question: Annotation<string>,
  context: Annotation<Document[]>,
  answer: Annotation<string>,
});

// export const createRAGChain = async (vectorStore: any) => {
//     console.log("[createRAGChain] Mulai proses inisialisasi RAG Chain");

//     // Ambil instance LLM dari konfigurasi
//     console.log("[createRAGChain] Mengambil instance LLM...");
//     const llmResponse = await getCurrentLLM();
//     if (!llmResponse.success || !llmResponse.data) {
//       console.error("[createRAGChain] Gagal mendapatkan instance LLM");
//       throw new Error("Failed to retrieve LLM instance");
//     }
//     const llm = llmResponse.data;
//     console.log("[createRAGChain] Instance LLM berhasil diambil");

//     console.log("[createRAGChain] Mengambil prompt template...");
//     const promptTemplate = await pull<ChatPromptTemplate>("rlm/rag-prompt");
//     console.log("[createRAGChain] Prompt template berhasil diambil");

//     const retrieve = async (state: typeof InputStateAnnotation.State) => {
//       console.log("[retrieve] Menerima pertanyaan:", state.question);
//       const retrievedDocs = await vectorStore.similaritySearch(state.question);
//       console.log("[retrieve] Dokumen yang diambil:", retrievedDocs);
//       return { context: retrievedDocs };
//     };

//     const generate = async (state: { question: string; context: Document[] }) => {
//       console.log("[generate] Menerima pertanyaan:", state.question);
//       console.log("[generate] Dokumen konteks yang diterima:", state.context);
//       const docsContent = state.context.map((doc) => doc.pageContent).join("\n");
//       console.log("[generate] Konten dokumen yang telah digabung:", docsContent);

//       console.log("[generate] Menyiapkan pesan dengan prompt template...");
//       const messages = await promptTemplate.invoke({
//         question: state.question,
//         context: docsContent,
//       });
//       console.log("[generate] Pesan yang telah dipersiapkan:", messages);

//       console.log("[generate] Memanggil LLM dengan pesan yang telah disiapkan...");
//       const result = await llm.invoke(messages);
//       console.log("[generate] Hasil dari LLM:", result);

//       return { answer: result.content };
//     };

//     console.log("[createRAGChain] Menyusun state graph dengan node: retrieve dan generate");
//     const graph = new StateGraph(StateAnnotation)
//       .addNode("retrieve", retrieve)
//       .addNode("generate", generate)
//       .addEdge("__start__", "retrieve")
//       .addEdge("retrieve", "generate")
//       .addEdge("generate", "__end__")
//       .compile();
//     console.log("[createRAGChain] State graph berhasil disusun");

//     return graph;
//   };

export const createRAGChain = async (vectorStore: any) => {
  // Ambil instance LLM dari konfigurasi
  const llmResponse = await getCurrentLLM();
  if (!llmResponse.success || !llmResponse.data) {
    throw new Error("Failed to retrieve LLM instance");
  }
  const llm = llmResponse.data;
  const template = `Gunakan potongan konteks berikut untuk menjawab pertanyaan di akhir.
Jika Anda tidak tahu jawabannya, katakan saja bahwa Anda tidak tahu, jangan mencoba membuat jawaban.
Gunakan maksimal tiga kalimat dan buat jawaban se-singkat mungkin. Pastikan jawaban Anda merupakan kalimat yang efektif dan informatif.
Selalu ucapkan "terima kasih sudah bertanya!" di akhir jawaban.

{context}

Pertanyaan: {question}

Jawaban yang Bermanfaat:`;

  const promptTemplateCustom = ChatPromptTemplate.fromMessages([
    ["user", template],
  ]);

  const retrieve = async (state: typeof InputStateAnnotation.State) => {
    const retrievedDocs = await vectorStore.similaritySearch(state.question);
    return { context: retrievedDocs };
  };

  const generate = async (state: { question: string; context: Document[] }) => {
    const docsContent = state.context.map((doc) => doc.pageContent).join("\n");
    const messages = await promptTemplateCustom.invoke({
      question: state.question,
      context: docsContent,
    });
    const result = await llm.invoke(messages);
    return { answer: result.content };
  };

  // Compile application and test
  return new StateGraph(StateAnnotation)
    .addNode("retrieve", retrieve)
    .addNode("generate", generate)
    .addEdge("__start__", "retrieve")
    .addEdge("retrieve", "generate")
    .addEdge("generate", "__end__")
    .compile();
};
