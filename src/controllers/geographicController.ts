// src/controllers/geographicController.ts

import { Request, Response } from 'express';
import { 
  getProvinces, 
  getRegenciesByProvinceCode 
} from '../services/provincesAndRegenciesService';

/**
 * Get all provinces without regencies
 * @route GET /api/geographic/provinces
 * @access Public
 */
export const handleGetProvinces = async (req: Request, res: Response): Promise<void> => {
  try {
    const provinces = await getProvinces();
    
    res.status(200).json({
      success: true,
      data: provinces,
      count: provinces.length
    });
  } catch (error) {
    console.error('Error fetching provinces:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching provinces',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Get all regencies for a specific province by province code
 * @route GET /api/geographic/provinces/:provinceCode/regencies
 * @access Public
 */
export const handleGetRegenciesByProvince = async (req: Request, res: Response): Promise<void> => {
  try {
    const { provinceCode } = req.params;
    
    if (!provinceCode) {
      res.status(400).json({
        success: false,
        message: 'Province code is required'
      });
      return;
    }
    
    const regencies = await getRegenciesByProvinceCode(provinceCode);
    
    if (!regencies) {
      res.status(404).json({
        success: false,
        message: `No regencies found for province code: ${provinceCode}`
      });
      return;
    }
    
    res.status(200).json({
      success: true,
      data: regencies,
      count: regencies.length,
      provinceCode
    });
  } catch (error) {
    console.error(`Error fetching regencies for province ${req.params.provinceCode}:`, error);
    res.status(500).json({
      success: false,
      message: 'Error fetching regencies',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};