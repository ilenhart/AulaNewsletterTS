/**
 * Construct for creating API Gateway REST API for session management
 */

import * as cdk from 'aws-cdk-lib';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface ApiGatewayConstructProps {
  manageSessionIdFunction: lambda.Function;
}

/**
 * Creates a REST API Gateway with /api/sessionID endpoint
 * Backed by the manage-sessionid Lambda function
 */
export class ApiGatewayConstruct extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly deployment: apigateway.Deployment;

  constructor(scope: Construct, id: string, props: ApiGatewayConstructProps) {
    super(scope, id);

    // Create REST API
    this.api = new apigateway.RestApi(this, 'AulaSessionApi', {
      restApiName: 'Aula Session Management API',
      description: 'API for managing Aula session IDs (v2 - no auth)',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 100,
        throttlingBurstLimit: 200,
        // Disable CloudWatch logging (requires account-level CloudWatch Logs role)
        // loggingLevel: apigateway.MethodLooogingLevel.OFF,
        // dataTraceEnabled: false,
        metricsEnabled: true,
        description: 'Deployment with NONE authorization',
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
          'X-aulasession-authenticate',
        ],
      },
      endpointTypes: [apigateway.EndpointType.REGIONAL],
    });

    // Create Lambda integration
    const lambdaIntegration = new apigateway.LambdaIntegration(props.manageSessionIdFunction, {
      proxy: true,
      allowTestInvoke: true,
    });

    // Create /api resource
    const apiResource = this.api.root.addResource('api');

    // Create /api/sessionID resource
    const sessionIdResource = apiResource.addResource('sessionID');

    // Add GET method
    // Use NONE authorization - Lambda handles authentication via X-aulasession-authenticate header
    sessionIdResource.addMethod('GET', lambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': apigateway.Model.EMPTY_MODEL,
          },
        },
        {
          statusCode: '401',
          responseModels: {
            'application/json': apigateway.Model.ERROR_MODEL,
          },
        },
        {
          statusCode: '404',
          responseModels: {
            'application/json': apigateway.Model.ERROR_MODEL,
          },
        },
        {
          statusCode: '500',
          responseModels: {
            'application/json': apigateway.Model.ERROR_MODEL,
          },
        },
      ],
    });

    // Add POST method
    // Use NONE authorization - Lambda handles authentication via X-aulasession-authenticate header
    sessionIdResource.addMethod('POST', lambdaIntegration, {
      authorizationType: apigateway.AuthorizationType.NONE,
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': apigateway.Model.EMPTY_MODEL,
          },
        },
        {
          statusCode: '400',
          responseModels: {
            'application/json': apigateway.Model.ERROR_MODEL,
          },
        },
        {
          statusCode: '401',
          responseModels: {
            'application/json': apigateway.Model.ERROR_MODEL,
          },
        },
        {
          statusCode: '500',
          responseModels: {
            'application/json': apigateway.Model.ERROR_MODEL,
          },
        },
      ],
    });

    // Store reference to deployment
    this.deployment = this.api.latestDeployment!;
  }
}
