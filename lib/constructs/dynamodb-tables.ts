import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

/**
 * Construct for creating all DynamoDB tables used by the Aula Newsletter application
 */
export class DynamoDBTablesConstruct extends Construct {
  // Session table
  public readonly aulaSessionIdTable: dynamodb.Table;

  // RAW data tables
  public readonly rawDailyOverviewTable: dynamodb.Table;
  public readonly rawThreadsTable: dynamodb.Table;
  public readonly rawThreadMessagesTable: dynamodb.Table;
  public readonly rawCalendarEventsTable: dynamodb.Table;
  public readonly rawPostsTable: dynamodb.Table;
  public readonly rawWeekOverviewTable: dynamodb.Table;
  public readonly rawBookListTable: dynamodb.Table;
  public readonly rawGalleryAlbumsTable: dynamodb.Table;
  public readonly rawDerivedEventsTable: dynamodb.Table;

  // PARSED data tables - translated content
  public readonly parsedPostsTable: dynamodb.Table;
  public readonly parsedThreadMessagesTable: dynamodb.Table;
  public readonly parsedThreadsTable: dynamodb.Table;

  // DERIVED data tables - AI-extracted events
  public readonly derivedEventsFromPostsTable: dynamodb.Table;
  public readonly derivedEventsFromMessagesTable: dynamodb.Table;

  // Attachments table
  public readonly aulaAttachmentsTable: dynamodb.Table;

  // Newsletter snapshots table - stores daily generated newsletters
  public readonly newsletterSnapshotsTable: dynamodb.Table;

  private readonly removalPolicy: cdk.RemovalPolicy;

  constructor(scope: Construct, id: string, removalPolicy: cdk.RemovalPolicy) {
    super(scope, id);
    this.removalPolicy = removalPolicy;

    // Session ID table
    // Stores Aula session tokens with tracking:
    // - sessionId: Current session token
    // - created: When this specific sessionId was first created
    // - lastUpdated: Last modification time
    // - lastUsedSuccessfully: Last successful Aula API call
    // - lastUsedFailure: First failure timestamp (captures when session first failed)
    // - ttl: Expiration timestamp
    this.aulaSessionIdTable = this.createTable(
      'AulaSessionIdTable',
      'Id',
      dynamodb.AttributeType.NUMBER
    );

    // RAW data tables
    this.rawDailyOverviewTable = this.createTable(
      'RAW_dailyOverview',
      'Id',
      dynamodb.AttributeType.NUMBER
    );

    this.rawThreadsTable = this.createTable(
      'RAW_threads',
      'Id',
      dynamodb.AttributeType.NUMBER
    );

    // Note: RAW_threadMessages uses STRING type for Id (special case)
    this.rawThreadMessagesTable = this.createTable(
      'RAW_threadMessages',
      'Id',
      dynamodb.AttributeType.STRING
    );

    this.rawCalendarEventsTable = this.createTable(
      'RAW_calendarEvents',
      'Id',
      dynamodb.AttributeType.NUMBER
    );

    this.rawPostsTable = this.createTable(
      'RAW_posts',
      'Id',
      dynamodb.AttributeType.NUMBER
    );

    this.rawWeekOverviewTable = this.createTable(
      'RAW_weekOverview',
      'Id',
      dynamodb.AttributeType.NUMBER
    );

    this.rawBookListTable = this.createTable(
      'RAW_bookList',
      'Id',
      dynamodb.AttributeType.NUMBER
    );

    this.rawGalleryAlbumsTable = this.createTable(
      'RAW_galleryAlbums',
      'Id',
      dynamodb.AttributeType.NUMBER
    );

    this.rawDerivedEventsTable = this.createTable(
      'RAW_derivedEvents',
      'Id',
      dynamodb.AttributeType.NUMBER
    );

    // PARSED data tables - translated content with caching
    this.parsedPostsTable = this.createTable(
      'PARSED_posts',
      'Id',
      dynamodb.AttributeType.STRING
    );

    this.parsedThreadMessagesTable = this.createTable(
      'PARSED_threadMessages',
      'Id',
      dynamodb.AttributeType.STRING
    );

    this.parsedThreadsTable = this.createTable(
      'PARSED_threads',
      'Id',
      dynamodb.AttributeType.STRING
    );

    // DERIVED data tables - AI-extracted events from posts and messages
    this.derivedEventsFromPostsTable = this.createTable(
      'DERIVED_EVENTS_FromPosts',
      'Id',
      dynamodb.AttributeType.STRING
    );

    this.derivedEventsFromMessagesTable = this.createTable(
      'DERIVED_EVENTS_FromMessages',
      'Id',
      dynamodb.AttributeType.STRING
    );

    // Attachments table with GSI for querying by PostId or MessageId
    this.aulaAttachmentsTable = new dynamodb.Table(this, 'AulaAttachmentsTable', {
      tableName: 'AulaAttachmentsTable',
      partitionKey: {
        name: 'AttachmentId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: this.removalPolicy,
      timeToLiveAttribute: 'ttl',
    });

    // GSI for querying attachments by PostId
    this.aulaAttachmentsTable.addGlobalSecondaryIndex({
      indexName: 'PostIdIndex',
      partitionKey: {
        name: 'PostId',
        type: dynamodb.AttributeType.NUMBER,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // GSI for querying attachments by MessageId
    this.aulaAttachmentsTable.addGlobalSecondaryIndex({
      indexName: 'MessageIdIndex',
      partitionKey: {
        name: 'MessageId',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Newsletter snapshots table - stores daily newsletter cache
    this.newsletterSnapshotsTable = this.createTable(
      'NEWSLETTER_SNAPSHOTS',
      'SnapshotDate',
      dynamodb.AttributeType.STRING
    );
  }

  /**
   * Helper method to create a DynamoDB table with standard configuration
   */
  private createTable(
    tableName: string,
    partitionKeyName: string,
    partitionKeyType: dynamodb.AttributeType
  ): dynamodb.Table {
    return new dynamodb.Table(this, tableName, {
      tableName,
      partitionKey: {
        name: partitionKeyName,
        type: partitionKeyType,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: this.removalPolicy,
      timeToLiveAttribute: 'ttl',
    });
  }

  /**
   * Get all tables as an array for convenient iteration
   */
  public getAllTables(): dynamodb.Table[] {
    return [
      this.aulaSessionIdTable,
      this.rawDailyOverviewTable,
      this.rawThreadsTable,
      this.rawThreadMessagesTable,
      this.rawCalendarEventsTable,
      this.rawPostsTable,
      this.rawWeekOverviewTable,
      this.rawBookListTable,
      this.rawGalleryAlbumsTable,
      this.rawDerivedEventsTable,
      this.parsedPostsTable,
      this.parsedThreadMessagesTable,
      this.parsedThreadsTable,
      this.derivedEventsFromPostsTable,
      this.derivedEventsFromMessagesTable,
      this.aulaAttachmentsTable,
      this.newsletterSnapshotsTable,
    ];
  }
}
