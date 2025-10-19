/**
 * Newsletter Snapshot Data Access Layer
 * Handles saving and retrieving daily newsletter snapshots from DynamoDB
 */

import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { NewsletterSnapshot } from '../types';
import { logInfo, logWarn, logError } from '../utils';

export class NewsletterSnapshotAccess {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  /**
   * Get newsletter snapshot for a specific date
   * @param snapshotDate - Date in YYYY-MM-DD format
   * @returns Newsletter snapshot or null if not found
   */
  async getSnapshot(snapshotDate: string): Promise<NewsletterSnapshot | null> {
    try {
      logInfo('Fetching newsletter snapshot', { snapshotDate, tableName: this.tableName });

      const response = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            SnapshotDate: snapshotDate,
          },
        })
      );

      if (!response.Item) {
        logInfo('No snapshot found for date', { snapshotDate });
        return null;
      }

      logInfo('Successfully retrieved snapshot', {
        snapshotDate,
        generatedAt: response.Item.GeneratedAt,
      });

      return response.Item as NewsletterSnapshot;
    } catch (error) {
      logError('Failed to fetch newsletter snapshot', {
        error: error instanceof Error ? error.message : String(error),
        snapshotDate,
      });
      return null;
    }
  }

  /**
   * Save newsletter snapshot to DynamoDB
   * @param snapshot - Newsletter snapshot to save
   */
  async saveSnapshot(snapshot: NewsletterSnapshot): Promise<void> {
    try {
      logInfo('Saving newsletter snapshot', {
        snapshotDate: snapshot.SnapshotDate,
        tableName: this.tableName,
      });

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: snapshot,
        })
      );

      logInfo('Successfully saved snapshot', {
        snapshotDate: snapshot.SnapshotDate,
        generatedAt: snapshot.GeneratedAt,
      });
    } catch (error) {
      logError('Failed to save newsletter snapshot', {
        error: error instanceof Error ? error.message : String(error),
        snapshotDate: snapshot.SnapshotDate,
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw error;
    }
  }

  /**
   * Get yesterday's snapshot (helper method)
   * @returns Yesterday's snapshot or null if not found
   */
  async getYesterdaySnapshot(): Promise<NewsletterSnapshot | null> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayDate = yesterday.toISOString().split('T')[0]; // YYYY-MM-DD

    return await this.getSnapshot(yesterdayDate);
  }

  /**
   * Create an empty snapshot structure
   * @param snapshotDate - Date in YYYY-MM-DD format
   * @returns Empty snapshot
   */
  createEmptySnapshot(snapshotDate: string): NewsletterSnapshot {
    const ttl = Math.floor(Date.now() / 1000) + 60 * 24 * 60 * 60; // 60 days

    return {
      SnapshotDate: snapshotDate,
      GeneratedAt: new Date().toISOString(),
      NewsletterJson: {
        importantInformation: [],
        generalReminders: [],
        upcomingEvents: [],
        weeklyHighlights: [],
        threadSummaries: [],
      },
      ProcessedItemIds: {
        postIds: [],
        messageIds: [],
        eventIds: [],
        derivedEventIds: [],
      },
      ttl,
    };
  }
}
