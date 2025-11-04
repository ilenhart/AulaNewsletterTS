import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { DynamoDBTablesConstruct } from '../constructs/dynamodb-tables';
import { S3BucketsConstruct } from '../constructs/s3-buckets';
import { LambdaFunctionsConstruct } from '../constructs/lambda-functions';
import { EventSchedulesConstruct } from '../constructs/event-schedules';
import { ApiGatewayConstruct } from '../constructs/api-gateway';
import { StackConfiguration } from '../config/stack-config';

/**
 * Main CDK Stack for the Aula Newsletter application
 *
 * This stack creates:
 * - DynamoDB tables for storing Aula data (RAW, PARSED, and session data)
 * - S3 buckets for storing attachments
 * - Lambda functions for fetching data and generating newsletters
 * - EventBridge rules for scheduled execution
 * - IAM roles and permissions
 */
export class AulaNewsletterStack extends cdk.Stack {
  public readonly tables: DynamoDBTablesConstruct;
  public readonly buckets: S3BucketsConstruct;
  public readonly lambdaFunctions: LambdaFunctionsConstruct;
  public readonly eventSchedules?: EventSchedulesConstruct;
  public readonly apiGateway: ApiGatewayConstruct;

  constructor(scope: Construct, id: string, config: StackConfiguration, props?: cdk.StackProps) {
    super(scope, id, props);

    // Create DynamoDB Tables
    this.tables = new DynamoDBTablesConstruct(this, 'DynamoDBTables', config.stackProps.removalPolicy);

    // Create S3 Buckets
    this.buckets = new S3BucketsConstruct(this, 'S3Buckets', {
      environment: config.stackProps.environment,
    });

    // Create Lambda Functions
    this.lambdaFunctions = new LambdaFunctionsConstruct(
      this,
      'LambdaFunctions',
      this.tables,
      this.buckets,
      config.lambdaConfig
    );

    // Create EventBridge Schedules (conditionally)
    this.eventSchedules = config.scheduleConfig.enableSchedules
      ? new EventSchedulesConstruct(this, 'EventSchedules', {
          lambdaFunctions: this.lambdaFunctions,
          scheduleConfig: config.scheduleConfig,
        })
      : undefined;

    // Create API Gateway
    this.apiGateway = new ApiGatewayConstruct(this, 'ApiGateway', {
      manageSessionIdFunction: this.lambdaFunctions.manageSessionIdFunction,
      updateAndGenerateFullProcessFunction: this.lambdaFunctions.updateAndGenerateFullProcessFunction,
    });

    // Stack Outputs
    new cdk.CfnOutput(this, 'GetAulaAndPersistFunctionArn', {
      description: 'ARN of the GetAulaAndPersist Lambda function',
      value: this.lambdaFunctions.getAulaAndPersistFunction.functionArn,
      exportName: `${id}-GetAulaAndPersistFunctionArn`,
    });

    new cdk.CfnOutput(this, 'GenerateNewsletterFunctionArn', {
      description: 'ARN of the GenerateNewsletter Lambda function',
      value: this.lambdaFunctions.generateNewsletterFunction.functionArn,
      exportName: `${id}-GenerateNewsletterFunctionArn`,
    });

    new cdk.CfnOutput(this, 'AulaKeepSessionAliveFunctionArn', {
      description: 'ARN of the AulaKeepSessionAlive Lambda function',
      value: this.lambdaFunctions.aulaKeepSessionAliveFunction.functionArn,
      exportName: `${id}-AulaKeepSessionAliveFunctionArn`,
    });

    new cdk.CfnOutput(this, 'UpdateAndGenerateFullProcessFunctionArn', {
      description: 'ARN of the UpdateAndGenerateFullProcess Lambda function',
      value: this.lambdaFunctions.updateAndGenerateFullProcessFunction.functionArn,
      exportName: `${id}-UpdateAndGenerateFullProcessFunctionArn`,
    });

    new cdk.CfnOutput(this, 'GetAulaAndPersistFunctionName', {
      description: 'Name of the GetAulaAndPersist Lambda function',
      value: this.lambdaFunctions.getAulaAndPersistFunction.functionName,
    });

    new cdk.CfnOutput(this, 'GenerateNewsletterFunctionName', {
      description: 'Name of the GenerateNewsletter Lambda function',
      value: this.lambdaFunctions.generateNewsletterFunction.functionName,
    });

    new cdk.CfnOutput(this, 'AulaKeepSessionAliveFunctionName', {
      description: 'Name of the AulaKeepSessionAlive Lambda function',
      value: this.lambdaFunctions.aulaKeepSessionAliveFunction.functionName,
    });

    new cdk.CfnOutput(this, 'UpdateAndGenerateFullProcessFunctionName', {
      description: 'Name of the UpdateAndGenerateFullProcess Lambda function',
      value: this.lambdaFunctions.updateAndGenerateFullProcessFunction.functionName,
    });

    // IAM Role ARNs
    new cdk.CfnOutput(this, 'GetAulaRoleArn', {
      description: 'IAM role ARN for GetAulaAndPersist Lambda',
      value: this.lambdaFunctions.getAulaRole.roleArn,
    });

    new cdk.CfnOutput(this, 'GenerateNewsletterRoleArn', {
      description: 'IAM role ARN for GenerateNewsletter Lambda',
      value: this.lambdaFunctions.generateNewsletterRole.roleArn,
    });

    new cdk.CfnOutput(this, 'KeepSessionAliveRoleArn', {
      description: 'IAM role ARN for KeepSessionAlive Lambda',
      value: this.lambdaFunctions.keepSessionAliveRole.roleArn,
    });

    new cdk.CfnOutput(this, 'UpdateAndGenerateFullProcessRoleArn', {
      description: 'IAM role ARN for UpdateAndGenerateFullProcess Lambda',
      value: this.lambdaFunctions.updateAndGenerateFullProcessRole.roleArn,
    });

    // DynamoDB Table Names
    new cdk.CfnOutput(this, 'AulaSessionTableName', {
      description: 'DynamoDB table for Aula sessions',
      value: this.tables.aulaSessionIdTable.tableName,
    });

    new cdk.CfnOutput(this, 'RawThreadMessagesTableName', {
      description: 'DynamoDB table for raw thread messages',
      value: this.tables.rawThreadMessagesTable.tableName,
    });

    // EventBridge Rule ARNs (conditional on schedules being enabled)
    if (this.eventSchedules) {
      new cdk.CfnOutput(this, 'GetAulaScheduleRuleArn', {
        description: 'EventBridge rule ARN for GetAulaAndPersist schedule',
        value: this.eventSchedules.getAulaAndPersistRule.ruleArn,
      });

      new cdk.CfnOutput(this, 'GenerateNewsletterScheduleRuleArn', {
        description: 'EventBridge rule ARN for GenerateNewsletter schedule',
        value: this.eventSchedules.generateNewsletterRule.ruleArn,
      });

      new cdk.CfnOutput(this, 'KeepSessionAliveScheduleRuleArn', {
        description: 'EventBridge rule ARN for KeepSessionAlive schedule',
        value: this.eventSchedules.aulaKeepSessionAliveRule.ruleArn,
      });

      // Optional high-frequency schedule output
      if (this.eventSchedules.aulaKeepSessionAliveHighFreqRule) {
        new cdk.CfnOutput(this, 'KeepSessionAliveHighFreqScheduleRuleArn', {
          description: 'EventBridge rule ARN for KeepSessionAlive high-frequency schedule',
          value: this.eventSchedules.aulaKeepSessionAliveHighFreqRule.ruleArn,
        });
      }
    } else {
      // Add output indicating schedules are disabled
      new cdk.CfnOutput(this, 'EventBridgeSchedulesStatus', {
        description: 'EventBridge schedules deployment status',
        value: 'DISABLED - Lambdas can only be invoked manually or via API',
      });
    }

    // API Gateway outputs
    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      description: 'API Gateway endpoint URL',
      value: this.apiGateway.api.url,
      exportName: `${id}-ApiGatewayUrl`,
    });

    new cdk.CfnOutput(this, 'ApiGatewayId', {
      description: 'API Gateway REST API ID',
      value: this.apiGateway.api.restApiId,
    });

    new cdk.CfnOutput(this, 'SessionIdEndpoint', {
      description: 'Full URL for session ID management endpoint',
      value: `${this.apiGateway.api.url}api/sessionID`,
    });

    new cdk.CfnOutput(this, 'SendNewsletterEndpoint', {
      description: 'Full URL for on-demand newsletter generation endpoint',
      value: `${this.apiGateway.api.url}api/sendNewsletter`,
    });

    new cdk.CfnOutput(this, 'ManageSessionIdFunctionArn', {
      description: 'ARN of the ManageSessionId Lambda function',
      value: this.lambdaFunctions.manageSessionIdFunction.functionArn,
      exportName: `${id}-ManageSessionIdFunctionArn`,
    });

    new cdk.CfnOutput(this, 'ManageSessionIdFunctionName', {
      description: 'Name of the ManageSessionId Lambda function',
      value: this.lambdaFunctions.manageSessionIdFunction.functionName,
    });

    new cdk.CfnOutput(this, 'ManageSessionIdRoleArn', {
      description: 'IAM role ARN for ManageSessionId Lambda',
      value: this.lambdaFunctions.manageSessionIdRole.roleArn,
    });

    // Schedule configuration outputs (conditional on schedules being enabled)
    if (this.eventSchedules) {
      new cdk.CfnOutput(this, 'GetAulaSchedule', {
        description: 'GetAulaAndPersist cron schedule',
        value: config.scheduleConfig.getAulaSchedule,
      });

      new cdk.CfnOutput(this, 'GenerateNewsletterSchedule', {
        description: 'GenerateNewsletter cron schedule',
        value: config.scheduleConfig.generateNewsletterSchedule,
      });

      new cdk.CfnOutput(this, 'KeepSessionAliveSchedule', {
        description: 'KeepSessionAlive cron schedule',
        value: config.scheduleConfig.keepSessionAliveSchedule,
      });

      if (config.scheduleConfig.keepSessionAliveHighFrequencySchedule) {
        new cdk.CfnOutput(this, 'KeepSessionAliveHighFreqSchedule', {
          description: 'KeepSessionAlive high-frequency cron schedule',
          value: config.scheduleConfig.keepSessionAliveHighFrequencySchedule,
        });
      }
    }

    // S3 Bucket outputs
    new cdk.CfnOutput(this, 'AttachmentsBucketName', {
      description: 'S3 bucket for Aula attachments',
      value: this.buckets.attachmentsBucket.bucketName,
      exportName: `${id}-AttachmentsBucketName`,
    });

    new cdk.CfnOutput(this, 'AttachmentsBucketArn', {
      description: 'ARN of the attachments S3 bucket',
      value: this.buckets.attachmentsBucket.bucketArn,
    });

    // Attachments Table output
    new cdk.CfnOutput(this, 'AttachmentsTableName', {
      description: 'DynamoDB table for attachment metadata',
      value: this.tables.aulaAttachmentsTable.tableName,
    });
  }
}
