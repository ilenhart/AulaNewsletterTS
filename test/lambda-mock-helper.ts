/**
 * Lambda Mock Helper for Local Testing
 *
 * This module intercepts AWS Lambda SDK calls and redirects them to local handler functions
 * instead of making actual AWS API calls. This allows for true integration testing of the
 * orchestrator lambda without deploying to AWS.
 */

import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { handler as GetAulaHandler } from '../src/functions/get-aula-persist/index';
import { handler as GenerateNewsletterHandler } from '../src/functions/generate-newsletter/index';
import { LambdaContext } from '../src/common/types';

/**
 * Creates a mock Lambda context for local handler invocations
 */
function createMockContext(functionName: string): LambdaContext {
  return {
    functionName: functionName,
    functionVersion: '$LATEST',
    invokedFunctionArn: `arn:aws:lambda:local:123456789012:function:${functionName}`,
    memoryLimitInMB: '1024',
    awsRequestId: 'local-test-request-' + Date.now(),
    logGroupName: `/aws/lambda/${functionName}`,
    logStreamName: `${new Date().toISOString().split('T')[0]}/[$LATEST]local-test-stream`,
    getRemainingTimeInMillis: () => 900000, // 15 minutes
    done: () => {},
    fail: () => {},
    succeed: () => {},
    callbackWaitsForEmptyEventLoop: true,
  };
}

/**
 * Sets up Lambda SDK mocks to intercept InvokeCommand calls
 * and redirect them to local handler functions
 */
export function setupLambdaMocks(): void {
  // Store the original send method
  const originalSend = LambdaClient.prototype.send as any;

  // Override the send method
  LambdaClient.prototype.send = async function (this: any, command: any, options?: any): Promise<any> {
    // Only intercept InvokeCommand
    if (command instanceof InvokeCommand) {
      const functionName = command.input?.FunctionName;
      const payloadString = command.input?.Payload;

      console.log(`\n[Lambda Mock] Intercepting invocation: ${functionName}`);

      // Parse the payload
      let event: any = {};
      if (payloadString) {
        try {
          // Handle different payload types
          let payloadStr: string;
          if (typeof payloadString === 'string') {
            payloadStr = payloadString;
          } else if (payloadString instanceof Uint8Array) {
            const decoder = new TextDecoder();
            payloadStr = decoder.decode(payloadString);
          } else {
            // Convert to string if it's a Buffer or other type
            payloadStr = String(payloadString);
          }
          event = JSON.parse(payloadStr);
        } catch (error) {
          console.error('[Lambda Mock] Error parsing payload:', error);
        }
      }

      // Route to appropriate local handler
      if (functionName?.includes('get-aula-persist') || functionName === 'local-test-get-aula-persist') {
        console.log('[Lambda Mock] Routing to local GetAulaAndPersist handler');
        const context = createMockContext('GetAulaAndPersistFunction-LocalTest');

        try {
          const result = await GetAulaHandler(event, context);

          // Convert handler response to Lambda InvokeCommand response format
          return {
            StatusCode: result.statusCode,
            FunctionError: result.statusCode >= 400 ? 'Unhandled' : undefined,
            Payload: new TextEncoder().encode(JSON.stringify(result)),
          };
        } catch (error: any) {
          console.error('[Lambda Mock] Error in GetAulaAndPersist handler:', error);
          return {
            StatusCode: 500,
            FunctionError: 'Unhandled',
            Payload: new TextEncoder().encode(JSON.stringify({
              statusCode: 500,
              body: JSON.stringify({
                error: 'Lambda execution error',
                message: error.message,
              }),
            })),
          };
        }
      } else if (functionName?.includes('generate-newsletter') || functionName === 'local-test-generate-newsletter') {
        console.log('[Lambda Mock] Routing to local GenerateNewsletter handler');
        const context = createMockContext('GenerateNewsletterFunction-LocalTest');

        try {
          const result = await GenerateNewsletterHandler(event, context);

          // Convert handler response to Lambda InvokeCommand response format
          return {
            StatusCode: result.statusCode,
            FunctionError: result.statusCode >= 400 ? 'Unhandled' : undefined,
            Payload: new TextEncoder().encode(JSON.stringify(result)),
          };
        } catch (error: any) {
          console.error('[Lambda Mock] Error in GenerateNewsletter handler:', error);
          return {
            StatusCode: 500,
            FunctionError: 'Unhandled',
            Payload: new TextEncoder().encode(JSON.stringify({
              statusCode: 500,
              body: JSON.stringify({
                error: 'Lambda execution error',
                message: error.message,
              }),
            })),
          };
        }
      }

      // Unknown function - log warning and try original method
      console.warn(`[Lambda Mock] Unknown function name: ${functionName}, falling back to original SDK`);
      return originalSend.call(this, command, options);
    }

    // Not an InvokeCommand - use original method
    return originalSend.call(this, command, options);
  };

  console.log('[Lambda Mock] Mock setup complete - Lambda SDK calls will be intercepted');
}

/**
 * Restores the original Lambda SDK behavior (removes mocks)
 * Call this in afterAll() if you need to clean up
 */
export function teardownLambdaMocks(): void {
  // Note: This is a simplified version. In a real implementation,
  // you'd need to store the original method and restore it properly.
  // For now, this is informational.
  console.log('[Lambda Mock] Teardown called (mocks remain active for session)');
}
