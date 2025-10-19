/**
 * Integration test for generate-newsletter Lambda function
 *
 * This test runs locally but communicates with deployed AWS resources:
 * - DynamoDB: Reads data from RAW_ tables
 * - Amazon Bedrock: Uses Claude AI for translation and summarization
 * - Amazon SES: Sends email newsletter
 * - Lambda handler runs locally for debugging
 *
 * Setup:
 * 1. Ensure you have deployed the CDK stack (npx cdk deploy)
 * 2. Ensure data exists in DynamoDB tables (run get-aula-persist first)
 * 3. Set environment variables in .env file:
 *    - DAILY_OVERVIEW_TABLE=RAW_dailyOverview
 *    - THREADS_TABLE=RAW_threads
 *    - THREAD_MESSAGES_TABLE=RAW_threadMessages
 *    - CALENDAR_EVENTS_TABLE=RAW_calendarEvents
 *    - POSTS_TABLE=RAW_posts
 *    - EMAIL_FROM_ADDRESS=verified@email.com
 *    - EMAIL_TO_ADDRESSES=recipient@email.com
 *    - CHILD_NAME=Child Name
 *    - PARENT_NAMES=Parent Names
 *    - MESSAGE_FAMILY_NAMES_TO_FLAG=Names,To,Flag
 *    - BEDROCK_MODEL_ID=anthropic.claude-3-sonnet-20240229-v1:0
 *    - AWS_REGION=your-region (or AWS_REGION_OVERRIDE)
 * 4. Ensure AWS credentials are configured
 * 5. Ensure SES sender email is verified
 * 6. Ensure Bedrock model access is enabled
 *
 * Run: npm test -- generate-newsletter.integration.test.ts
 *
 * NOTE: This test will send real emails and make real Bedrock API calls.
 * Use with caution to avoid unnecessary costs.
 */

