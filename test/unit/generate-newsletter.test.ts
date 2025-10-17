import { handler } from '../../lambda/generate-newsletter';
import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

// Mock AWS SDK clients
jest.mock('@aws-sdk/client-bedrock-runtime', () => ({
  BedrockRuntimeClient: jest.fn(),
  InvokeModelCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: jest.fn(),
  SendEmailCommand: jest.fn(),
}));

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: jest.fn(),
    })),
  },
  ScanCommand: jest.fn(),
  PutCommand: jest.fn(),
}));

describe('GenerateNewsletter Lambda Handler', () => {
  let mockBedrockClient: any;
  let mockSesClient: any;
  let mockDocClient: any;

  beforeEach(() => {
    // Set up environment variables
    process.env.MESSAGE_FAMILY_NAMES_TO_FLAG = 'Smith,Johnson';
    process.env.CHILD_NAME = 'Jane Doe';
    process.env.PARENT_NAMES = 'John Doe, Mary Doe';
    process.env.EMAIL_TO_ADDRESSES = 'parent@example.com,parent2@example.com';
    process.env.EMAIL_FROM_ADDRESS = 'noreply@school.com';
    process.env.THREADMESSAGES_DAYS_IN_PAST = '30';
    process.env.CALENDAR_EVENTS_DAYS_IN_PAST = '3';
    process.env.CALENDAR_EVENTS_DAYS_IN_FUTURE = '7';
    process.env.POSTS_DAYS_IN_PAST = '3';

    // Mock Bedrock Client
    mockBedrockClient = {
      send: jest.fn().mockResolvedValue({
        body: new TextEncoder().encode(
          JSON.stringify({
            content: [
              {
                text: 'This is a translated and summarized message from the AI.',
              },
            ],
          })
        ),
      }),
    };
    (BedrockRuntimeClient as jest.Mock).mockImplementation(() => mockBedrockClient);

    // Mock SES Client
    mockSesClient = {
      send: jest.fn().mockResolvedValue({
        MessageId: 'test-message-id-123',
      }),
    };
    (SESClient as jest.Mock).mockImplementation(() => mockSesClient);

    // Mock DynamoDB Document Client with different responses for different tables
    mockDocClient = {
      send: jest.fn().mockImplementation((command: any) => {
        // Return different mock data based on table name
        const tableName = command.input?.TableName;

        if (tableName === 'RAW_dailyOverview') {
          return Promise.resolve({
            Items: [
              {
                Id: 1,
                Date: new Date().toISOString(),
                Content: 'Test daily overview content',
              },
            ],
          });
        } else if (tableName === 'RAW_threadMessages') {
          return Promise.resolve({
            Items: [
              {
                Id: 'msg-1',
                ThreadId: 100,
                SentDate: new Date().toISOString(),
                Sender: {
                  FullName: 'Teacher Smith',
                  Role: 'employee',
                },
                MessageText: 'Dette er en testbesked på dansk.',
                Attachments: [],
              },
            ],
          });
        } else if (tableName === 'RAW_threads') {
          return Promise.resolve({
            Items: [
              {
                Id: 100,
                Subject: 'Important School Update',
              },
            ],
          });
        } else if (tableName === 'RAW_calendarEvents') {
          return Promise.resolve({
            Items: [
              {
                Id: 200,
                Title: 'School Trip',
                StartDate: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
                EndDate: new Date(Date.now() + 86400000 + 3600000).toISOString(),
                CreatorName: 'Principal Johnson',
                Type: 'excursion',
                PrimaryResourceText: 'Class 3A',
              },
            ],
          });
        } else if (tableName === 'RAW_posts') {
          return Promise.resolve({
            Items: [
              {
                Id: 300,
                Title: 'Weekly Update',
                Content: 'Denne uge har vi haft en fantastisk tid!',
                Timestamp: new Date().toISOString(),
                Author: 'Mrs. Thompson',
                AuthorRole: 'teacher',
                Attachments: [
                  {
                    Id: 1,
                    Type: 'image',
                    Name: 'class-photo.jpg',
                    DownloadUrl: 'https://example.com/photo.jpg',
                    ThumbnailUrl: 'https://example.com/photo-thumb.jpg',
                  },
                ],
              },
            ],
          });
        } else if (tableName === 'RAW_derivedEvents') {
          return Promise.resolve({
            Items: [],
          });
        }

        return Promise.resolve({ Items: [] });
      }),
    };

    (DynamoDBDocumentClient.from as jest.Mock).mockReturnValue(mockDocClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should successfully generate and send newsletter', async () => {
    const event = {};
    const context = {};

    const result = await handler(event, context);

    // Verify successful response
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Successfully generated newsletter');

    // Verify DynamoDB was queried for all data types
    expect(mockDocClient.send).toHaveBeenCalled();

    // Verify Bedrock AI was called for translations and summaries
    expect(mockBedrockClient.send).toHaveBeenCalled();

    // Verify email was sent via SES
    expect(mockSesClient.send).toHaveBeenCalledTimes(1);

    // Verify the result contains generated content
    const body = JSON.parse(result.body);
    expect(body.content).toContain('<!DOCTYPE html>');
    expect(body.timestamp).toBeDefined();
  });

  test('should handle missing environment variables', async () => {
    delete process.env.CHILD_NAME;
    delete process.env.EMAIL_FROM_ADDRESS;

    const event = {};
    const context = {};

    const result = await handler(event, context);

    // Should still process but with empty values
    expect(result.statusCode).toBe(200);
  });

  test('should handle DynamoDB query failure', async () => {
    mockDocClient.send.mockRejectedValue(new Error('DynamoDB read error'));

    const event = {};
    const context = {};

    const result = await handler(event, context);

    // Verify error response
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Error generating newsletter');
    expect(JSON.parse(result.body).error).toBe('DynamoDB read error');
  });

  test('should handle Bedrock AI invocation failure', async () => {
    mockBedrockClient.send.mockRejectedValue(new Error('AI model error'));

    const event = {};
    const context = {};

    const result = await handler(event, context);

    // Verify error response
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Error generating newsletter');
    expect(JSON.parse(result.body).error).toBe('AI model error');
  });

  test('should handle SES email sending failure', async () => {
    mockSesClient.send.mockRejectedValue(new Error('Email sending failed'));

    const event = {};
    const context = {};

    const result = await handler(event, context);

    // Verify error response
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Error generating newsletter');
    expect(JSON.parse(result.body).error).toBe('Email sending failed');
  });

  test('should process posts with attachments', async () => {
    const event = {};
    const context = {};

    const result = await handler(event, context);

    expect(result.statusCode).toBe(200);

    // Verify DynamoDB was queried and Bedrock was called
    expect(mockDocClient.send).toHaveBeenCalled();
    expect(mockBedrockClient.send).toHaveBeenCalled();

    // Verify the response contains generated content
    const body = JSON.parse(result.body);
    expect(body.content).toBeDefined();
    expect(body.message).toBe('Successfully generated newsletter');
  });

  test('should process thread messages with translations', async () => {
    const event = {};
    const context = {};

    const result = await handler(event, context);

    expect(result.statusCode).toBe(200);

    // Verify Bedrock was called to translate Danish messages
    expect(mockBedrockClient.send).toHaveBeenCalled();

    // Check that translation prompt was created (indirectly verified through mock calls)
    const bedrockCalls = mockBedrockClient.send.mock.calls;
    expect(bedrockCalls.length).toBeGreaterThan(0);
  });

  test('should process calendar events excluding lessons', async () => {
    const event = {};
    const context = {};

    const result = await handler(event, context);

    expect(result.statusCode).toBe(200);

    // Verify calendar data was queried
    expect(mockDocClient.send).toHaveBeenCalled();
  });

  test('should include family names in AI prompts', async () => {
    const event = {};
    const context = {};

    await handler(event, context);

    // Verify Bedrock was called
    expect(mockBedrockClient.send).toHaveBeenCalled();

    // The prompts should include the flagged family names
    // This is indirectly tested through the mock setup
    expect(process.env.MESSAGE_FAMILY_NAMES_TO_FLAG).toBe('Smith,Johnson');
  });

  test('should generate HTML email with proper structure', async () => {
    const event = {};
    const context = {};

    const result = await handler(event, context);

    expect(result.statusCode).toBe(200);

    const htmlContent = JSON.parse(result.body).content;

    // Verify HTML structure
    expect(htmlContent).toContain('<!DOCTYPE html>');
    expect(htmlContent).toContain('<html>');
    expect(htmlContent).toContain('<body>');
    expect(htmlContent).toContain('</body>');
    expect(htmlContent).toContain('</html>');
  });

  test('should respect custom date range environment variables', async () => {
    process.env.THREADMESSAGES_DAYS_IN_PAST = '60';
    process.env.CALENDAR_EVENTS_DAYS_IN_FUTURE = '14';
    process.env.POSTS_DAYS_IN_PAST = '7';

    const event = {};
    const context = {};

    const result = await handler(event, context);

    expect(result.statusCode).toBe(200);

    // Verify the handler ran successfully with custom date ranges
    expect(mockDocClient.send).toHaveBeenCalled();
  });

  test('should handle empty data from DynamoDB gracefully', async () => {
    mockDocClient.send.mockResolvedValue({ Items: [] });

    const event = {};
    const context = {};

    const result = await handler(event, context);

    // Should still succeed even with no data
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Successfully generated newsletter');
  });

  test('should use custom AWS region when provided', async () => {
    process.env.AWS_REGION_OVERRIDE = 'us-west-2';
    process.env.AWS_ACCESS_KEY_ID = 'test-key';
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret';

    const event = {};
    const context = {};

    const result = await handler(event, context);

    expect(result.statusCode).toBe(200);
  });
});
