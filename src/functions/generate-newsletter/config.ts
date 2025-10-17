/**
 * Configuration for generate-newsletter Lambda
 */

import { validateRequired, getEnvString, getEnvInt, getEnvArray } from '../../common/config';
import { DynamoDBConfig } from '../../common/types';

export interface NewsletterConfig {
  dynamodb: DynamoDBConfig;
  dataRetrieval: {
    threadMessagesDaysInPast: number;
    calendarEventsDaysInPast: number;
    calendarEventsDaysInFuture: number;
    postsDaysInPast: number;
  };
  email: {
    fromAddress: string;
    toAddresses: string[];
  };
  personalization: {
    childName: string;
    parentNames: string;
    messageFamilyNames: string;
  };
  bedrock: {
    modelId: string;
  };
}

/**
 * Loads and validates configuration for generate-newsletter lambda
 */
export function getConfig(): NewsletterConfig {
  // Validate required environment variables
  validateRequired([
    'DAILY_OVERVIEW_TABLE',
    'THREADS_TABLE',
    'THREAD_MESSAGES_TABLE',
    'CALENDAR_EVENTS_TABLE',
    'POSTS_TABLE',
    'EMAIL_FROM_ADDRESS',
    'EMAIL_TO_ADDRESSES',
    'CHILD_NAME',
    'PARENT_NAMES',
  ]);

  return {
    dynamodb: {
      sessionIdTable: getEnvString('AULA_SESSION_ID_TABLE', 'AulaSessionIdTable'),
      dailyOverviewTable: getEnvString('DAILY_OVERVIEW_TABLE'),
      threadsTable: getEnvString('THREADS_TABLE'),
      threadMessagesTable: getEnvString('THREAD_MESSAGES_TABLE'),
      calendarEventsTable: getEnvString('CALENDAR_EVENTS_TABLE'),
      postsTable: getEnvString('POSTS_TABLE'),
      weekOverviewTable: getEnvString('WEEK_OVERVIEW_TABLE', 'RAW_weekOverview'),
      bookListTable: getEnvString('BOOK_LIST_TABLE', 'RAW_bookList'),
      galleryAlbumsTable: getEnvString('GALLERY_ALBUMS_TABLE', 'RAW_galleryAlbums'),
      derivedEventsTable: getEnvString('DERIVED_EVENTS_TABLE', 'RAW_derivedEvents'),
    },
    dataRetrieval: {
      threadMessagesDaysInPast: getEnvInt('THREADMESSAGES_DAYS_IN_PAST', 30),
      calendarEventsDaysInPast: getEnvInt('CALENDAR_EVENTS_DAYS_IN_PAST', 3),
      calendarEventsDaysInFuture: getEnvInt('CALENDAR_EVENTS_DAYS_IN_FUTURE', 7),
      postsDaysInPast: getEnvInt('POSTS_DAYS_IN_PAST', 3),
    },
    email: {
      fromAddress: getEnvString('EMAIL_FROM_ADDRESS'),
      toAddresses: getEnvArray('EMAIL_TO_ADDRESSES'),
    },
    personalization: {
      childName: getEnvString('CHILD_NAME'),
      parentNames: getEnvString('PARENT_NAMES'),
      messageFamilyNames: getEnvString('MESSAGE_FAMILY_NAMES_TO_FLAG', 'None'),
    },
    bedrock: {
      modelId: getEnvString('BEDROCK_MODEL_ID', 'anthropic.claude-3-sonnet-20240229-v1:0'),
    },
  };
}
