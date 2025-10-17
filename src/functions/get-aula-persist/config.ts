/**
 * Configuration management for GetAulaAndPersist Lambda
 * Reads and validates environment variables
 */

import { LambdaConfig, DynamoDBConfig, DataRetrievalConfig, AulaConfig } from './types';

/**
 * Validates that required environment variables are set
 */
function validateRequiredEnvVars(): void {
  const required = [
    'DAILY_OVERVIEW_TABLE',
    'THREADS_TABLE',
    'THREAD_MESSAGES_TABLE',
    'CALENDAR_EVENTS_TABLE',
    'POSTS_TABLE',
    'WEEK_OVERVIEW_TABLE',
    'BOOK_LIST_TABLE',
    'GALLERY_ALBUMS_TABLE',
    'AULA_SESSION_ID_TABLE',
  ];

  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

/**
 * Parses an environment variable as an integer with a default value
 */
function getEnvInt(key: string, defaultValue: number): number {
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
 * Loads DynamoDB configuration from environment variables
 */
function loadDynamoDBConfig(): DynamoDBConfig {
  return {
    sessionIdTable: process.env.AULA_SESSION_ID_TABLE!,
    dailyOverviewTable: process.env.DAILY_OVERVIEW_TABLE!,
    threadsTable: process.env.THREADS_TABLE!,
    threadMessagesTable: process.env.THREAD_MESSAGES_TABLE!,
    calendarEventsTable: process.env.CALENDAR_EVENTS_TABLE!,
    postsTable: process.env.POSTS_TABLE!,
    weekOverviewTable: process.env.WEEK_OVERVIEW_TABLE!,
    bookListTable: process.env.BOOK_LIST_TABLE!,
    galleryAlbumsTable: process.env.GALLERY_ALBUMS_TABLE!,
    derivedEventsTable: process.env.DERIVED_EVENTS_TABLE || 'RAW_derivedEvents',
    region: process.env.AWS_REGION_OVERRIDE || process.env.AWS_REGION,
  };
}

/**
 * Loads data retrieval configuration from environment variables
 */
function loadDataRetrievalConfig(): DataRetrievalConfig {
  return {
    threadMessagesDays: getEnvInt('THREAD_MESSAGES_DAYS', 30),
    postsDays: getEnvInt('POSTS_DAYS', 30),
    calendarEventsPast: getEnvInt('CALENDAR_EVENTS_DAYS_PAST', 10),
    calendarEventsFuture: getEnvInt('CALENDAR_EVENTS_DAYS_FUTURE', 30),
    galleryDays: getEnvInt('GALLERY_DAYS', 5),
  };
}

/**
 * Loads Aula API configuration from environment variables
 */
function loadAulaConfig(): AulaConfig {
  return {
    apiUrl: process.env.API_URL || 'https://www.aula.dk/api/',
  };
}

/**
 * Loads attachments configuration from environment variables (optional)
 */
function loadAttachmentsConfig(): { bucketName: string; tableName: string } | undefined {
  const bucketName = process.env.ATTACHMENTS_BUCKET;
  const tableName = process.env.ATTACHMENTS_TABLE;

  if (!bucketName || !tableName) {
    return undefined;
  }

  return { bucketName, tableName };
}

/**
 * Loads and validates all configuration from environment variables
 * Throws an error if required variables are missing
 */
export function getConfig(): LambdaConfig {
  // Validate required variables first
  validateRequiredEnvVars();

  // Load configuration sections
  const config: LambdaConfig = {
    dynamodb: loadDynamoDBConfig(),
    dataRetrieval: loadDataRetrievalConfig(),
    aula: loadAulaConfig(),
    attachments: loadAttachmentsConfig(),
  };

  return config;
}
