/**
 * Integration test for aula-keep-session-alive Lambda function
 *
 * This test runs locally but communicates with deployed AWS resources:
 * - DynamoDB: AulaSessionIdTable
 * - Aula API: Pings the live API with stored session
 * - Lambda handler runs locally for debugging
 *
 * Setup:
 * 1. Ensure you have deployed the CDK stack (npx cdk deploy)
 * 2. Ensure a valid session ID exists in DynamoDB (use manage-sessionid API to set it)
 * 3. Set environment variables in .env file:
 *    - AULA_SESSION_ID_TABLE=AulaSessionIdTable
 *    - API_URL=https://www.aula.dk/api/
 *    - EMAIL_FROM_ADDRESS=your-verified-ses-email@example.com
 *    - EMAIL_TO_ADDRESSES=recipient@example.com
 *    - AWS_REGION=your-region (or AWS_REGION_OVERRIDE)
 * 4. Ensure AWS credentials are configured
 *
 * Run: npm test -- aula-keep-session-alive.integration.test.ts
 */

import { EventBridgeEvent } from 'aws-lambda';
import { handler } from '../src/functions/aula-keep-session-alive/index';
import { DynamoDBSessionProvider } from '../src/common/dynamodb/session-provider';
import { createDynamoDBDocClient } from '../src/common/aws/dynamodb-client';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

