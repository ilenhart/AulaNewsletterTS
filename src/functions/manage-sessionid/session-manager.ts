/**
 * Business logic for managing session IDs in DynamoDB
 */

import { DynamoDBDocumentClient, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { AulaSession } from '../../common/types';
import { logInfo, logError, oneHourFromNow } from '../../common/utils';

export class SessionManager {
  private static readonly SESSION_RECORD_ID = 1;

  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly tableName: string
  ) {}

  /**
   * Retrieves the current session record from DynamoDB
   * Returns null if no session exists
   */
  async getSession(): Promise<AulaSession | null> {
    try {
      logInfo('Retrieving session from DynamoDB', { table: this.tableName });

      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.tableName,
          Key: { Id: SessionManager.SESSION_RECORD_ID },
        })
      );

      if (!result.Item) {
        logInfo('No session found in DynamoDB');
        return null;
      }

      const session = result.Item as AulaSession;
      logInfo('Successfully retrieved session from DynamoDB');
      return session;
    } catch (error) {
      logError('Error retrieving session from DynamoDB', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Updates or creates a session record in DynamoDB with the provided sessionId
   *
   * Logic for 'created' timestamp:
   * - If new sessionId (different from existing): Set created to current timestamp
   * - If same sessionId (updating existing): Preserve existing created timestamp
   * - If no existing session: Set created to current timestamp
   */
  async updateSession(sessionId: string): Promise<AulaSession> {
    try {
      logInfo('Updating session in DynamoDB', { table: this.tableName });

      // Get existing session to check if sessionId has changed
      const existingSession = await this.getSession();

      // Determine if this is a new sessionId
      const isNewSessionId = !existingSession || existingSession.sessionId !== sessionId;

      // Set created timestamp:
      // - If new sessionId → use current timestamp
      // - If same sessionId → preserve existing created (or use current if missing for backward compatibility)
      const now = new Date().toISOString();
      const created = isNewSessionId
        ? now
        : (existingSession?.created || now);

      const ttl = oneHourFromNow();
      const session: AulaSession = {
        Id: SessionManager.SESSION_RECORD_ID,
        sessionId,
        ttl,
        lastUpdated: now,
        created,
      };

      await this.docClient.send(
        new PutCommand({
          TableName: this.tableName,
          Item: session,
        })
      );

      logInfo('Successfully updated session in DynamoDB', {
        isNewSessionId,
        created,
        expiresAt: new Date(ttl * 1000).toISOString(),
      });

      return session;
    } catch (error) {
      logError('Error updating session in DynamoDB', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
