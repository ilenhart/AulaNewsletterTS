/**
 * Shared utility functions for logging, error handling, and helper operations
 */

import { convert } from 'html-to-text';
import { ExecutionStats } from './types';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: any;
}

/**
 * Structured logging with JSON output for CloudWatch
 */
export function log(level: LogLevel, message: string, context?: any): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
  };

  if (context !== undefined) {
    entry.context = context;
  }

  console.log(JSON.stringify(entry));
}

export function logDebug(message: string, context?: any): void {
  log(LogLevel.DEBUG, message, context);
}

export function logInfo(message: string, context?: any): void {
  log(LogLevel.INFO, message, context);
}

export function logWarn(message: string, context?: any): void {
  log(LogLevel.WARN, message, context);
}

export function logError(message: string, context?: any): void {
  log(LogLevel.ERROR, message, context);
}

/**
 * Custom error class for Lambda-specific errors
 */
export class LambdaError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'LambdaError';
    Object.setPrototypeOf(this, LambdaError.prototype);
  }
}

/**
 * Custom error class for configuration errors
 */
export class ConfigurationError extends LambdaError {
  constructor(message: string, details?: any) {
    super(message, 500, details);
    this.name = 'ConfigurationError';
  }
}

/**
 * Custom error class for Aula API errors
 */
export class AulaAPIError extends LambdaError {
  constructor(message: string, details?: any) {
    super(message, 502, details);
    this.name = 'AulaAPIError';
  }
}

/**
 * Custom error class for DynamoDB errors
 */
export class DynamoDBError extends LambdaError {
  constructor(message: string, details?: any) {
    super(message, 500, details);
    this.name = 'DynamoDBError';
  }
}

/**
 * Custom error class for Bedrock/AI errors
 */
export class BedrockError extends LambdaError {
  constructor(message: string, details?: any) {
    super(message, 502, details);
    this.name = 'BedrockError';
  }
}

/**
 * Custom error class for SES/Email errors
 */
export class EmailError extends LambdaError {
  constructor(message: string, details?: any) {
    super(message, 502, details);
    this.name = 'EmailError';
  }
}

/**
 * Splits an array into chunks of specified size
 * Useful for batch operations
 */
export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Sleep for specified milliseconds
 * Useful for retry logic with delays
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000,
  operationName: string = 'operation'
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt === maxRetries) {
        logError(`${operationName} failed after ${maxRetries} attempts`, { error: lastError.message });
        throw lastError;
      }

      const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
      logWarn(`${operationName} failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms`, {
        error: lastError.message,
      });

      await sleep(delayMs);
    }
  }

  throw lastError!;
}

/**
 * Safely extracts error message from unknown error type
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return JSON.stringify(error);
}

/**
 * Formats execution statistics for logging
 */
export function formatExecutionStats(stats: ExecutionStats): string {
  const duration = stats.endTime
    ? stats.endTime.getTime() - stats.startTime.getTime()
    : Date.now() - stats.startTime.getTime();

  return `Processed ${stats.itemsProcessed} items (${stats.itemsSuccessful} successful, ${stats.itemsFailed} failed) in ${duration}ms`;
}

/**
 * Calculates TTL timestamp for a duration from now
 */
export function getTTL(durationSeconds: number): number {
  return Math.floor(Date.now() / 1000) + durationSeconds;
}

/**
 * Calculates TTL for one month from now
 */
export function oneMonthFromNow(): number {
  const now = new Date();
  const future = new Date(now);
  future.setMonth(future.getMonth() + 1);
  return Math.floor(future.getTime() / 1000);
}

/**
 * Calculates TTL for one hour from now
 */
export function oneHourFromNow(): number {
  return getTTL(3600);
}

/**
 * Calculates TTL for one year from now (365 days)
 */
export function oneYearFromNow(): number {
  return getTTL(365 * 24 * 3600);
}

/**
 * Calculates TTL for two months from now
 */
export function twoMonthsFromNow(): number {
  const now = new Date();
  const future = new Date(now);
  future.setMonth(future.getMonth() + 2);
  return Math.floor(future.getTime() / 1000);
}

