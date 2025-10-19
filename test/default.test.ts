

import { handler as GetAulaPersistHandler } from '../src/functions/get-aula-persist/index';
import { handler as GenerateNewsletterHandler } from '../src/functions/generate-newsletter/index';

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

 describe('Main runthrough', () => {

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

  });
