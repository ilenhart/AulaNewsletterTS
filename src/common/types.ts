/**
 * Shared TypeScript type definitions for all Aula Newsletter Lambdas
 */

// ===== Date Range Override (For On-Demand Newsletter Generation) =====

/**
 * Date range override for on-demand newsletter generation via API
 * Allows API calls to override default date ranges for both lambdas
 */
export interface DateRangeOverride {
  lastNumberOfDays?: number;  // Days in past (threads, posts, calendar past, gallery)
  futureDays?: number;         // Days in future (calendar events only)
}

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

// ===== Attachment Metadata Types =====

export interface AttachmentMetadata {
  AttachmentId: string; // Format: "post-{postId}-{attachmentId}" or "message-{messageId}-{attachmentId}"
  PostId: number | null; // Set if attachment is from a post
  MessageId: string | null; // Set if attachment is from a message
  AttachmentType: 'image' | 'file';
  FileName: string;
  OriginalUrl: string;
  S3Key: string;
  S3Bucket: string;
  DownloadedAt: string; // ISO 8601 timestamp
  FileSize?: number; // Bytes
  ContentType?: string; // MIME type
  ttl: number; // TTL for automatic deletion (1 year from download)
}

// ===== Session Types =====

export interface AulaSession {
  Id: number;
  sessionId: string;
  lastUpdated: string;
  ttl: number;
  created?: string; // ISO 8601 timestamp when this sessionId was first created
  lastUsedSuccessfully?: string; // ISO 8601 timestamp when session was last used successfully
  lastUsedFailure?: string; // ISO 8601 timestamp when session first failed (captures first failure only)
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
  // PARSED tables - translated content with caching
  parsedPostsTable?: string;
  parsedThreadMessagesTable?: string;
  parsedThreadsTable?: string;
  // DERIVED tables - AI-extracted events
  derivedEventsFromPostsTable?: string;
  derivedEventsFromMessagesTable?: string;
  // Newsletter snapshots
  newsletterSnapshotsTable?: string;
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

// ===== PARSED Table Types =====

/**
 * PARSED_posts table - Cached translations of RAW_posts
 */
export interface ParsedPost {
  Id: string;                    // Format: "post-{sourcePostId}"
  SourcePostId: number;          // Links to RAW_posts.Id
  SourceTimestamp: string;       // RAW_posts.Timestamp (detect if source changed)
  TitleOriginal: string;         // Original Danish title
  TitleEnglish: string;          // Translated title
  ContentOriginal: string;       // Original Danish content
  ContentEnglish: string;        // Translated content
  Author: string;                // From RAW_posts
  AuthorRole: string;            // From RAW_posts
  TranslatedAt: string;          // ISO timestamp when translation occurred
  TranslationModel: string;      // e.g., "anthropic.claude-3-sonnet-20240229-v1:0"
  ttl: number;                   // 1 month expiration (align with RAW data)
}

/**
 * PARSED_threadMessages table - Cached translations of RAW_threadMessages
 */
export interface ParsedThreadMessage {
  Id: string;                    // Format: "message-{sourceMessageId}"
  SourceMessageId: string;       // Links to RAW_threadMessages.Id (STRING!)
  SourceThreadId: number;        // Thread this message belongs to
  SentDate: string;              // From RAW_threadMessages
  SenderFullName: string;        // From sender object
  SenderRole: string;            // From sender object
  MessageTextOriginal: string;   // Original Danish text
  MessageTextEnglish: string;    // Translated text
  TranslatedAt: string;          // ISO timestamp
  TranslationModel: string;      // Model used for translation
  ttl: number;                   // 1 month expiration
}

/**
 * PARSED_threads table - Cached translations of RAW_threads metadata
 */
export interface ParsedThread {
  Id: string;                    // Format: "thread-{sourceThreadId}"
  SourceThreadId: number;        // Links to RAW_threads.Id
  SubjectOriginal: string;       // Original Danish subject
  SubjectEnglish: string;        // Translated subject
  TranslatedAt: string;          // ISO timestamp when translation occurred
  TranslationModel: string;      // e.g., "anthropic.claude-3-sonnet-20240229-v1:0"
  ttl: number;                   // 1 month expiration (align with RAW data)
}

// ===== DERIVED_EVENTS Table Types =====

/**
 * DERIVED_EVENTS_FromPosts and DERIVED_EVENTS_FromMessages tables
 * AI-extracted events from posts and messages
 *
 * NEW SCHEMA: Events are deduplicated across sources
 * - Same real-world event mentioned in multiple posts/messages = ONE record
 * - Multiple sources tracked in SourcePostIds/SourceMessageIds arrays
 * - Events can be updated as new information arrives
 */
export interface DerivedEventExtracted {
  Id: string;                    // Unique event ID: "event-{uuid}" or "event-{date}-{hash}"

  // Extracted event details
  EventTitle: string;            // AI-extracted event title
  EventDescription: string;      // AI-extracted description
  EventDate: string;             // AI-extracted date (ISO format when possible)
  EventTime?: string;            // AI-extracted time if available
  EventLocation?: string;        // AI-extracted location
  EventType?: string;            // e.g., "field_trip", "meeting", "deadline", "celebration"

