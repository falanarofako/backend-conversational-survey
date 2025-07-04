import ApiKeyUsage, { ApiKeyUsage as ApiKeyUsageType } from '../models/ApiKeyUsage';
import dotenv from 'dotenv';
dotenv.config();

const LIMITS = {
  RPM: 30, // Requests per minute
  RPD: 200, // Requests per day
  TPM: 1000000, // Tokens per minute
};

const USAGE_RESET_INTERVALS = {
  RPM: 60 * 1000, // 1 minute
  RPD: 24 * 60 * 60 * 1000, // 1 day
  TPM: 60 * 1000, // 1 minute
};

const ERROR_THRESHOLD = 3; // Deactivate after 3 consecutive errors

function getEnvApiKeys() {
  return Object.keys(process.env)
    .filter((k) => k.startsWith('GEMINI_API_KEY_'))
    .map((k) => process.env[k]!)
    .filter(Boolean);
}

async function syncKeysWithDB() {
  const envKeys = getEnvApiKeys();
  const dbKeys = (await ApiKeyUsage.find({})).map((k) => k.apiKey);
  for (const key of envKeys) {
    if (!dbKeys.includes(key)) {
      await ApiKeyUsage.create({ apiKey: key });
    }
  }
  // Optionally, deactivate keys not in env
  for (const dbKey of dbKeys) {
    if (!envKeys.includes(dbKey)) {
      await ApiKeyUsage.updateOne({ apiKey: dbKey }, { isActive: false });
    }
  }
}

function getScore(usage: any) {
  const rpmScore = 1 - usage.rpm / LIMITS.RPM;
  const rpdScore = 1 - usage.rpd / LIMITS.RPD;
  const tpmScore = 1 - usage.tpm / LIMITS.TPM;
  return 0.5 * rpmScore + 0.3 * rpdScore + 0.2 * tpmScore;
}

async function resetUsageIfNeeded(key: ApiKeyUsageType) {
  const now = new Date();
  let updated = false;
  if (key.usage.lastUsed) {
    if (now.getTime() - key.usage.lastUsed.getTime() > USAGE_RESET_INTERVALS.RPM) {
      key.usage.rpm = 0;
      key.usage.tpm = 0;
      updated = true;
    }
    if (now.getTime() - key.usage.lastUsed.getTime() > USAGE_RESET_INTERVALS.RPD) {
      key.usage.rpd = 0;
      updated = true;
    }
  }
  if (updated) await key.save();
}

export const apiKeyManager = {
  async initialize() {
    await syncKeysWithDB();
  },

  async getAllKeys() {
    await syncKeysWithDB();
    return ApiKeyUsage.find({});
  },

  async getBestKey() {
    await syncKeysWithDB();
    const keys = await ApiKeyUsage.find({ isActive: true });
    let bestKey: ApiKeyUsageType | null = null;
    let bestScore = -Infinity;
    for (const key of keys) {
      await resetUsageIfNeeded(key);
      const score = getScore(key.usage);
      if (score > bestScore) {
        bestScore = score;
        bestKey = key;
      }
    }
    if (!bestKey) throw new Error('No active API key available');
    return { apiKey: bestKey.apiKey, score: bestScore, usage: bestKey.usage };
  },

  async useKey(apiKey: string, tokensUsed: number) {
    const key = await ApiKeyUsage.findOne({ apiKey });
    if (!key || !key.isActive) throw new Error('API key not active');
    await resetUsageIfNeeded(key);
    key.usage.rpm += 1;
    key.usage.rpd += 1;
    key.usage.tpm += tokensUsed;
    key.usage.lastUsed = new Date();
    await key.save();
    // Deactivate if limit exceeded
    if (
      key.usage.rpm >= LIMITS.RPM ||
      key.usage.rpd >= LIMITS.RPD ||
      key.usage.tpm >= LIMITS.TPM
    ) {
      key.isActive = false;
      key.deactivatedAt = new Date();
      await key.save();
    }
  },

  async reportError(apiKey: string) {
    const key = await ApiKeyUsage.findOne({ apiKey });
    if (!key) return;
    key.errorCount += 1;
    if (key.errorCount >= ERROR_THRESHOLD) {
      key.isActive = false;
      key.deactivatedAt = new Date();
    }
    await key.save();
  },

  async reactivateKey(apiKey: string) {
    const key = await ApiKeyUsage.findOne({ apiKey });
    if (!key) throw new Error('API key not found');
    key.isActive = true;
    key.errorCount = 0;
    key.deactivatedAt = null;
    key.usage.rpm = 0;
    key.usage.rpd = 0;
    key.usage.tpm = 0;
    key.usage.lastUsed = null;
    await key.save();
  },

  async resetAllLimits() {
    await ApiKeyUsage.updateMany({}, {
      $set: {
        'usage.rpm': 0,
        'usage.rpd': 0,
        'usage.tpm': 0,
        'usage.lastUsed': null,
        errorCount: 0,
        isActive: true,
        deactivatedAt: null,
      },
    });
  },

  async getUsageStats() {
    await syncKeysWithDB();
    return ApiKeyUsage.find({}, { apiKey: 1, usage: 1, isActive: 1, errorCount: 1, deactivatedAt: 1 });
  },

  async getRateLimit(apiKey: string) {
    const key = await ApiKeyUsage.findOne({ apiKey });
    if (!key) throw new Error('API key not found');
    return {
      apiKey: key.apiKey,
      usage: key.usage,
      isActive: key.isActive,
      errorCount: key.errorCount,
      deactivatedAt: key.deactivatedAt,
      limits: LIMITS,
    };
  },
}; 