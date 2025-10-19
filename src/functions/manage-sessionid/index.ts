/**
 * Lambda handler for managing Aula session IDs via API Gateway
 *
 * Endpoints:
 * - GET /api/sessionID - Retrieve current session record
 * - POST /api/sessionID - Update session with new sessionId
 *
 * Authentication: Requires X-aulasession-authenticate header
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { createDynamoDBDocClient } from '../../common/aws/dynamodb-client';
import { logInfo, logError, logWarn } from '../../common/utils';
import { isValidSessionId, getSessionIdErrorMessage } from '../../common/session-validation';
import { loadConfig } from './config';
import { validateAuthToken, createUnauthorizedResponse } from './auth';
import { SessionManager } from './session-manager';

/**
 * CORS headers for all responses
 * Allows requests from Chrome extensions and web browsers
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-aulasession-authenticate,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

/**
 * Main Lambda handler for API Gateway proxy integration
 */
export async function handler(event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> {
  logInfo('Received API Gateway request', {
    method: event.httpMethod,
    path: event.path,
  });

  try {
    // Load configuration
    const config = loadConfig();

    // Validate authentication token
    if (!validateAuthToken(event, config.authToken)) {
      return createUnauthorizedResponse();
    }

    // Initialize session manager
    const docClient = createDynamoDBDocClient();
    const sessionManager = new SessionManager(docClient, config.tableName);

    // Route based on HTTP method
    switch (event.httpMethod) {
      case 'GET':
        return await handleGetSession(sessionManager);
      case 'POST':
        return await handlePostSession(sessionManager, event);
      default:
        return createMethodNotAllowedResponse(event.httpMethod);
    }
  } catch (error) {
    logError('Unexpected error in Lambda handler', {
      error: error instanceof Error ? error.message : String(error),
    });
    return createErrorResponse(error);
  }
}

/**
 * Handle GET request - retrieve current session
 */
async function handleGetSession(sessionManager: SessionManager): Promise<APIGatewayProxyResult> {
  try {
    const session = await sessionManager.getSession();

    if (!session) {
      return {
        statusCode: 404,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS,
        },
        body: JSON.stringify({
          error: 'Not Found',
          message: 'No session record found',
        }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
      },
      body: JSON.stringify(session),
    };
  } catch (error) {
    logError('Error handling GET request', {
      error: error instanceof Error ? error.message : String(error),
    });
    return createErrorResponse(error);
  }
}

/**
 * Handle POST request - update session with new sessionId
 */
async function handlePostSession(
  sessionManager: SessionManager,
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> {
  try {
    // Parse request body
    if (!event.body) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS,
        },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Request body is required',
        }),
      };
    }

    let requestBody: { sessionId?: string };
    try {
      requestBody = JSON.parse(event.body);
    } catch {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS,
        },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'Invalid JSON in request body',
        }),
      };
    }

    // Validate sessionId exists and is a string
    if (!requestBody.sessionId || typeof requestBody.sessionId !== 'string') {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS,
        },
        body: JSON.stringify({
          error: 'Bad Request',
          message: 'sessionId is required and must be a string',
        }),
      };
    }

    // Validate sessionId format (32 lowercase alphanumeric characters)
    if (!isValidSessionId(requestBody.sessionId)) {
      const errorMessage = getSessionIdErrorMessage(requestBody.sessionId);
      logWarn('Invalid session ID format provided', {
        sessionIdLength: requestBody.sessionId.length,
        errorMessage,
      });
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          ...CORS_HEADERS,
        },
        body: JSON.stringify({
          error: 'Bad Request',
          message: errorMessage,
        }),
      };
    }

    // Update session
    const session = await sessionManager.updateSession(requestBody.sessionId);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        ...CORS_HEADERS,
      },
      body: JSON.stringify({
        message: 'Session ID updated successfully',
        sessionId: session.sessionId,
      }),
    };
  } catch (error) {
    logError('Error handling POST request', {
      error: error instanceof Error ? error.message : String(error),
    });
    return createErrorResponse(error);
  }
}

/**
 * Create 405 Method Not Allowed response
 */
function createMethodNotAllowedResponse(method: string): APIGatewayProxyResult {
  return {
    statusCode: 405,
    headers: {
      'Content-Type': 'application/json',
      'Allow': 'GET, POST',
      ...CORS_HEADERS,
    },
    body: JSON.stringify({
      error: 'Method Not Allowed',
      message: `HTTP method ${method} is not supported. Allowed methods: GET, POST`,
    }),
  };
}

/**
 * Create 500 Internal Server Error response
 */
function createErrorResponse(error: unknown): APIGatewayProxyResult {
  return {
    statusCode: 500,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify({
      error: 'Internal Server Error',
      message: error instanceof Error ? error.message : 'An unexpected error occurred',
    }),
  };
}
