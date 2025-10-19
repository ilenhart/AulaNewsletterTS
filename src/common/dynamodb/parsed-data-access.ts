/**
 * Data access layer for PARSED tables
 * Handles caching logic for translated content
 */

import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ParsedPost, ParsedThreadMessage, ParsedThread } from '../types';
import { logInfo, logWarn, logError } from '../utils';

export class ParsedDataAccess {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly parsedPostsTable: string,
    private readonly parsedMessagesTable: string,
    private readonly parsedThreadsTable?: string
  ) {}

  /**
   * Get parsed post by source ID
   * Returns null if not found or stale (source was updated after translation)
   */
  async getParsedPost(sourcePostId: number, sourceTimestamp: string): Promise<ParsedPost | null> {
    try {
      const response = await this.docClient.send(
        new GetCommand({
          TableName: this.parsedPostsTable,
          Key: { Id: `post-${sourcePostId}` },
        })
      );

      if (!response.Item) {
        logInfo(`No cached translation found for post ${sourcePostId}`);
        return null;
      }

      // Check if stale (source was updated after translation)
      if (response.Item.SourceTimestamp !== sourceTimestamp) {
        logInfo(`Cached translation for post ${sourcePostId} is stale`, {
          cachedTimestamp: response.Item.SourceTimestamp,
          currentTimestamp: sourceTimestamp,
        });
        return null;
      }

      logInfo(`Found cached translation for post ${sourcePostId}`);
      return response.Item as ParsedPost;
    } catch (error) {
      logWarn(`Error retrieving parsed post ${sourcePostId}`, { error });
      return null;
    }
  }

  /**
   * Save parsed post to cache
   */
  async saveParsedPost(parsedPost: ParsedPost): Promise<void> {
    try {
      logInfo(`Attempting to save parsed post to cache`, {
        postId: parsedPost.SourcePostId,
        tableName: this.parsedPostsTable,
        id: parsedPost.Id,
      });

      await this.docClient.send(
        new PutCommand({
          TableName: this.parsedPostsTable,
          Item: {
            ...parsedPost,
            ttl: this.calculateTTL(),
          },
        })
      );

      logInfo(`Successfully saved parsed post to cache`, { postId: parsedPost.SourcePostId });
    } catch (error) {
      logError(`CRITICAL: Failed to save parsed post ${parsedPost.SourcePostId}`, {
        error: error instanceof Error ? error.message : String(error),
        tableName: this.parsedPostsTable,
        postId: parsedPost.SourcePostId,
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Don't throw - caching failures should not break the flow
    }
  }

  /**
   * Get parsed message by source ID
   * Returns null if not found or stale
   */
  async getParsedMessage(
    sourceMessageId: string,
    sentDate: string
  ): Promise<ParsedThreadMessage | null> {
    try {
      const response = await this.docClient.send(
        new GetCommand({
          TableName: this.parsedMessagesTable,
          Key: { Id: `message-${sourceMessageId}` },
        })
      );

      if (!response.Item) {
        logInfo(`No cached translation found for message ${sourceMessageId}`);
        return null;
      }

      // Check if stale (use SentDate as staleness indicator for messages)
      if (response.Item.SentDate !== sentDate) {
        logInfo(`Cached translation for message ${sourceMessageId} is stale`, {
          cachedSentDate: response.Item.SentDate,
          currentSentDate: sentDate,
        });
        return null;
      }

      logInfo(`Found cached translation for message ${sourceMessageId}`);
      return response.Item as ParsedThreadMessage;
    } catch (error) {
      logWarn(`Error retrieving parsed message ${sourceMessageId}`, { error });
      return null;
    }
  }

  /**
   * Save parsed message to cache
   */
  async saveParsedMessage(parsedMessage: ParsedThreadMessage): Promise<void> {
    try {
      logInfo(`Attempting to save parsed message to cache`, {
        messageId: parsedMessage.SourceMessageId,
        tableName: this.parsedMessagesTable,
        id: parsedMessage.Id,
      });

      await this.docClient.send(
        new PutCommand({
          TableName: this.parsedMessagesTable,
          Item: {
            ...parsedMessage,
            ttl: this.calculateTTL(),
          },
        })
      );

      logInfo(`Successfully saved parsed message to cache`, {
        messageId: parsedMessage.SourceMessageId,
      });
    } catch (error) {
      logError(`CRITICAL: Failed to save parsed message ${parsedMessage.SourceMessageId}`, {
        error: error instanceof Error ? error.message : String(error),
        tableName: this.parsedMessagesTable,
        messageId: parsedMessage.SourceMessageId,
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Don't throw - caching failures should not break the flow
    }
  }

  /**
   * Get parsed thread (translated subject) by source ID
   * Returns null if not found
   */
  async getParsedThread(sourceThreadId: number): Promise<ParsedThread | null> {
    if (!this.parsedThreadsTable) {
      logWarn('PARSED_threads table not configured, skipping cache lookup');
      return null;
    }

    try {
      const response = await this.docClient.send(
        new GetCommand({
          TableName: this.parsedThreadsTable,
          Key: { Id: `thread-${sourceThreadId}` },
        })
      );

      if (!response.Item) {
        logInfo(`No cached translation found for thread ${sourceThreadId}`);
        return null;
      }

      logInfo(`Found cached translation for thread ${sourceThreadId}`);
      return response.Item as ParsedThread;
    } catch (error) {
      logWarn(`Error retrieving parsed thread ${sourceThreadId}`, { error });
      return null;
    }
  }

  /**
   * Save parsed thread to cache
   */
  async saveParsedThread(parsedThread: ParsedThread): Promise<void> {
    if (!this.parsedThreadsTable) {
      logWarn('PARSED_threads table not configured, skipping cache save');
      return;
    }

    try {
      logInfo(`Attempting to save parsed thread to cache`, {
        threadId: parsedThread.SourceThreadId,
        tableName: this.parsedThreadsTable,
        id: parsedThread.Id,
      });

      await this.docClient.send(
        new PutCommand({
          TableName: this.parsedThreadsTable,
          Item: {
            ...parsedThread,
            ttl: this.calculateTTL(),
          },
        })
      );

      logInfo(`Successfully saved parsed thread to cache`, {
        threadId: parsedThread.SourceThreadId,
      });
    } catch (error) {
      logError(`CRITICAL: Failed to save parsed thread ${parsedThread.SourceThreadId}`, {
        error: error instanceof Error ? error.message : String(error),
        tableName: this.parsedThreadsTable,
        threadId: parsedThread.SourceThreadId,
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Don't throw - caching failures should not break the flow
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
