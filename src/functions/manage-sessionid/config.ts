/**
 * Configuration for manage-sessionid Lambda function
 * Loads and validates environment variables
 */

import { requireEnv } from '../../common/config';

export interface ManageSessionIdConfig {
  tableName: string;
  authToken: string;
}

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): ManageSessionIdConfig {
  return {
    tableName: requireEnv('TABLE_NAME'),
    authToken: requireEnv('AULASESSION_AUTHENTICATE_TOKEN'),
  };
}
