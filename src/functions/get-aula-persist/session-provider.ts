/**
 * DynamoDB-backed session provider for Aula API authentication
 * Persists session IDs across Lambda invocations to reduce login calls
 */

import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ISessionIdProvider } from 'aula-apiclient-ts';
import { logInfo, logWarn, logError } from './utils';

/**
 * Session ID record stored in DynamoDB
 */
interface SessionRecord {
  Id: number;
  sessionId: string;
  ttl: number;
  updatedAt: string;
}

/**
 * DynamoDB-backed implementation of ISessionIdProvider
 * Stores and retrieves Aula session IDs from DynamoDB
 */
export class DynamoDBSessionProvider implements ISessionIdProvider {
  private static readonly SESSION_RECORD_ID = 1;
  private static readonly SESSION_TTL_SECONDS = 3600; // 1 hour

  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  /**
   * Retrieves the stored Aula session ID from DynamoDB
   * Returns empty string if no session is found or if an error occurs
   */
  async getKnownAulaSessionId(): Promise<string> {
    try {
      logInfo('Retrieving stored Aula session ID from DynamoDB', { table: this.tableName });

      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { Id: DynamoDBSessionProvider.SESSION_RECORD_ID },
        })
      );

      if (!result.Item) {
        logInfo('No stored session ID found');
        return '';
      }

      const record = result.Item as SessionRecord;

      // Check if session has expired
      const now = Math.floor(Date.now() / 1000);
      if (record.ttl && record.ttl < now) {
        logWarn('Stored session ID has expired', {
          expiredAt: new Date(record.ttl * 1000).toISOString(),
        });
        return '';
      }

      logInfo('Retrieved valid session ID from DynamoDB');
      return record.sessionId || '';
    } catch (error) {
      logError('Error retrieving session ID from DynamoDB', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Return empty string to trigger fresh login
      return '';
    }
  }

  /**
   * Stores the Aula session ID in DynamoDB with TTL
   * Session expires after 1 hour
   */
  async setKnownAulaSessionId(sessionId: string): Promise<void> {
    try {
      logInfo('Storing new Aula session ID in DynamoDB', { table: this.tableName });

      const now = Math.floor(Date.now() / 1000);
      const ttl = now + DynamoDBSessionProvider.SESSION_TTL_SECONDS;

      const record: SessionRecord = {
        Id: DynamoDBSessionProvider.SESSION_RECORD_ID,
        sessionId,
        ttl,
        updatedAt: new Date().toISOString(),
      };

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: record,
        })
      );

      logInfo('Successfully stored session ID in DynamoDB', {
        expiresAt: new Date(ttl * 1000).toISOString(),
      });
    } catch (error) {
      logError('Error storing session ID in DynamoDB', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - session storage failure shouldn't break the lambda
      // The session just won't be reused next time
    }
  }
}
