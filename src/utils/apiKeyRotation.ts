// src/utils/apiKeyRotation.ts

import { 
    KeyState, 
    APIKeyStatus, 
    ServiceResponse, 
    APIError,
    ErrorType,
    ERROR_TYPES
  } from '../types/intentTypes';
  import { setTimeout } from 'timers/promises';
  import fs from 'fs/promises';
  import path from 'path';
  
  // Configuration constants
  const ROTATION_INTERVAL = 60 * 1000; // 1 minute
  const MAX_USAGE_PER_KEY = 60; // requests per minute
  const ERROR_THRESHOLD = 3; // maximum errors before rotation
  const MONITORED_ERROR_CODES = [ERROR_TYPES.RATE_LIMIT, ERROR_TYPES.PERMISSION_DENIED, ERROR_TYPES.INTERNAL_ERROR];
  const ERROR_LOG_PATH = path.join(__dirname, '../data/api_errors.json');
  
  // Initialize key state
  export const initializeKeyState = async (): Promise<KeyState> => {
    const apiKeys = Object.keys(process.env)
      .filter(key => key.startsWith('GEMINI_API_KEY_'))
      .map(key => process.env[key] as string)
      .filter(Boolean);
  
    if (apiKeys.length === 0) {
      throw new Error('No API keys configured. Please set GEMINI_API_KEY_* environment variables.');
    }
  
    const initialState: KeyState = {
      apiKeys,
      currentIndex: 0,
      lastRotation: Date.now(),
      usageCount: {},
      errorCounts: {}
    };
  
    // Initialize counters
    apiKeys.forEach(key => {
      initialState.usageCount[key] = 0;
      initialState.errorCounts[key] = MONITORED_ERROR_CODES.reduce((acc, code) => {
        acc[code] = 0;
        return acc;
      }, {} as { [code: number]: number });
    });
  
    console.log(`API Key rotation system initialized with ${apiKeys.length} keys`);
    
    // Load existing error log or create new one
    await initializeErrorLog();
  
    return initialState;
  };
  
  // Error logging functions
  const initializeErrorLog = async (): Promise<void> => {
    try {
      await fs.access(ERROR_LOG_PATH);
    } catch {
      await fs.writeFile(ERROR_LOG_PATH, JSON.stringify({
        errors: [],
        totalErrors: 0,
        errorsByType: {}
      }, null, 2));
    }
  };
  
  const logError = async (error: APIError): Promise<void> => {
    try {
      const logContent = await fs.readFile(ERROR_LOG_PATH, 'utf-8');
      const errorLog = JSON.parse(logContent);
      
      errorLog.errors.push(error);
      errorLog.totalErrors++;
      errorLog.errorsByType[error.code] = (errorLog.errorsByType[error.code] || 0) + 1;
      errorLog.lastError = error;
  
      await fs.writeFile(ERROR_LOG_PATH, JSON.stringify(errorLog, null, 2));
    } catch (e) {
      console.error('Failed to log API error:', e);
    }
  };
  
  // Key rotation logic
  const shouldRotateKey = async (state: KeyState, currentKey: string): Promise<boolean> => {
    const timeSinceRotation = Date.now() - state.lastRotation;
    const usageExceeded = state.usageCount[currentKey] >= MAX_USAGE_PER_KEY;
    const errorThresholdExceeded = Object.values(state.errorCounts[currentKey])
      .reduce((sum, count) => sum + count, 0) >= ERROR_THRESHOLD;
  
    if (usageExceeded) {
      console.log(`Key rotation triggered: Usage limit exceeded for key ${state.currentIndex + 1}`);
      await logError({
        code: ERROR_TYPES.RATE_LIMIT,
        message: 'Usage limit exceeded',
        timestamp: new Date().toISOString(),
        apiKeyIndex: state.currentIndex
      });
    }
  
    if (errorThresholdExceeded) {
      console.log(`Key rotation triggered: Error threshold exceeded for key ${state.currentIndex + 1}`);
    }
  
    if (timeSinceRotation >= ROTATION_INTERVAL) {
      console.log(`Key rotation triggered: Time interval exceeded for key ${state.currentIndex + 1}`);
    }
  
    return timeSinceRotation >= ROTATION_INTERVAL || 
           usageExceeded || 
           errorThresholdExceeded;
  };
  
  // Rotate to next available key
  export const rotateKey = async (state: KeyState): Promise<ServiceResponse<[string, KeyState]>> => {
    try {
      const newState = { ...state };
      
      // Reset counters for current key
      const oldKey = newState.apiKeys[newState.currentIndex];
      newState.usageCount[oldKey] = 0;
      Object.keys(newState.errorCounts[oldKey]).forEach(code => {
        newState.errorCounts[oldKey][parseInt(code)] = 0;
      });
  
      // Find next available key
      let attempts = 0;
      let nextKeyFound = false;
      
      while (attempts < newState.apiKeys.length && !nextKeyFound) {
        newState.currentIndex = (newState.currentIndex + 1) % newState.apiKeys.length;
        const nextKey = newState.apiKeys[newState.currentIndex];
        
        // Check if next key is usable
        if (newState.errorCounts[nextKey][ERROR_TYPES.PERMISSION_DENIED] < ERROR_THRESHOLD) {
          nextKeyFound = true;
        }
        attempts++;
      }
  
      if (!nextKeyFound) {
        throw new Error('No available API keys remaining');
      }
  
      newState.lastRotation = Date.now();
  
      console.log(`Rotated to API key ${newState.currentIndex + 1} of ${newState.apiKeys.length}`);
      
      return {
        success: true,
        data: [newState.apiKeys[newState.currentIndex], newState],
        metadata: {
          processing_time: Date.now() - state.lastRotation,
          api_key_used: newState.currentIndex,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error during key rotation'
      };
    }
  };
  
  // Get current API key
  export const getCurrentKey = async (state: KeyState): Promise<ServiceResponse<[string, KeyState]>> => {
    try {
      const currentKey = state.apiKeys[state.currentIndex];
      
      if (await shouldRotateKey(state, currentKey)) {
        return rotateKey(state);
      }
  
      const newState = {
        ...state,
        usageCount: {
          ...state.usageCount,
          [currentKey]: state.usageCount[currentKey] + 1
        }
      };
  
      return {
        success: true,
        data: [currentKey, newState],
        metadata: {
          processing_time: 0,
          api_key_used: state.currentIndex,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error getting current key'
      };
    }
  };
  
  // Handle API errors
  export const handleError = async (
    state: KeyState, 
    error: any
  ): Promise<ServiceResponse<[string, KeyState]>> => {
    try {
      const currentKey = state.apiKeys[state.currentIndex];
      const statusCode = error.response?.status as ErrorType;
  
      if (statusCode && state.errorCounts[currentKey][statusCode] !== undefined) {
        const newState = {
          ...state,
          errorCounts: {
            ...state.errorCounts,
            [currentKey]: {
              ...state.errorCounts[currentKey],
              [statusCode]: state.errorCounts[currentKey][statusCode] + 1
            }
          }
        };
  
        await logError({
          code: statusCode,
          message: error.response?.data?.message || error.message,
          timestamp: new Date().toISOString(),
          apiKeyIndex: state.currentIndex,
          context: error.response?.data
        });
  
        console.log(`Error ${statusCode} recorded for key ${state.currentIndex + 1}`);
        
        if (statusCode === ERROR_TYPES.RATE_LIMIT || statusCode === ERROR_TYPES.PERMISSION_DENIED) {
          console.log(`Immediate rotation triggered due to error ${statusCode}`);
          return rotateKey(newState);
        }
  
        return {
          success: true,
          data: [currentKey, newState],
          metadata: {
            processing_time: 0,
            api_key_used: state.currentIndex,
            timestamp: new Date().toISOString()
          }
        };
      }
  
      return {
        success: true,
        data: [currentKey, state],
        metadata: {
          processing_time: 0,
          api_key_used: state.currentIndex,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error handling API error'
      };
    }
  };
  
  // Get API key status
  export const getKeyStatus = (state: KeyState): APIKeyStatus => {
    return {
      currentKeyIndex: state.currentIndex,
      totalKeys: state.apiKeys.length,
      usageCounts: { ...state.usageCount },
      errorCounts: JSON.parse(JSON.stringify(state.errorCounts)),
      timeSinceLastRotation: Date.now() - state.lastRotation
    };
  };
  
  // Reset key counters
  export const resetCounters = async (state: KeyState): Promise<ServiceResponse<KeyState>> => {
    try {
      const newState = {
        ...state,
        lastRotation: Date.now()
      };
  
      state.apiKeys.forEach(key => {
        newState.usageCount[key] = 0;
        newState.errorCounts[key] = MONITORED_ERROR_CODES.reduce((acc, code) => {
          acc[code] = 0;
          return acc;
        }, {} as { [code: number]: number });
      });
  
      console.log('API key counters reset');
      
      return {
        success: true,
        data: newState,
        metadata: {
          processing_time: 0,
          api_key_used: state.currentIndex,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error resetting counters'
      };
    }
  };