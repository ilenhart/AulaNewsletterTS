import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as path from 'path';
import { Construct } from 'constructs';
import { DynamoDBTablesConstruct } from './dynamodb-tables';
import { S3BucketsConstruct } from './s3-buckets';
import { LambdaConfiguration } from '../config/stack-config';

/**
 * Construct for creating Lambda functions for the Aula Newsletter application
 * Uses NodejsFunction for TypeScript-native bundling with esbuild
 */
export class LambdaFunctionsConstruct extends Construct {
  public readonly getAulaAndPersistFunction: NodejsFunction;
  public readonly generateNewsletterFunction: NodejsFunction;
  public readonly aulaKeepSessionAliveFunction: NodejsFunction;
  public readonly manageSessionIdFunction: NodejsFunction;
  public readonly updateAndGenerateFullProcessFunction: NodejsFunction;
  public readonly getAulaRole: iam.Role;
  public readonly generateNewsletterRole: iam.Role;
  public readonly keepSessionAliveRole: iam.Role;
  public readonly manageSessionIdRole: iam.Role;
  public readonly updateAndGenerateFullProcessRole: iam.Role;

  constructor(
    scope: Construct,
    id: string,
    tables: DynamoDBTablesConstruct,
    buckets: S3BucketsConstruct,
    config: LambdaConfiguration
  ) {
    super(scope, id);

    // Create IAM role for GetAulaAndPersist Lambda (needs DynamoDB and S3 access)
    this.getAulaRole = new iam.Role(this, 'GetAulaAndPersistRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for GetAulaAndPersist Lambda - DynamoDB and S3 access',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant DynamoDB read/write permissions to all tables
    tables.getAllTables().forEach(table => {
      table.grantReadWriteData(this.getAulaRole);
    });

    // Grant S3 write permissions for attachment uploads
    buckets.attachmentsBucket.grantReadWrite(this.getAulaRole);

    // Create IAM role for KeepSessionAlive Lambda (needs session table access and SES for alerts)
    this.keepSessionAliveRole = new iam.Role(this, 'KeepSessionAliveRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for KeepSessionAlive Lambda - Session table and SES',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant DynamoDB read/write permissions only to session table
    tables.aulaSessionIdTable.grantReadWriteData(this.keepSessionAliveRole);

    // Grant SES permissions for sending session expiration alerts
    this.keepSessionAliveRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ses:SendEmail',
        'ses:SendRawEmail',
      ],
      resources: ['*'], // SES requires wildcard for resources
      conditions: {
        StringEquals: {
          'ses:FromAddress': config.emailFromAddress,
        },
      },
    }));

    // Create IAM role for GenerateNewsletter Lambda (needs DynamoDB read, Bedrock, SES)
    this.generateNewsletterRole = new iam.Role(this, 'GenerateNewsletterRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for GenerateNewsletter Lambda - DynamoDB read, Bedrock, SES',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant DynamoDB read-only permissions to RAW tables
    tables.rawDailyOverviewTable.grantReadData(this.generateNewsletterRole);
    tables.rawThreadsTable.grantReadData(this.generateNewsletterRole);
    tables.rawThreadMessagesTable.grantReadData(this.generateNewsletterRole);
    tables.rawCalendarEventsTable.grantReadData(this.generateNewsletterRole);
    tables.rawPostsTable.grantReadData(this.generateNewsletterRole);
    tables.rawWeekOverviewTable.grantReadData(this.generateNewsletterRole);
    tables.rawBookListTable.grantReadData(this.generateNewsletterRole);
    tables.rawGalleryAlbumsTable.grantReadData(this.generateNewsletterRole);
    tables.rawDerivedEventsTable.grantReadData(this.generateNewsletterRole);
    tables.aulaAttachmentsTable.grantReadData(this.generateNewsletterRole);

    // Grant DynamoDB read/write permissions to PARSED and DERIVED tables (for caching)
    tables.parsedPostsTable.grantReadWriteData(this.generateNewsletterRole);
    tables.parsedThreadMessagesTable.grantReadWriteData(this.generateNewsletterRole);
    tables.parsedThreadsTable.grantReadWriteData(this.generateNewsletterRole);
    tables.derivedEventsFromPostsTable.grantReadWriteData(this.generateNewsletterRole);
    tables.derivedEventsFromMessagesTable.grantReadWriteData(this.generateNewsletterRole);

    // Grant DynamoDB read/write permissions to newsletter snapshots table (for incremental generation)
    tables.newsletterSnapshotsTable.grantReadWriteData(this.generateNewsletterRole);

    // Grant S3 read permissions for attachments
    buckets.attachmentsBucket.grantRead(this.generateNewsletterRole);

    // Grant specific Bedrock permissions (least privilege - only the model we use)
    this.generateNewsletterRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'bedrock:InvokeModel',
        'bedrock:InvokeModelWithResponseStream',
      ],
      resources: [
        `arn:aws:bedrock:${cdk.Stack.of(this).region}::foundation-model/anthropic.claude-3-sonnet-20240229-v1:0`,
      ],
    }));

    // Grant specific SES permissions (least privilege)
    this.generateNewsletterRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        'ses:SendEmail',
        'ses:SendRawEmail',
      ],
      resources: ['*'], // SES requires wildcard for resources
      conditions: {
        StringEquals: {
          'ses:FromAddress': config.emailFromAddress,
        },
      },
    }));

    // Common environment variables
    // Note: AWS_REGION is automatically set by Lambda runtime
    // Lambdas automatically use their IAM role for credentials
    const commonEnv = {
      PARENT_FIRSTNAME: config.parentFirstName,
      CHILD_FIRSTNAME: config.childFirstName,
      MESSAGE_FAMILY_NAMES_TO_FLAG: config.messageFamilyNamesToFlag,
      PARENT_MAILBOX_IDS: config.parentMailboxIds,
      DAILY_OVERVIEW_TABLE: tables.rawDailyOverviewTable.tableName,
      THREADS_TABLE: tables.rawThreadsTable.tableName,
      THREAD_MESSAGES_TABLE: tables.rawThreadMessagesTable.tableName,
      CALENDAR_EVENTS_TABLE: tables.rawCalendarEventsTable.tableName,
      POSTS_TABLE: tables.rawPostsTable.tableName,
      WEEK_OVERVIEW_TABLE: tables.rawWeekOverviewTable.tableName,
      BOOK_LIST_TABLE: tables.rawBookListTable.tableName,
      GALLERY_ALBUMS_TABLE: tables.rawGalleryAlbumsTable.tableName,
    };

    // Common bundling configuration for all lambdas
    const commonBundling = {
      minify: false,  // Keep readable for debugging; set to true for production
      sourceMap: true,
      target: 'es2022',
      // Bundle all dependencies including AWS SDK v3 and aula-apiclient-ts
      // Node.js 18.x does not include AWS SDK in the Lambda runtime environment
      // We bundle all packages to ensure they're available at runtime
      // aula-apiclient-ts is a symlinked dependency and will be bundled directly into the code
      externalModules: [],  // No external modules - bundle everything including aula-apiclient-ts
      forceDockerBundling: false,  // Use local esbuild instead of Docker
    };

    // GetAulaAndPersist Lambda function
    this.getAulaAndPersistFunction = new NodejsFunction(this, 'GetAulaAndPersistFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(process.cwd(), 'src/functions/get-aula-persist/index.ts'),
      handler: 'handler',
      role: this.getAulaRole,
      timeout: cdk.Duration.seconds(config.getAulaTimeout),
      description: 'Fetches data from Aula API and persists to DynamoDB',
      environment: {
        ...commonEnv,
        API_URL: config.apiUrl,
        AULA_SESSION_ID_TABLE: tables.aulaSessionIdTable.tableName,
        THREAD_MESSAGES_DAYS: config.threadMessagesDays.toString(),
        POSTS_DAYS: config.postsDays.toString(),
        CALENDAR_EVENTS_DAYS_PAST: config.calendarEventsPast.toString(),
        CALENDAR_EVENTS_DAYS_FUTURE: config.calendarEventsFuture.toString(),
        GALLERY_DAYS: config.galleryDays.toString(),
        ATTACHMENTS_BUCKET: buckets.attachmentsBucket.bucketName,
        ATTACHMENTS_TABLE: tables.aulaAttachmentsTable.tableName,
      },
      bundling: commonBundling,
    });

    // GenerateNewsletter Lambda function
    this.generateNewsletterFunction = new NodejsFunction(this, 'GenerateNewsletterFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(process.cwd(), 'src/functions/generate-newsletter/index.ts'),
      handler: 'handler',
      role: this.generateNewsletterRole,
      timeout: cdk.Duration.seconds(config.generateNewsletterTimeout),
      description: 'Generates AI-powered newsletter from DynamoDB data and emails it',
      environment: {
        ...commonEnv,
        CHILD_NAME: config.childName,
        PARENT_NAMES: config.parentNames,
        EMAIL_FROM_ADDRESS: config.emailFromAddress,
        EMAIL_TO_ADDRESSES: config.emailToAddresses,
        SMTP_HOST: 'your-smtp-host', // Not used, SES is used instead
        SMTP_PORT: '587',
        SMTP_USERNAME: 'your-smtp-username',
        SMTP_PASSWORD: 'your-smtp-password',
        THREADMESSAGES_DAYS_IN_PAST: config.threadMessagesDaysInPast.toString(),
        CALENDAR_EVENTS_DAYS_IN_PAST: config.calendarEventsDaysInPast.toString(),
        CALENDAR_EVENTS_DAYS_IN_FUTURE: config.calendarEventsDaysInFuture.toString(),
        POSTS_DAYS_IN_PAST: config.postsDaysInPast.toString(),
        GENERATE_NEWSLETTER_IF_NOTHING_NEW: config.generateNewsletterIfNothingNew.toString(),
        ATTACHMENTS_BUCKET: buckets.attachmentsBucket.bucketName,
        ATTACHMENTS_TABLE: tables.aulaAttachmentsTable.tableName,
        // PARSED tables - translated content with caching
        PARSED_POSTS_TABLE: tables.parsedPostsTable.tableName,
        PARSED_THREAD_MESSAGES_TABLE: tables.parsedThreadMessagesTable.tableName,
        PARSED_THREADS_TABLE: tables.parsedThreadsTable.tableName,
        // DERIVED tables - AI-extracted events
        DERIVED_EVENTS_FROM_POSTS_TABLE: tables.derivedEventsFromPostsTable.tableName,
        DERIVED_EVENTS_FROM_MESSAGES_TABLE: tables.derivedEventsFromMessagesTable.tableName,
        // Newsletter snapshots
        NEWSLETTER_SNAPSHOTS_TABLE: tables.newsletterSnapshotsTable.tableName,
      },
      bundling: commonBundling,
    });

    // AulaKeepSessionAlive Lambda function
    this.aulaKeepSessionAliveFunction = new NodejsFunction(this, 'AulaKeepSessionAliveFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(process.cwd(), 'src/functions/aula-keep-session-alive/index.ts'),
      handler: 'handler',
      role: this.keepSessionAliveRole,
      timeout: cdk.Duration.seconds(config.keepSessionAliveTimeout),
      description: 'Keeps Aula session alive by pinging the API and sends alerts on failure',
      environment: {
        AULA_SESSION_ID_TABLE: tables.aulaSessionIdTable.tableName,
        API_URL: config.apiUrl,
        EMAIL_FROM_ADDRESS: config.emailFromAddress,
        EMAIL_TO_ADDRESSES: config.emailToAddresses,
        SESSION_ALIVE_SEND_EMAIL_ON_SUCCESS: config.sessionAliveSendEmailOnSuccess.toString(),
      },
      bundling: commonBundling,
    });

    // Create IAM role for ManageSessionId Lambda (only needs session table access)
    this.manageSessionIdRole = new iam.Role(this, 'ManageSessionIdRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for ManageSessionId Lambda - Session table only',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant DynamoDB read/write permissions only to session table
    tables.aulaSessionIdTable.grantReadWriteData(this.manageSessionIdRole);

    // ManageSessionId Lambda function (API Gateway handler)
    this.manageSessionIdFunction = new NodejsFunction(this, 'ManageSessionIdFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(process.cwd(), 'src/functions/manage-sessionid/index.ts'),
      handler: 'handler',
      role: this.manageSessionIdRole,
      timeout: cdk.Duration.seconds(30),
      description: 'API handler for managing Aula session IDs via REST API',
      environment: {
        TABLE_NAME: tables.aulaSessionIdTable.tableName,
        AULASESSION_AUTHENTICATE_TOKEN: config.aulaSessionAuthenticateToken,
      },
      bundling: commonBundling,
    });

    // Create IAM role for UpdateAndGenerateFullProcess Lambda (needs lambda:InvokeFunction)
    this.updateAndGenerateFullProcessRole = new iam.Role(this, 'UpdateAndGenerateFullProcessRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'Execution role for UpdateAndGenerateFullProcess Lambda - Invoke other lambdas',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'),
      ],
    });

    // Grant permission to invoke get-aula-persist and generate-newsletter lambdas
    this.updateAndGenerateFullProcessRole.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ['lambda:InvokeFunction'],
      resources: [
        this.getAulaAndPersistFunction.functionArn,
        this.generateNewsletterFunction.functionArn,
      ],
    }));

    // UpdateAndGenerateFullProcess Lambda function (orchestrates on-demand newsletter generation)
    this.updateAndGenerateFullProcessFunction = new NodejsFunction(this, 'UpdateAndGenerateFullProcessFunction', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(process.cwd(), 'src/functions/update-and-generate-full-process/index.ts'),
      handler: 'handler',
      role: this.updateAndGenerateFullProcessRole,
      timeout: cdk.Duration.seconds(900), // 15 minutes (enough for both lambdas to complete)
      description: 'Orchestrates on-demand newsletter generation by invoking get-aula-persist then generate-newsletter',
      environment: {
        AULASESSION_AUTHENTICATE_TOKEN: config.aulaSessionAuthenticateToken,
        GET_AULA_PERSIST_FUNCTION_NAME: this.getAulaAndPersistFunction.functionName,
        GENERATE_NEWSLETTER_FUNCTION_NAME: this.generateNewsletterFunction.functionName,
        GET_AULA_TIMEOUT: config.getAulaTimeout.toString(),
        GENERATE_NEWSLETTER_TIMEOUT: config.generateNewsletterTimeout.toString(),
      },
      bundling: commonBundling,
    });
  }
}
