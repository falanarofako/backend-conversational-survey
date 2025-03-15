// src/services/provincesAndRegenciesService.ts

import Province, { Regency, IProvince } from "../models/Province";
import mongoose from "mongoose";

// Define a type for the lean province document with regencies
interface LeanProvinceWithRegencies {
  regencies: Regency[];
  name?: string;
  code?: string;
}

/**
 * Initialize the provinces and regencies data in the database
 * @param data Array of province data to insert
 */
export async function initializeProvincesData(data: any[]): Promise<void> {
  try {
    // Check if data already exists
    const count = await Province.estimatedDocumentCount();
    if (count > 0) {
      console.log('Provinces data already initialized');
      return;
    }

    // Insert the data
    await Province.insertMany(data);
    console.log('Provinces data initialized successfully');
  } catch (error) {
    console.error('Error initializing provinces data:', error);
    throw error;
  }
}

/**
 * Get all provinces
 * @returns Array of province objects with code and name
 */
export async function getProvinces(): Promise<{ code: string; name: string }[]> {
  try {
    // Using the raw query approach to avoid TypeScript issues
    const provinces = await mongoose.model('Province').aggregate([
      { $project: { _id: 0, code: 1, name: 1 } }
    ]);
    
    return provinces.map(province => ({
      code: province.code,
      name: province.name
    }));
  } catch (error) {
    console.error('Error fetching provinces:', error);
    return [];
  }
}

/**
 * Get all province names
 * @returns Array of province names
 */
export async function getProvinceNames(): Promise<string[]> {
  try {
    // Using the raw query approach
    const provinces = await mongoose.model('Province').aggregate([
      { $project: { _id: 0, name: 1 } }
    ]);
    
    return provinces.map(province => province.name);
  } catch (error) {
    console.error('Error fetching province names:', error);
    return [];
  }
}

/**
 * Get regencies by province code
 * @param provinceCode The code of the province
 * @returns Array of regency objects or null if province not found
 */
export async function getRegenciesByProvinceCode(provinceCode: string): Promise<Regency[] | null> {
  try {
    const result = await mongoose.model('Province').aggregate([
      { $match: { code: provinceCode } },
      { $project: { _id: 0, regencies: 1 } },
      { $limit: 1 }
    ]);
    
    if (result.length > 0) {
      return result[0].regencies;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching regencies for province code ${provinceCode}:`, error);
    return null;
  }
}

/**
 * Get regency names by province code
 * @param provinceCode The code of the province
 * @returns Array of regency names or null if province not found
 */
export async function getRegencyNamesByProvinceCode(provinceCode: string): Promise<string[] | null> {
  try {
    const result = await mongoose.model('Province').aggregate([
      { $match: { code: provinceCode } },
      { $project: { _id: 0, regencies: 1 } },
      { $limit: 1 }
    ]);
    
    if (result.length > 0 && result[0].regencies) {
      return result[0].regencies.map((regency: Regency) => regency.name);
    }
    return null;
  } catch (error) {
    console.error(`Error fetching regency names for province code ${provinceCode}:`, error);
    return null;
  }
}

/**
 * Get regency names by province name
 * @param provinceName The name of the province
 * @returns Array of regency names or null if province not found
 */
export async function getRegencyNamesByProvinceName(provinceName: string): Promise<string[] | null> {
  try {
    const result = await mongoose.model('Province').aggregate([
      { $match: { name: provinceName } },
      { $project: { _id: 0, regencies: 1 } },
      { $limit: 1 }
    ]);
    
    if (result.length > 0 && result[0].regencies) {
      return result[0].regencies.map((regency: Regency) => regency.name);
    }
    return null;
  } catch (error) {
    console.error(`Error fetching regency names for province name ${provinceName}:`, error);
    return null;
  }
}