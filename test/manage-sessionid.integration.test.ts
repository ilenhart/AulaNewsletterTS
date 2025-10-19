/**
 * Integration test for manage-sessionid Lambda function
 *
 * This test runs locally but communicates with deployed AWS resources:
 * - DynamoDB: AulaSessionIdTable
 * - Lambda handler runs locally for debugging
 *
 * Setup:
 * 1. Ensure you have deployed the CDK stack (npx cdk deploy)
 * 2. Set environment variables in .env file:
 *    - TABLE_NAME=AulaSessionIdTable
 *    - AULASESSION_AUTHENTICATE_TOKEN=your-token
 *    - AWS_REGION=your-region (or AWS_REGION_OVERRIDE)
 * 3. Ensure AWS credentials are configured
 *
 * Run: npm test -- manage-sessionid.integration.test.ts
 */

import { APIGatewayProxyEvent } from 'aws-lambda';
import { handler } from '../src/functions/manage-sessionid/index';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

describe('ManageSessionId Lambda - Integration Tests', () => {
  // Store the auth token from environment
  const authToken = process.env.AULASESSION_AUTHENTICATE_TOKEN;
  const tableName = process.env.TABLE_NAME || 'AulaSessionIdTable';

  beforeAll(() => {
    // Verify required environment variables are set
    if (!authToken) {
      throw new Error('AULASESSION_AUTHENTICATE_TOKEN environment variable is required');
    }

    console.log('Test Configuration:');
    console.log(`  Table Name: ${tableName}`);
    console.log(`  AWS Region: ${process.env.AWS_REGION_OVERRIDE || process.env.AWS_REGION || 'default'}`);
    console.log(`  Auth Token: ${authToken.substring(0, 8)}...`);
  });

  /**
   * Helper function to create a mock API Gateway GET event
   */
  function createGetEvent(headers?: Record<string, string>): APIGatewayProxyEvent {
    return {
      httpMethod: 'GET',
      path: '/api/sessionID',
      resource: '/api/sessionID',
      body: null,
      headers: {
        'Content-Type': 'application/json',
        'X-aulasession-authenticate': authToken!,
        ...headers,
      },
      multiValueHeaders: {},
      isBase64Encoded: false,
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        accountId: '123456789012',
        apiId: 'test-api-id',
        protocol: 'HTTP/1.1',
        httpMethod: 'GET',
        path: '/api/sessionID',
        stage: 'prod',
        requestId: 'test-request-id',
        requestTimeEpoch: Date.now(),
        resourceId: 'test-resource-id',
        resourcePath: '/api/sessionID',
        identity: {
          accessKey: null,
          accountId: null,
          apiKey: null,
          apiKeyId: null,
          caller: null,
          clientCert: null,
          cognitoAuthenticationProvider: null,
          cognitoAuthenticationType: null,
          cognitoIdentityId: null,
          cognitoIdentityPoolId: null,
          principalOrgId: null,
          sourceIp: '127.0.0.1',
          user: null,
          userAgent: 'jest-test',
          userArn: null,
        },
        authorizer: null,
      },
    } as APIGatewayProxyEvent;
  }

  /**
   * Helper function to create a mock API Gateway POST event
   * Used for setting/updating the session ID
   */
  function createPostEvent(
    sessionId: string,
    headers?: Record<string, string>
  ): APIGatewayProxyEvent {
    return {
      httpMethod: 'POST',
      path: '/api/sessionID',
      resource: '/api/sessionID',
      body: JSON.stringify({ sessionId }),
      headers: {
        'Content-Type': 'application/json',
        'X-aulasession-authenticate': authToken!,
        ...headers,
      },
      multiValueHeaders: {},
      isBase64Encoded: false,
      pathParameters: null,
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      stageVariables: null,
      requestContext: {
        accountId: '123456789012',
        apiId: 'test-api-id',
        protocol: 'HTTP/1.1',
        httpMethod: 'POST',
        path: '/api/sessionID',
        stage: 'prod',
        requestId: 'test-request-id',
        requestTimeEpoch: Date.now(),
        resourceId: 'test-resource-id',
        resourcePath: '/api/sessionID',
        identity: {
          accessKey: null,
          accountId: null,
          apiKey: null,
          apiKeyId: null,
          caller: null,
          clientCert: null,
          cognitoAuthenticationProvider: null,
          cognitoAuthenticationType: null,
          cognitoIdentityId: null,
          cognitoIdentityPoolId: null,
          principalOrgId: null,
          sourceIp: '127.0.0.1',
          user: null,
          userAgent: 'jest-test',
          userArn: null,
        },
        authorizer: null,
      },
    } as APIGatewayProxyEvent;
  }

  describe('GET /api/sessionID', () => {
    it('should return 200 and session data when session exists', async () => {
      // Arrange
      const event = createGetEvent();

      // Act
      const response = await handler(event);

      // Assert
      console.log('Response:', JSON.stringify(response, null, 2));

      expect(response.statusCode).toBeGreaterThanOrEqual(200);
      expect(response.statusCode).toBeLessThan(500);
      expect(response.headers).toHaveProperty('Content-Type', 'application/json');
      expect(response.headers).toHaveProperty('Access-Control-Allow-Origin', '*');

      const body = JSON.parse(response.body);
      console.log('Response Body:', JSON.stringify(body, null, 2));

      if (response.statusCode === 200) {
        // Session exists
        expect(body).toHaveProperty('Id');
        expect(body).toHaveProperty('sessionId');
        expect(body).toHaveProperty('lastUpdated');
        expect(body).toHaveProperty('created');
        expect(body.Id).toBe(1);
      } else if (response.statusCode === 404) {
        // No session found (valid scenario)
        expect(body).toHaveProperty('error', 'Not Found');
        expect(body).toHaveProperty('message');
      } else {
        throw new Error(`Unexpected status code: ${response.statusCode}`);
      }
    }, 30000); // 30 second timeout for AWS calls

    it('should return 401 when authentication token is missing', async () => {
      // Arrange
      const event = createGetEvent({
        'X-aulasession-authenticate': '', // Empty token
      });

      // Act
      const response = await handler(event);

      // Assert
      expect(response.statusCode).toBe(401);
      expect(response.headers).toHaveProperty('Content-Type', 'application/json');

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Unauthorized');
      expect(body).toHaveProperty('message');
    });

    it('should return 401 when authentication token is invalid', async () => {
      // Arrange
      const event = createGetEvent({
        'X-aulasession-authenticate': 'invalid-token-12345',
      });

      // Act
      const response = await handler(event);

      // Assert
      expect(response.statusCode).toBe(401);
      expect(response.headers).toHaveProperty('Content-Type', 'application/json');

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Unauthorized');
    });

    it('should include CORS headers in response', async () => {
      // Arrange
      const event = createGetEvent();

      // Act
      const response = await handler(event);

      // Assert
      expect(response.headers).toHaveProperty('Access-Control-Allow-Origin', '*');
      expect(response.headers).toHaveProperty('Access-Control-Allow-Methods');
      expect(response.headers).toHaveProperty('Access-Control-Allow-Headers');
    });
  });

  describe('POST /api/sessionID', () => {
    it('should post a session ID and then retrieve it successfully', async () => {
      // Arrange - Generate a valid 32-character lowercase alphanumeric session ID
      const randomString = Math.random().toString(32).substring(2) + Math.random().toString(32).substring(2);
      const testSessionId = randomString.substring(0, 32).toLowerCase().padEnd(32, '0');
      console.log(`Testing with valid session ID: ${testSessionId}`);

      // Act - Step 1: POST the session ID
      const postEvent = createPostEvent(testSessionId);
      const postResponse = await handler(postEvent);

      // Assert - POST should succeed
      console.log('POST Response:', JSON.stringify(postResponse, null, 2));
      expect(postResponse.statusCode).toBe(200);
      expect(postResponse.headers).toHaveProperty('Content-Type', 'application/json');
      expect(postResponse.headers).toHaveProperty('Access-Control-Allow-Origin', '*');

      const postBody = JSON.parse(postResponse.body);
      expect(postBody).toHaveProperty('message');
      console.log('POST Response Body:', JSON.stringify(postBody, null, 2));

      // Act - Step 2: GET the session ID
      const getEvent = createGetEvent();
      const getResponse = await handler(getEvent);

      // Assert - GET should return the session we just posted
      console.log('GET Response:', JSON.stringify(getResponse, null, 2));
      expect(getResponse.statusCode).toBe(200);
      expect(getResponse.headers).toHaveProperty('Content-Type', 'application/json');

      const getBody = JSON.parse(getResponse.body);
      console.log('GET Response Body:', JSON.stringify(getBody, null, 2));

      // Verify the retrieved session matches what we posted
      expect(getBody).toHaveProperty('Id', 1);
      expect(getBody).toHaveProperty('sessionId', testSessionId);
      expect(getBody).toHaveProperty('lastUpdated');
      expect(getBody).toHaveProperty('created');

      // Verify timestamps are valid ISO strings
      expect(new Date(getBody.lastUpdated).toISOString()).toBe(getBody.lastUpdated);
      expect(new Date(getBody.created).toISOString()).toBe(getBody.created);
    }, 30000); // 30 second timeout for AWS calls

    it('should reject session ID with invalid format - too short', async () => {
      // Arrange - Session ID that is too short (only 20 characters)
      const invalidSessionId = 'abcd1234efgh5678ijkl';
      console.log(`Testing with too-short session ID: ${invalidSessionId} (${invalidSessionId.length} chars)`);

      // Act
      const postEvent = createPostEvent(invalidSessionId);
      const response = await handler(postEvent);

      // Assert
      console.log('Response:', JSON.stringify(response, null, 2));
      expect(response.statusCode).toBe(400);
      expect(response.headers).toHaveProperty('Content-Type', 'application/json');

      const body = JSON.parse(response.body);
      console.log('Response Body:', JSON.stringify(body, null, 2));
      expect(body).toHaveProperty('error', 'Bad Request');
      expect(body.message).toContain('32 characters');
      expect(body.message).toContain('20 characters');
    });

    it('should reject session ID with invalid format - too long', async () => {
      // Arrange - Session ID that is too long (36 characters)
      const invalidSessionId = 'abcd1234efgh5678ijkl9012mnop3456qrst';
      console.log(`Testing with too-long session ID: ${invalidSessionId} (${invalidSessionId.length} chars)`);

      // Act
      const postEvent = createPostEvent(invalidSessionId);
      const response = await handler(postEvent);

      // Assert
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Bad Request');
      expect(body.message).toContain('32 characters');
      expect(body.message).toContain('36 characters');
    });

    it('should reject session ID with uppercase letters', async () => {
      // Arrange - Valid length but contains uppercase
      const invalidSessionId = 'ABCD1234efgh5678ijkl9012mnop3456';
      console.log(`Testing with uppercase session ID: ${invalidSessionId}`);

      // Act
      const postEvent = createPostEvent(invalidSessionId);
      const response = await handler(postEvent);

      // Assert
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Bad Request');
      expect(body.message).toContain('uppercase');
    });

    it('should reject session ID with special characters', async () => {
      // Arrange - Valid length but contains special characters
      const invalidSessionId = 'abcd-1234-efgh-5678-ijkl-9012-mn';
      console.log(`Testing with special chars session ID: ${invalidSessionId}`);

      // Act
      const postEvent = createPostEvent(invalidSessionId);
      const response = await handler(postEvent);

      // Assert
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Bad Request');
      expect(body.message).toContain('lowercase letters');
      expect(body.message).toContain('numbers');
    });

    it('should reject session ID with spaces', async () => {
      // Arrange - Valid length but contains spaces
      const invalidSessionId = 'abcd 1234 efgh 5678 ijkl 9012 mn';
      console.log(`Testing with spaces session ID: "${invalidSessionId}"`);

      // Act
      const postEvent = createPostEvent(invalidSessionId);
      const response = await handler(postEvent);

      // Assert
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Bad Request');
      expect(body.message).toContain('lowercase letters');
      expect(body.message).toContain('numbers');
    });
  });

  describe('Error Handling', () => {
    it('should return 405 for unsupported HTTP methods', async () => {
      // Arrange
      const event = createGetEvent();
      event.httpMethod = 'DELETE'; // Unsupported method

      // Act
      const response = await handler(event);

      // Assert
      expect(response.statusCode).toBe(405);
      expect(response.headers).toHaveProperty('Allow', 'GET, POST');

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('error', 'Method Not Allowed');
      expect(body.message).toContain('DELETE');
    });
  });
});
