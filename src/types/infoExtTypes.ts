// src/types/infoExtTypes.ts

import { Question } from "./intentTypes";

// Interface untuk input dan output
export interface InformationExtractionInput {
  question: Question;
  response: string;
}

export interface InformationExtractionOutput {
  extracted_information: string | number | string[]; // Tambahkan dukungan untuk array string
  explanation: string; // Penjelasan dari LLM
}
