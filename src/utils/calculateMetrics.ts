export function calculateMetrics(predictions: string[], actuals: string[]) {
    const uniqueIntents = [
      "expected_answer",
      "unexpected_answer",
      "question",
      "other",
    ];
    const matrix = Array(uniqueIntents.length)
      .fill(0)
      .map(() => Array(uniqueIntents.length).fill(0));
  
    for (let i = 0; i < predictions.length; i++) {
      const actualIndex = uniqueIntents.indexOf(actuals[i]);
      const predictedIndex = uniqueIntents.indexOf(predictions[i]);
      if (actualIndex >= 0 && predictedIndex >= 0) {
        matrix[actualIndex][predictedIndex]++;
      }
    }
  
    const precision: { [key: string]: number } = {};
    const recall: { [key: string]: number } = {};
    const f1Score: { [key: string]: number } = {};
  
    uniqueIntents.forEach((intent, i) => {
      const tp = matrix[i][i];
      const fp = matrix.reduce((sum, row, j) => sum + (j !== i ? row[i] : 0), 0);
      const fn = matrix[i].reduce(
        (sum, cell, j) => sum + (j !== i ? cell : 0),
        0
      );
  
      precision[intent] = tp / (tp + fp) || 0;
      recall[intent] = tp / (tp + fn) || 0;
      f1Score[intent] =
        2 *
        ((precision[intent] * recall[intent]) /
          (precision[intent] + recall[intent]) || 0);
    });
  
    const accuracy =
      predictions.filter((pred, i) => pred === actuals[i]).length /
      predictions.length;
  
    return {
      accuracy,
      precision,
      recall,
      f1Score,
      confusionMatrix: { matrix, labels: uniqueIntents },
    };
  }