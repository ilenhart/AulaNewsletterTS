import * as dotenv from 'dotenv';
import * as cdk from 'aws-cdk-lib';

// Load environment variables from .env file
dotenv.config();

/**
 * EventBridge schedule configuration for Lambda functions
 */
export interface ScheduleConfiguration {
  enableSchedules: boolean;  // Control whether EventBridge schedules are deployed
  getAulaSchedule: string;
  generateNewsletterSchedule: string;
  keepSessionAliveSchedule: string;
  keepSessionAliveHighFrequencySchedule?: string;  // Optional: High-frequency schedule for specific time windows
}

/**
 * Complete stack configuration
 */
export interface StackConfiguration {
  lambdaConfig: LambdaConfiguration;
  scheduleConfig: ScheduleConfiguration;
  environment: 'development' | 'staging' | 'production';
  stackProps: StackProperties;
}

/**
 * Lambda function configuration
 */
export interface LambdaConfiguration {
  // Aula API configuration
  apiUrl: string;

  // User information
  parentFirstName: string;
  childFirstName: string;
  childName: string;
  parentNames: string;
  messageFamilyNamesToFlag: string;
  parentMailboxIds: string;

  // Email configuration
  emailFromAddress: string;
  emailToAddresses: string;

  // API authentication
  aulaSessionAuthenticateToken: string;

  // Data retrieval configuration
  threadMessagesDaysInPast: number;
  calendarEventsDaysInPast: number;
  calendarEventsDaysInFuture: number;
  postsDaysInPast: number;

  // GetAulaAndPersist specific configuration
  threadMessagesDays: number;
  postsDays: number;
  calendarEventsPast: number;
  calendarEventsFuture: number;
  galleryDays: number;

  // Lambda timeouts (in seconds)
  getAulaTimeout: number;
  generateNewsletterTimeout: number;
  keepSessionAliveTimeout: number;

  // Newsletter generation behavior
  generateNewsletterIfNothingNew: boolean;

  // Session keep-alive behavior
  sessionAliveSendEmailOnSuccess: boolean;
}

/**
 * Stack-level properties
 */
export interface StackProperties {
  environment: 'development' | 'staging' | 'production';
  removalPolicy: cdk.RemovalPolicy;
  enableCostTags: boolean;
  tags: Record<string, string>;
}

/**
 * Require an environment variable to be set
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Get an environment variable with a default value
 */
