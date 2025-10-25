/**
 * Configuration for aula-keep-session-alive Lambda
 */

import { validateRequired, getEnvString, getEnvBool } from '../../common/config';

export interface KeepSessionAliveConfig {
  sessionTableName: string;
  apiUrl: string;
  emailFromAddress: string;
  emailToAddresses: string[];
  sendEmailOnSuccess: boolean;
}

/**
 * Loads and validates configuration for keep-session-alive lambda
 */
export function getConfig(): KeepSessionAliveConfig {
  // Validate required environment variables
  validateRequired([
    'AULA_SESSION_ID_TABLE',
    'EMAIL_FROM_ADDRESS',
    'EMAIL_TO_ADDRESSES',
  ]);

  return {
    sessionTableName: getEnvString('AULA_SESSION_ID_TABLE'),
    apiUrl: getEnvString('API_URL', 'https://www.aula.dk/api/'),
    emailFromAddress: getEnvString('EMAIL_FROM_ADDRESS'),
    emailToAddresses: getEnvString('EMAIL_TO_ADDRESSES')
      .split(',')
      .map(email => email.trim())
      .filter(email => email.length > 0),
    sendEmailOnSuccess: getEnvBool('SESSION_ALIVE_SEND_EMAIL_ON_SUCCESS', false),
  };
}
