/**
 * Update and Generate Full Process Lambda Handler
 * Orchestrates on-demand newsletter generation by invoking:
 * 1. get-aula-persist (fetch latest data from Aula)
 * 2. generate-newsletter (generate and email newsletter)
 *
 * Designed for REST API invocation (Lambda Function URL or API Gateway)
 */

import { LambdaClient } from '@aws-sdk/client-lambda';
import { getConfig } from './config';
import { LambdaInvoker } from './lambda-invoker';
import {
  LambdaEvent,
  LambdaContext,
  LambdaResponse,
  FullProcessResult,
  StepResult,
  GetAulaPersistPayload,
  GenerateNewsletterPayload,
} from './types';
import { DateRangeOverride } from '../../common/types';
import { logInfo, logError, getErrorMessage } from '../../common/utils';

/**
 * CORS headers for all responses
 * Allows requests from Chrome extensions and web browsers
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-aulasession-authenticate,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'PUT,OPTIONS',
};

/**
 * Lambda handler function
 * Orchestrates the full newsletter generation workflow
 */
export const handler = async (
  event: LambdaEvent,
  context: LambdaContext
): Promise<LambdaResponse> => {
  const startTime = Date.now();

  logInfo('UpdateAndGenerateFullProcess Lambda started', {
    functionName: context.functionName,
    requestId: context.awsRequestId,
    httpMethod: event.httpMethod,
  });

  try {
    // Load configuration
    const config = getConfig();

    // Validate authentication (if called via API)
    if (event.headers) {
      const authHeader = event.headers['X-aulasession-authenticate'] ||
                        event.headers['x-aulasession-authenticate'];

      if (!authHeader || authHeader !== config.authenticateToken) {
        logError('Authentication failed', {
          hasAuthHeader: !!authHeader,
        });

        return {
          statusCode: 401,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
          },
          body: JSON.stringify({
            error: 'Unauthorized',
            message: 'Invalid or missing authentication token',
          }),
        };
      }

      logInfo('Authentication successful');
    }

    // Extract query string parameters for date range overrides
    const queryParams = event.queryStringParameters || {};
    let dateRangeOverride: DateRangeOverride | undefined;

    if (queryParams.lastNumberOfDays || queryParams.futureDays) {
      const lastNumberOfDays = queryParams.lastNumberOfDays
        ? parseInt(queryParams.lastNumberOfDays, 10)
        : undefined;
      const futureDays = queryParams.futureDays
        ? parseInt(queryParams.futureDays, 10)
        : undefined;

      // Validate parameters
      if (lastNumberOfDays !== undefined && (isNaN(lastNumberOfDays) || lastNumberOfDays < 0 || lastNumberOfDays > 365)) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
          },
          body: JSON.stringify({
            error: 'Bad Request',
            message: 'lastNumberOfDays must be a number between 0 and 365',
          }),
        };
      }

      if (futureDays !== undefined && (isNaN(futureDays) || futureDays < 0 || futureDays > 365)) {
        return {
          statusCode: 400,
          headers: {
            'Content-Type': 'application/json',
            ...CORS_HEADERS,
          },
          body: JSON.stringify({
            error: 'Bad Request',
            message: 'futureDays must be a number between 0 and 365',
          }),
        };
      }

      dateRangeOverride = {
        lastNumberOfDays,
        futureDays,
      };

      logInfo('Using date range overrides', {
        lastNumberOfDays,
        futureDays,
      });
    } else {
      logInfo('No date range overrides - using default behavior');
    }

    // Initialize Lambda invoker
    const lambdaClient = new LambdaClient({});
    const lambdaInvoker = new LambdaInvoker(lambdaClient);

    // Step 1: Invoke get-aula-persist
    logInfo('Step 1: Invoking get-aula-persist lambda', {
      functionName: config.getAulaPersistFunctionName,
      hasDateOverride: !!dateRangeOverride,
    });

    const getAulaPayload: GetAulaPersistPayload = dateRangeOverride
      ? { dateRangeOverride }
      : {};

    const getAulaResult = await lambdaInvoker.invokeLambda(
      config.getAulaPersistFunctionName,
      getAulaPayload
    );

    const dataUpdateStep: StepResult = {
      status: getAulaResult.success ? 'success' : 'failed',
      statusCode: getAulaResult.statusCode,
      duration: getAulaResult.duration,
      message: getAulaResult.error,
      details: getAulaResult.payload,
    };

    // Check if operation was skipped (e.g., session in failed state)
    if (lambdaInvoker.isSkipped(getAulaResult)) {
      logInfo('Data update was skipped (session in failed state)', {
        payload: getAulaResult.payload,
      });

      dataUpdateStep.status = 'skipped';
      dataUpdateStep.message = 'Session in failed state - data update skipped';

      const totalDuration = Date.now() - startTime;
      const result: FullProcessResult = {
        success: false,
        steps: {
          dataUpdate: dataUpdateStep,
        },
        totalDuration,
        timestamp: new Date().toISOString(),
        message: 'Newsletter generation skipped: Session in failed state. Please update session ID.',
      };

      logInfo('Full process completed (skipped)', { result });

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS,
        },
        body: JSON.stringify(result),
      };
    }

    // Check if get-aula-persist failed
    if (!getAulaResult.success) {
      logError('Data update failed', {
        statusCode: getAulaResult.statusCode,
        error: getAulaResult.error,
      });

      const totalDuration = Date.now() - startTime;
      const result: FullProcessResult = {
        success: false,
        steps: {
          dataUpdate: dataUpdateStep,
        },
        totalDuration,
        timestamp: new Date().toISOString(),
        message: `Data update failed: ${getAulaResult.error || 'Unknown error'}`,
      };

      logInfo('Full process completed (data update failed)', { result });

      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS,
        },
        body: JSON.stringify(result),
      };
    }

    logInfo('Data update completed successfully', {
      duration: getAulaResult.duration,
    });

    // Step 2: Invoke generate-newsletter
    logInfo('Step 2: Invoking generate-newsletter lambda', {
      functionName: config.generateNewsletterFunctionName,
      hasDateOverride: !!dateRangeOverride,
    });

    const generateNewsletterPayload: GenerateNewsletterPayload = dateRangeOverride
      ? { dateRangeOverride }
      : {};

    const generateNewsletterResult = await lambdaInvoker.invokeLambda(
      config.generateNewsletterFunctionName,
      generateNewsletterPayload
    );

    const newsletterStep: StepResult = {
      status: generateNewsletterResult.success ? 'success' : 'failed',
      statusCode: generateNewsletterResult.statusCode,
      duration: generateNewsletterResult.duration,
      message: generateNewsletterResult.error,
      details: generateNewsletterResult.payload,
    };

    // Check if newsletter generation was skipped
    if (lambdaInvoker.isSkipped(generateNewsletterResult)) {
      logInfo('Newsletter generation was skipped', {
        payload: generateNewsletterResult.payload,
      });

      newsletterStep.status = 'skipped';
      newsletterStep.message = 'No new content - newsletter generation skipped';
    }

    // Prepare final result
    const totalDuration = Date.now() - startTime;
    const allSuccess = getAulaResult.success && generateNewsletterResult.success;

    const result: FullProcessResult = {
      success: allSuccess,
      steps: {
        dataUpdate: dataUpdateStep,
        newsletterGeneration: newsletterStep,
      },
      totalDuration,
      timestamp: new Date().toISOString(),
      message: allSuccess
        ? 'Full process completed successfully'
        : generateNewsletterResult.success
        ? 'Data updated, but newsletter generation had issues'
        : 'Data updated successfully, but newsletter generation failed',
    };

    logInfo('Full process completed', {
      success: allSuccess,
      totalDuration,
      dataUpdateDuration: dataUpdateStep.duration,
      newsletterDuration: newsletterStep.duration,
    });

    return {
      statusCode: allSuccess ? 200 : 207, // 207 = Multi-Status (partial success)
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
      },
      body: JSON.stringify(result),
    };
  } catch (error) {
    const totalDuration = Date.now() - startTime;
    const errorMessage = getErrorMessage(error);

    logError('Unexpected error in UpdateAndGenerateFullProcess', {
      error: errorMessage,
      duration: totalDuration,
    });

    const result: FullProcessResult = {
      success: false,
      steps: {
        dataUpdate: {
          status: 'failed',
          statusCode: 500,
          duration: totalDuration,
          message: errorMessage,
        },
      },
      totalDuration,
      timestamp: new Date().toISOString(),
      message: `Unexpected error: ${errorMessage}`,
    };

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
      },
      body: JSON.stringify(result),
    };
  }
};
