// src/controllers/informationExtractionController.ts

import { Request, Response } from "express";
import {
  extractInformation,
} from "../services/informationExtractionService";
import { InformationExtractionInput } from "../types/infoExtTypes";

export const handleInformationExtraction = async (req: Request, res: Response): Promise<void> => {
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