/**
 * Gets start of today in UTC
 */
export function getStartOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/**
 * Gets date range for querying data
 */
export function getDateRange(daysInPast: number, daysInFuture: number = 0): { start: Date; end: Date } {
  const startOfToday = getStartOfToday();
  const start = new Date(startOfToday.getTime() - daysInPast * 24 * 60 * 60 * 1000);
  const end = new Date(startOfToday.getTime() + (daysInFuture + 1) * 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Strips HTML tags and formatting from text using html-to-text library
 * Converts HTML to clean plain text suitable for AI processing
 */
export function stripHtml(html: string): string {
  if (!html) return '';

  try {
    return convert(html, {
      wordwrap: false,
      preserveNewlines: true,
      selectors: [
        { selector: 'a', options: { ignoreHref: true } },
        { selector: 'img', format: 'skip' },
      ],
    });
  } catch (error) {
    logWarn('Failed to strip HTML, returning original text', {
      error: error instanceof Error ? error.message : String(error),
    });
    // Fallback: return original text if HTML parsing fails
    return html;
  }
}

/**
 * Extracts JSON from LLM response that may contain explanatory text
 * Handles common LLM patterns:
 * - "Here is the JSON: {...}"
 * - ```json\n{...}\n```
 * - Text before/after JSON
 *
 * @param response - Raw response from LLM
 * @param context - Optional context for logging (e.g., "event merge", "newsletter generation")
 * @returns Parsed JSON object or null if no valid JSON found
 */
export function extractJsonFromLLMResponse<T = any>(response: string, context?: string): T | null {
  if (!response || response.trim().length === 0) {
    logWarn('Empty response from LLM', { context });
    return null;
  }

  let cleaned = response.trim();

  // Step 1: Remove markdown code fences
  if (cleaned.includes('```json')) {
    const jsonMatch = cleaned.match(/```json\s*\n?([\s\S]*?)\n?```/);
    if (jsonMatch) {
      cleaned = jsonMatch[1].trim();
    }
  } else if (cleaned.includes('```')) {
    const codeMatch = cleaned.match(/```\s*\n?([\s\S]*?)\n?```/);
    if (codeMatch) {
      cleaned = codeMatch[1].trim();
    }
  }

  // Step 2: Try to extract JSON object or array using regex
  // Look for { ... } or [ ... ] with proper nesting
  const jsonObjectMatch = cleaned.match(/(\{(?:[^{}]|(?:\{(?:[^{}]|\{[^{}]*\})*\}))*\})/s);
  const jsonArrayMatch = cleaned.match(/(\[(?:[^\[\]]|(?:\[(?:[^\[\]]|\[[^\[\]]*\])*\]))*\])/s);

  let jsonString: string | null = null;

  if (jsonObjectMatch) {
    jsonString = jsonObjectMatch[1];
  } else if (jsonArrayMatch) {
    jsonString = jsonArrayMatch[1];
  }

  // Step 3: Try to parse the extracted JSON
  if (jsonString) {
    try {
      const parsed = JSON.parse(jsonString);
      return parsed as T;
    } catch (parseError) {
      logWarn('Failed to parse extracted JSON', {
        context,
        jsonString: jsonString.substring(0, 200),
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });
    }
  }

  // Step 4: Last resort - try to parse the entire response
  try {
    const parsed = JSON.parse(cleaned);
    return parsed as T;
  } catch (finalError) {
    logError('Could not extract valid JSON from LLM response', {
      context,
      response: response.substring(0, 500),
      error: finalError instanceof Error ? finalError.message : String(finalError),
    });
    return null;
  }
}

/**
 * Safe JSON parse with fallback value
 * @param jsonString - String to parse
 * @param fallback - Value to return if parsing fails
 * @param context - Optional context for logging
 */
export function safeJsonParse<T>(jsonString: string, fallback: T, context?: string): T {
  try {
    return JSON.parse(jsonString) as T;
  } catch (error) {
    logWarn('JSON parse failed, using fallback', {
      context,
      error: error instanceof Error ? error.message : String(error),
    });
    return fallback;
  }
}
