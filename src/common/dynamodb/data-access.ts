/**
 * Shared DynamoDB data access operations
 * Used by generate-newsletter lambda to read from RAW tables
 */

import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import {
  AulaMessage,
  AulaThread,
  AulaPost,
  AulaCalendarEvent,
  AulaDailyOverview,
  DynamoDBConfig,
} from '../types';
import { logInfo, logError, DynamoDBError } from '../utils';

/**
 * DynamoDB data reader for newsletter generation
 * Provides methods to query RAW data tables with date filtering
 */
export class DynamoDBDataReader {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly config: DynamoDBConfig
  ) {}

  /**
   * Gets thread messages within a date range
   */
  async getThreadMessages(startDate: Date, endDate: Date): Promise<AulaMessage[]> {
    try {
      logInfo('Fetching thread messages from DynamoDB', {
        table: this.config.threadMessagesTable,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      const command = new ScanCommand({
        TableName: this.config.threadMessagesTable!,
        FilterExpression: '#date BETWEEN :start AND :end',
        ExpressionAttributeNames: {
          '#date': 'SentDate',
        },
        ExpressionAttributeValues: {
          ':start': startDate.toISOString(),
          ':end': endDate.toISOString(),
        },
      });

      const result = await this.docClient.send(command);
      const messages = (result.Items || []) as AulaMessage[];

      logInfo(`Retrieved ${messages.length} thread messages`);
      return messages;
    } catch (error) {
      logError('Error fetching thread messages', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DynamoDBError('Failed to fetch thread messages', { originalError: error });
    }
  }

  /**
   * Gets threads by IDs
   */
  async getThreadsByIds(threadIds: number[]): Promise<AulaThread[]> {
    if (threadIds.length === 0) {
      return [];
    }

    try {
      logInfo('Fetching threads from DynamoDB', {
        table: this.config.threadsTable,
        count: threadIds.length,
      });

      const command = new ScanCommand({
        TableName: this.config.threadsTable!,
      });

      const result = await this.docClient.send(command);
      const allThreads = (result.Items || []) as AulaThread[];

      const threads = allThreads.filter(thread => threadIds.includes(thread.Id));

      logInfo(`Retrieved ${threads.length} threads`);
      return threads;
    } catch (error) {
      logError('Error fetching threads', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DynamoDBError('Failed to fetch threads', { originalError: error });
    }
  }

  /**
   * Gets calendar events within a date range
   */
  async getCalendarEvents(startDate: Date, endDate: Date): Promise<AulaCalendarEvent[]> {
    try {
      logInfo('Fetching calendar events from DynamoDB', {
        table: this.config.calendarEventsTable,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      const command = new ScanCommand({
        TableName: this.config.calendarEventsTable!,
        FilterExpression: '#date BETWEEN :start AND :end',
        ExpressionAttributeNames: {
          '#date': 'StartDate',
        },
        ExpressionAttributeValues: {
          ':start': startDate.toISOString(),
          ':end': endDate.toISOString(),
        },
      });

      const result = await this.docClient.send(command);
      const events = (result.Items || []) as AulaCalendarEvent[];

      logInfo(`Retrieved ${events.length} calendar events`);
      return events;
    } catch (error) {
      logError('Error fetching calendar events', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DynamoDBError('Failed to fetch calendar events', { originalError: error });
    }
  }

  /**
   * Gets posts within a date range
   */
  async getPosts(startDate: Date, endDate: Date): Promise<AulaPost[]> {
    try {
      logInfo('Fetching posts from DynamoDB', {
        table: this.config.postsTable,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      const command = new ScanCommand({
        TableName: this.config.postsTable!,
        FilterExpression: '#date BETWEEN :start AND :end',
        ExpressionAttributeNames: {
          '#date': 'Timestamp',
        },
        ExpressionAttributeValues: {
          ':start': startDate.toISOString(),
          ':end': endDate.toISOString(),
        },
      });

      const result = await this.docClient.send(command);
      const posts = (result.Items || []) as AulaPost[];

      logInfo(`Retrieved ${posts.length} posts`);
      return posts;
    } catch (error) {
      logError('Error fetching posts', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DynamoDBError('Failed to fetch posts', { originalError: error });
    }
  }

  /**
   * Gets daily overviews within a date range
   */
  async getDailyOverviews(startDate: Date, endDate: Date): Promise<AulaDailyOverview[]> {
    try {
      logInfo('Fetching daily overviews from DynamoDB', {
        table: this.config.dailyOverviewTable,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
      });

      const command = new ScanCommand({
        TableName: this.config.dailyOverviewTable!,
        FilterExpression: '#date BETWEEN :start AND :end',
        ExpressionAttributeNames: {
          '#date': 'Date',
        },
        ExpressionAttributeValues: {
          ':start': startDate.toISOString(),
          ':end': endDate.toISOString(),
        },
      });

      const result = await this.docClient.send(command);
      const overviews = (result.Items || []) as AulaDailyOverview[];

      logInfo(`Retrieved ${overviews.length} daily overviews`);
      return overviews;
    } catch (error) {
      logError('Error fetching daily overviews', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DynamoDBError('Failed to fetch daily overviews', { originalError: error });
    }
  }
}
