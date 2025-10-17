/**
 * Authentication middleware for API Gateway requests
 * Validates the X-aulasession-authenticate header
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { logWarn } from '../../common/utils';

/**
 * CORS headers for all responses
 */
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type,X-aulasession-authenticate,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
};

/**
 * Validates the authentication token from request headers
 * Returns true if valid, false otherwise
 */
export function validateAuthToken(event: APIGatewayProxyEvent, expectedToken: string): boolean {
  const authHeader = event.headers['X-aulasession-authenticate'] || event.headers['x-aulasession-authenticate'];

  if (!authHeader) {
    logWarn('Missing authentication header');
    return false;
  }

  if (authHeader !== expectedToken) {
    logWarn('Invalid authentication token');
    return false;
  }

  return true;
}

/**
 * Creates a 401 Unauthorized response
 */
export function createUnauthorizedResponse() {
  return {
    statusCode: 401,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
    body: JSON.stringify({
      error: 'Unauthorized',
      message: 'Missing or invalid X-aulasession-authenticate header',
    }),
  };
}
