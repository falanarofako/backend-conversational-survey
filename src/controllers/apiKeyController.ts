import { Request, Response } from 'express';
import { apiKeyManager } from '../services/apiKeyManager';

export const getAllKeyStatus = async (req: Request, res: Response) => {
  try {
    const keys = await apiKeyManager.getAllKeys();
    res.json(keys);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : err });
  }
};

export const getBestKey = async (req: Request, res: Response) => {
  try {
    const best = await apiKeyManager.getBestKey();
    res.json(best);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : err });
  }
};

export const getUsageStats = async (req: Request, res: Response) => {
  try {
    const stats = await apiKeyManager.getUsageStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : err });
  }
};

export const reactivateKey = async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.params;
    await apiKeyManager.reactivateKey(apiKey);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : err });
  }
};

export const resetAllLimits = async (req: Request, res: Response) => {
  try {
    await apiKeyManager.resetAllLimits();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : err });
  }
};

export const getRateLimit = async (req: Request, res: Response) => {
  try {
    const { apiKey } = req.params;
    const info = await apiKeyManager.getRateLimit(apiKey);
    res.json(info);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : err });
  }
}; 