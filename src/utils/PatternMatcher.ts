// src/utils/PatternMatcher.ts

const questionPatterns = [
    /^apa\s/i,
    /^bagaimana\s/i,
    /^mengapa\s/i,
    /^siapa\s/i,
    /^dimana\s/i,
    /^kapan\s/i,
    /^berapa\s/i,
    /^bolehkah\s/i,
    /^apakah\s/i,
    /\?$/
  ];
  
  const commonAnswerPatterns = [
    /^ya\b/i,
    /^tidak\b/i,
    /^saya\s/i,
    /^adalah\s/i,
    /^sekitar\s/i,
    /^kurang lebih\s/i
  ];
  
  /**
   * Check apakah teks mengandung pattern tertentu
   */
  export const hasPattern = (text: string, patterns: RegExp[]): boolean => {
    return patterns.some(pattern => pattern.test(text));
  };
  
  /**
   * Pattern matching untuk klasifikasi cepat
   */
  export const matchPattern = (response: string) => {
    // Check question patterns
    if (hasPattern(response, questionPatterns)) {
      return {
        intent: 'question' as const,
        confidence: 1,
        explanation: 'Respons mengandung pola pertanyaan yang jelas'
      };
    }
  
    // Check answer patterns
    if (hasPattern(response, commonAnswerPatterns)) {
      return {
        intent: 'answer' as const,
        confidence: 0.98,
        explanation: 'Respons mengandung pola jawaban yang umum'
      };
    }
  
    // Default case
    return {
      intent: 'other' as const,
      confidence: 0.5,
      explanation: 'Tidak ditemukan pola yang jelas, membutuhkan analisis LLM'
    };
  };
  
  export default {
    matchPattern,
    hasPattern
  };