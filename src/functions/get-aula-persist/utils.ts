/**
 * Utility functions for logging, error handling, and helper operations
 */

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
export interface ExecutionStats {
  startTime: Date;
  endTime?: Date;
  itemsProcessed: number;
  itemsSuccessful: number;
  itemsFailed: number;
}

export function formatExecutionStats(stats: ExecutionStats): string {
  const duration = stats.endTime
    ? stats.endTime.getTime() - stats.startTime.getTime()
    : Date.now() - stats.startTime.getTime();

  return `Processed ${stats.itemsProcessed} items (${stats.itemsSuccessful} successful, ${stats.itemsFailed} failed) in ${duration}ms`;
}

/**
 * Calculates the start date for data retrieval based on session state
 *
 * Priority:
 * 1. lastUsedSuccessfully (most recent known good fetch)
 * 2. created (session creation date)
 * 3. Fallback to X days ago (from config)
 *
 * @param session - The Aula session record (may be null)
 * @param defaultDaysInPast - Number of days to go back if no session history available
 * @returns Date object representing the start date for data retrieval
 */
export function calculateDataStartDate(
  session: { created?: string; lastUsedSuccessfully?: string } | null,
  defaultDaysInPast: number
): Date {
  // Priority 1: Use lastUsedSuccessfully if available
  if (session?.lastUsedSuccessfully) {
    const lastSuccessDate = new Date(session.lastUsedSuccessfully);
    logInfo('Using lastUsedSuccessfully as data start date', {
      startDate: lastSuccessDate.toISOString(),
      daysAgo: Math.floor((Date.now() - lastSuccessDate.getTime()) / (1000 * 60 * 60 * 24)),
    });
    return lastSuccessDate;
  }

  // Priority 2: Use created if available
  if (session?.created) {
    const createdDate = new Date(session.created);
    logInfo('Using session created date as data start date', {
      startDate: createdDate.toISOString(),
      daysAgo: Math.floor((Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24)),
    });
    return createdDate;
  }

  // Priority 3: Fallback to configured days in past
  const fallbackDate = new Date();
  fallbackDate.setDate(fallbackDate.getDate() - defaultDaysInPast);
  logInfo('Using default days-in-past as data start date', {
    startDate: fallbackDate.toISOString(),
    daysInPast: defaultDaysInPast,
  });
  return fallbackDate;
}
