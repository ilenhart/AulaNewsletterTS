/**
 * Lambda Invoker Service
 * Handles synchronous invocation of other Lambda functions
 */

import { LambdaClient, InvokeCommand, InvokeCommandOutput } from '@aws-sdk/client-lambda';
import { LambdaInvocationResult } from './types';
import { logInfo, logError, logWarn } from '../../common/utils';

/**
 * Service for invoking other Lambda functions
 */
export class LambdaInvoker {
  constructor(private readonly lambdaClient: LambdaClient) {}

  /**
   * Invokes a Lambda function synchronously and waits for response
   * @param functionName - Name of the Lambda function to invoke
   * @param payload - Optional payload to pass to the lambda
   * @returns Invocation result with parsed response
   */
  async invokeLambda(
    functionName: string,
    payload?: any
  ): Promise<LambdaInvocationResult> {
    const startTime = Date.now();

    try {
      logInfo('Invoking Lambda function', {
        functionName,
        hasPayload: !!payload,
      });

      const command = new InvokeCommand({
        FunctionName: functionName,
        InvocationType: 'RequestResponse', // Synchronous invocation
        Payload: payload ? JSON.stringify(payload) : undefined,
      });

      const response = await this.lambdaClient.send(command);
      const duration = Date.now() - startTime;

      return this.parseLambdaResponse(response, functionName, duration);
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      logError('Lambda invocation failed', {
        functionName,
        error: errorMessage,
        duration,
      });

      return {
        success: false,
        statusCode: 500,
        payload: null,
        duration,
        functionName,
        error: errorMessage,
      };
    }
  }

  /**
   * Parses the Lambda invocation response
   * @param response - Raw Lambda invocation response
   * @param functionName - Name of invoked function
   * @param duration - Execution duration in milliseconds
   * @returns Parsed invocation result
   */
  private parseLambdaResponse(
    response: InvokeCommandOutput,
    functionName: string,
    duration: number
  ): LambdaInvocationResult {
    // Check for function error (handled exception in lambda)
    if (response.FunctionError) {
      logWarn('Lambda function returned error', {
        functionName,
        errorType: response.FunctionError,
      });

      let errorPayload: any = {};
      try {
        if (response.Payload) {
          const payloadString = new TextDecoder().decode(response.Payload);
          errorPayload = JSON.parse(payloadString);
        }
      } catch (parseError) {
        logError('Failed to parse error payload', {
          error: parseError instanceof Error ? parseError.message : String(parseError),
        });
      }

      return {
        success: false,
        statusCode: errorPayload.statusCode || 500,
        payload: errorPayload,
        duration,
        functionName,
        error: errorPayload.body || response.FunctionError,
      };
    }

    // Parse successful response
    let parsedPayload: any = null;
    try {
      if (response.Payload) {
        const payloadString = new TextDecoder().decode(response.Payload);
        parsedPayload = JSON.parse(payloadString);
      }
    } catch (parseError) {
      logError('Failed to parse lambda response payload', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
      });

      return {
        success: false,
        statusCode: 500,
        payload: null,
        duration,
        functionName,
        error: 'Failed to parse lambda response',
      };
    }

    const statusCode = parsedPayload?.statusCode || response.StatusCode || 200;
    const success = statusCode >= 200 && statusCode < 300;

    logInfo('Lambda invocation completed', {
      functionName,
      statusCode,
      success,
      duration,
    });

    return {
      success,
      statusCode,
      payload: parsedPayload,
      duration,
      functionName,
    };
  }

  /**
   * Checks if a lambda result indicates the operation was skipped
   * (e.g., session in failed state)
   */
  isSkipped(result: LambdaInvocationResult): boolean {
    if (!result.payload || !result.payload.body) {
      return false;
    }

    try {
      const body = typeof result.payload.body === 'string'
        ? JSON.parse(result.payload.body)
        : result.payload.body;

      // Check for skip messages
      return (
        body.message?.toLowerCase().includes('skipped') ||
        body.message?.toLowerCase().includes('skip') ||
        body.processingSkipped === true
      );
    } catch {
      return false;
    }
  }
}
