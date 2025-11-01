/**
 * TypeScript type definitions for the GetAulaAndPersist Lambda
 */

import { DateRangeOverride } from '../../common/types';

// ===== Aula API Response Types =====

export interface AulaMessage {
  Id: string;
  ThreadId: number;
  SentDate: string;
  Sender: {
    FullName: string;
    Role: string;
  };
  MessageText: string;
  Attachments: AulaAttachment[];
  Recipients: any[];
  [key: string]: any;
}

export interface AulaThread {
  Id: number;
  Subject: string;
  Messages: AulaMessage[];
  [key: string]: any;
}

export interface AulaPost {
  Id: number;
  Title: string;
  Content: string;
  Timestamp: string;
  Author: string;
  AuthorRole: string;
  Attachments: AulaAttachment[];
  [key: string]: any;
}

export interface AulaCalendarEvent {
  Id: number;
  Title: string;
  StartDate: string;
  EndDate: string;
  CreatorName: string;
  Type: string;
  PrimaryResourceText: string;
  [key: string]: any;
}

export interface AulaDailyOverview {
  Id: number;
  Date: string;
  [key: string]: any;
}

export interface AulaGalleryAlbum {
  Id: number;
  Title: string;
  CreatedDate: string;
  [key: string]: any;
}

export interface AulaAttachment {
  Id: number;
  Type: string;
  Name: string;
  DownloadUrl: string;
  ThumbnailUrl?: string;
}

export interface AulaWeekOverview {
  Id: number;
  WeekNumber: number;
  Year: number;
  [key: string]: any;
}

export interface AulaBookList {
  Id: number;
  WeekNumber: number;
  Year: number;
  [key: string]: any;
}

// ===== Configuration Types =====

export interface DynamoDBConfig {
  sessionIdTable: string;
  dailyOverviewTable: string;
  threadsTable: string;
  threadMessagesTable: string;
  calendarEventsTable: string;
  postsTable: string;
  weekOverviewTable: string;
  bookListTable: string;
  galleryAlbumsTable: string;
  derivedEventsTable: string;
  region?: string;
}

export interface DataRetrievalConfig {
  threadMessagesDays: number;
  postsDays: number;
  calendarEventsPast: number;
  calendarEventsFuture: number;
  galleryDays: number;
}

export interface AulaConfig {
  apiUrl: string;
}

export interface AttachmentsConfig {
  bucketName: string;
  tableName: string;
}

export interface LambdaConfig {
  dynamodb: DynamoDBConfig;
  dataRetrieval: DataRetrievalConfig;
  aula: AulaConfig;
  attachments?: AttachmentsConfig;
}

// ===== Data Structure Types =====

export interface AulaDataCollection {
  Aula: {
    Overview: { Overviews: AulaDailyOverview[] };
    Messages: { Threads: AulaThread[] };
    Calendar: { CalendarEvents: AulaCalendarEvent[] };
    Posts: { Posts: AulaPost[] };
    Gallery: { Albums: AulaGalleryAlbum[] };
  };
  MeeBook: {
    WorkPlan: { Weeks: AulaWeekOverview[] };
    BookList: { Weeks: AulaBookList[] };
  };
}

// ===== Save Result Types =====

export interface SaveResult {
  successful: number;
  failed: number;
  failedItems?: any[];
}

export interface BatchSaveResult {
  overviews: SaveResult;
  threads: SaveResult;
  messages: SaveResult;
  calendarEvents: SaveResult;
  posts: SaveResult;
  weekOverviews: SaveResult;
  bookLists: SaveResult;
  galleryAlbums: SaveResult;
}

// ===== Lambda Event Types =====

export interface LambdaEvent {
  // EventBridge scheduled event
  source?: string;
  'detail-type'?: string;
  time?: string;
  // Date range override (when invoked by orchestrator)
  dateRangeOverride?: DateRangeOverride;
  [key: string]: any;
}

export interface LambdaContext {
  functionName: string;
  functionVersion: string;
  invokedFunctionArn: string;
  memoryLimitInMB: string;
  awsRequestId: string;
  logGroupName: string;
  logStreamName: string;
  getRemainingTimeInMillis(): number;
  [key: string]: any;
}

// ===== Lambda Response Type =====

export interface LambdaResponse {
  statusCode: number;
  body: string;
}
