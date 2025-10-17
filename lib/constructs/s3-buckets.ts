/**
 * S3 Buckets Construct
 * Defines S3 buckets for storing Aula attachments
 */

import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { RemovalPolicy, Duration } from 'aws-cdk-lib';

export interface S3BucketsConstructProps {
  environment: string;
}

/**
 * Construct for creating S3 buckets used by the application
 */
export class S3BucketsConstruct extends Construct {
  public readonly attachmentsBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: S3BucketsConstructProps) {
    super(scope, id);

    // S3 bucket for storing downloaded Aula attachments
    this.attachmentsBucket = new s3.Bucket(this, 'AulaAttachmentsBucket', {
      bucketName: undefined, // Let CloudFormation auto-generate unique name
      versioned: false,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,

      // Lifecycle rules
      lifecycleRules: [
        {
          id: 'DeleteOldAttachments',
          enabled: true,
          expiration: Duration.days(365), // Delete attachments after 1 year
        },
      ],

      // Removal policy based on environment
      removalPolicy: ['development', 'staging'].includes(props.environment)
        ? RemovalPolicy.DESTROY
        : RemovalPolicy.RETAIN,
      autoDeleteObjects: ['development', 'staging'].includes(props.environment),
    });
  }
}
