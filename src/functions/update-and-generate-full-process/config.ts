/**
 * Configuration for Update and Generate Full Process Lambda
 */

import { getEnvString, getEnvInt } from '../../common/config';

export interface UpdateAndGenerateConfig {
  // Authentication
  authenticateToken: string;

  // Lambda function names
  getAulaPersistFunctionName: string;
  generateNewsletterFunctionName: string;

  // Timeouts (in seconds)
  getAulaTimeout: number;
  generateNewsletterTimeout: number;
}

/**
 * Detects if running in local test environment vs deployed AWS Lambda
 */
function isLocalEnvironment(): boolean {
  // Check if we're running in a deployed Lambda environment
  // AWS Lambda always sets AWS_LAMBDA_FUNCTION_NAME
  return !process.env.AWS_LAMBDA_FUNCTION_NAME;
}

/**
 * Loads and validates configuration from environment variables
 */
export function getConfig(): UpdateAndGenerateConfig {
  // Validate required environment variables
  const authenticateToken = getEnvString('AULASESSION_AUTHENTICATE_TOKEN');
  if (!authenticateToken) {
    throw new Error('AULASESSION_AUTHENTICATE_TOKEN is required');
  }

  // Detect environment
  const isLocal = isLocalEnvironment();

  // Function names: required in deployed environment, placeholder in local testing
  // Use optional default values to avoid throwing errors in local mode
  const getAulaPersistFunctionName = getEnvString(
    'GET_AULA_PERSIST_FUNCTION_NAME',
    isLocal ? 'local-test-get-aula-persist' : undefined
  );

  const generateNewsletterFunctionName = getEnvString(
    'GENERATE_NEWSLETTER_FUNCTION_NAME',
    isLocal ? 'local-test-generate-newsletter' : undefined
  );

  // In deployed environment, function names must be provided
  if (!isLocal && (!getAulaPersistFunctionName || !generateNewsletterFunctionName)) {
    throw new Error('GET_AULA_PERSIST_FUNCTION_NAME and GENERATE_NEWSLETTER_FUNCTION_NAME are required in deployed environment');
  }

  return {
    authenticateToken,
    getAulaPersistFunctionName: getAulaPersistFunctionName!,
    generateNewsletterFunctionName: generateNewsletterFunctionName!,
    getAulaTimeout: getEnvInt('GET_AULA_TIMEOUT', 900),
    generateNewsletterTimeout: getEnvInt('GENERATE_NEWSLETTER_TIMEOUT', 900),
  };
}
