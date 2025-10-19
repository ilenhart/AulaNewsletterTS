/**
 * Data access layer for DERIVED_EVENTS tables
 * Handles caching logic for AI-extracted events
 */

import {
  DynamoDBDocumentClient,
  ScanCommand,
  BatchWriteCommand,
  DeleteCommand,
} from '@aws-sdk/lib-dynamodb';
import { DerivedEventExtracted } from '../types';
import { logInfo, logWarn, logError, chunk } from '../utils';

export class DerivedEventsAccess {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly eventsFromPostsTable: string,
    private readonly eventsFromMessagesTable: string
  ) {}

  /**
   * Get all derived events for a post
   * Returns empty array if none found
   * @deprecated Use BulkEventExtractionService for new semantic deduplication flow
   */
  async getEventsForPost(
    sourcePostId: number,
    sourceTimestamp: string
  ): Promise<DerivedEventExtracted[]> {
    // This method is deprecated but kept for backward compatibility
    // The new schema doesn't have SourceTimestamp at top level
    // Just return events for this source post ID
    try {
      const response = await this.docClient.send(
        new ScanCommand({
          TableName: this.eventsFromPostsTable,
          FilterExpression: 'contains(SourcePostIds, :postId)',
          ExpressionAttributeValues: {
            ':postId': sourcePostId,
          },
        })
      );

      const events = (response.Items || []) as DerivedEventExtracted[];
      logInfo(`Found ${events.length} events for post ${sourcePostId}`);
      return events;
    } catch (error) {
      logWarn(`Error retrieving events for post ${sourcePostId}`, { error });
      return [];
    }
  }

  /**
   * Get all derived events for a message
   * Returns empty array if none found
   * @deprecated Use BulkEventExtractionService for new semantic deduplication flow
   */
  async getEventsForMessage(
    sourceMessageId: string,
    sentDate: string
  ): Promise<DerivedEventExtracted[]> {
    // This method is deprecated but kept for backward compatibility
    // The new schema doesn't have SentDate at top level
    // Just return events for this source message ID
    try {
      const response = await this.docClient.send(
        new ScanCommand({
          TableName: this.eventsFromMessagesTable,
          FilterExpression: 'contains(SourceMessageIds, :messageId)',
          ExpressionAttributeValues: {
            ':messageId': sourceMessageId,
          },
        })
      );

      const events = (response.Items || []) as DerivedEventExtracted[];
      logInfo(`Found ${events.length} events for message ${sourceMessageId}`);
      return events;
    } catch (error) {
      logWarn(`Error retrieving events for message ${sourceMessageId}`, { error });
      return [];
    }
  }

  /**
   * Save multiple derived events from a post
   * @deprecated Use BulkEventExtractionService.saveDeduplicatedEvent for new schema
   */
  async saveEventsForPost(
    sourcePostId: number,
    sourceTimestamp: string,
    events: Partial<DerivedEventExtracted>[],
    extractionModel: string
  ): Promise<void> {
    if (events.length === 0) {
      logInfo(`No events to save for post ${sourcePostId}`);
      return;
    }

    try {
      logInfo(`Attempting to save ${events.length} events for post ${sourcePostId}`, {
        tableName: this.eventsFromPostsTable,
        eventCount: events.length,
      });

      const now = new Date().toISOString();

      const items = events.map((event, index) => ({
        Id: `post-${sourcePostId}-event-${index + 1}`,
        SourcePostIds: [sourcePostId],
        SourceMessageIds: [],
        SourceThreadIds: [],
        FirstMentionedAt: now,
        LastUpdatedAt: now,
        LastUpdatedBySource: `post-${sourcePostId}`,
        UpdateCount: 0,
        ...event,
        ExtractedAt: now,
        ExtractionModel: extractionModel,
        ttl: this.calculateTTL(),
      }));

      // Batch write in chunks of 25 (DynamoDB limit)
      const batches = chunk(items, 25);

      for (const batch of batches) {
        await this.docClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [this.eventsFromPostsTable]: batch.map((item) => ({
                PutRequest: { Item: item },
              })),
            },
          })
        );
      }

      logInfo(`Successfully saved ${items.length} events for post ${sourcePostId}`);
    } catch (error) {
      logError(`CRITICAL: Failed to save events for post ${sourcePostId}`, {
        error: error instanceof Error ? error.message : String(error),
        tableName: this.eventsFromPostsTable,
        postId: sourcePostId,
        eventCount: events.length,
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Don't throw - caching failures should not break the flow
    }
  }

  /**
   * Save multiple derived events from a message
   * @deprecated Use BulkEventExtractionService.saveDeduplicatedEvent for new schema
   */
  async saveEventsForMessage(
    sourceMessageId: string,
    sourceThreadId: number,
    sentDate: string,
    events: Partial<DerivedEventExtracted>[],
    extractionModel: string
  ): Promise<void> {
    if (events.length === 0) {
      logInfo(`No events to save for message ${sourceMessageId}`);
      return;
    }

    try {
      logInfo(`Attempting to save ${events.length} events for message ${sourceMessageId}`, {
        tableName: this.eventsFromMessagesTable,
        eventCount: events.length,
      });

      const now = new Date().toISOString();

      const items = events.map((event, index) => ({
        Id: `message-${sourceMessageId}-event-${index + 1}`,
        SourcePostIds: [],
        SourceMessageIds: [sourceMessageId],
        SourceThreadIds: [sourceThreadId],
        FirstMentionedAt: now,
        LastUpdatedAt: now,
        LastUpdatedBySource: `message-${sourceMessageId}`,
        UpdateCount: 0,
        ...event,
        ExtractedAt: now,
        ExtractionModel: extractionModel,
        ttl: this.calculateTTL(),
      }));

      // Batch write in chunks of 25 (DynamoDB limit)
      const batches = chunk(items, 25);

      for (const batch of batches) {
        await this.docClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [this.eventsFromMessagesTable]: batch.map((item) => ({
                PutRequest: { Item: item },
              })),
            },
          })
        );
      }

      logInfo(`Successfully saved ${items.length} events for message ${sourceMessageId}`);
    } catch (error) {
      logError(`CRITICAL: Failed to save events for message ${sourceMessageId}`, {
        error: error instanceof Error ? error.message : String(error),
        tableName: this.eventsFromMessagesTable,
        messageId: sourceMessageId,
        eventCount: events.length,
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Don't throw - caching failures should not break the flow
    }
  }

  /**
   * Delete all events for a post (used when cache is stale)
   */
  private async deleteEventsForPost(sourcePostId: number): Promise<void> {
    try {
      const response = await this.docClient.send(
        new ScanCommand({
          TableName: this.eventsFromPostsTable,
          FilterExpression: 'SourcePostId = :postId',
          ExpressionAttributeValues: {
            ':postId': sourcePostId,
          },
        })
      );

      const items = response.Items || [];

      for (const item of items) {
        await this.docClient.send(
          new DeleteCommand({
            TableName: this.eventsFromPostsTable,
            Key: { Id: item.Id },
          })
        );
      }

      logInfo(`Deleted ${items.length} stale events for post ${sourcePostId}`);
    } catch (error) {
      logWarn(`Error deleting events for post ${sourcePostId}`, { error });
    }
  }

  /**
   * Delete all events for a message (used when cache is stale)
   */
  private async deleteEventsForMessage(sourceMessageId: string): Promise<void> {
    try {
      const response = await this.docClient.send(
        new ScanCommand({
          TableName: this.eventsFromMessagesTable,
          FilterExpression: 'SourceMessageId = :messageId',
          ExpressionAttributeValues: {
            ':messageId': sourceMessageId,
          },
        })
      );

      const items = response.Items || [];

      for (const item of items) {
        await this.docClient.send(
          new DeleteCommand({
            TableName: this.eventsFromMessagesTable,
            Key: { Id: item.Id },
          })
        );
      }

      logInfo(`Deleted ${items.length} stale events for message ${sourceMessageId}`);
    } catch (error) {
      logWarn(`Error deleting events for message ${sourceMessageId}`, { error });
    }
  }

  /**
   * Get ALL events from both tables (for semantic deduplication)
   * Optionally filter by date range
   */
  async getAllEvents(daysInPast?: number): Promise<DerivedEventExtracted[]> {
    try {
      let filterExpression: string | undefined;
      let expressionAttributeValues: any | undefined;

      if (daysInPast) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysInPast);
        const cutoffIso = cutoffDate.toISOString();

        filterExpression = 'FirstMentionedAt >= :cutoffDate';
        expressionAttributeValues = {
          ':cutoffDate': cutoffIso,
        };
      }

      const [postsEvents, messagesEvents] = await Promise.all([
        this.docClient.send(
          new ScanCommand({
            TableName: this.eventsFromPostsTable,
            FilterExpression: filterExpression,
            ExpressionAttributeValues: expressionAttributeValues,
          })
        ),
        this.docClient.send(
          new ScanCommand({
            TableName: this.eventsFromMessagesTable,
            FilterExpression: filterExpression,
            ExpressionAttributeValues: expressionAttributeValues,
          })
        ),
      ]);

      const allEvents = [
        ...(postsEvents.Items || []),
        ...(messagesEvents.Items || []),
      ] as DerivedEventExtracted[];

      logInfo(`Retrieved ${allEvents.length} total events`, {
        postsEvents: postsEvents.Items?.length || 0,
        messagesEvents: messagesEvents.Items?.length || 0,
        daysInPast,
      });

      return allEvents;
    } catch (error) {
      logError('Failed to retrieve all events', { error });
      return [];
    }
  }

  /**
   * Save a deduplicated event (with new schema supporting multiple sources)
   */
  async saveDeduplicatedEvent(
    event: DerivedEventExtracted,
    targetTable: 'posts' | 'messages'
  ): Promise<void> {
    try {
      const tableName =
        targetTable === 'posts' ? this.eventsFromPostsTable : this.eventsFromMessagesTable;

      await this.docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: [
              {
                PutRequest: {
                  Item: {
                    ...event,
                    ttl: this.calculateTTL(),
                  },
                },
              },
            ],
          },
        })
      );

      logInfo(`Saved deduplicated event ${event.Id}`, {
        table: tableName,
        eventTitle: event.EventTitle,
      });
    } catch (error) {
      logError(`Failed to save deduplicated event ${event.Id}`, {
        error: error instanceof Error ? error.message : String(error),
        eventId: event.Id,
      });
    }
  }

  /**
   * Update an existing event (used when merging new information)
   */
  async updateEvent(
    eventId: string,
    updates: Partial<DerivedEventExtracted>,
    targetTable: 'posts' | 'messages'
  ): Promise<void> {
    try {
      const tableName =
        targetTable === 'posts' ? this.eventsFromPostsTable : this.eventsFromMessagesTable;

      // First get the existing event
      const scanResult = await this.docClient.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: 'Id = :id',
          ExpressionAttributeValues: {
            ':id': eventId,
          },
        })
      );

      if (!scanResult.Items || scanResult.Items.length === 0) {
        logWarn(`Event ${eventId} not found for update`);
        return;
      }

      const existingEvent = scanResult.Items[0] as DerivedEventExtracted;

      // Merge updates with existing
      const updatedEvent = {
        ...existingEvent,
        ...updates,
        ttl: this.calculateTTL(), // Refresh TTL
      };

      // Save updated event
      await this.docClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: [
              {
                PutRequest: {
                  Item: updatedEvent,
                },
              },
            ],
          },
        })
      );

      logInfo(`Updated event ${eventId}`, {
        table: tableName,
        updateCount: existingEvent.UpdateCount + 1,
      });
    } catch (error) {
      logError(`Failed to update event ${eventId}`, {
        error: error instanceof Error ? error.message : String(error),
        eventId,
      });
    }
  }

  /**
   * Delete an event by its ID
   */
  async deleteEvent(eventId: string, targetTable: 'posts' | 'messages'): Promise<void> {
    try {
      const tableName =
        targetTable === 'posts' ? this.eventsFromPostsTable : this.eventsFromMessagesTable;

      await this.docClient.send(
        new DeleteCommand({
          TableName: tableName,
          Key: { Id: eventId },
        })
      );

      logInfo(`Deleted event ${eventId}`, { table: tableName });
    } catch (error) {
      logWarn(`Error deleting event ${eventId}`, { error });
    }
  }

  /**
   * Check if events have already been extracted from a post
   * Used to avoid re-extracting events from the same post multiple times
   * @param sourcePostId - The ID of the post to check
   * @returns true if any events exist with this sourcePostId, false otherwise
   */
  async hasEventsForPost(sourcePostId: number): Promise<boolean> {
    try {
      const response = await this.docClient.send(
        new ScanCommand({
          TableName: this.eventsFromPostsTable,
          FilterExpression: 'contains(SourcePostIds, :postId)',
          ExpressionAttributeValues: {
            ':postId': sourcePostId,
          },
          Select: 'COUNT', // Only return count, not items
        })
      );

      const hasEvents = (response.Count || 0) > 0;
      logInfo(`Post ${sourcePostId} has ${response.Count || 0} existing events`);
      return hasEvents;
    } catch (error) {
      logWarn(`Error checking events for post ${sourcePostId}`, { error });
      // On error, assume no events exist (safe to extract)
      return false;
    }
  }

  /**
   * Check if events have already been extracted from a message
   * Used to avoid re-extracting events from the same message multiple times
   * @param sourceMessageId - The ID of the message to check
   * @returns true if any events exist with this sourceMessageId, false otherwise
   */
  async hasEventsForMessage(sourceMessageId: string): Promise<boolean> {
    try {
      const response = await this.docClient.send(
        new ScanCommand({
          TableName: this.eventsFromMessagesTable,
          FilterExpression: 'contains(SourceMessageIds, :messageId)',
          ExpressionAttributeValues: {
            ':messageId': sourceMessageId,
          },
          Select: 'COUNT', // Only return count, not items
        })
      );

      const hasEvents = (response.Count || 0) > 0;
      logInfo(`Message ${sourceMessageId} has ${response.Count || 0} existing events`);
      return hasEvents;
    } catch (error) {
      logWarn(`Error checking events for message ${sourceMessageId}`, { error });
      // On error, assume no events exist (safe to extract)
      return false;
    }
  }

  /**
   * Calculate TTL for 2 months from now
   */
  private calculateTTL(): number {
    const twoMonthsFromNow = new Date();
    twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);
    return Math.floor(twoMonthsFromNow.getTime() / 1000);
  }
}
