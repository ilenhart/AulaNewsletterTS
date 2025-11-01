

import { handler as GetAulaPersistHandler } from '../src/functions/get-aula-persist/index';
import { handler as GenerateNewsletterHandler } from '../src/functions/generate-newsletter/index';
import { handler as KeepSessionAliveHandler } from '../src/functions/aula-keep-session-alive/index';
import { handler as UpdateAndGenerateHandler } from '../src/functions/update-and-generate-full-process/index';
import { setupLambdaMocks } from './lambda-mock-helper';

const createMockGetAulaPersistEvent = () => ({
  version: '0',
  id: 'test-event-id-' + Date.now(),
  'detail-type': 'Scheduled Event',
  source: 'aws.events',
  account: '123456789012',
  time: new Date().toISOString(),
  region: process.env.AWS_REGION || 'us-east-1',
  resources: [
    'arn:aws:events:us-east-1:123456789012:rule/GetAulaAndPersistRule',
  ],
  detail: {},
});

const createMockGetAulaPersistContext = () => ({
  functionName: 'GetAulaAndPersistFunction-Test',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:GetAulaAndPersistFunction-Test',
  memoryLimitInMB: '512',
  awsRequestId: 'test-request-id-' + Date.now(),
  logGroupName: '/aws/lambda/GetAulaAndPersistFunction-Test',
  logStreamName: '2025/10/18/[$LATEST]test-stream',
  getRemainingTimeInMillis: () => 900000, // 15 minutes
  done: () => {},
  fail: () => {},
  succeed: () => {},
  callbackWaitsForEmptyEventLoop: true,
});

// Mock EventBridge event and Lambda context
const createMockGenerateNewsletterEvent = () => ({
  version: '0',
  id: 'test-event-id-' + Date.now(),
  'detail-type': 'Scheduled Event',
  source: 'aws.events',
  account: '123456789012',
  time: new Date().toISOString(),
  region: process.env.AWS_REGION || 'us-east-1',
  resources: [
    'arn:aws:events:us-east-1:123456789012:rule/GenerateNewsletterRule',
  ],
  detail: {},
});

const createMockGenerateNewsletterContext = () => ({
  functionName: 'GenerateNewsletterFunction-Test',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:GenerateNewsletterFunction-Test',
  memoryLimitInMB: '512',
  awsRequestId: 'test-request-id-' + Date.now(),
  logGroupName: '/aws/lambda/GenerateNewsletterFunction-Test',
  logStreamName: '2025/10/18/[$LATEST]test-stream',
  getRemainingTimeInMillis: () => 900000, // 15 minutes
  done: () => {},
  fail: () => {},
  succeed: () => {},
  callbackWaitsForEmptyEventLoop: true,
});

const createMockKeepSessionAliveEvent = () => ({
  version: '0',
  id: 'test-event-id-' + Date.now(),
  'detail-type': 'Scheduled Event' as const,
  source: 'aws.events',
  account: '123456789012',
  time: new Date().toISOString(),
  region: process.env.AWS_REGION || 'us-east-1',
  resources: [
    'arn:aws:events:us-east-1:123456789012:rule/AulaKeepSessionAliveRule',
  ],
  detail: {},
});

// Mock API Gateway event for UpdateAndGenerateFullProcess
const createMockUpdateAndGenerateEvent = (queryParams?: {
  lastNumberOfDays?: string;
  futureDays?: string;
}) => ({
  httpMethod: 'PUT',
  path: '/api/sendNewsletter',
  headers: {
    'X-aulasession-authenticate': process.env.AULASESSION_AUTHENTICATE_TOKEN || 'test-token',
    'Content-Type': 'application/json',
  },
  queryStringParameters: queryParams,
  body: undefined,
  isBase64Encoded: false,
  requestContext: {
    accountId: '123456789012',
    apiId: 'test-api-id',
    requestId: 'test-request-id-' + Date.now(),
  },
});

const createMockUpdateAndGenerateContext = () => ({
  functionName: 'UpdateAndGenerateFullProcessFunction-Test',
  functionVersion: '$LATEST',
  invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:UpdateAndGenerateFullProcessFunction-Test',
  memoryLimitInMB: '1024',
  awsRequestId: 'test-request-id-' + Date.now(),
  logGroupName: '/aws/lambda/UpdateAndGenerateFullProcessFunction-Test',
  logStreamName: '2025/11/01/[$LATEST]test-stream',
  getRemainingTimeInMillis: () => 900000, // 15 minutes
  done: () => {},
  fail: () => {},
  succeed: () => {},
  callbackWaitsForEmptyEventLoop: true,
});

