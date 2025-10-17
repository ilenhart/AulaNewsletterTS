/**
 * DynamoDB client factory
 * Creates and configures DynamoDB DocumentClient with consistent settings
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { AWSConfig } from '../types';
import { getAwsConfig } from '../config';

/**
 * Creates a configured DynamoDB DocumentClient
 * Uses environment variables for region and credentials if not provided
 */
export function createDynamoDBDocClient(config?: AWSConfig): DynamoDBDocumentClient {
  const awsConfig = config || getAwsConfig();

  const client = new DynamoDBClient(awsConfig);

  return DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      convertClassInstanceToMap: true,
      removeUndefinedValues: true,
    },
  });
}

/**
 * Creates a base DynamoDB Client (without document client wrapper)
 */
export function createDynamoDBClient(config?: AWSConfig): DynamoDBClient {
  const awsConfig = config || getAwsConfig();
  return new DynamoDBClient(awsConfig);
}
