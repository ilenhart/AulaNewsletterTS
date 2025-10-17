/**
 * Integration test for GenerateNewsletter Lambda
 *
 * This test executes the LOCAL Lambda code against LIVE AWS resources.
 * It will:
 * - Use your local credentials (AWS_PROFILE or default credentials)
 * - Read from actual DynamoDB tables in your AWS environment
 * - Invoke Amazon Bedrock (Claude AI) for translation and summarization
 * - Send a real email via Amazon SES (if email config is provided)
 *
 * Prerequisites:
 * - AWS credentials configured (aws configure or AWS_PROFILE set)
 * - DynamoDB tables deployed and populated with data (run get-aula-persist first)
 * - .env file configured with all required variables
 * - Amazon Bedrock access enabled in your AWS account
 * - Amazon SES verified email addresses (sender and recipients)
 *
 * Run with: npm test -- test/integration/generate-newsletter.integration.test.ts
 */

import { handler } from '../../lambda/generate-newsletter';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

describe('GenerateNewsletter Integration Test', () => {
  // Increase timeout to 10 minutes since this:
  // - Queries multiple DynamoDB tables
  // - Makes multiple calls to Bedrock AI for translation/summarization
  // - Sends email via SES
  jest.setTimeout(600000);

  it('should successfully generate newsletter from DynamoDB data and send email', async () => {
    // Verify required environment variables are set
    expect(process.env.CHILD_NAME).toBeDefined();
    expect(process.env.PARENT_NAMES).toBeDefined();
    expect(process.env.EMAIL_FROM_ADDRESS).toBeDefined();
    expect(process.env.EMAIL_TO_ADDRESSES).toBeDefined();

    console.log('Starting GenerateNewsletter integration test...');
    console.log('This will:');
    console.log('  1. Read data from DynamoDB tables');
    console.log('  2. Invoke Amazon Bedrock (Claude AI) for translation and summarization');
    console.log('  3. Generate HTML newsletter content');
    console.log('  4. Send email via Amazon SES');
    console.log('');
    console.log('Configuration:');
    console.log(`  - Child Name: ${process.env.CHILD_NAME}`);
    console.log(`  - Parent Names: ${process.env.PARENT_NAMES}`);
    console.log(`  - Email From: ${process.env.EMAIL_FROM_ADDRESS}`);
    console.log(`  - Email To: ${process.env.EMAIL_TO_ADDRESSES}`);
    console.log(`  - Thread Messages Days: ${process.env.THREADMESSAGES_DAYS_IN_PAST || '30'}`);
    console.log(`  - Calendar Events Past Days: ${process.env.CALENDAR_EVENTS_DAYS_IN_PAST || '3'}`);
    console.log(`  - Calendar Events Future Days: ${process.env.CALENDAR_EVENTS_DAYS_IN_FUTURE || '7'}`);
    console.log(`  - Posts Days: ${process.env.POSTS_DAYS_IN_PAST || '3'}`);
    console.log('');

    // Create mock Lambda event and context
    const mockEvent = {};
    const mockContext = {
      functionName: 'GenerateNewsletter-Integration-Test',
      functionVersion: '$LATEST',
      invokedFunctionArn: 'arn:aws:lambda:local:000000000000:function:test',
      memoryLimitInMB: '512',
      awsRequestId: 'test-request-id',
      logGroupName: '/aws/lambda/test',
      logStreamName: 'test-stream',
      getRemainingTimeInMillis: () => 600000,
      done: () => {},
      fail: () => {},
      succeed: () => {},
      callbackWaitsForEmptyEventLoop: true,
    };

    // Execute the Lambda handler with local code against live AWS
    console.log('Executing Lambda handler...');
    const result = await handler(mockEvent, mockContext);

    // Verify successful response
    expect(result.statusCode).toBe(200);
    expect(result.body).toBeDefined();

    const responseBody = JSON.parse(result.body);
    expect(responseBody.message).toBe('Successfully generated newsletter');
    expect(responseBody.content).toBeDefined();
    expect(responseBody.timestamp).toBeDefined();

    // Verify HTML content was generated
    expect(responseBody.content).toContain('<!DOCTYPE html>');
    expect(responseBody.content).toContain('summary of recent Aula activity');

    console.log('');
    console.log('Integration test completed successfully!');
    console.log('Newsletter generated and email sent.');
    console.log('Response:', {
      message: responseBody.message,
      timestamp: responseBody.timestamp,
      contentLength: responseBody.content.length,
    });

    // Log a snippet of the generated content
    console.log('');
    console.log('Generated content preview (first 500 chars):');
    console.log(responseBody.content.substring(0, 500) + '...');
  });

  it('should handle missing required environment variables gracefully', async () => {
    // Temporarily remove required environment variables
    const originalChildName = process.env.CHILD_NAME;
    const originalParentNames = process.env.PARENT_NAMES;

    delete process.env.CHILD_NAME;
    delete process.env.PARENT_NAMES;

    const mockEvent = {};
    const mockContext = {
      functionName: 'GenerateNewsletter-Integration-Test',
      functionVersion: '$LATEST',
      invokedFunctionArn: 'arn:aws:lambda:local:000000000000:function:test',
      memoryLimitInMB: '512',
      awsRequestId: 'test-request-id',
      logGroupName: '/aws/lambda/test',
      logStreamName: 'test-stream',
      getRemainingTimeInMillis: () => 600000,
      done: () => {},
      fail: () => {},
      succeed: () => {},
      callbackWaitsForEmptyEventLoop: true,
    };

    // Execute the Lambda handler - should handle missing config
    const result = await handler(mockEvent, mockContext);

    // Even with missing child/parent names, the Lambda should complete
    // (it just won't have personalized context for AI prompts)
    expect(result.statusCode).toBe(200);

    // Restore environment variables
    process.env.CHILD_NAME = originalChildName;
    process.env.PARENT_NAMES = originalParentNames;
  });

  it('should retrieve data from DynamoDB tables without errors', async () => {
    // This is a lighter test that just verifies DynamoDB connectivity
    // without sending email

    // Temporarily disable email sending
    const originalEmailFrom = process.env.EMAIL_FROM_ADDRESS;
    delete process.env.EMAIL_FROM_ADDRESS;

    console.log('Testing DynamoDB and Bedrock connectivity (email disabled)...');

    const mockEvent = {};
    const mockContext = {
      functionName: 'GenerateNewsletter-Integration-Test',
      functionVersion: '$LATEST',
      invokedFunctionArn: 'arn:aws:lambda:local:000000000000:function:test',
      memoryLimitInMB: '512',
      awsRequestId: 'test-request-id',
      logGroupName: '/aws/lambda/test',
      logStreamName: 'test-stream',
      getRemainingTimeInMillis: () => 600000,
      done: () => {},
      fail: () => {},
      succeed: () => {},
      callbackWaitsForEmptyEventLoop: true,
    };

    const result = await handler(mockEvent, mockContext);

    // Should succeed even without sending email
    expect(result.statusCode).toBe(200);

    const responseBody = JSON.parse(result.body);
    expect(responseBody.content).toBeDefined();

    console.log('DynamoDB and Bedrock connectivity verified successfully!');

    // Restore email config
    process.env.EMAIL_FROM_ADDRESS = originalEmailFrom;
  });
});