  // Multiple source tracking (event may be mentioned in multiple posts/messages)
  SourcePostIds: number[];       // All posts mentioning this event
  SourceMessageIds: string[];    // All messages mentioning this event (STRING!)
  SourceThreadIds: number[];     // All threads mentioning this event

  // Update tracking
  FirstMentionedAt: string;      // ISO timestamp when first discovered
  LastUpdatedAt: string;         // ISO timestamp of most recent update
  LastUpdatedBySource: string;   // Format: "post-123" or "message-abc"
  UpdateCount: number;           // How many times this event has been updated
  MergeNotes?: string;           // AI-generated notes about what changed during merges

  // Metadata
  ExtractedAt: string;           // ISO timestamp when first extracted
  ExtractionModel: string;       // Model used for extraction
  Confidence?: 'high' | 'medium' | 'low'; // AI confidence level
  RawExtractionText?: string;    // Full AI response (for debugging/reprocessing)

  ttl: number;                   // 2 month expiration
}

/**
 * Temporary event structure during extraction (before deduplication)
 * Used internally during event extraction process
 */
export interface ExtractedEventCandidate {
  EventTitle: string;
  EventDescription: string;
  EventDate: string;
  EventTime?: string;
  EventLocation?: string;
  EventType?: string;
  Confidence?: 'high' | 'medium' | 'low';
  SourceType: 'post' | 'message';
  SourceId: number | string;     // Post ID or Message ID
  SourceTimestamp: string;       // When source was created
}

/**
 * Unified event representation for newsletter generation
 * Combines events from RAW_calendarEvents and DERIVED_EVENTS tables
 * Used for real-time deduplication in newsletter (not persisted to database)
 */
export interface UnifiedEvent {
  // Event details
  EventTitle: string;
  EventDescription: string;
  EventDate: string;
  EventTime?: string;
  EventLocation?: string;
  EventType?: string;

  // Source tracking
  SourceType: 'calendar' | 'derived_post' | 'derived_message';
  SourceConfidence: 'high' | 'medium' | 'low';
  SourceIds: string[];  // Can have multiple if merged from different sources

  // Calendar-specific fields
  CalendarEventId?: number;
  CreatorName?: string;
  StartDate?: string;
  EndDate?: string;

  // Derived-specific fields
  DerivedEventId?: string;
  ExtractedFrom?: string[];  // Post IDs, Message IDs that mentioned this event
  UpdateCount?: number;

  // For deduplication tracking
  MergedFrom?: string[];  // IDs of events that were merged into this one
}

// ===== Newsletter Structure Types =====

/**
 * Important information item in the newsletter
 */
export interface NewsletterImportantInfo {
  type: 'health_alert' | 'policy_change' | 'deadline' | 'family_mention' | 'urgent_request';
  description: string;
  source: string;
  createdAt?: string;  // ISO timestamp - for expiration rules (Phase 2)
  deadline?: string;   // ISO date - for deadline items (Phase 2)
  isNew?: boolean;     // Phase 3: Item added today
}

/**
 * Event in the newsletter
 */
export interface NewsletterEvent {
  title: string;
  date: string;  // YYYY-MM-DD
  time?: string;  // HH:MM
  location?: string;
  description: string;
  whoShouldAttend?: string;
  requirements?: string[];
  source?: string;
  isNew?: boolean;        // Phase 3: Event added today
  isUpdated?: boolean;    // Phase 3: Event details changed
  changes?: string[];     // Phase 3: List of what changed (e.g., "Time changed from 3pm to 4pm")
}

/**
 * Thread summary in the newsletter
 */
export interface NewsletterThreadSummary {
  title: string;
  summary: string;
  tone: 'happy' | 'friendly' | 'informational' | 'concerned' | 'contentious' | 'urgent';
}

/**
 * Complete newsletter structure from Bedrock JSON response
 */
export interface NewsletterStructure {
  importantInformation: NewsletterImportantInfo[];
  generalReminders: string[];  // NEW: Non-critical actionable items
  upcomingEvents: NewsletterEvent[];
  weeklyHighlights: string[];
  threadSummaries: NewsletterThreadSummary[];
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

// ===== Newsletter Snapshot Types =====

/**
 * Processed IDs from a newsletter snapshot
 * Tracks which items have already been processed to avoid reprocessing
 */
export interface ProcessedItemIds {
  postIds: number[];        // RAW_posts.Id values
  messageIds: string[];     // RAW_threadMessages.Id values (STRING!)
  eventIds: string[];       // DerivedEvent IDs or CalendarEvent IDs
  derivedEventIds: string[]; // DERIVED_EVENTS IDs
}

/**
 * Newsletter snapshot stored in DynamoDB
 * Contains the full newsletter structure and metadata for incremental generation
 */
export interface NewsletterSnapshot {
  SnapshotDate: string;           // Partition key: YYYY-MM-DD format
  GeneratedAt: string;            // ISO 8601 timestamp when newsletter was generated
  NewsletterJson: NewsletterStructure; // Full newsletter structure
  ProcessedItemIds: ProcessedItemIds;  // IDs of items already processed
  ProcessingStats?: {             // Statistics from this generation (Phase 2)
    postsProcessed: number;
    messagesProcessed: number;
    eventsExtracted: number;
    bedrockCalls: number;         // Track API usage for cost monitoring
  };
  ttl: number;                    // Auto-expire after 60 days
}
