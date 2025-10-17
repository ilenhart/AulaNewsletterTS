/**
 * Shared TypeScript type definitions for all Aula Newsletter Lambdas
 */

// ===== Aula Data Types (Used across lambdas) =====

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
  SentToUs?: boolean;
  ContainsFlaggedFamilyName?: boolean;
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
  Content?: string;
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

// ===== Session Types =====

export interface AulaSession {
  Id: number;
  sessionId: string;
  lastUpdated: string;
  ttl: number;
  created?: string; // ISO 8601 timestamp when this sessionId was first created
}

// ===== Configuration Types =====

export interface DynamoDBConfig {
  sessionIdTable: string;
  dailyOverviewTable?: string;
  threadsTable?: string;
  threadMessagesTable?: string;
  calendarEventsTable?: string;
  postsTable?: string;
  weekOverviewTable?: string;
  bookListTable?: string;
  galleryAlbumsTable?: string;
  derivedEventsTable?: string;
  region?: string;
}

export interface AWSConfig {
  region?: string;
  credentials?: {
    accessKeyId: string;
    secretAccessKey: string;
  };
}

// ===== Lambda Event/Response Types =====

export interface LambdaEvent {
  source?: string;
  'detail-type'?: string;
  time?: string;
  resources?: string[];
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

export interface LambdaResponse {
  statusCode: number;
  body: string;
}

// ===== Newsletter-Specific Types =====

export interface AttachmentGroup {
  threadSubject?: string;
  postSubject?: string;
  attachments: AulaAttachment[];
}

export interface DerivedEvent {
  Id?: number;
  dateTime: Date;
  hours: string;
  location: string;
  type: string;
  details: string;
  asks: string;
}

// ===== Execution Statistics =====

export interface ExecutionStats {
  startTime: Date;
  endTime?: Date;
  itemsProcessed: number;
  itemsSuccessful: number;
  itemsFailed: number;
}

// ===== Save Results =====

export interface SaveResult {
  successful: number;
  failed: number;
  failedItems?: any[];
}
