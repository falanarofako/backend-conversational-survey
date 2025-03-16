// src/utils/apiKeyRotation.ts

import { ServiceResponse } from '../types/intentTypes';

// Configuration constants
const ROTATION_INTERVAL = 60 * 1000; // 1 minute
const MAX_USAGE_PER_KEY = 60; // requests per minute

// Simple key manager without complex state tracking
export class ApiKeyManager {
  private apiKeys: string[];
  private currentIndex: number = 0;
  private usageCounts: number[] = [];
  private lastRotationTime: number = Date.now();

  constructor() {
    // Get API keys from environment variables
    this.apiKeys = Object.keys(process.env)
      .filter(key => key.startsWith('GEMINI_API_KEY_'))
      .map(key => process.env[key] as string)
      .filter(Boolean);

    if (this.apiKeys.length === 0) {
      throw new Error('No API keys configured. Please set GEMINI_API_KEY_* environment variables.');
    }

    // Initialize usage counters
    this.usageCounts = Array(this.apiKeys.length).fill(0);
    
    console.log(`API Key manager initialized with ${this.apiKeys.length} keys`);
  }

  // Get current API key
  public getCurrentKey(): ServiceResponse<string> {
    try {
      // Check if we need to rotate
      if (this.shouldRotateKey()) {
        this.rotateKey();
      }

      // Increment usage count
      this.usageCounts[this.currentIndex]++;

      return {
        success: true,
        data: this.apiKeys[this.currentIndex],
        metadata: {
          processing_time: 0,
          api_key_used: this.currentIndex,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error getting current key'
      };
    }
  }

  // Handle error (automatically rotate key if needed)
  public handleError(): ServiceResponse<string> {
    try {
      // Simply rotate to next key on error
      this.rotateKey();
      
      return {
        success: true,
        data: this.apiKeys[this.currentIndex],
        metadata: {
          processing_time: 0,
          api_key_used: this.currentIndex,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error handling API error'
      };
    }
  }

  // Reset all counters
  public resetCounters(): ServiceResponse<void> {
    try {
      this.usageCounts = Array(this.apiKeys.length).fill(0);
      this.lastRotationTime = Date.now();
      
      return {
        success: true,
        metadata: {
          processing_time: 0,
          api_key_used: this.currentIndex,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error resetting counters'
      };
    }
  }

  // Get current status
  public getStatus(): ServiceResponse<{
    currentKeyIndex: number,
    totalKeys: number,
    usageCounts: number[],
    timeSinceLastRotation: number
  }> {
    return {
      success: true,
      data: {
        currentKeyIndex: this.currentIndex,
        totalKeys: this.apiKeys.length,
        usageCounts: [...this.usageCounts],
        timeSinceLastRotation: Date.now() - this.lastRotationTime
      },
      metadata: {
        processing_time: 0,
        api_key_used: this.currentIndex,
        timestamp: new Date().toISOString()
      }
    };
  }

  // Private helper methods
  private shouldRotateKey(): boolean {
    const timeSinceRotation = Date.now() - this.lastRotationTime;
    const usageExceeded = this.usageCounts[this.currentIndex] >= MAX_USAGE_PER_KEY;
    
    return timeSinceRotation >= ROTATION_INTERVAL || usageExceeded;
  }

  private rotateKey(): void {
    // Reset counter for current key
    this.usageCounts[this.currentIndex] = 0;
    
    // Move to next key
    this.currentIndex = (this.currentIndex + 1) % this.apiKeys.length;
    this.lastRotationTime = Date.now();
    
    console.log(`Rotated to API key ${this.currentIndex + 1} of ${this.apiKeys.length}`);
  }
}

// Singleton instance
let keyManagerInstance: ApiKeyManager | null = null;

// Get the key manager instance
export const getKeyManager = (): ApiKeyManager => {
  if (!keyManagerInstance) {
    keyManagerInstance = new ApiKeyManager();
  }
  return keyManagerInstance;
};