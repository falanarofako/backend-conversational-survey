// src/services/vectorStore.ts

import { MongoClient } from "mongodb";
import { MongoDBAtlasVectorSearch } from "@langchain/mongodb";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { TaskType } from "@google/generative-ai";

const embeddings = new GoogleGenerativeAIEmbeddings({
  model: "text-embedding-004",
  taskType: TaskType.RETRIEVAL_DOCUMENT,
  title: "Wisnus Embeddings",
  apiKey: process.env.GEMINI_API_KEY_1 as string,
});

export const initializeVectorStore = async () => {
  const client = new MongoClient(process.env.MONGODB_URI as string);
  await client.connect();

  const collection = client
    .db(process.env.MONGODB_DB_NAME)
    .collection(process.env.MONGODB_COLLECTION_NAME as string);

  return new MongoDBAtlasVectorSearch(embeddings, {
    collection: collection,
    indexName: "vector_index",
    textKey: "text",
    embeddingKey: "embedding",
  });
};
