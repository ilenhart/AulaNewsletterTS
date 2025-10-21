/**
 * DynamoDB-backed session provider for Aula API authentication
 * Persists session IDs across Lambda invocations to reduce login calls
 *
 * SHARED across: get-aula-persist and aula-keep-session-alive lambdas
 */

import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { ISessionIdProvider } from 'aula-apiclient-ts';
import { AulaSession } from '../types';
import { logInfo, logWarn, logError, oneHourFromNow, oneYearFromNow } from '../utils';

/**
 * DynamoDB-backed implementation of ISessionIdProvider
 * Stores and retrieves Aula session IDs from DynamoDB
 */
export class DynamoDBSessionProvider implements ISessionIdProvider {
  private static readonly SESSION_RECORD_ID = 1;

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

      const record = result.Item as AulaSession;

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
   *
   * Logic for 'created' timestamp:
   * - If new sessionId (different from existing): Set created to current timestamp
   * - If same sessionId (updating existing): Preserve existing created timestamp
   * - If no existing session: Set created to current timestamp
   */
  async setKnownAulaSessionId(sessionId: string): Promise<void> {
    try {
      logInfo('Storing new Aula session ID in DynamoDB', { table: this.tableName });

      // Get existing session to check if sessionId has changed
      const existingResult = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { Id: DynamoDBSessionProvider.SESSION_RECORD_ID },
        })
      );

      const existingSession = existingResult.Item as AulaSession | undefined;

      // Determine if this is a new sessionId
      const isNewSessionId = !existingSession || existingSession.sessionId !== sessionId;

      // Set created timestamp
      const now = new Date().toISOString();
      const created = isNewSessionId
        ? now
        : (existingSession?.created || now);

      const ttl = oneYearFromNow();

      const record: AulaSession = {
        Id: DynamoDBSessionProvider.SESSION_RECORD_ID,
        sessionId,
        ttl,
        lastUpdated: now,
        created,
      };

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: record,
        })
      );

      logInfo('Successfully stored session ID in DynamoDB', {
        isNewSessionId,
        created,
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

  /**
   * Updates the last accessed timestamp for the session
   * Used by keep-session-alive lambda to track session health
   */
  async updateSessionTimestamp(): Promise<void> {
    try {
      logInfo('Updating session timestamp', { table: this.tableName });

      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { Id: DynamoDBSessionProvider.SESSION_RECORD_ID },
        })
      );

      if (!result.Item) {
        logWarn('No session found to update');
        return;
      }

      const session = result.Item as AulaSession;

      const updatedSession: AulaSession = {
        ...session,
        lastUpdated: new Date().toISOString(),
        ttl: oneYearFromNow(), // Extend TTL to 1 year
      };

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: updatedSession,
        })
      );

      logInfo('Session timestamp updated successfully');
    } catch (error) {
      logError('Error updating session timestamp', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Updates session after successful Aula API call
   * - Sets lastUsedSuccessfully to current timestamp (always updated)
   * - Clears lastUsedFailure (sets to null/undefined)
   * Used by keep-session-alive lambda to track successful pings
   */
  async updateSessionSuccess(): Promise<void> {
    try {
      logInfo('Updating session success timestamp', { table: this.tableName });

      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { Id: DynamoDBSessionProvider.SESSION_RECORD_ID },
        })
      );

      if (!result.Item) {
        logWarn('No session found to update');
        return;
      }

      const session = result.Item as AulaSession;

      const updatedSession: AulaSession = {
        ...session,
        lastUsedSuccessfully: new Date().toISOString(),
        lastUsedFailure: undefined, // Clear failure timestamp on success
      };

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: updatedSession,
        })
      );

      logInfo('Session success timestamp updated successfully', {
        lastUsedSuccessfully: updatedSession.lastUsedSuccessfully,
      });
    } catch (error) {
      logError('Error updating session success timestamp', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Updates session after failed Aula API call
   * - Sets lastUsedFailure to current timestamp ONLY if currently null/undefined
   * - This captures the FIRST failure time, not subsequent failures
   * Used by keep-session-alive lambda to track when session first failed
   */
  async updateSessionFailure(): Promise<void> {
    try {
      logInfo('Updating session failure timestamp', { table: this.tableName });

      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { Id: DynamoDBSessionProvider.SESSION_RECORD_ID },
        })
      );

      if (!result.Item) {
        logWarn('No session found to update');
        return;
      }

      const session = result.Item as AulaSession;

      // Only update if lastUsedFailure is not already set (capture first failure)
      if (session.lastUsedFailure) {
        logInfo('Session already has a failure timestamp, not updating', {
          existingFailureTimestamp: session.lastUsedFailure,
        });
        return;
      }

      const updatedSession: AulaSession = {
        ...session,
        lastUsedFailure: new Date().toISOString(),
      };

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: updatedSession,
        })
      );

      logInfo('Session failure timestamp updated successfully', {
        lastUsedFailure: updatedSession.lastUsedFailure,
      });
    } catch (error) {
      logError('Error updating session failure timestamp', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
