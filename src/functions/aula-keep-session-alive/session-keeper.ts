/**
 * Session keeper service
 * Pings Aula API to keep session alive
 */

import { AulaAPIClient, AulaClientConfig, AulaInvalidSessionError } from 'aula-apiclient-ts';
import { DynamoDBSessionProvider } from '../../common/dynamodb/session-provider';
import { AulaSession } from '../../common/types';
import { logInfo, logError, logWarn, AulaAPIError } from '../../common/utils';
import { validateSessionId } from '../../common/session-validation';

/**
 * Reasons why session ping failed
 */
export enum SessionFailureReason {
  /** No session ID exists in DynamoDB (deleted or TTL expired) */
  NO_SESSION_IN_DATABASE = 'NO_SESSION_IN_DATABASE',
  /** Session ID exists but is not in valid format (not 32 alphanumeric) */
  INVALID_SESSION_FORMAT = 'INVALID_SESSION_FORMAT',
  /** Session ID exists and is valid format but was rejected by Aula (403) */
  SESSION_REJECTED_BY_AULA = 'SESSION_REJECTED_BY_AULA',
  /** Generic error (unknown cause) */
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Service for keeping Aula sessions alive
 */
export class SessionKeeperService {
  private currentSession: AulaSession | null = null;
  private failureReason: SessionFailureReason | null = null;

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
   * Gets the failure reason from the last keepSessionAlive attempt
   * Returns null if the last attempt was successful
   */
  getFailureReason(): SessionFailureReason | null {
    return this.failureReason;
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
      // Reset failure reason on new attempt
      this.failureReason = null;

      // Retrieve full session record before attempting ping (for error context)
      this.currentSession = await this.retrieveSessionRecord();

      // Check if session exists in database
      if (!this.currentSession || !this.currentSession.sessionId) {
        logError('No session ID found in DynamoDB');
        this.failureReason = SessionFailureReason.NO_SESSION_IN_DATABASE;
        throw new AulaAPIError('No session ID available in DynamoDB');
      }

      // Validate session ID format
      try {
        validateSessionId(this.currentSession.sessionId);
        logInfo('Session ID validation passed');
      } catch (error) {
        logWarn('Session ID validation failed', {
          sessionId: this.currentSession.sessionId.substring(0, 10) + '...',
          error: error instanceof Error ? error.message : String(error),
        });
        this.failureReason = SessionFailureReason.INVALID_SESSION_FORMAT;
        throw new AulaAPIError(
          `Invalid session ID format in DynamoDB: ${error instanceof Error ? error.message : 'Unknown format error'}`,
          { originalError: error }
        );
      }

      // Configure Aula client with session provider
      const config = new AulaClientConfig();
      config.sessionIdProvider = this.sessionProvider;
      config.aulaApiUrl = this.apiUrl;

      const aulaClient = new AulaAPIClient(config);

      logInfo('Pinging Aula to keep session alive');
      await aulaClient.PingAula();
      logInfo('Successfully pinged Aula');

      // Update session timestamps in DynamoDB
      await this.sessionProvider.updateSessionTimestamp();
      await this.sessionProvider.updateSessionSuccess();
    } catch (error) {
      // Update failure timestamp first (before re-throwing)
      try {
        await this.sessionProvider.updateSessionFailure();
      } catch (updateError) {
        // Log but don't fail if we can't update the failure timestamp
        logError('Failed to update session failure timestamp', {
          error: updateError instanceof Error ? updateError.message : String(updateError),
        });
      }

      // Handle specific AulaInvalidSessionError with detailed information
      if (error instanceof AulaInvalidSessionError) {
        // Set failure reason: session was rejected by Aula
        this.failureReason = SessionFailureReason.SESSION_REJECTED_BY_AULA;

        logError('Aula session is invalid or expired', {
          error: error.message,
          sessionId: this.currentSession?.sessionId?.substring(0, 10) + '...',
          httpStatus: error.httpStatus,
          aulaStatusCode: error.aulaStatusCode,
          aulaSubCode: error.aulaSubCode,
          aulaMessage: error.aulaMessage,
          aulaErrorInformation: error.aulaErrorInformation,
        });
        throw new AulaAPIError(
          `Aula session is invalid or expired: ${error.message}`,
          { originalError: error }
        );
      }

      // Handle generic errors - if we haven't already set a failure reason
      if (!this.failureReason) {
        this.failureReason = SessionFailureReason.UNKNOWN_ERROR;
      }

      logError('Error keeping session alive', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new AulaAPIError('Failed to keep session alive', { originalError: error });
    }
  }
}