function getEnv(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

/**
 * Get a numeric environment variable with a default value
 */
function getEnvNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a number, got: ${value}`);
  }
  return parsed;
}

/**
 * Validates an EventBridge cron expression
 * EventBridge uses 6 fields: minute hour day-of-month month day-of-week year
 */
function validateCronExpression(expression: string, name: string): void {
  const parts = expression.trim().split(/\s+/);

  if (parts.length !== 6) {
    throw new Error(
      `Invalid cron expression for ${name}: "${expression}". ` +
      `EventBridge requires 6 fields: minute hour day-of-month month day-of-week year. ` +
      `Example: "0 0/4 * * ? *" (every 4 hours)`
    );
  }

  // Basic validation for each field
  const [minute, hour, dayOfMonth, month, dayOfWeek, year] = parts;

  // Check that day-of-month and day-of-week aren't both specified (one must be ?)
  if (dayOfMonth !== '?' && dayOfWeek !== '?') {
    throw new Error(
      `Invalid cron expression for ${name}: "${expression}". ` +
      `Either day-of-month or day-of-week must be '?', not both can be specified.`
    );
  }

  // Ensure at least one is ?
  if (dayOfMonth === '?' && dayOfWeek === '?') {
    throw new Error(
      `Invalid cron expression for ${name}: "${expression}". ` +
      `At least one of day-of-month or day-of-week must be specified (not both '?').`
    );
  }
}

/**
 * Load and validate configuration from environment variables
 */
export function loadConfiguration(): StackConfiguration {
  const environment = (process.env.ENVIRONMENT || 'development') as 'development' | 'staging' | 'production';

  // Validate environment value
  if (!['development', 'staging', 'production'].includes(environment)) {
    throw new Error(`Invalid ENVIRONMENT value: ${environment}. Must be one of: development, staging, production`);
  }

  // Load schedule configuration with defaults
  const enableSchedules = getEnv('ENABLE_EVENTBRIDGE_SCHEDULES', 'true').toLowerCase() === 'true';
  const getAulaSchedule = getEnv('GET_AULA_SCHEDULE', '0 9,17 * * ? *');
  const generateNewsletterSchedule = getEnv('GENERATE_NEWSLETTER_SCHEDULE', '0 18 * * ? *');
  const keepSessionAliveSchedule = getEnv('KEEP_SESSION_ALIVE_SCHEDULE', '0 0/4 * * ? *');
  const keepSessionAliveHighFrequencySchedule = process.env.KEEP_SESSION_ALIVE_HIGH_FREQ_SCHEDULE || undefined;

  // Validate cron expressions only if schedules are enabled
  if (enableSchedules) {
    validateCronExpression(getAulaSchedule, 'GET_AULA_SCHEDULE');
    validateCronExpression(generateNewsletterSchedule, 'GENERATE_NEWSLETTER_SCHEDULE');
    validateCronExpression(keepSessionAliveSchedule, 'KEEP_SESSION_ALIVE_SCHEDULE');

    // Validate optional high-frequency schedule if provided
    if (keepSessionAliveHighFrequencySchedule) {
      validateCronExpression(keepSessionAliveHighFrequencySchedule, 'KEEP_SESSION_ALIVE_HIGH_FREQ_SCHEDULE');
    }
  }

  return {
    environment,
    scheduleConfig: {
      enableSchedules,
      getAulaSchedule,
      generateNewsletterSchedule,
      keepSessionAliveSchedule,
      keepSessionAliveHighFrequencySchedule,
    },
    lambdaConfig: {
      // Required fields with validation
      emailFromAddress: requireEnv('EMAIL_FROM_ADDRESS'),
      emailToAddresses: requireEnv('EMAIL_TO_ADDRESSES'),
      aulaSessionAuthenticateToken: requireEnv('AULASESSION_AUTHENTICATE_TOKEN'),

      // Optional with defaults
      apiUrl: getEnv('API_URL', 'https://www.aula.dk/api/'),
      parentFirstName: getEnv('PARENT_FIRSTNAME', 'Parent'),
      childFirstName: getEnv('CHILD_FIRSTNAME', 'Child'),
      childName: getEnv('CHILD_NAME', 'Child FullName'),
      parentNames: getEnv('PARENT_NAMES', 'Parent Names'),
      messageFamilyNamesToFlag: getEnv('MESSAGE_FAMILY_NAMES_TO_FLAG', ''),
      parentMailboxIds: getEnv('PARENT_MAILBOX_IDS', '0,0'),

      // Numeric configurations for data retrieval (GenerateNewsletter Lambda)
      // NOTE: These values are ONLY used in FULL MODE (first run, no previous snapshot)
      // In INCREMENTAL MODE, the system fetches data since the last GeneratedAt timestamp
      threadMessagesDaysInPast: getEnvNumber('THREADMESSAGES_DAYS_IN_PAST', 30),
      calendarEventsDaysInPast: getEnvNumber('CALENDAR_EVENTS_DAYS_IN_PAST', 7),
      calendarEventsDaysInFuture: getEnvNumber('CALENDAR_EVENTS_DAYS_IN_FUTURE', 7),
      postsDaysInPast: getEnvNumber('POSTS_DAYS_IN_PAST', 30),

      // GetAulaAndPersist specific
      threadMessagesDays: getEnvNumber('THREAD_MESSAGES_DAYS', 30),
      postsDays: getEnvNumber('POSTS_DAYS', 30),
      calendarEventsPast: getEnvNumber('CALENDAR_EVENTS_DAYS_PAST', 10),
      calendarEventsFuture: getEnvNumber('CALENDAR_EVENTS_DAYS_FUTURE', 30),
      galleryDays: getEnvNumber('GALLERY_DAYS', 5),

      // Lambda timeouts (in seconds)
      getAulaTimeout: getEnvNumber('GET_AULA_TIMEOUT', 900),
      generateNewsletterTimeout: getEnvNumber('GENERATE_NEWSLETTER_TIMEOUT', 900),
      keepSessionAliveTimeout: getEnvNumber('KEEP_SESSION_ALIVE_TIMEOUT', 60),

      // Newsletter generation behavior
      generateNewsletterIfNothingNew: getEnv('GENERATE_NEWSLETTER_IF_NOTHING_NEW', 'false').toLowerCase() === 'true',

      // Session keep-alive behavior
      sessionAliveSendEmailOnSuccess: getEnv('SESSION_ALIVE_SEND_EMAIL_ON_SUCCESS', 'false').toLowerCase() === 'true',
    },
    stackProps: {
      environment,
      // Use RETAIN for production, DESTROY for dev/staging
      removalPolicy: environment === 'production' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      enableCostTags: true,
      tags: {
        Project: 'AulaNewsletter',
        Environment: environment,
        ManagedBy: 'CDK',
        Owner: getEnv('STACK_OWNER', 'Team'),
        CostCenter: getEnv('COST_CENTER', 'Engineering'),
      },
    },
  };
}
