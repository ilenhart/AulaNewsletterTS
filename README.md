# Aula Newsletter CDK Infrastructure

This directory contains the AWS CDK infrastructure for the Aula Newsletter application - an automated newsletter system that fetches data from the Aula school management platform, stores it in DynamoDB, and generates AI-powered newsletter summaries using Amazon Bedrock (Claude AI).

## Architecture Overview

The application uses a **four-Lambda architecture** with scheduled execution and REST API:

1. **GetAulaAndPersist Lambda**: Runs twice daily (9am & 5pm UTC) to fetch and store Aula data
2. **GenerateNewsletter Lambda**: Runs daily (6pm UTC) to generate and email AI-summarized newsletters
3. **AulaKeepSessionAlive Lambda**: Runs every 4 hours to ping Aula and keep sessions alive
4. **ManageSessionId Lambda**: REST API handler for GET/POST session ID management (used by Chrome extension)

### AWS Services Used

- **AWS Lambda**: Four functions for data fetching, newsletter generation, session management, and API
- **Amazon DynamoDB**: 13 tables for storing RAW, PARSED, session data, and attachment metadata
- **Amazon S3**: One bucket for storing downloaded Aula attachments
- **Amazon EventBridge**: Scheduled rules for automatic Lambda execution
- **Amazon Bedrock**: Claude 3 Sonnet for AI translation and summarization
- **Amazon SES**: Email delivery service
- **Amazon API Gateway**: REST API for session management
- **IAM**: Roles and permissions management

## Related Projects

This extension is part of a suite of three interconnected projects designed to work with the Aula.dk platform. Each project can be used independently, but together they form a complete solution for Aula session management, API interaction, and automation.

### 🔐 AulaLoginBrowserExtension 

