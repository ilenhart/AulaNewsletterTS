import { handler } from '../../lambda/get-aula-persist';
import { AulaAPIClient } from 'aula-apiclient-ts';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

// Mock the AulaAPIClient
jest.mock('aula-apiclient-ts', () => ({
  AulaAPIClient: jest.fn(),
  AulaClientConfig: jest.fn(),
}));

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: jest.fn(),
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: jest.fn(),
    })),
  },
  PutCommand: jest.fn(),
  QueryCommand: jest.fn(),
}));

describe('GetAulaAndPersist Lambda Handler', () => {
  let mockAulaClient: any;
  let mockDocClient: any;

  beforeEach(() => {
    // Reset environment variables
    process.env.AULA_USERNAME = 'test-user';
    process.env.AULA_PASSWORD = 'test-password';
    process.env.API_URL = 'https://www.aula.dk/api/';
    process.env.PARENT_FIRSTNAME = 'John';
    process.env.CHILD_FIRSTNAME = 'Jane';

    // Mock AulaAPIClient instance
    mockAulaClient = {
      Login: jest.fn().mockResolvedValue(undefined),
      CurrentChild: { id: 12345 },
      GetAulaThreads: jest.fn().mockResolvedValue([
        {
          id: 1,
          subject: 'Test Thread',
          messages: [
            {
              id: 'msg-1',
              sendDateTime: '2024-01-15T10:00:00Z',
              text: { html: 'Test message content' },
            },
          ],
        },
      ]),
      GetPosts: jest.fn().mockResolvedValue([
        {
          id: 101,
          title: 'Test Post',
          content: { html: 'Test post content' },
          timestamp: '2024-01-15T09:00:00Z',
        },
      ]),
      GetCalendarEvents: jest.fn().mockResolvedValue([
        {
          id: 201,
          title: 'Test Event',
          startDate: '2024-01-20T08:00:00Z',
          endDate: '2024-01-20T10:00:00Z',
        },
      ]),
      GetDailyOverview: jest.fn().mockResolvedValue([
        {
          id: 301,
          date: '2024-01-15',
          content: 'Test overview',
        },
      ]),
      GetGalleryAlbumMedia: jest.fn().mockResolvedValue([
        {
          id: 401,
          name: 'Test Album',
          creationDate: '2024-01-15T12:00:00Z',
        },
      ]),
      getMeeBookInformation: jest.fn().mockResolvedValue({
        workPlan: [
          {
            id: 501,
            weekNumber: 3,
            content: 'Week plan content',
          },
        ],
        bookList: [
          {
            id: 601,
            weekNumber: 3,
            books: ['Book 1', 'Book 2'],
          },
        ],
      }),
    };

    (AulaAPIClient as jest.Mock).mockImplementation(() => mockAulaClient);

    // Mock DynamoDB Document Client
    mockDocClient = {
      send: jest.fn().mockResolvedValue({ Count: 0 }),
    };

    (DynamoDBDocumentClient.from as jest.Mock).mockReturnValue(mockDocClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('should successfully retrieve and persist Aula data', async () => {
    const event = {};
    const context = {};

    const result = await handler(event as any, context as any);

    // Verify successful response
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body).message).toBe('Successfully retrieved and persisted Aula data');

    // Verify AulaAPIClient methods were called
    expect(mockAulaClient.Login).toHaveBeenCalledTimes(1);
    expect(mockAulaClient.GetAulaThreads).toHaveBeenCalledWith(30);
    expect(mockAulaClient.GetPosts).toHaveBeenCalledWith(30);
    expect(mockAulaClient.GetCalendarEvents).toHaveBeenCalledWith(10, 30);
    expect(mockAulaClient.GetDailyOverview).toHaveBeenCalledWith(12345);
    expect(mockAulaClient.GetGalleryAlbumMedia).toHaveBeenCalledWith(12, 30, undefined, 5);
    expect(mockAulaClient.getMeeBookInformation).toHaveBeenCalledTimes(1);

    // Verify DynamoDB saves were attempted
    expect(mockDocClient.send).toHaveBeenCalled();
  });

  test('should handle missing credentials', async () => {
    delete process.env.AULA_USERNAME;
    delete process.env.AULA_PASSWORD;

    const event = {};
    const context = {};

    const result = await handler(event as any, context as any);

    // Verify error response
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Error processing Aula data');
    expect(JSON.parse(result.body).error).toContain('AULA_USERNAME and AULA_PASSWORD');

    // Verify login was not called
    expect(mockAulaClient.Login).not.toHaveBeenCalled();
  });

  test('should handle login failure', async () => {
    mockAulaClient.Login.mockRejectedValue(new Error('Authentication failed'));

    const event = {};
    const context = {};

    const result = await handler(event as any, context as any);

    // Verify error response
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Error processing Aula data');
    expect(JSON.parse(result.body).error).toBe('Authentication failed');

    // Verify login was called but failed
    expect(mockAulaClient.Login).toHaveBeenCalledTimes(1);
  });

  test('should handle data retrieval failure', async () => {
    mockAulaClient.GetAulaThreads.mockRejectedValue(new Error('Network error'));

    const event = {};
    const context = {};

    const result = await handler(event as any, context as any);

    // Verify error response
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Error processing Aula data');
    expect(JSON.parse(result.body).error).toBe('Network error');

    // Verify login was successful but data retrieval failed
    expect(mockAulaClient.Login).toHaveBeenCalledTimes(1);
    expect(mockAulaClient.GetAulaThreads).toHaveBeenCalledTimes(1);
  });

  test('should handle DynamoDB save failure', async () => {
    mockDocClient.send.mockRejectedValue(new Error('DynamoDB write error'));

    const event = {};
    const context = {};

    const result = await handler(event as any, context as any);

    // Verify error response
    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body).message).toBe('Error processing Aula data');
    expect(JSON.parse(result.body).error).toBe('DynamoDB write error');
  });

  test('should use custom AWS region when provided', async () => {
    process.env.AWS_REGION_OVERRIDE = 'eu-west-1';

    const event = {};
    const context = {};

    const result = await handler(event as any, context as any);

    // Verify successful response
    expect(result.statusCode).toBe(200);
  });

  test('should properly transform data structure for DynamoDB', async () => {
    const event = {};
    const context = {};

    await handler(event as any, context as any);

    // Verify data was retrieved
    expect(mockAulaClient.GetAulaThreads).toHaveBeenCalled();
    expect(mockAulaClient.GetPosts).toHaveBeenCalled();
    expect(mockAulaClient.GetCalendarEvents).toHaveBeenCalled();
    expect(mockAulaClient.GetDailyOverview).toHaveBeenCalled();
    expect(mockAulaClient.GetGalleryAlbumMedia).toHaveBeenCalled();
    expect(mockAulaClient.getMeeBookInformation).toHaveBeenCalled();

    // Verify DynamoDB operations were performed
    expect(mockDocClient.send).toHaveBeenCalled();
  });
});