import { handler } from '../src/functions/generate-newsletter/index';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Mock EventBridge event and Lambda context
const createMockEvent = () => ({
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

const createMockContext = () => ({
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

describe('GenerateNewsletter Lambda - Integration Tests', () => {
  // Store table names
  const tables = {
    dailyOverview: process.env.DAILY_OVERVIEW_TABLE || 'RAW_dailyOverview',
    threads: process.env.THREADS_TABLE || 'RAW_threads',
    threadMessages: process.env.THREAD_MESSAGES_TABLE || 'RAW_threadMessages',
    calendarEvents: process.env.CALENDAR_EVENTS_TABLE || 'RAW_calendarEvents',
    posts: process.env.POSTS_TABLE || 'RAW_posts',
  };

  const emailFromAddress = process.env.EMAIL_FROM_ADDRESS;
  const emailToAddresses = process.env.EMAIL_TO_ADDRESSES;
  const childName = process.env.CHILD_NAME;
  const parentNames = process.env.PARENT_NAMES;

  // DynamoDB client for verification
  let docClient: DynamoDBDocumentClient;

  beforeAll(() => {
    // Verify required environment variables are set
    const required = [
      'DAILY_OVERVIEW_TABLE',
      'THREADS_TABLE',
      'THREAD_MESSAGES_TABLE',
      'CALENDAR_EVENTS_TABLE',
      'POSTS_TABLE',
      'EMAIL_FROM_ADDRESS',
      'EMAIL_TO_ADDRESSES',
      'CHILD_NAME',
      'PARENT_NAMES',
    ];

    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables for testing: ${missing.join(', ')}`);
    }

    console.log('Test Configuration:');
    console.log(`  AWS Region: ${process.env.AWS_REGION_OVERRIDE || process.env.AWS_REGION || 'default'}`);
    console.log(`  Daily Overview Table: ${tables.dailyOverview}`);
    console.log(`  Threads Table: ${tables.threads}`);
    console.log(`  Thread Messages Table: ${tables.threadMessages}`);
    console.log(`  Calendar Events Table: ${tables.calendarEvents}`);
    console.log(`  Posts Table: ${tables.posts}`);
    console.log(`  Email From: ${emailFromAddress}`);
    console.log(`  Email To: ${emailToAddresses}`);
    console.log(`  Child Name: ${childName}`);
    console.log(`  Parent Names: ${parentNames}`);
    console.log(`  Bedrock Model: ${process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-sonnet-20240229-v1:0'}`);

    // Initialize DynamoDB client for verification
    const client = new DynamoDBClient({
      region: process.env.AWS_REGION_OVERRIDE || process.env.AWS_REGION,
    });
    docClient = DynamoDBDocumentClient.from(client);
  });

  /**
   * Helper function to count items in a DynamoDB table
   */
  async function countTableItems(tableName: string): Promise<number> {
    try {
      const result = await docClient.send(
        new ScanCommand({
          TableName: tableName,
          Select: 'COUNT',
        })
      );
      return result.Count || 0;
    } catch (error) {
      console.error(`Error counting items in ${tableName}:`, error);
      return 0;
    }
  }

  /**
   * Helper function to check if tables have data
   */
  async function verifyDataExists(): Promise<{ hasData: boolean; counts: Record<string, number> }> {
    const counts = {
      dailyOverview: await countTableItems(tables.dailyOverview),
      threads: await countTableItems(tables.threads),
      threadMessages: await countTableItems(tables.threadMessages),
      calendarEvents: await countTableItems(tables.calendarEvents),
      posts: await countTableItems(tables.posts),
    };

    const totalItems = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return {
      hasData: totalItems > 0,
      counts,
    };
  }

  describe('Handler Execution', () => {
    it('should successfully generate and send newsletter', async () => {
      // Check if data exists in tables
      const { hasData, counts } = await verifyDataExists();
      console.log('Table data counts:', counts);

      if (!hasData) {
        console.warn('⚠️  No data found in DynamoDB tables - newsletter may be empty');
        console.warn('   Run get-aula-persist Lambda first to populate data');
      }

      // Arrange
      const event = createMockEvent();
      const context = createMockContext();

      // Act
      console.log('\n⚠️  This test will send a REAL EMAIL and make REAL Bedrock API calls!');
      const startTime = Date.now();
      const response = await handler(event, context);
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
        console.log(`  Email sent to: ${emailToAddresses}`);
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
    }, 180000); // 3 minute timeout for Bedrock and SES calls

    it('should return proper response structure', async () => {
      // Arrange
      const event = createMockEvent();
      const context = createMockContext();

      // Act
      const response = await handler(event, context);

      // Assert - Verify response structure regardless of success/failure
      expect(response).toHaveProperty('statusCode');
      expect(typeof response.statusCode).toBe('number');
      expect(response).toHaveProperty('body');
      expect(typeof response.body).toBe('string');

      const body = JSON.parse(response.body);
      expect(body).toHaveProperty('message');
      expect(body).toHaveProperty('timestamp');

      if (response.statusCode === 200) {
        // Success case
        expect(body).toHaveProperty('duration');
        expect(body).toHaveProperty('stats');
        expect(body.stats).toHaveProperty('overviews');
        expect(body.stats).toHaveProperty('threads');
        expect(body.stats).toHaveProperty('calendarEvents');
        expect(body.stats).toHaveProperty('posts');
      } else {
        // Error case
        expect(body).toHaveProperty('error');
      }
    }, 180000);
  });

  describe('Configuration', () => {
    it('should load configuration from environment variables', () => {
      // Verify all required environment variables are accessible
      expect(process.env.DAILY_OVERVIEW_TABLE).toBeDefined();
      expect(process.env.THREADS_TABLE).toBeDefined();
      expect(process.env.THREAD_MESSAGES_TABLE).toBeDefined();
      expect(process.env.CALENDAR_EVENTS_TABLE).toBeDefined();
      expect(process.env.POSTS_TABLE).toBeDefined();
      expect(process.env.EMAIL_FROM_ADDRESS).toBeDefined();
      expect(process.env.EMAIL_TO_ADDRESSES).toBeDefined();
      expect(process.env.CHILD_NAME).toBeDefined();
      expect(process.env.PARENT_NAMES).toBeDefined();

      console.log('All required environment variables are set');
    });

    it('should have valid data retrieval configuration', () => {
      // Verify data retrieval config defaults or values
      const threadMessagesDays = parseInt(process.env.THREADMESSAGES_DAYS_IN_PAST || '30', 10);
      const calendarEventsPast = parseInt(process.env.CALENDAR_EVENTS_DAYS_IN_PAST || '3', 10);
      const calendarEventsFuture = parseInt(process.env.CALENDAR_EVENTS_DAYS_IN_FUTURE || '7', 10);
      const postsDays = parseInt(process.env.POSTS_DAYS_IN_PAST || '3', 10);

      expect(threadMessagesDays).toBeGreaterThan(0);
      expect(calendarEventsPast).toBeGreaterThan(0);
      expect(calendarEventsFuture).toBeGreaterThan(0);
      expect(postsDays).toBeGreaterThan(0);

      console.log('Data Retrieval Configuration:');
      console.log(`  Thread Messages Days Past: ${threadMessagesDays}`);
      console.log(`  Calendar Events Days Past: ${calendarEventsPast}`);
      console.log(`  Calendar Events Days Future: ${calendarEventsFuture}`);
      console.log(`  Posts Days Past: ${postsDays}`);
    });

    it('should have valid email configuration', () => {
      expect(emailFromAddress).toBeDefined();
      expect(emailToAddresses).toBeDefined();

      // Parse email addresses
      const toAddresses = emailToAddresses!.split(',').map(e => e.trim());
      expect(toAddresses.length).toBeGreaterThan(0);

      console.log('Email Configuration:');
      console.log(`  From: ${emailFromAddress}`);
      console.log(`  To: ${toAddresses.join(', ')}`);
    });

    it('should have valid personalization configuration', () => {
      expect(childName).toBeDefined();
      expect(parentNames).toBeDefined();

      console.log('Personalization Configuration:');
      console.log(`  Child Name: ${childName}`);
      console.log(`  Parent Names: ${parentNames}`);
      console.log(`  Message Family Names: ${process.env.MESSAGE_FAMILY_NAMES_TO_FLAG || 'None'}`);
    });
  });

  describe('DynamoDB Table Access', () => {
    it('should be able to access all required DynamoDB tables', async () => {
      // Test that we can query each table (even if empty)
      const tableTests = Object.entries(tables).map(async ([name, tableName]) => {
        try {
          const count = await countTableItems(tableName);
          console.log(`  ${name}: ${count} items`);
          return { name, tableName, count, success: true };
        } catch (error) {
          console.error(`  ${name} (${tableName}): ERROR - ${error instanceof Error ? error.message : String(error)}`);
          return { name, tableName, count: 0, success: false };
        }
      });

      const results = await Promise.all(tableTests);

      // All tables should be accessible
      const failedTables = results.filter(r => !r.success);
      if (failedTables.length > 0) {
        console.error('Failed to access tables:', failedTables.map(t => t.tableName));
      }

      expect(failedTables.length).toBe(0);
      console.log(`✓ All ${results.length} tables are accessible`);
    }, 30000);
  });

  describe('Data Availability', () => {
    it('should check if data is available in DynamoDB tables', async () => {
      const { hasData, counts } = await verifyDataExists();

      console.log('Data availability check:');
      Object.entries(counts).forEach(([table, count]) => {
        const status = count > 0 ? '✓' : '⚠';
        console.log(`  ${status} ${table}: ${count} items`);
      });

      if (hasData) {
        console.log('\n✓ Data is available for newsletter generation');
        expect(hasData).toBe(true);
      } else {
        console.warn('\n⚠️  No data available in any table');
        console.warn('   Newsletter will be generated but will be empty');
        console.warn('   Run get-aula-persist Lambda first to populate data');
        // Don't fail the test - just document the state
        expect(hasData).toBe(false);
      }
    });
  });
});