**Repository**: [github.com/ilenhart/AulaLoginBrowserExtension](https://github.com/ilenhart/AulaLoginBrowserExtension)

**Purpose**: Chrome browser extension for capturing and storing Aula session IDs

**What it does**:
- Automatically detects and extracts your PHPSESSID from www.aula.dk
- Provides a real-time view of your current session
- Synchronizes session IDs with a backend persistence layer via REST API
- Supports custom authentication for secure backend communication
- Can work with any REST backend, or specifically with **AulaNewsletterTS** as a backend

**Use this when**: You need to capture and persist your Aula session ID for use by other services or automation tools.

---

### 📡 AulaApiClient

**Repository**: [github.com/ilenhart/AulaAPIClient](https://github.com/ilenhart/AulaApiClient)

**Purpose**: General-purpose API wrapper for the Aula platform

**What it does**:
- Provides a clean, typed interface for interacting with Aula.dk `/api` endpoints
- Handles authentication using the PHPSESSID session ID
- Wraps common Aula API operations (messages, calendars, profiles, etc.)
- Can be integrated into any Node.js or TypeScript project

**Use this when**: You need to programmatically interact with Aula's API from your own applications or scripts.

---

### 📰 AulaNewsletterTS (This Project)

**Repository**: [github.com/ilenhart/AulaNewsletterTS](https://github.com/ilenhart/AulaNewsletterTS)

**Purpose**: AWS-based automation platform for Aula with session persistence and AI-powered newsletters

**What it does**:
- Acts as a REST API backend for storing session IDs (compatible with this extension)
- Periodically pings Aula to keep sessions alive  (similar to if you keep Aula open in your browser and occasionally refresh)
- Pulls information from Aula using the **AulaApiClient** library
- Generates AI-powered newsletters from Aula data
- Sends automated email updates
- Deployed as a serverless solution on AWS (Lambda, DynamoDB, SES)

**Use this when**: You want a complete, turnkey solution for Aula automation, session management, and automated newsletters.

---

### How They Work Together

```
┌─────────────────────────────────────────────────────────────┐
│  Browser (www.aula.dk)                                      │
│  ┌────────────────────────────────────┐                     │
│  │  AulaLoginBrowserExtension         │                     │
│  │  • Captures PHPSESSID              │                     │
│  │  • Shows current session           │                     │
│  └────────────────┬───────────────────┘                     │
└───────────────────┼─────────────────────────────────────────┘
                    │
                    │ REST API (POST /session)
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  AWS (AulaNewsletterTS)                                     │
│  ┌────────────────────────────────────┐                     │
│  │  • Stores session ID in DynamoDB   │                     │
│  │  • Keeps session alive (pings)     │                     │
│  │  • Uses AulaApiClient ────────┐    │                     │
│  └────────────────────────────────┼────┘                    │
└───────────────────────────────────┼─────────────────────────┘
                                    │
                                    │ Uses library
                                    ▼
┌─────────────────────────────────────────────────────────────┐
│  AulaApiClient                                              │
│  ┌────────────────────────────────────┐                     │
│  │  • Makes API calls to Aula.dk      │                     │
│  │  • Fetches messages, calendar, etc │                     │
│  │  • Returns structured data         │                     │
│  └────────────────────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

### Usage Scenarios

**Scenario 1: Manual Session Management**
- Use **AulaLoginBrowserExtension** alone to view and manually save your session ID to a simple backend of your choice

**Scenario 2: Custom Integration**
- Use **AulaLoginBrowserExtension** to capture sessions
- Use **AulaApiClient** in your own application to interact with Aula
- Build your own backend for session storage

**Scenario 3: Complete Automation (Recommended)**
- Deploy **AulaNewsletterTS** to AWS
- Install **AulaLoginBrowserExtension** and configure it to use AulaNewsletterTS endpoints
- Extension automatically keeps the backend session updated
- **AulaNewsletterTS** uses **AulaApiClient** to pull data and generate newsletters
- Fully automated Aula monitoring and notifications

### Getting Started with the Full Stack

1. **Deploy AulaNewsletterTS** to AWS (follow its README for deployment instructions)
2. **Install this extension** (AulaLoginBrowserExtension) in Chrome
3. **Configure the extension** to use your AulaNewsletterTS API endpoints
4. **Log into Aula.dk** - the extension will automatically sync your session
5. **AulaNewsletterTS** will handle the rest (keeping session alive, generating newsletters)

Each project has its own detailed documentation in its respective repository.

## Project Structure

```
AulaNewsletterTS/                      # Root-level CDK project
├── bin/
│   └── app.ts                         # CDK app entry point
├── lib/
│   ├── config/
│   │   └── stack-config.ts            # Type-safe configuration management
│   ├── constructs/
│   │   ├── dynamodb-tables.ts         # DynamoDB tables construct
│   │   ├── lambda-functions.ts        # Lambda functions construct
│   │   ├── s3-buckets.ts              # S3 buckets construct
│   │   ├── api-gateway.ts             # API Gateway construct
│   │   └── event-schedules.ts         # EventBridge schedules construct
│   └── stacks/
│       └── aula-newsletter-stack.ts   # Main stack definition
├── src/
│   ├── functions/                     # Lambda handlers
│   │   ├── get-aula-persist/          # Fetch & persist Aula data
│   │   ├── generate-newsletter/       # Generate AI newsletters
│   │   ├── aula-keep-session-alive/   # Keep sessions alive
│   │   └── manage-sessionid/          # API Gateway handler
│   └── common/                        # Shared library code
│       ├── aws/                       # AWS client factories
│       ├── dynamodb/                  # DynamoDB utilities
│       ├── types.ts                   # Common TypeScript interfaces
│       ├── config.ts                  # Configuration utilities
│       └── utils.ts                   # Logging & error handling
├── test/
│   └── aula-newsletter-stack.test.ts  # Stack tests
├── dist/                              # Compiled TypeScript output (gitignored)
├── .env                               # Environment variables (gitignored)
├── .env.default                       # Example environment configuration
├── cdk.json                           # CDK configuration
├── package.json                       # Node.js dependencies
├── tsconfig.json                      # TypeScript configuration
└── CLAUDE.md                          # Detailed project documentation
```



## Setup Instructions

### Prerequisites

- Node.js 18.x or later
- AWS CLI configured with appropriate credentials
- AWS CDK CLI installed: `npm install -g aws-cdk`

### Installation

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Configure environment variables**:
   ```bash
   cp .env.default .env
   # Edit .env with your actual values
   ```

3. **Bootstrap CDK (first time only)**:
   ```bash
   cdk bootstrap
   ```

### Configuration

Edit the `.env` file with your specific values:

#### Required Configuration
- `EMAIL_FROM_ADDRESS`: SES-verified sender email
- `EMAIL_TO_ADDRESSES`: Recipient email addresses (comma-separated)
- `AULASESSION_AUTHENTICATE_TOKEN`: Secret token for API Gateway authentication (generate with `openssl rand -hex 32`)

**Note on Authentication**: This project uses session-based authentication via the `AulaSessionIdTable` DynamoDB table. Session IDs are populated by the AulaLoginBrowserExtension via the ManageSessionId API endpoint. No username/password is required for Lambda execution.

#### User Information
- `PARENT_FIRSTNAME`, `CHILD_FIRSTNAME`: Used in AI prompts
- `CHILD_NAME`, `PARENT_NAMES`: Full names for newsletter context
- `MESSAGE_FAMILY_NAMES_TO_FLAG`: Names to highlight in messages
- `PARENT_MAILBOX_IDS`: Aula mailbox IDs (comma-separated)

#### Optional Configuration - Newsletter Generation
- `THREADMESSAGES_DAYS_IN_PAST`: Days to retrieve messages for newsletter (default: 3)
- `CALENDAR_EVENTS_DAYS_IN_PAST`: Past calendar events for newsletter (default: 3)
- `CALENDAR_EVENTS_DAYS_IN_FUTURE`: Future calendar events for newsletter (default: 7)
- `POSTS_DAYS_IN_PAST`: Days to retrieve posts for newsletter (default: 3)

#### Optional Configuration - GetAulaAndPersist Data Retrieval
- `THREAD_MESSAGES_DAYS`: Days of thread messages to persist (default: 30)
- `POSTS_DAYS`: Days of posts to persist (default: 30)
- `CALENDAR_EVENTS_DAYS_PAST`: Past calendar events to persist (default: 10)
- `CALENDAR_EVENTS_DAYS_FUTURE`: Future calendar events to persist (default: 30)
- `GALLERY_DAYS`: Days of gallery albums to persist (default: 5)

#### Optional Configuration - Lambda Timeouts
- `GET_AULA_TIMEOUT`: GetAulaAndPersist timeout in seconds (default: 900)
- `GENERATE_NEWSLETTER_TIMEOUT`: GenerateNewsletter timeout in seconds (default: 900)
- `KEEP_SESSION_ALIVE_TIMEOUT`: KeepSessionAlive timeout in seconds (default: 60)

#### Optional Configuration - EventBridge Schedules
- `GET_AULA_SCHEDULE`: Cron expression for GetAulaAndPersist (default: `0 9,17 * * ? *`)
- `GENERATE_NEWSLETTER_SCHEDULE`: Cron expression for GenerateNewsletter (default: `0 18 * * ? *`)
- `KEEP_SESSION_ALIVE_SCHEDULE`: Cron expression for KeepSessionAlive (default: `0 0/4 * * ? *`)

#### Optional Configuration - Deployment
- `ENVIRONMENT`: Deployment environment - development, staging, or production (default: development)
- `STACK_OWNER`: Cost allocation tag for owner (default: Team)
- `COST_CENTER`: Cost allocation tag for cost center (default: Engineering)
- `API_URL`: Aula API endpoint (default: https://www.aula.dk/api/)

## CDK Commands

### Development

```bash
# Compile TypeScript to JavaScript
npm run build

# Watch for changes and compile
npm run watch

# Run tests
npm run test
```

### Deployment

```bash
# Synthesize CloudFormation template (check output)
cdk synth

# Show differences between deployed stack and current code
cdk diff

# Deploy stack to AWS
cdk deploy

# Destroy stack (WARNING: deletes all resources)
cdk destroy
```

## DynamoDB Tables

All tables use:
- **Billing Mode**: Pay-per-request (no capacity planning needed)
- **TTL**: Enabled on `ttl` attribute (1-month expiration)
- **Partition Key**: `Id` (Number type, except RAW_threadMessages uses String)
- **Removal Policy**: DESTROY (change to RETAIN for production)

### Table List

#### Session Table
- `AulaSessionIdTable` - Stores Aula authentication session tokens

#### RAW Data Tables
- `RAW_dailyOverview` - Daily school activity summaries
- `RAW_threads` - Message thread metadata
- `RAW_threadMessages` - Individual thread messages (Id is STRING type)
- `RAW_calendarEvents` - Calendar events and appointments
- `RAW_posts` - School posts and announcements
- `RAW_weekOverview` - MeeBook weekly work plans
- `RAW_bookList` - MeeBook reading lists
- `RAW_galleryAlbums` - Photo gallery albums
- `RAW_derivedEvents` - AI-extracted events from posts

#### PARSED Data Tables (Future Use)
- `PARSED_posts` - Processed post data
- `DERIVED_EVENTS_FromPostsTable` - Events extracted from posts

#### Attachments Table
- `AulaAttachmentsTable` - Attachment metadata with S3 locations
  - **Partition Key**: `AttachmentId` (STRING)
  - **GSI**: `PostIdIndex` - Query attachments by PostId (NUMBER)
  - **GSI**: `MessageIdIndex` - Query attachments by MessageId (STRING)
  - **Fields**: PostId, MessageId, AttachmentType (image/file), FileName, S3Key, S3Bucket, OriginalUrl, DownloadedAt, FileSize, ContentType, ttl

## Lambda Functions

### GetAulaAndPersist
- **Runtime**: Node.js 18.x
- **Timeout**: 900 seconds (15 minutes) - configurable via `GET_AULA_TIMEOUT`
- **Schedule**: Twice daily at 9am and 5pm UTC - configurable via `GET_AULA_SCHEDULE`
- **Function**: Uses session ID from DynamoDB to authenticate to Aula, fetches data, persists to DynamoDB, downloads attachments to S3
- **Code**: `src/functions/get-aula-persist/index.ts`
- **IAM Role**: `getAulaRole` - DynamoDB read/write all tables, S3 read/write attachments bucket

### GenerateNewsletter
- **Runtime**: Node.js 18.x
- **Timeout**: 900 seconds (15 minutes) - configurable via `GENERATE_NEWSLETTER_TIMEOUT`
- **Schedule**: Daily at 6pm UTC - configurable via `GENERATE_NEWSLETTER_SCHEDULE`
- **Function**: Retrieves data from DynamoDB, queries S3 attachment metadata, translates/summarizes with AI, generates HTML email with inline images and file links, sends via SES
- **Code**: `src/functions/generate-newsletter/index.ts`
- **IAM Role**: `generateNewsletterRole` - DynamoDB read-only all tables, S3 read attachments bucket, Bedrock InvokeModel (Claude 3 Sonnet only), SES SendEmail

### AulaKeepSessionAlive
- **Runtime**: Node.js 18.x
- **Timeout**: 60 seconds (1 minute) - configurable via `KEEP_SESSION_ALIVE_TIMEOUT`
- **Schedule**: Every 4 hours - configurable via `KEEP_SESSION_ALIVE_SCHEDULE`
- **Function**: Retrieves session ID from DynamoDB, pings Aula API to keep session alive, sends email alert on failure
- **Code**: `src/functions/aula-keep-session-alive/index.ts`
- **IAM Role**: `keepSessionAliveRole` - DynamoDB read/write session table only, SES SendEmail for alerts

### ManageSessionId (API Gateway Handler)
- **Runtime**: Node.js 18.x
- **Timeout**: 60 seconds (default)
- **Trigger**: API Gateway REST API (no schedule)
- **Endpoints**:
  - `GET /api/sessionID` - Retrieve current session record
  - `POST /api/sessionID` - Update session with new sessionId
- **Function**: Manages session IDs via REST API, validates authentication token, provides CORS headers for Chrome extension compatibility
- **Code**: `src/functions/manage-sessionid/index.ts`
- **IAM Role**: `manageSessionIdRole` - DynamoDB read/write session table only
- **Authentication**: Requires `X-aulasession-authenticate` header with token

## EventBridge Schedules

| Lambda Function | Cron Expression | Schedule | Default |
|----------------|-----------------|----------|---------|
| GetAulaAndPersist | `GET_AULA_SCHEDULE` | Configurable | `cron(0 9,17 * * ? *)` (9am & 5pm UTC) |
| GenerateNewsletter | `GENERATE_NEWSLETTER_SCHEDULE` | Configurable | `cron(0 18 * * ? *)` (6pm UTC) |
| AulaKeepSessionAlive | `KEEP_SESSION_ALIVE_SCHEDULE` | Configurable | `cron(0 0/4 * * ? *)` (Every 4 hours) |
| ManageSessionId | N/A - API Gateway triggered | No schedule | N/A |

## IAM Permissions

Each Lambda has its own least-privilege IAM role:

### GetAulaAndPersist Role (`getAulaRole`)
- **CloudWatch Logs**: Write logs
- **DynamoDB**: Read/write all tables
- **S3**: Read/write attachments bucket

### GenerateNewsletter Role (`generateNewsletterRole`)
- **CloudWatch Logs**: Write logs
- **DynamoDB**: Read-only all tables
- **S3**: Read-only attachments bucket
- **Bedrock**: InvokeModel (Claude 3 Sonnet only - `anthropic.claude-3-sonnet-20240229-v1:0`)
- **SES**: SendEmail (restricted to specific sender via condition)

### KeepSessionAlive Role (`keepSessionAliveRole`)
- **CloudWatch Logs**: Write logs
- **DynamoDB**: Read/write session table only
- **SES**: SendEmail (for session expiration alerts)

### ManageSessionId Role (`manageSessionIdRole`)
- **CloudWatch Logs**: Write logs
- **DynamoDB**: Read/write session table only

## S3 Buckets

### AulaAttachmentsBucket
- **Purpose**: Store downloaded Aula attachments (images and files)
- **Encryption**: S3-managed encryption
- **Public Access**: Blocked (all access via Lambda)
- **Lifecycle**: Delete attachments after 1 year
- **Removal Policy**: DESTROY for dev/staging, RETAIN for production
- **Structure**: `attachments/YYYY-MM-DD/{attachmentId}/{filename}`

## API Gateway

### AulaSessionApi
- **Type**: REST API
- **Stage**: `prod`
- **Endpoint**: Regional (publicly accessible)
- **Base URL**: `https://{api-id}.execute-api.{region}.amazonaws.com/prod`
- **CORS**: Enabled for all origins (supports Chrome extensions)
- **Throttling**: 100 requests/second rate limit, 200 burst limit
- **Endpoints**:
  - `GET /api/sessionID` - Retrieve current session
  - `POST /api/sessionID` - Update session ID
- **Authentication**: Custom header `X-aulasession-authenticate`

## Outputs

After deployment, the stack exports:

### Lambda Functions
- `GetAulaAndPersistFunctionArn`: ARN of the data fetching Lambda
- `GetAulaAndPersistFunctionName`: Function name for CLI invocation
- `GenerateNewsletterFunctionArn`: ARN of the newsletter Lambda
- `GenerateNewsletterFunctionName`: Function name for CLI invocation
- `AulaKeepSessionAliveFunctionArn`: ARN of the session keep-alive Lambda
- `AulaKeepSessionAliveFunctionName`: Function name for CLI invocation
- `ManageSessionIdFunctionArn`: ARN of the API Gateway handler Lambda
- `ManageSessionIdFunctionName`: Function name for CLI invocation

### IAM Roles
- `GetAulaRoleArn`: IAM role ARN for GetAulaAndPersist
- `GenerateNewsletterRoleArn`: IAM role ARN for GenerateNewsletter
- `KeepSessionAliveRoleArn`: IAM role ARN for KeepSessionAlive
- `ManageSessionIdRoleArn`: IAM role ARN for ManageSessionId

### API Gateway
- `ApiGatewayUrl`: Full URL to the API Gateway endpoint
- `ApiGatewayRestApiId`: REST API ID
- `ApiGatewayRestApiName`: REST API name
- `ApiGatewayStageName`: Deployment stage name (prod)
- `ApiGatewayDeploymentId`: Current deployment ID
- `SessionEndpointUrl`: Full URL to session management endpoint

### EventBridge Schedules
- `GetAulaSchedule`: Cron expression for GetAulaAndPersist
- `GenerateNewsletterSchedule`: Cron expression for GenerateNewsletter
- `KeepSessionAliveSchedule`: Cron expression for KeepSessionAlive

### Storage
- `AttachmentsBucketName`: S3 bucket name for attachments
- `AttachmentsBucketArn`: S3 bucket ARN
- `AttachmentsTableName`: DynamoDB table name for attachment metadata

## Testing Locally

To test the Lambda functions locally before deployment:

```bash
# Compile CDK infrastructure and validate
npm run build

# Generate CloudFormation template to verify resources
npx cdk synth

# Lambda functions use TypeScript-native bundling via NodejsFunction
# No manual compilation needed - esbuild handles bundling during cdk synth/deploy
```

## Production Considerations

Before deploying to production:

1. **Remove hardcoded credentials**:
   - Use AWS Secrets Manager or Parameter Store
   - Update Lambda code to fetch secrets at runtime

2. **Update Removal Policy**:
   - Change `removalPolicy: cdk.RemovalPolicy.DESTROY` to `RETAIN` in `dynamodb-tables.ts`

3. **Configure SES**:
   - Verify email addresses in Amazon SES
   - Request production access (move out of sandbox)

4. **Add monitoring**:
   - CloudWatch alarms for Lambda errors
   - DynamoDB capacity monitoring
   - Cost monitoring

5. **Enable encryption**:
   - Add KMS encryption to DynamoDB tables
   - Encrypt Lambda environment variables

6. **Tag resources**:
   - Add cost allocation tags
   - Add environment tags (prod/dev/test)

## Troubleshooting

### Deployment Fails
- Ensure AWS credentials are configured: `aws configure`
- Check CDK bootstrap: `cdk bootstrap`
- Verify region configuration in `.env`

### Lambda Timeout
- Default timeout is 900s (15 min)
- Check CloudWatch Logs for errors
- Increase timeout if needed in `lambda-functions.ts`

### Email Not Sending
- Verify SES email addresses are verified
- Check SES sandbox restrictions
- Review CloudWatch Logs for SES errors

### DynamoDB Access Denied
- Verify IAM role has correct permissions
- Check table names match environment variables
- Review CloudWatch Logs for specific errors

## Contributing

When modifying the infrastructure:
1. Make changes in the appropriate construct file
2. Run `npm run build` to compile
3. Run `cdk diff` to preview changes
4. Test in a non-production environment first
5. Update this README if adding new features

## License

See parent project LICENSE file.

## Support

For issues or questions, refer to the main project documentation at `/CLAUDE.md`.
