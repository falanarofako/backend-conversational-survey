// src/controllers/questionnaireController.ts

import { Request, Response } from "express"; // Ensure this import is here
import { saveQuestionnaire } from "../services/questionnaireService"; // Ensure the import of your service function
import fs from "fs/promises";
import path from "path";

// Add type annotation for the handler function
export const handleSaveQuestionnaire = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const datasetPath = path.join(__dirname, "../data/questionnaireForChatbot.json");
    const rawData = await fs.readFile(datasetPath, "utf-8");
    const data = JSON.parse(rawData);

    // Validate request body
    if (!data || !data.survey) {
      res
        .status(400)
        .json({ success: false, message: "Invalid questionnaire data" });
      return;
    }

    const result = await saveQuestionnaire(data);

    if (result.success) {
      res.status(201).json({ success: true, data: result.data });
      return;
    } else {
      res.status(500).json({ success: false, message: result.error });
      return;
    }
  } catch (error) {
    if (error instanceof Error) {
      res.status(500).json({ success: false, message: error.message });
      return;
    } else {
      res
        .status(500)
        .json({ success: false, message: "Unknown error occurred" });
      return;
    }
  }
};
