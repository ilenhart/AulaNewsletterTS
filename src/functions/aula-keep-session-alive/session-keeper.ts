/**
 * Session keeper service
 * Pings Aula API to keep session alive
 */

import { AulaAPIClient, AulaClientConfig } from 'aula-apiclient-ts';
import { DynamoDBSessionProvider } from '../../common/dynamodb/session-provider';
import { AulaSession } from '../../common/types';
import { logInfo, logError, AulaAPIError } from '../../common/utils';

/**
 * Service for keeping Aula sessions alive
 */
export class SessionKeeperService {
  private currentSession: AulaSession | null = null;

  constructor(
    private readonly sessionProvider: DynamoDBSessionProvider,
    private readonly apiUrl: string
  ) {}

  /**
   * Gets the current session record (useful for error reporting)
   * Returns the session that was active when keepSessionAlive was last called
   */
  getCurrentSession(): AulaSession | null {
    return this.currentSession;
  }

  /**
   * Retrieves the full session record from DynamoDB
   * This provides more context than just the session ID string
   */
  async retrieveSessionRecord(): Promise<AulaSession | null> {
    try {
      // Access the internal docClient and tableName from the session provider
      // Note: This uses TypeScript 'any' to access private properties
      const provider = this.sessionProvider as any;
      const docClient = provider.docClient;
      const tableName = provider.tableName;

      if (!docClient || !tableName) {
        logError('Unable to access DynamoDB client or table name from session provider');
        return null;
      }

      // Import GetCommand dynamically to avoid circular dependencies
      const { GetCommand } = await import('@aws-sdk/lib-dynamodb');

      const result = await docClient.send(
        new GetCommand({
          TableName: tableName,
          Key: { Id: 1 },
        })
      );

      return result.Item as AulaSession | null;
    } catch (error) {
      logError('Error retrieving session record', {
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  /**
   * Pings Aula API and updates session timestamp
   */
  async keepSessionAlive(): Promise<void> {
    try {
      // Retrieve full session record before attempting ping (for error context)
      this.currentSession = await this.retrieveSessionRecord();

      // Configure Aula client with session provider
      const config = new AulaClientConfig();
      config.sessionIdProvider = this.sessionProvider;
      config.aulaApiUrl = this.apiUrl;

      const aulaClient = new AulaAPIClient(config);

      logInfo('Pinging Aula to keep session alive');
      await aulaClient.PingAula();
      logInfo('Successfully pinged Aula');

      // Update session timestamp in DynamoDB
      await this.sessionProvider.updateSessionTimestamp();
    } catch (error) {
      logError('Error keeping session alive', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AulaAPIError('Failed to keep session alive', { originalError: error });
    }
  }
}
