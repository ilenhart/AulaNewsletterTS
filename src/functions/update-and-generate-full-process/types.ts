/**
 * TypeScript interfaces for Update and Generate Full Process Lambda
 */

import { DateRangeOverride } from '../../common/types';

/**
 * Lambda invocation payload for get-aula-persist
 */
export interface GetAulaPersistPayload {
  dateRangeOverride?: DateRangeOverride;
}

/**
 * Lambda invocation payload for generate-newsletter
 */
export interface GenerateNewsletterPayload {
  dateRangeOverride?: DateRangeOverride;
}

/**
 * Lambda invocation result
 */
export interface LambdaInvocationResult {
  success: boolean;
  statusCode: number;
  payload: any;
  duration: number;
  functionName: string;
  error?: string;
}

/**
 * Step execution details
 */
export interface StepResult {
  status: 'success' | 'failed' | 'skipped';
  statusCode: number;
  duration: number;
  message?: string;
  details?: any;
}

/**
 * Full process execution result
 */
export interface FullProcessResult {
  success: boolean;
  steps: {
    dataUpdate: StepResult;
    newsletterGeneration?: StepResult;
  };
  totalDuration: number;
  timestamp: string;
  message: string;
}

/**
 * Lambda event and context types (for REST API invocation)
 */
export interface LambdaEvent {
  httpMethod?: string;
  headers?: { [key: string]: string };
  queryStringParameters?: { [key: string]: string };
  body?: string;
  [key: string]: any;
}

export interface LambdaContext {
  functionName: string;
  awsRequestId: string;
  [key: string]: any;
}

export interface LambdaResponse {
  statusCode: number;
  headers?: { [key: string]: string };
  body: string;
}
