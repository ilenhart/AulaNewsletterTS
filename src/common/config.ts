/**
 * Shared configuration utilities for all Aula Newsletter Lambdas
 */

import { AWSConfig } from './types';

/**
 * Validates that required environment variables are set
 * Throws an error if any are missing
 */
export function validateRequired(keys: string[]): void {
  const missing = keys.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Gets an environment variable as a string with optional default
 */
export function getEnvString(key: string, defaultValue?: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (defaultValue === undefined) {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return defaultValue;
  }
  return value;
}

/**
 * Parses an environment variable as an integer with a default value
 */
export function getEnvInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;

  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    console.warn(`Invalid integer value for ${key}: "${value}", using default: ${defaultValue}`);
    return defaultValue;
  }

  return parsed;
}

/**
 * Gets an environment variable as a boolean
 */
export function getEnvBool(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;

  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Gets AWS configuration from environment variables
 * Returns region and optional credentials
 */
export function getAwsConfig(): AWSConfig {
  const config: AWSConfig = {};

  // Set region
  if (process.env.AWS_REGION_OVERRIDE) {
    config.region = process.env.AWS_REGION_OVERRIDE;
  } else if (process.env.AWS_REGION) {
    config.region = process.env.AWS_REGION;
  }

  // Set credentials if provided (for local testing)
  if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
    config.credentials = {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };
  }

  return config;
}

/**
 * Parses a comma-separated environment variable into an array
 */
export function getEnvArray(key: string, defaultValue: string[] = []): string[] {
  const value = process.env[key];
  if (!value) return defaultValue;

  return value.split(',').map(item => item.trim()).filter(item => item.length > 0);
}
