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

  // PARSED data tables (future use)
  public readonly parsedPostsTable: dynamodb.Table;
  public readonly derivedEventsFromPostsTable: dynamodb.Table;

  // Attachments table
  public readonly aulaAttachmentsTable: dynamodb.Table;

  private readonly removalPolicy: cdk.RemovalPolicy;

  constructor(scope: Construct, id: string, removalPolicy: cdk.RemovalPolicy) {
    super(scope, id);
    this.removalPolicy = removalPolicy;

    // Session ID table
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

    // PARSED data tables (future use)
    this.parsedPostsTable = this.createTable(
      'PARSED_posts',
      'Id',
      dynamodb.AttributeType.NUMBER
    );

    this.derivedEventsFromPostsTable = this.createTable(
      'DERIVED_EVENTS_FromPostsTable',
      'Id',
      dynamodb.AttributeType.NUMBER
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
      this.derivedEventsFromPostsTable,
      this.aulaAttachmentsTable,
    ];
  }
}
