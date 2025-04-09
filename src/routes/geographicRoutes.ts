// src/routes/geographicRoutes.ts

import { Router } from 'express';
import { 
  handleGetProvinces, 
  handleGetRegenciesByProvince 
} from '../controllers/geographicController';

const router = Router();

/**
 * @route   GET /api/geographic/provinces
 * @desc    Get all provinces without regencies
 * @access  Public
 */
router.get('/provinces', handleGetProvinces);

/**
 * @route   GET /api/geographic/provinces/:provinceCode/regencies
 * @desc    Get all regencies for a specific province by province code
 * @access  Public
 */
router.get('/provinces/:provinceCode/regencies', handleGetRegenciesByProvince);

export default router;