/**
 * Configuration for manage-sessionid Lambda function
 * Loads and validates environment variables
 */

import { getEnvString, validateRequired } from '../../common/config';

export interface ManageSessionIdConfig {
  tableName: string;
  authToken: string;
}

/**
 * Load and validate configuration from environment variables
 */
export function loadConfig(): ManageSessionIdConfig {
  validateRequired(['TABLE_NAME', 'AULASESSION_AUTHENTICATE_TOKEN']);

  return {
    tableName: getEnvString('TABLE_NAME')!,
    authToken: getEnvString('AULASESSION_AUTHENTICATE_TOKEN')!,
  };
}
