/**
 * SES client factory
 * Creates and configures SESClient for email operations
 */

import { SESClient } from '@aws-sdk/client-ses';
import { AWSConfig } from '../types';
import { getAwsConfig } from '../config';

/**
 * Creates a configured SESClient
 * Uses environment variables for region and credentials if not provided
 */
export function createSESClient(config?: AWSConfig): SESClient {
  const awsConfig = config || getAwsConfig();
  return new SESClient(awsConfig);
}
