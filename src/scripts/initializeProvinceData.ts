// src/scripts/initializeProvinceData.ts

import * as dotenv from 'dotenv';
import mongoose from 'mongoose';
import * as fs from 'fs';
import * as path from 'path';
import { initializeProvincesData } from '../services/provincesAndRegenciesService';

// Load environment variables
dotenv.config();

// Database connection
async function connectDB(): Promise<typeof mongoose> {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI);
    console.log('MongoDB connected successfully');
    return conn;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

// Run initialization
async function run() {
  try {
    // Connect to database
    await connectDB();

    // Read provinces data from JSON file
    const filePath = "E:/Kuliah/Semester 7/Koding/backend-conversational-survey/src/data/indonesia_provinces_and_regencies.json";
    
    if (!fs.existsSync(filePath)) {
      console.error(`File not found: ${filePath}`);
      process.exit(1);
    }
    
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    // Initialize data in MongoDB
    await initializeProvincesData(data);

    console.log('Data initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('Error initializing data:', error);
    process.exit(1);
  }
}

// Run the script
run();