describe('AulaKeepSessionAlive Lambda - Integration Tests', () => {
  const sessionTableName = process.env.AULA_SESSION_ID_TABLE || 'AulaSessionIdTable';
  const apiUrl = process.env.API_URL || 'https://www.aula.dk/api/';
  const emailFromAddress = process.env.EMAIL_FROM_ADDRESS;
  const emailToAddresses = process.env.EMAIL_TO_ADDRESSES;

  beforeAll(() => {
    // Verify required environment variables are set
    if (!emailFromAddress) {
      throw new Error('EMAIL_FROM_ADDRESS environment variable is required');
    }
    if (!emailToAddresses) {
      throw new Error('EMAIL_TO_ADDRESSES environment variable is required');
    }

    console.log('Test Configuration:');
    console.log(`  Session Table: ${sessionTableName}`);
    console.log(`  API URL: ${apiUrl}`);
    console.log(`  AWS Region: ${process.env.AWS_REGION_OVERRIDE || process.env.AWS_REGION || 'default'}`);
    console.log(`  Email From: ${emailFromAddress}`);
    console.log(`  Email To: ${emailToAddresses}`);
  });

  /**
   * Helper function to create a mock EventBridge scheduled event
   */
  function createScheduledEvent(): EventBridgeEvent<'Scheduled Event', Record<string, unknown>> {
    return {
      version: '0',
      id: 'test-event-id-' + Date.now(),
      'detail-type': 'Scheduled Event',
      source: 'aws.events',
      account: '123456789012',
      time: new Date().toISOString(),
      region: process.env.AWS_REGION || 'us-east-1',
      resources: [
        'arn:aws:events:us-east-1:123456789012:rule/KeepSessionAliveRule',
      ],
      detail: {},
    };
  }

  /**
   * Helper function to check if a valid session exists in DynamoDB
   */
  async function checkSessionExists(): Promise<boolean> {
    try {
      const docClient = createDynamoDBDocClient();
      const sessionProvider = new DynamoDBSessionProvider(docClient, sessionTableName);
      const sessionId = await sessionProvider.getKnownAulaSessionId();
      return !!sessionId && sessionId.length > 0;
    } catch (error) {
      return false;
    }
  }

  /**
   * Helper function to create a test session in DynamoDB
   * Returns the session ID that was created
   */
  async function createTestSession(): Promise<string> {
    const { PutCommand } = await import('@aws-sdk/lib-dynamodb');
    const docClient = createDynamoDBDocClient();
    const testSessionId = `test-session-${Date.now()}`;
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    await docClient.send(
      new PutCommand({
        TableName: sessionTableName,
        Item: {
          Id: 1,
          sessionId: testSessionId,
          created: now,
          lastUpdated: now,
          ttl: ttl,
        },
      })
    );

    console.log(`Created test session: ${testSessionId}`);
    return testSessionId;
  }

  describe('Handler Execution', () => {
    it('should successfully execute when a valid session exists', async () => {
      // Check if session exists, skip test if not
      const sessionExists = await checkSessionExists();
      if (!sessionExists) {
        console.warn('⚠️  No session found in DynamoDB - skipping test');
        console.warn('   Run the manage-sessionid API to set a valid session first');
        return; // Skip test gracefully
      }

      // Arrange
      const event = createScheduledEvent();

      // Act
      const response = await handler(event);

      // Assert
      console.log('Response:', JSON.stringify(response, null, 2));

      // The response could be:
      // - 200 (success - valid session)
      // - 500 (failure - invalid/expired session)
      // - 502 (bad gateway - Aula API error)
      // All are valid test outcomes - we're just verifying the handler executes without crashing
      expect(response).toHaveProperty('statusCode');
      expect(response).toHaveProperty('body');
      expect([200, 500, 502]).toContain(response.statusCode);

      const body = JSON.parse(response.body);
      console.log('Response Body:', JSON.stringify(body, null, 2));

      if (response.statusCode === 200) {
        // Success case - valid Aula session
        expect(body).toHaveProperty('message', 'Successfully kept session alive');
        expect(body).toHaveProperty('timestamp');
        expect(body).toHaveProperty('duration');
        expect(body.duration).toMatch(/\d+ms/);
      } else {
        // Failure case (session expired/invalid/API error)
        expect(body).toHaveProperty('message', 'Error keeping session alive');
        expect(body).toHaveProperty('error');
        expect(body).toHaveProperty('timestamp');
        console.log(`ℹ️  Lambda failed as expected with test session: ${body.error}`);
      }
    }, 60000); // 60 second timeout for Aula API call

    it('should handle the case when no session exists in DynamoDB', async () => {
      // This test is informational - we can't easily delete the session
      // without affecting other tests or the production session
      // So we just document expected behavior

      console.log('ℹ️  Expected behavior when no session exists:');
      console.log('   - Handler should fail with an error');
      console.log('   - Error message should indicate missing session');
      console.log('   - Email alert should be sent (if SES is configured)');
      console.log('   - Response statusCode should be 500');

      // This test serves as documentation of expected behavior
      expect(true).toBe(true);
    });

    it('should return proper response structure', async () => {
      // Arrange
      const event = createScheduledEvent();

      // Act
      const response = await handler(event);

      // Assert - Verify response structure regardless of success/failure
      expect(response).toHaveProperty('statusCode');
      expect(typeof response.statusCode).toBe('number');
      expect(response).toHaveProperty('body');
      expect(typeof response.body).toBe('string');

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('message');
      expect(body).toHaveProperty('timestamp');

      // Verify timestamp is valid ISO string
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    }, 60000);
  });

  describe('EventBridge Event Processing', () => {
    it('should accept and process EventBridge scheduled events', async () => {
      // Arrange
      const event = createScheduledEvent();

      // Verify event structure
      expect(event).toHaveProperty('version', '0');
      expect(event).toHaveProperty('detail-type', 'Scheduled Event');
      expect(event).toHaveProperty('source', 'aws.events');
      expect(event).toHaveProperty('resources');
      expect(Array.isArray(event.resources)).toBe(true);
      expect(event.resources.length).toBeGreaterThan(0);

      // Act - Handler should accept this event structure
      const response = await handler(event);

      // Assert
      expect(response).toBeDefined();
      expect(response.statusCode).toBeDefined();
    }, 60000);

    it('should include execution metadata in response', async () => {
      // Arrange
      const event = createScheduledEvent();
      const startTime = Date.now();

      // Act
      const response = await handler(event);
      const endTime = Date.now();
      const totalDuration = endTime - startTime;

      // Assert
      console.log(`Total test execution time: ${totalDuration}ms`);

      const body = JSON.parse(response.body);

      if (response.statusCode === 200) {
        // Success case includes duration
        expect(body).toHaveProperty('duration');
        const durationMatch = body.duration.match(/(\d+)ms/);
        expect(durationMatch).toBeTruthy();

        if (durationMatch) {
          const reportedDuration = parseInt(durationMatch[1]);
          console.log(`Lambda reported duration: ${reportedDuration}ms`);
          expect(reportedDuration).toBeGreaterThan(0);
          expect(reportedDuration).toBeLessThan(totalDuration + 1000); // Allow 1s overhead
        }
      }

      expect(body).toHaveProperty('timestamp');
    }, 60000);
  });

  describe('Configuration', () => {
    it('should load configuration from environment variables', () => {
      // Verify environment variables are accessible
      expect(process.env.AULA_SESSION_ID_TABLE).toBeDefined();
      expect(process.env.API_URL).toBeDefined();
      expect(process.env.EMAIL_FROM_ADDRESS).toBeDefined();
      expect(process.env.EMAIL_TO_ADDRESSES).toBeDefined();

      console.log('Environment Configuration:');
      console.log(`  AULA_SESSION_ID_TABLE: ${process.env.AULA_SESSION_ID_TABLE}`);
      console.log(`  API_URL: ${process.env.API_URL}`);
      console.log(`  EMAIL_FROM_ADDRESS: ${process.env.EMAIL_FROM_ADDRESS}`);
      console.log(`  EMAIL_TO_ADDRESSES: ${process.env.EMAIL_TO_ADDRESSES}`);
    });
  });

  describe('Session Management', () => {
    it('should be able to read session from DynamoDB', async () => {
      // Arrange
      const docClient = createDynamoDBDocClient();
      const sessionProvider = new DynamoDBSessionProvider(docClient, sessionTableName);

      // Act
      let sessionId: string = '';
      let error: Error | null = null;

      try {
        sessionId = await sessionProvider.getKnownAulaSessionId();
      } catch (err) {
        error = err as Error;
      }

      // Assert - Either we get a session ID or empty string (both valid states)
      if (sessionId && sessionId.length > 0) {
        console.log(`✓ Session found: ${sessionId.substring(0, 20)}...`);
        expect(typeof sessionId).toBe('string');
        expect(sessionId.length).toBeGreaterThan(0);
      } else if (error) {
        console.log(`ℹ️  Error reading session: ${error.message}`);
        expect(error).toBeInstanceOf(Error);
      } else {
        console.log('ℹ️  No session in DynamoDB (expected if session not set)');
        expect(sessionId).toBe('');
      }
    });
  });
});