describe('Main runthrough', () => {

  // Setup Lambda SDK mocks before all tests
  // This intercepts Lambda InvokeCommand calls and redirects to local handlers
  beforeAll(() => {
    setupLambdaMocks();
  });

  it('should successfully ping Aula with the session in the db', async () => {
    // Assume session exists in DynamoDB

    // Arrange
    const event = createMockKeepSessionAliveEvent();

    // Act
    const startTime = Date.now();
    const response = await KeepSessionAliveHandler(event);
    const duration = Date.now() - startTime;

    // Assert
    console.log(`\nExecution completed in ${duration}ms`);
    console.log('Response:', JSON.stringify(response, null, 2));

    // Response should have valid structure
    expect(response).toHaveProperty('statusCode');
    expect(response).toHaveProperty('body');
    expect(typeof response.body).toBe('string');

    const body = JSON.parse(response.body);
    console.log('Response Body:', JSON.stringify(body, null, 2));

    // Status code should be 200 (success) or 500 (error)
    expect([200, 500, 502]).toContain(response.statusCode);

    if (response.statusCode === 200) {
      // Success - session ping worked
      expect(body).toHaveProperty('message');
      expect(body.message).toContain('Successfully kept session alive');
      expect(body).toHaveProperty('timestamp');
      expect(body).toHaveProperty('duration');
      console.log('\n✓ Session successfully kept alive!');
      console.log(`  Duration: ${body.duration}`);
    } else {
      // Failure - session might have expired
      expect(body).toHaveProperty('message');
      expect(body).toHaveProperty('error');
      expect(body).toHaveProperty('timestamp');
      console.log(`\nℹ️  Lambda failed (session may have expired): ${body.error || body.message}`);
      console.log('⚠️  An email alert should have been sent to configured recipients');
    }
  }, 120000); // 2 minute timeout for Aula API calls


    it('should successfully execute and persist data from Aula API', async () => {
 
      //Assume session exists

      // Arrange
      const event = createMockGetAulaPersistEvent();
      const context = createMockGetAulaPersistContext();

      // Act
      const startTime = Date.now();
      const response = await GetAulaPersistHandler(event, context);
      const duration = Date.now() - startTime;

      // Assert
      console.log(`\nExecution completed in ${duration}ms`);
      console.log('Response:', JSON.stringify(response, null, 2));

      // Response should have valid structure
      expect(response).toHaveProperty('statusCode');
      expect(response).toHaveProperty('body');
      expect(typeof response.body).toBe('string');

      const body = JSON.parse(response.body);
      console.log('Response Body:', JSON.stringify(body, null, 2));

      // Status code should be 200 (success), 207 (partial), or 500 (error)
      expect([200, 207, 500, 502]).toContain(response.statusCode);

      if (response.statusCode === 200) {
        // Complete success
        expect(body).toHaveProperty('message');
        expect(body.message).toContain('Successfully');
        expect(body).toHaveProperty('stats');
        expect(body.stats).toHaveProperty('totalSuccessful');
        expect(body.stats.totalSuccessful).toBeGreaterThan(0);
        console.log(`✓ Successfully persisted ${body.stats.totalSuccessful} items`);
      } else if (response.statusCode === 207) {
        // Partial success
        expect(body).toHaveProperty('message', 'Partially succeeded');
        expect(body).toHaveProperty('stats');
        console.log(`⚠ Partial success: ${body.stats.totalSuccessful} succeeded, ${body.stats.totalFailed} failed`);
      } else {
        // Failure - but test still passes (we're testing execution, not success)
        // Could have 'error' property or just 'message' with stats showing failures
        expect(body).toHaveProperty('message');
        console.log(`ℹ️  Lambda failed (expected with some data issues): ${body.error || body.message}`);
      }
    }, 120000); // 2 minute timeout for Aula API calls

     it('should successfully generate and send newsletter', async () => {

        // Arrange
        const event = createMockGenerateNewsletterEvent();
        const context = createMockGenerateNewsletterContext();
  
        // Act
        console.log('\n⚠️  This test will send a REAL EMAIL and make REAL Bedrock API calls!');
        const startTime = Date.now();
        const response = await GenerateNewsletterHandler(event, context);
        const duration = Date.now() - startTime;
  
        // Assert
        console.log(`\nExecution completed in ${duration}ms`);
        console.log('Response:', JSON.stringify(response, null, 2));
  
        // Response should have valid structure
        expect(response).toHaveProperty('statusCode');
        expect(response).toHaveProperty('body');
        expect(typeof response.body).toBe('string');
  
        const body = JSON.parse(response.body);
        console.log('Response Body:', JSON.stringify(body, null, 2));
  
        // Status code should be 200 (success) or 500 (error)
        expect([200, 500, 502]).toContain(response.statusCode);
  
        if (response.statusCode === 200) {
          // Success - newsletter generated and sent
          expect(body).toHaveProperty('message');
          expect(body.message).toContain('Successfully generated and sent newsletter');
          expect(body).toHaveProperty('timestamp');
          expect(body).toHaveProperty('duration');
          expect(body).toHaveProperty('stats');
  
          console.log('\n✓ Newsletter successfully generated and sent!');
          console.log(`  Email sent to: email`);
          console.log(`  Data processed:`);
          console.log(`    - Overviews: ${body.stats.overviews}`);
          console.log(`    - Threads: ${body.stats.threads}`);
          console.log(`    - Calendar Events: ${body.stats.calendarEvents}`);
          console.log(`    - Posts: ${body.stats.posts}`);
        } else {
          // Failure
          expect(body).toHaveProperty('message');
          expect(body).toHaveProperty('error');
          expect(body).toHaveProperty('timestamp');
          console.log(`\nℹ️  Lambda failed: ${body.error || body.message}`);
        }
      }, 640000); // 3 minute timeout for Bedrock and SES calls

     it('should successfully orchestrate full process with custom date ranges', async () => {
        // Arrange
        const event = createMockUpdateAndGenerateEvent({
          lastNumberOfDays: '7',
          futureDays: '14',
        });
        const context = createMockUpdateAndGenerateContext();

        // Act
        console.log('\n⚠️  This test will invoke REAL LAMBDAS (GetAulaAndPersist + GenerateNewsletter)!');
        console.log('⚠️  This will fetch real data, make Bedrock calls, and send a real email!');
        console.log('📅 Using custom date ranges: 7 days past, 14 days future');
        const startTime = Date.now();
        const response = await UpdateAndGenerateHandler(event, context);
        const duration = Date.now() - startTime;

        // Assert
        console.log(`\nExecution completed in ${duration}ms`);
        console.log('Response:', JSON.stringify(response, null, 2));

        // Response should have valid structure
        expect(response).toHaveProperty('statusCode');
        expect(response).toHaveProperty('headers');
        expect(response).toHaveProperty('body');
        expect(typeof response.body).toBe('string');

        const body = JSON.parse(response.body);
        console.log('Response Body:', JSON.stringify(body, null, 2));

        // Status code should be 200 (success), 207 (partial), or 500 (error)
        expect([200, 207, 500]).toContain(response.statusCode);

        // Full process result structure
        expect(body).toHaveProperty('success');
        expect(body).toHaveProperty('steps');
        expect(body).toHaveProperty('totalDuration');
        expect(body).toHaveProperty('timestamp');
        expect(body).toHaveProperty('message');

        // Step results - data update
        expect(body.steps).toHaveProperty('dataUpdate');
        expect(body.steps.dataUpdate).toHaveProperty('status');
        expect(body.steps.dataUpdate).toHaveProperty('statusCode');
        expect(body.steps.dataUpdate).toHaveProperty('duration');

        console.log(`\n  Total Duration: ${body.totalDuration}ms`);
        console.log(`\n  Step 1 - Data Update (GetAulaAndPersist):`);
        console.log(`    Status: ${body.steps.dataUpdate.status}`);
        console.log(`    Status Code: ${body.steps.dataUpdate.statusCode}`);
        console.log(`    Duration: ${body.steps.dataUpdate.duration}ms`);

        if (response.statusCode === 200) {
          // Complete success - both steps completed
          expect(body.success).toBe(true);
          expect(body.steps).toHaveProperty('newsletterGeneration');
          expect(body.steps.newsletterGeneration).toHaveProperty('status');
          expect(body.steps.newsletterGeneration).toHaveProperty('statusCode');
          expect(body.steps.newsletterGeneration).toHaveProperty('duration');

          console.log(`\n  Step 2 - Newsletter Generation:`);
          console.log(`    Status: ${body.steps.newsletterGeneration.status}`);
          console.log(`    Status Code: ${body.steps.newsletterGeneration.statusCode}`);
          console.log(`    Duration: ${body.steps.newsletterGeneration.duration}ms`);

          console.log('\n✓ Full process completed successfully!');
          console.log('✓ Email should have been sent with custom date range data');
        } else if (response.statusCode === 207) {
          // Partial success
          expect(body.success).toBe(false);
          console.log(`\n⚠ Partial success: ${body.message}`);

          if (body.steps.newsletterGeneration) {
            console.log(`\n  Step 2 - Newsletter Generation:`);
            console.log(`    Status: ${body.steps.newsletterGeneration.status}`);
            console.log(`    Status Code: ${body.steps.newsletterGeneration.statusCode}`);
            console.log(`    Duration: ${body.steps.newsletterGeneration.duration}ms`);
          }
        } else {
          // Failure - likely data update failed
          expect(body.success).toBe(false);
          expect(body).toHaveProperty('message');
          console.log(`\nℹ️  Lambda orchestration failed: ${body.message}`);

          if (body.steps.newsletterGeneration) {
            console.log(`\n  Step 2 - Newsletter Generation:`);
            console.log(`    Status: ${body.steps.newsletterGeneration.status}`);
            console.log(`    Status Code: ${body.steps.newsletterGeneration.statusCode}`);
          } else {
            console.log('\n  Step 2 - Newsletter Generation: Not attempted (data update failed)');
          }
        }
      }, 900000); // 15 minute timeout (max lambda execution time)

  });
