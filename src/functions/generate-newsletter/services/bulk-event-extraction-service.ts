/**
 * Bulk Event Extraction Service
 * Extracts events from ALL PARSED items (last 14 days) and deduplicates semantically
 *
 * Flow:
 * 1. Scan PARSED_posts and PARSED_threadMessages from last 14 days
 * 2. Extract events from each using Bedrock AI
 * 3. Compare each extracted event against existing DERIVED_EVENTS semantically
 * 4. If duplicate found: Merge information and update existing event
 * 5. If new event: Create new DERIVED_EVENT with unique ID
 */

import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ParsedDataAccess } from '../../../common/dynamodb/parsed-data-access';
import { DerivedEventsAccess } from '../../../common/dynamodb/derived-events-access';
import { BedrockService } from './bedrock-service';
import { EventSemanticMatcher } from './event-semantic-matcher';
import { BedrockPrompts } from './bedrock-prompts';
import {
  ParsedPost,
  ParsedThreadMessage,
  DerivedEventExtracted,
  ExtractedEventCandidate,
} from '../../../common/types';
import { logInfo, logError, logWarn } from '../../../common/utils';
import { randomUUID } from 'crypto';

export interface EventExtractionStats {
  postsScanned: number;
  messagesScanned: number;
  eventsExtracted: number;
  eventsCreated: number;
  eventsUpdated: number;
  eventsMerged: number;
  errors: number;
}

