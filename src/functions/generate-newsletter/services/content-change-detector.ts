/**
 * Content Change Detector Service
 * Quickly checks if there's new content since last snapshot without fetching full data
 * Used for early circuit breaker logic to avoid unnecessary processing
 */

import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBConfig } from '../../../common/types';
import { logInfo, logError } from '../../../common/utils';

export interface ContentCheckDetails {
  newMessages: number;
  newPosts: number;
  totalNewItems: number;
}

export interface ContentCheckResult {
  hasNewContent: boolean;
  details: ContentCheckDetails;
}

/**
 * Service for checking if there's new content since a timestamp
 * Uses DynamoDB count-only scans for fast checks
 */
export class ContentChangeDetector {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly config: DynamoDBConfig
  ) {}

  /**
   * Checks if there's ANY new content since the given timestamp
   * Returns quickly with only counts, no full data fetching
   *
   * @param sinceTimestamp - ISO timestamp to check for new content after
   * @returns Object with hasNewContent flag and details about what's new
   */
  async hasNewContentSince(sinceTimestamp: string): Promise<ContentCheckResult> {
    logInfo('Checking for new content since timestamp', { sinceTimestamp });

    try {
      // Run both checks in parallel for speed
      const [messagesCount, postsCount] = await Promise.all([
        this.countNewMessages(sinceTimestamp),
        this.countNewPosts(sinceTimestamp),
      ]);

      const totalNewItems = messagesCount + postsCount;
      const hasNewContent = totalNewItems > 0;

      const result: ContentCheckResult = {
        hasNewContent,
        details: {
          newMessages: messagesCount,
          newPosts: postsCount,
          totalNewItems,
        },
      };

      logInfo('Content check complete', result);
      return result;
    } catch (error) {
      logError('Error checking for new content', {
        error: error instanceof Error ? error.message : String(error),
        sinceTimestamp,
      });
      // On error, assume there IS new content to avoid missing newsletters
      return {
        hasNewContent: true,
        details: {
          newMessages: -1,
          newPosts: -1,
          totalNewItems: -1,
        },
      };
    }
  }

  /**
   * Counts new messages since timestamp
   * Uses SELECT: 'COUNT' for fast query without fetching data
   */
  private async countNewMessages(sinceTimestamp: string): Promise<number> {
    if (!this.config.threadMessagesTable) {
      logInfo('Thread messages table not configured, returning 0');
      return 0;
    }

    try {
      const result = await this.docClient.send(
        new ScanCommand({
          TableName: this.config.threadMessagesTable,
          FilterExpression: '#sentDate > :sinceTimestamp',
          ExpressionAttributeNames: {
            '#sentDate': 'SentDate',
          },
          ExpressionAttributeValues: {
            ':sinceTimestamp': sinceTimestamp,
          },
          Select: 'COUNT', // Only return count, not items
        })
      );

      const count = result.Count || 0;
      logInfo(`Found ${count} new messages since ${sinceTimestamp}`);
      return count;
    } catch (error) {
      logError('Error counting new messages', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Counts new posts since timestamp
   * Uses SELECT: 'COUNT' for fast query without fetching data
   */
  private async countNewPosts(sinceTimestamp: string): Promise<number> {
    if (!this.config.postsTable) {
      logInfo('Posts table not configured, returning 0');
      return 0;
    }

    try {
      const result = await this.docClient.send(
        new ScanCommand({
          TableName: this.config.postsTable,
          FilterExpression: '#timestamp > :sinceTimestamp',
          ExpressionAttributeNames: {
            '#timestamp': 'Timestamp',
          },
          ExpressionAttributeValues: {
            ':sinceTimestamp': sinceTimestamp,
          },
          Select: 'COUNT', // Only return count, not items
        })
      );

      const count = result.Count || 0;
      logInfo(`Found ${count} new posts since ${sinceTimestamp}`);
      return count;
    } catch (error) {
      logError('Error counting new posts', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }
}
