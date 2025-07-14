// src/types/intentTypes.ts

// Question validation types
export interface QuestionValidation {
  required?: boolean;
  input_type?: "text" | "number" | "date";
  min?: number;
  max?: number;
  pattern?: string;
}

export interface QuestionOption {
  text: string;
  additional_info?: string;
}

export interface Question {
  code?: string;
  text: string;
  type: 'text' | 'select' | 'date';
  unit?: string;
  multiple?: boolean;
  options?: (string | QuestionOption)[];
  system_guidelines?: string[];
  allow_other?: boolean;
  additional_info?: string;
  instruction?: string;
  validation: QuestionValidation;
  modified_question?: string;
  layered_question?: Question[];
}

// Updated ClassificationContext
export interface ClassificationContext {
  question: Question;
  response: string;
}

// Classification output type remains the same
export interface ClassificationOutput {
  intent: "expected_answer" | "unexpected_answer" | "question" | "other";
  confidence: number;
  explanation: string;
  clarification_reason?: string;
  follow_up_question?: string;
}

export interface ClassificationResult {
  success: boolean;
  data?: ClassificationOutput;
  error?: string;
}

// Evaluation types
export interface EvaluationSample {
  question: string;
  response: string;
  intent: string;
  style: string;
}

export interface ConfusionMatrix {
  matrix: number[][];
  labels: string[];
}

export interface EvaluationMetrics {
  accuracy: number;
  precision: { [key: string]: number };
  recall: { [key: string]: number };
  f1Score: { [key: string]: number };
  confusionMatrix: ConfusionMatrix;
  averageMetrics: {
    macroAveragePrecision: number;
    macroAverageRecall: number;
    macroAverageF1: number;
    weightedAveragePrecision: number;
    weightedAverageRecall: number;
    weightedAverageF1: number;
  };
}

export interface EvaluationResults {
  metrics: EvaluationMetrics;
  totalSamples: number;
  errors: string[];
  evaluationTime: number;
}

// API Key management types
export interface APIKeyStatus {
  currentKeyIndex: number;
  totalKeys: number;
  usageCounts: { [key: string]: number };
  errorCounts: { [key: string]: { [code: number]: number } };
  timeSinceLastRotation: number;
}

export interface KeyState {
  apiKeys: string[];
  currentIndex: number;
  lastRotation: number;
  usageCount: { [key: string]: number };
  errorCounts: { [key: string]: { [code: number]: number } };
}

// Classification progress tracking types
export interface ClassificationProgress {
  sampleId: number;
  question: string;
  response: string;
  actualIntent: string;
  predictedIntent?: string;
  confidence?: number;
  explanation?: string;
  follow_up_question?: string; // Added this property
  processed: boolean;
  timestamp: string;
  processing_time?: number;
  api_key_used?: string;
  error?: string;
}

export interface EvaluationProgress {
  totalSamples: number;
  processedSamples: number;
  lastProcessedIndex: number;
  startTime: string;
  lastUpdateTime: string;
  results: ClassificationProgress[];
  successRate?: number;
  averageprocessing_time?: number;
  errorRates: {
    total: number;
    byErrorType: { [key: string]: number };
  };
}

// Error handling types
export interface APIError {
  code: number;
  message: string;
  timestamp: string;
  apiKeyIndex: number;
  context?: any;
}

export interface ErrorLog {
  errors: APIError[];
  totalErrors: number;
  errorsByType: { [key: string]: number };
  lastError?: APIError;
}

// Service response types
export interface ServiceResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    processing_time: number;
    api_key_used: string;
    timestamp: string;
  };
}

// Validation types
export interface ValidationRule {
  type: "required" | "format" | "length" | "custom";
  message: string;
  validate: (value: any) => boolean;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

// Constants remain the same
export const INTENT_TYPES = [
  "expected_answer",
  "unexpected_answer",
  "question",
  "other",
] as const;
export type IntentType = (typeof INTENT_TYPES)[number];

export const ERROR_TYPES = {
  RATE_LIMIT: 429,
  PERMISSION_DENIED: 403,
  INTERNAL_ERROR: 500,
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
} as const;

export type ErrorType = (typeof ERROR_TYPES)[keyof typeof ERROR_TYPES];
