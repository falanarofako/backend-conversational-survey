import { Router } from 'express';
import {
  getAllKeyStatus,
  getBestKey,
  getUsageStats,
  reactivateKey,
  resetAllLimits,
  getRateLimit,
} from '../controllers/apiKeyController';

const router = Router();

router.get('/status', getAllKeyStatus);
router.get('/best', getBestKey);
router.get('/usage-stats', getUsageStats);
router.post('/reactivate/:apiKey', reactivateKey);
router.post('/reset-limits', resetAllLimits);
router.get('/rate-limit/:apiKey', getRateLimit);

export default router; 