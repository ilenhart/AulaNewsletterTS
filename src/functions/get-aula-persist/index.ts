/**
 * GetAulaAndPersist Lambda Handler
 * Fetches data from Aula API and persists to DynamoDB
 * Runs on EventBridge schedule (twice daily: 9am and 5pm UTC)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { AulaAPIClient, AulaClientConfig } from 'aula-apiclient-ts';
import * as dotenv from 'dotenv';

import { getConfig } from './config';
import { DynamoDBSessionProvider } from './session-provider';
import { AulaDataService } from './aula-data-service';
import { DynamoDBManager } from './dynamodb-manager';
import { LambdaEvent, LambdaContext, LambdaResponse } from './types';
import {
  logInfo,
  logError,
  LambdaError,
  getErrorMessage,
  ExecutionStats,
  formatExecutionStats,
} from './utils';

// Load environment variables from .env file (for local development)
dotenv.config();

/**
 * Lambda handler function
 * Orchestrates the data fetch and persist workflow
 */
export const handler = async (event: LambdaEvent, context: LambdaContext): Promise<LambdaResponse> => {
  const startTime = new Date();
  logInfo('GetAulaAndPersist Lambda started', {
    functionName: context.functionName,
    requestId: context.awsRequestId,
    eventSource: event.source,
  });

  try {
    // Load and validate configuration
    logInfo('Loading configuration from environment variables');
    const config = getConfig();

    // Initialize DynamoDB client
    logInfo('Initializing DynamoDB client');
    const awsConfig: any = {};
    if (config.dynamodb.region) {
      awsConfig.region = config.dynamodb.region;
    }
    if (process.env.AWS_ACCESS_KEY_ID) {
      awsConfig.credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      };
    }

    const dynamoClient = new DynamoDBClient(awsConfig);
    const docClient = DynamoDBDocumentClient.from(dynamoClient, {
      marshallOptions: {
        convertClassInstanceToMap: true,
        removeUndefinedValues: true,
      },
    });

    // Initialize session provider
    logInfo('Initializing session provider');
    const sessionProvider = new DynamoDBSessionProvider(
      docClient,
      config.dynamodb.sessionIdTable
    );

    // Initialize Aula API client
    logInfo('Initializing Aula API client');
    const aulaConfig = new AulaClientConfig();
    aulaConfig.sessionIdProvider = sessionProvider;
    aulaConfig.aulaApiUrl = config.aula.apiUrl;
    const aulaClient = new AulaAPIClient(aulaConfig);

    // Initialize services
    const aulaDataService = new AulaDataService(aulaClient);
    const dynamoManager = new DynamoDBManager(config.dynamodb, awsConfig.credentials);

    // Login to Aula
    logInfo('Logging into Aula API');
    await aulaClient.Login();
    logInfo('Successfully authenticated with Aula API');

    // Retrieve data from Aula
    logInfo('Retrieving data from Aula API');
    const data = await aulaDataService.retrieveCurrentInformation(config.dataRetrieval);
    logInfo('Successfully retrieved all data from Aula API');

    // Save data to DynamoDB (all in parallel)
    logInfo('Saving data to DynamoDB');
    const saveResults = await dynamoManager.saveAllData(data);

    // Calculate totals
    const totalSuccessful =
      saveResults.overviews.successful +
      saveResults.threads.successful +
      saveResults.messages.successful +
      saveResults.calendarEvents.successful +
      saveResults.posts.successful +
      saveResults.workPlan.successful +
      saveResults.bookList.successful +
      saveResults.galleryAlbums.successful;

    const totalFailed =
      saveResults.overviews.failed +
      saveResults.threads.failed +
      saveResults.messages.failed +
      saveResults.calendarEvents.failed +
      saveResults.posts.failed +
      saveResults.workPlan.failed +
      saveResults.bookList.failed +
      saveResults.galleryAlbums.failed;

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    const stats: ExecutionStats = {
      startTime,
      endTime,
      itemsProcessed: totalSuccessful + totalFailed,
      itemsSuccessful: totalSuccessful,
      itemsFailed: totalFailed,
    };

    logInfo('GetAulaAndPersist Lambda completed successfully', {
      duration: `${duration}ms`,
      stats: formatExecutionStats(stats),
      breakdown: {
        overviews: { successful: saveResults.overviews.successful, failed: saveResults.overviews.failed },
        threads: { successful: saveResults.threads.successful, failed: saveResults.threads.failed },
        messages: { successful: saveResults.messages.successful, failed: saveResults.messages.failed },
        calendarEvents: { successful: saveResults.calendarEvents.successful, failed: saveResults.calendarEvents.failed },
        posts: { successful: saveResults.posts.successful, failed: saveResults.posts.failed },
        workPlan: { successful: saveResults.workPlan.successful, failed: saveResults.workPlan.failed },
        bookList: { successful: saveResults.bookList.successful, failed: saveResults.bookList.failed },
        galleryAlbums: { successful: saveResults.galleryAlbums.successful, failed: saveResults.galleryAlbums.failed },
      },
    });

    // Determine response status
    if (totalFailed > 0 && totalSuccessful === 0) {
      // Complete failure
      return {
        statusCode: 500,
        body: JSON.stringify({
          message: 'Failed to persist any data',
          stats: {
            totalFailed,
            totalSuccessful,
            duration: `${duration}ms`,
          },
        }),
      };
    } else if (totalFailed > 0) {
      // Partial success
      return {
        statusCode: 207, // Multi-Status
        body: JSON.stringify({
          message: 'Partially succeeded',
          stats: {
            totalSuccessful,
            totalFailed,
            duration: `${duration}ms`,
          },
          breakdown: saveResults,
        }),
      };
    } else {
      // Complete success
      return {
        statusCode: 200,
        body: JSON.stringify({
          message: 'Successfully retrieved and persisted all Aula data',
          stats: {
            totalSuccessful,
            duration: `${duration}ms`,
          },
          timestamp: endTime.toISOString(),
        }),
      };
    }
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logError('Error in GetAulaAndPersist Lambda', {
      error: errorMessage,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });

    // Determine appropriate status code
    let statusCode = 500;
    if (error instanceof LambdaError) {
      statusCode = error.statusCode;
    }

    return {
      statusCode,
      body: JSON.stringify({
        message: 'Error processing Aula data',
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
