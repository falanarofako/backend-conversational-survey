// src/controllers/ragController.ts

import { Request, Response } from "express";
import { processPDFs } from "../services/pdfProcessor";
import { initializeVectorStore } from "../services/vectorStore";
import { createRAGChain } from "../services/ragService";

let ragChain: any = null;

export const initializeRAG = async (req: Request, res: Response) => {
    try {
      // Proses ekstraksi dokumen PDF
      const docs = await processPDFs();
      const vectorStore = await initializeVectorStore();
  
      // Cek apakah dokumen sudah tersimpan pada vector store
      // (asumsi: vectorStore menyimpan properti 'collection' dari MongoDB)
      const collection = (vectorStore as any).collection;
      const existingCount = await collection.countDocuments();
  
      if (existingCount === 0) {
        console.log("Belum ada dokumen tersimpan. Menambahkan dokumen baru...");
        await vectorStore.addDocuments(docs);
      } else {
        console.log("Dokumen sudah ada. Melewati proses penambahan dokumen.");
      }
  
      // Buat RAG chain menggunakan vectorStore
      ragChain = await createRAGChain(vectorStore);
      res.status(200).json({ message: "RAG system initialized" });
    } catch (error) {
      console.error("Error in initializeRAG:", error);
      res.status(500).json({ error: "Initialization failed" });
    }
  };

export const askQuestion = async (req: Request, res: Response) => {
  if (!ragChain) res.status(400).json({ error: "RAG not initialized" });

  try {
    const result = await ragChain.invoke({
      question: req.body.question,
    });
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ error: "Processing failed" });
  }
};
