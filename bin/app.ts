#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AulaNewsletterStack } from '../lib/stacks/aula-newsletter-stack';
import { loadConfiguration } from '../lib/config/stack-config';

const app = new cdk.App();

// Load and validate configuration from environment variables
const config = loadConfiguration();

// Create the stack
const stack = new AulaNewsletterStack(app, 'AulaNewsletterStack', config, {
  description: 'Aula Newsletter - Automated school newsletter system using AI',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
});

// Apply tags to all resources in the stack
if (config.stackProps.enableCostTags) {
  Object.entries(config.stackProps.tags).forEach(([key, value]) => {
    cdk.Tags.of(stack).add(key, value);
  });
}