// src/controllers/informationExtractionController.ts

import { Request, Response } from "express";
import {
  evaluateInformationExtraction,
  extractInformation,
} from "../services/informationExtractionService";
import { InformationExtractionInput } from "../types/infoExtTypes";
import fs from "fs/promises";
import path from "path";

export const handleInformationExtraction = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { question, response }: InformationExtractionInput = req.body;

    // Validasi input
    if (!question || !response) {
      res.status(400).json({
        success: false,
        message: "Pertanyaan dan respons wajib diisi.",
      });
      return;
    }

    // Ekstraksi informasi menggunakan service
    const extractionResult = await extractInformation({ question, response });

    if (!extractionResult.success) {
      res.status(500).json({
        success: false,
        message: extractionResult.error,
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: extractionResult.data,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error dalam ekstraksi informasi.",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

export const handleEvaluateInformationExtraction = async (
  req: Request,
  res: Response
) => {
  try {
    const datasetPath = path.join(
      __dirname,
      "../data/information-extraction-validation.json"
    );
    const rawData = await fs.readFile(datasetPath, "utf-8");
    const evaluationData = JSON.parse(rawData);

    // Validasi input
    if (!Array.isArray(evaluationData)) {
      res.status(400).json({
        success: false,
        message: "Data evaluasi harus berupa array.",
      });
      return;
    }

    for (const item of evaluationData) {
      if (!item.question || !item.response || !item.ground_truth) {
        res.status(400).json({
          success: false,
          message:
            "Setiap item harus memiliki question, response, dan ground_truth.",
        });
        return;
      }
    }

    // Jalankan proses evaluasi
    const evaluationResults = await evaluateInformationExtraction(
      evaluationData
    );

    console.log("evaluationResults", evaluationResults);

    res.status(200).json({
      success: true,
      data: evaluationResults,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error dalam evaluasi informasi.",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
