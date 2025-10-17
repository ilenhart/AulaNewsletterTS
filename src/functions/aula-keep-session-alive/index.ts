/**
 * AulaKeepSessionAlive Lambda Handler
 * Pings Aula API to keep session alive
 * Runs on EventBridge schedule (every 4 hours)
 * Sends email alert if session expires
 */

import { EventBridgeEvent } from 'aws-lambda';
import { createDynamoDBDocClient } from '../../common/aws/dynamodb-client';
import { createSESClient } from '../../common/aws/ses-client';
import { DynamoDBSessionProvider } from '../../common/dynamodb/session-provider';
import { SessionKeeperService } from './session-keeper';
import { EmailAlertService } from './email-alert-service';
import { getConfig } from './config';
import { logInfo, logError, getErrorMessage, LambdaError } from '../../common/utils';
import { LambdaResponse } from '../../common/types';

type DetailType = 'Scheduled Event';
type DetailPayload = Record<string, unknown>;

/**
 * Lambda handler function
 * Orchestrates the session keep-alive workflow
 */
export const handler = async (
  event: EventBridgeEvent<DetailType, DetailPayload>
): Promise<LambdaResponse> => {
  const startTime = new Date();

  logInfo('AulaKeepSessionAlive Lambda started', {
    ruleArns: event.resources,
    firedAt: event.time,
  });

  try {
    // Load configuration
    logInfo('Loading configuration from environment variables');
    const config = getConfig();

    // Initialize DynamoDB client
    logInfo('Initializing DynamoDB client');
    const docClient = createDynamoDBDocClient();

    // Initialize session provider
    logInfo('Initializing session provider');
    const sessionProvider = new DynamoDBSessionProvider(docClient, config.sessionTableName);

    // Initialize session keeper service
    const sessionKeeper = new SessionKeeperService(sessionProvider, config.apiUrl);

    // Keep session alive
    await sessionKeeper.keepSessionAlive();

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    logInfo('AulaKeepSessionAlive Lambda completed successfully', {
      duration: `${duration}ms`,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Successfully kept session alive',
        timestamp: endTime.toISOString(),
        duration: `${duration}ms`,
      }),
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logError('Error in AulaKeepSessionAlive Lambda', {
      error: errorMessage,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });

    // Send email alert on session failure
    try {
      logInfo('Attempting to send session expiration alert via email');

      // Load config and initialize services
      const config = getConfig();
      const sesClient = createSESClient();
      const emailService = new EmailAlertService(
        sesClient,
        config.emailFromAddress,
        config.emailToAddresses
      );

      // Get session context for the alert
      const docClient = createDynamoDBDocClient();
      const sessionProvider = new DynamoDBSessionProvider(docClient, config.sessionTableName);
      const sessionKeeper = new SessionKeeperService(sessionProvider, config.apiUrl);

      // Retrieve session record for error context
      const session = await sessionKeeper.retrieveSessionRecord();

      // Send the alert email
      await emailService.sendSessionExpiredAlert(session, error as Error);
      logInfo('Session expiration alert sent successfully');
    } catch (emailError) {
      // Don't fail the lambda if email sending fails - just log it
      logError('Failed to send session expiration alert email', {
        error: emailError instanceof Error ? emailError.message : String(emailError),
        originalError: errorMessage,
      });
      // Continue to return the original error, not the email error
    }

    // Determine appropriate status code
    let statusCode = 500;
    if (error instanceof LambdaError) {
      statusCode = error.statusCode;
    }

    return {
      statusCode,
      body: JSON.stringify({
        message: 'Error keeping session alive',
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