export class BulkEventExtractionService {
  private readonly prompts: BedrockPrompts;
  private readonly semanticMatcher: EventSemanticMatcher;

  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly parsedPostsTable: string,
    private readonly parsedMessagesTable: string,
    private readonly derivedEventsAccess: DerivedEventsAccess,
    private readonly bedrockService: BedrockService,
    private readonly modelId: string,
    private readonly promptContext: {
      parentNames: string;
      childName: string;
      messageFamilyNames: string;
    }
  ) {
    this.prompts = new BedrockPrompts(promptContext);
    this.semanticMatcher = new EventSemanticMatcher(bedrockService, promptContext);
  }

  /**
   * Extract and deduplicate events from all PARSED items (last 14 days)
   */
  async extractAndDeduplicateAllEvents(daysToProcess: number = 14): Promise<EventExtractionStats> {
    logInfo('Starting bulk event extraction and deduplication', { daysToProcess });

    const stats: EventExtractionStats = {
      postsScanned: 0,
      messagesScanned: 0,
      eventsExtracted: 0,
      eventsCreated: 0,
      eventsUpdated: 0,
      eventsMerged: 0,
      errors: 0,
    };

    try {
      // STEP 1: Get all existing events for comparison
      logInfo('Loading existing events for comparison');
      const existingEvents = await this.derivedEventsAccess.getAllEvents();
      logInfo(`Loaded ${existingEvents.length} existing events`);

      // STEP 2: Scan PARSED_posts from last 14 days
      logInfo('Scanning PARSED_posts from last 14 days');
      const parsedPosts = await this.scanParsedPosts(daysToProcess);
      stats.postsScanned = parsedPosts.length;
      logInfo(`Found ${parsedPosts.length} posts to process`);

      // STEP 3: Extract events from posts
      for (const post of parsedPosts) {
        try {
          // OPTIMIZATION: Check if we already extracted events from this post
          const alreadyExtracted = await this.derivedEventsAccess.hasEventsForPost(
            post.SourcePostId
          );

          if (alreadyExtracted) {
            logInfo(`Skipping post ${post.SourcePostId} - events already extracted`);
            continue; // Skip Bedrock call - we already processed this post
          }

          const extractedEvents = await this.extractEventsFromPost(post);
          stats.eventsExtracted += extractedEvents.length;

          // Process each extracted event
          for (const candidate of extractedEvents) {
            const result = await this.processEventCandidate(
              candidate,
              existingEvents,
              'posts'
            );

            if (result === 'created') stats.eventsCreated++;
            if (result === 'updated') stats.eventsUpdated++;
            if (result === 'merged') stats.eventsMerged++;
          }
        } catch (error) {
          stats.errors++;
          logError(`Failed to process post ${post.SourcePostId}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      // STEP 4: Scan PARSED_threadMessages from last 14 days
      logInfo('Scanning PARSED_threadMessages from last 14 days');
      const parsedMessages = await this.scanParsedMessages(daysToProcess);
      stats.messagesScanned = parsedMessages.length;
      logInfo(`Found ${parsedMessages.length} messages to process`);

      // STEP 5: Extract events from messages
      for (const message of parsedMessages) {
        try {
          // OPTIMIZATION: Check if we already extracted events from this message
          const alreadyExtracted = await this.derivedEventsAccess.hasEventsForMessage(
            message.SourceMessageId
          );

          if (alreadyExtracted) {
            logInfo(`Skipping message ${message.SourceMessageId} - events already extracted`);
            continue; // Skip Bedrock call - we already processed this message
          }

          const extractedEvents = await this.extractEventsFromMessage(message);
          stats.eventsExtracted += extractedEvents.length;

          // Process each extracted event
          for (const candidate of extractedEvents) {
            const result = await this.processEventCandidate(
              candidate,
              existingEvents,
              'messages'
            );

            if (result === 'created') stats.eventsCreated++;
            if (result === 'updated') stats.eventsUpdated++;
            if (result === 'merged') stats.eventsMerged++;
          }
        } catch (error) {
          stats.errors++;
          logError(`Failed to process message ${message.SourceMessageId}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logInfo('Bulk event extraction complete', stats);
      return stats;
    } catch (error) {
      logError('Bulk event extraction failed', {
        error: error instanceof Error ? error.message : String(error),
        stats,
      });
      return stats;
    }
  }

  /**
   * Scan PARSED_posts from last N days
   */
  private async scanParsedPosts(daysInPast: number): Promise<ParsedPost[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInPast);
    const cutoffIso = cutoffDate.toISOString();

    try {
      const response = await this.docClient.send(
        new ScanCommand({
          TableName: this.parsedPostsTable,
          FilterExpression: 'TranslatedAt >= :cutoffDate',
          ExpressionAttributeValues: {
            ':cutoffDate': cutoffIso,
          },
        })
      );

      return (response.Items || []) as ParsedPost[];
    } catch (error) {
      logError('Failed to scan PARSED_posts', { error });
      return [];
    }
  }

  /**
   * Scan PARSED_threadMessages from last N days
   */
  private async scanParsedMessages(daysInPast: number): Promise<ParsedThreadMessage[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysInPast);
    const cutoffIso = cutoffDate.toISOString();

    try {
      const response = await this.docClient.send(
        new ScanCommand({
          TableName: this.parsedMessagesTable,
          FilterExpression: 'TranslatedAt >= :cutoffDate',
          ExpressionAttributeValues: {
            ':cutoffDate': cutoffIso,
          },
        })
      );

      return (response.Items || []) as ParsedThreadMessage[];
    } catch (error) {
      logError('Failed to scan PARSED_threadMessages', { error });
      return [];
    }
  }

  /**
   * Extract events from a PARSED post using Bedrock
   */
  private async extractEventsFromPost(post: ParsedPost): Promise<ExtractedEventCandidate[]> {
    try {
      const extractionPrompt = this.prompts.getEventExtractionPromptForPost(
        post.TitleEnglish,
        post.ContentEnglish,
        post.SourceTimestamp
      );

      const extractionResult = await this.bedrockService.invoke(extractionPrompt);

      // Parse JSON array of events
      const events = this.parseEventExtractionResponse(extractionResult);

      // Convert to ExtractedEventCandidate format
      return events.map((event) => ({
        EventTitle: event.EventTitle,
        EventDescription: event.EventDescription,
        EventDate: event.EventDate,
        EventTime: event.EventTime,
        EventLocation: event.EventLocation,
        EventType: event.EventType,
        Confidence: event.Confidence,
        SourceType: 'post' as const,
        SourceId: post.SourcePostId,
        SourceTimestamp: post.SourceTimestamp,
      }));
    } catch (error) {
      logWarn(`Failed to extract events from post ${post.SourcePostId}`, { error });
      return [];
    }
  }

  /**
   * Extract events from a PARSED message using Bedrock
   */
  private async extractEventsFromMessage(
    message: ParsedThreadMessage
  ): Promise<ExtractedEventCandidate[]> {
    try {
      const extractionPrompt = this.prompts.getEventExtractionPromptForMessage(
        message.MessageTextEnglish,
        message.SentDate,
        message.SenderFullName
      );

      const extractionResult = await this.bedrockService.invoke(extractionPrompt);

      // Parse JSON array of events
      const events = this.parseEventExtractionResponse(extractionResult);

      // Convert to ExtractedEventCandidate format
      return events.map((event) => ({
        EventTitle: event.EventTitle,
        EventDescription: event.EventDescription,
        EventDate: event.EventDate,
        EventTime: event.EventTime,
        EventLocation: event.EventLocation,
        EventType: event.EventType,
        Confidence: event.Confidence,
        SourceType: 'message' as const,
        SourceId: message.SourceMessageId,
        SourceTimestamp: message.SentDate,
      }));
    } catch (error) {
      logWarn(`Failed to extract events from message ${message.SourceMessageId}`, { error });
      return [];
    }
  }

  /**
   * Process an extracted event candidate:
   * - Compare semantically against existing events WITH THE SAME DATE (optimization)
   * - If duplicate: Merge and update
   * - If new: Create new event
   */
  private async processEventCandidate(
    candidate: ExtractedEventCandidate,
    existingEvents: DerivedEventExtracted[],
    targetTable: 'posts' | 'messages'
  ): Promise<'created' | 'updated' | 'merged' | 'skipped'> {
    try {
      // OPTIMIZATION: Only compare against events with the same date
      // This reduces N:N comparison to a much smaller subset
      // If an event's date changes, we may create a duplicate, but that's acceptable
      const candidateDate = this.normalizeDate(candidate.EventDate);
      const sameDateEvents = existingEvents.filter((event) => {
        const eventDate = this.normalizeDate(event.EventDate);
        return eventDate === candidateDate;
      });

      logInfo('Filtering events by date for comparison', {
        candidateDate,
        totalExistingEvents: existingEvents.length,
        sameDateEvents: sameDateEvents.length,
        candidateTitle: candidate.EventTitle,
      });

      // Search for semantic match in same-date events only
      let matchedEvent: DerivedEventExtracted | null = null;

      for (const existingEvent of sameDateEvents) {
        const comparisonResult = await this.semanticMatcher.areEventsTheSame(
          candidate,
          existingEvent
        );

        if (comparisonResult.isSameEvent && comparisonResult.confidence !== 'low') {
          matchedEvent = existingEvent;
          logInfo('Found matching event', {
            candidateTitle: candidate.EventTitle,
            matchedEventId: existingEvent.Id,
            confidence: comparisonResult.confidence,
          });
          break;
        }
      }

      if (matchedEvent) {
        // DUPLICATE FOUND - Merge and update
        const mergeResult = await this.semanticMatcher.mergeEvents(matchedEvent, candidate);

        // Update existing event with merged information
        const updatedEvent: Partial<DerivedEventExtracted> = {
          EventTitle: mergeResult.EventTitle,
          EventDate: mergeResult.EventDate,
          EventTime: mergeResult.EventTime,
          EventLocation: mergeResult.EventLocation,
          EventDescription: mergeResult.EventDescription,
          EventType: mergeResult.EventType,
          MergeNotes: mergeResult.MergeNotes,
          LastUpdatedAt: new Date().toISOString(),
          LastUpdatedBySource:
            candidate.SourceType === 'post'
              ? `post-${candidate.SourceId}`
              : `message-${candidate.SourceId}`,
          UpdateCount: (matchedEvent.UpdateCount || 0) + 1,
        };

        // Add this source to the source lists if not already there
        if (candidate.SourceType === 'post') {
          const postId = candidate.SourceId as number;
          if (!matchedEvent.SourcePostIds.includes(postId)) {
            updatedEvent.SourcePostIds = [...matchedEvent.SourcePostIds, postId];
          }
        } else {
          const messageId = candidate.SourceId as string;
          if (!matchedEvent.SourceMessageIds.includes(messageId)) {
            updatedEvent.SourceMessageIds = [...matchedEvent.SourceMessageIds, messageId];
          }
        }

        // Determine which table the matched event is in
        const eventTable = matchedEvent.SourcePostIds.length > 0 ? 'posts' : 'messages';
        await this.derivedEventsAccess.updateEvent(matchedEvent.Id, updatedEvent, eventTable);

        logInfo('Updated existing event', {
          eventId: matchedEvent.Id,
          mergeNotes: mergeResult.MergeNotes,
        });

        return 'merged';
      } else {
        // NEW EVENT - Create new record
        const eventId = `event-${randomUUID()}`;
        const now = new Date().toISOString();

        const newEvent: DerivedEventExtracted = {
          Id: eventId,
          EventTitle: candidate.EventTitle,
          EventDescription: candidate.EventDescription,
          EventDate: candidate.EventDate,
          EventTime: candidate.EventTime,
          EventLocation: candidate.EventLocation,
          EventType: candidate.EventType,
          Confidence: candidate.Confidence,
          SourcePostIds: candidate.SourceType === 'post' ? [candidate.SourceId as number] : [],
          SourceMessageIds:
            candidate.SourceType === 'message' ? [candidate.SourceId as string] : [],
          SourceThreadIds: [],
          FirstMentionedAt: now,
          LastUpdatedAt: now,
          LastUpdatedBySource:
            candidate.SourceType === 'post'
              ? `post-${candidate.SourceId}`
              : `message-${candidate.SourceId}`,
          UpdateCount: 0,
          ExtractedAt: now,
          ExtractionModel: this.modelId,
          ttl: 0, // Will be set by DerivedEventsAccess
        };

        await this.derivedEventsAccess.saveDeduplicatedEvent(newEvent, targetTable);

        // Add to existingEvents array for future comparisons in this run
        existingEvents.push(newEvent);

        logInfo('Created new event', {
          eventId,
          eventTitle: newEvent.EventTitle,
          eventDate: newEvent.EventDate,
        });

        return 'created';
      }
    } catch (error) {
      logError('Failed to process event candidate', {
        error: error instanceof Error ? error.message : String(error),
        candidateTitle: candidate.EventTitle,
      });
      return 'skipped';
    }
  }

  /**
   * Parse event extraction response from AI (JSON array)
   */
  private parseEventExtractionResponse(response: string): any[] {
    try {
      // Remove markdown code blocks if present
      let cleaned = response.trim();
      cleaned = cleaned.replace(/^```json\s*/gm, '');
      cleaned = cleaned.replace(/^```\s*/gm, '');
      cleaned = cleaned.trim();

      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed)) {
        logWarn('AI did not return array for event extraction', { response: cleaned });
        return [];
      }

      // Validate each event has required fields
      const validEvents = parsed.filter((event) => {
        return event.EventTitle && event.EventDescription && event.EventDate;
      });

      if (validEvents.length !== parsed.length) {
        logWarn(`Filtered out ${parsed.length - validEvents.length} invalid events`);
      }

      return validEvents;
    } catch (error) {
      logWarn('Failed to parse event extraction response as JSON', { error, response });
      return [];
    }
  }

  /**
   * Normalize a date string to YYYY-MM-DD format for consistent comparison
   * Handles various date formats (ISO, partial dates, etc.)
   */
  private normalizeDate(dateString: string): string {
    if (!dateString) {
      return '';
    }

    try {
      // If it's already in YYYY-MM-DD format, return as-is
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return dateString;
      }

      // Try to parse as ISO date
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        // Convert to YYYY-MM-DD
        return date.toISOString().split('T')[0];
      }

      // If parsing fails, return original (will likely not match anything)
      logWarn('Could not normalize date, using original', { dateString });
      return dateString;
    } catch (error) {
      logWarn('Error normalizing date', { dateString, error });
      return dateString;
    }
  }
}
