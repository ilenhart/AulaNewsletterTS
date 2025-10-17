/**
 * Integration test for GetAulaAndPersist Lambda
 *
 * This test executes the LOCAL Lambda code against LIVE AWS resources.
 * It will:
 * - Use your local credentials (AWS_PROFILE or default credentials)
 * - Connect to the real Aula API
 * - Write to the actual DynamoDB tables in your AWS environment
 *
 * Prerequisites:
 * - AWS credentials configured (aws configure or AWS_PROFILE set)
 * - DynamoDB tables deployed to AWS
 * - .env file with Aula credentials configured
 *
 * Run with: npm test -- test/integration/get-aula-persist.integration.test.ts
 */

import { handler } from '../../lambda/get-aula-persist';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

describe('GetAulaAndPersist Integration Test', () => {
  // Increase timeout to 5 minutes since this calls real APIs and AWS services
  jest.setTimeout(300000);

  it('should successfully fetch Aula data and persist to DynamoDB', async () => {
    // Verify required environment variables are set
    expect(process.env.AULA_USERNAME).toBeDefined();
    expect(process.env.AULA_PASSWORD).toBeDefined();

    console.log('Starting integration test...');
    console.log('This will connect to real Aula API and AWS DynamoDB tables');

    // Create mock Lambda event and context
    const mockEvent = {};
    const mockContext = {
      functionName: 'GetAulaAndPersist-Integration-Test',
      functionVersion: '$LATEST',
      invokedFunctionArn: 'arn:aws:lambda:local:000000000000:function:test',
      memoryLimitInMB: '512',
      awsRequestId: 'test-request-id',
      logGroupName: '/aws/lambda/test',
      logStreamName: 'test-stream',
      getRemainingTimeInMillis: () => 300000,
      done: () => {},
      fail: () => {},
      succeed: () => {},
      callbackWaitsForEmptyEventLoop: true,
    };

    // Execute the Lambda handler with local code against live AWS
    const result = await handler(mockEvent, mockContext);

    // Verify successful response
    expect(result.statusCode).toBe(200);
    expect(result.body).toBeDefined();

    const responseBody = JSON.parse(result.body);
    expect(responseBody.message).toBe('Successfully retrieved and persisted Aula data');
    expect(responseBody.timestamp).toBeDefined();

    console.log('Integration test completed successfully!');
    console.log('Response:', responseBody);
  });

  it('should handle missing credentials gracefully', async () => {
    // Temporarily remove credentials
    const originalUsername = process.env.AULA_USERNAME;
    const originalPassword = process.env.AULA_PASSWORD;

    delete process.env.AULA_USERNAME;
    delete process.env.AULA_PASSWORD;

    const mockEvent = {};
    const mockContext = {
      functionName: 'GetAulaAndPersist-Integration-Test',
      functionVersion: '$LATEST',
      invokedFunctionArn: 'arn:aws:lambda:local:000000000000:function:test',
      memoryLimitInMB: '512',
      awsRequestId: 'test-request-id',
      logGroupName: '/aws/lambda/test',
      logStreamName: 'test-stream',
      getRemainingTimeInMillis: () => 300000,
      done: () => {},
      fail: () => {},
      succeed: () => {},
      callbackWaitsForEmptyEventLoop: true,
    };

    const result = await handler(mockEvent, mockContext);

    // Should return error response
    expect(result.statusCode).toBe(500);
    expect(result.body).toBeDefined();

    const responseBody = JSON.parse(result.body);
    expect(responseBody.message).toBe('Error processing Aula data');
    expect(responseBody.error).toContain('AULA_USERNAME and AULA_PASSWORD must be set');

    // Restore credentials
    process.env.AULA_USERNAME = originalUsername;
    process.env.AULA_PASSWORD = originalPassword;
  });
});
