/**
 * Bedrock client factory
 * Creates and configures BedrockRuntimeClient for AI operations
 */

import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { AWSConfig } from '../types';
import { getAwsConfig } from '../config';

/**
 * Creates a configured BedrockRuntimeClient
 * Uses environment variables for region and credentials if not provided
 */
export function createBedrockClient(config?: AWSConfig): BedrockRuntimeClient {
  const awsConfig = config || getAwsConfig();
  return new BedrockRuntimeClient(awsConfig);
}
