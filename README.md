# Aula Newsletter CDK Infrastructure

This directory contains the AWS CDK infrastructure for the Aula Newsletter application - an automated newsletter system that fetches data from the Aula school management platform, stores it in DynamoDB, and generates AI-powered newsletter summaries using Amazon Bedrock (Claude AI).

## Purpose

This is a complete setup of a number of functions, but the main functionality is:
- Keep track and persist valid sessionIDs from somewhere external (API Gateway, via ManageSessionID) (see related projects below for why this is)
- Keep sessionIDs alive by periodically pinging to ensure it is alive (lambda: aula-keep-session-alive, via Eventbridge) (see related projects below for why this is)
These are "helper" functions needed due to the way Aula controls access.

But the **main** purpose of this project is the generation of a periodic emailed newsletter for a parent to receive.  This newsletter can be received on whatever schedule is desired, and it includes:
- Any important events or reminders from Aula, from the threads/messages or posts that are created
- Any calendar events
- Any attachments (images/files) that were posted
- And generally, just "what's going on lately".

The intent of this project is because Aula itself can be very noisy, with parents and teachers creating posts and threads about things all the time.  As a busy parent, it can be involved to review Aula constantly to see what the latest is, so this newsletter is a "once daily" (or more if you want) summary of the very latest from Aula.  Naturally, once recieving the email, you can go directly to Aula to read more in detail about a particular message or post.

Aula itself can be configured to send an emailed notification when there is a new message or post, but unfortunately that notification doesn't really contain any information, just a pointer to go find it on Aula.  So, this once daily newsletter is better because it contains all the relevant content in a combined way (rather than message by message as Aula itself does).

In order to do this, this project pulls the latest messages and posts from Aula on a set schedule, and persists them to a secure database (get-aula-persist).  Then, on a separate schedule, a generate newsletter process runs (generate-newsletter), which examines the information in the secure database, summarizes, extracts reminders and implied events, and generally makes sense out of the whole thing.   Behind the scenes, this uses AI in Bedrock with the Claude model to do translation, summary, etc.

By default, if there are no updates since the last time the newsletter process ran (no new messages or posts), then no newsletter is sent at all.  This is configurable, if you want to receive basically an empty or repeated email just for kicks.

**On-Demand Newsletter Generation**: In addition to scheduled newsletters, you can trigger immediate newsletter generation via the REST API endpoint `PUT /api/sendNewsletter`. This allows you to:
- Generate a newsletter outside of the scheduled time
- Create custom newsletters covering specific date ranges (e.g., last 7 days, next 14 days)
- Test newsletter generation during development

Important to know, this process also translates the results into English (from Danish), so if you are looking to have the original Danish, that could be a configurable future feature request, or just change the prompts in this project accordingly.

## Access to Aula

It's important to know that in order to access Aula, you must have a valid sessionID.  This sessionID is stored in the AulaSessionID dynamoDB table, so it can always be used.  Where can you get this in the first place?  See the AulaLoginBrowserExtension mentioned below under related projects.   How can we ensure this session remains valid?  This project contains the AulaKeepSessionAlive lambda, which will ensure the session remains valid.

So, as a first step, it is recommended you use the above browser extension in chrome, log into Aula with your MitID credentials, and then use the extension to persist the session.  This session process is functionally equivalent to keeping your browser open and refreshing it periodically, so there is no circumvention of security happening.  MitID is still **required** as part of this process.

Note that if Aula has planned maintenance or otherwise goes down, the session will no longer be valid. See planned maintenance here: https://aulainfoprod.heyday.dk/driftsstatus , which is typically expected on Saturday nights.

## Architecture Overview

The application uses a **five-Lambda architecture** with scheduled execution and REST API:

1. **GetAulaAndPersist Lambda**: Runs twice daily (9am & 5pm UTC) to fetch and store Aula data
2. **GenerateNewsletter Lambda**: Runs daily (6pm UTC) to generate and email AI-summarized newsletters
3. **AulaKeepSessionAlive Lambda**: Runs every 4 hours to ping Aula and keep sessions alive
4. **ManageSessionId Lambda**: REST API handler for GET/POST session ID management (used by Chrome extension)
5. **UpdateAndGenerateFullProcess Lambda**: REST API handler for on-demand newsletter generation with custom date ranges

### AWS Services Used

- **AWS Lambda**: Five functions for data fetching, newsletter generation, session management, API session management, and on-demand newsletter generation
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
│   │   ├── manage-sessionid/          # API Gateway handler (session management)
│   │   └── update-and-generate-full-process/  # API Gateway handler (on-demand newsletter)
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

### UpdateAndGenerateFullProcess (API Gateway Handler - On-Demand Newsletter)
- **Runtime**: Node.js 18.x
- **Timeout**: 900 seconds (15 minutes)
- **Trigger**: API Gateway REST API (no schedule)
- **Endpoint**:
  - `PUT /api/sendNewsletter` - Trigger on-demand newsletter generation
- **Function**: Orchestrates immediate newsletter generation by invoking GetAulaAndPersist (to fetch latest data) followed by GenerateNewsletter (to create and email the newsletter). Supports custom date range overrides via query parameters.
- **Query Parameters** (optional):
  - `lastNumberOfDays` - Number of days in the past to retrieve data (0-365)
  - `futureDays` - Number of days in the future for calendar events (0-365)
- **Code**: `src/functions/update-and-generate-full-process/index.ts`
- **IAM Role**: `updateAndGenerateFullProcessRole` - Lambda InvokeFunction permissions for GetAulaAndPersist and GenerateNewsletter lambdas only
- **Authentication**: Requires `X-aulasession-authenticate` header with token
- **Response**: Returns 202 Accepted immediately (lambda runs in background)
- **CORS**: Enabled for cross-origin requests

**Example Usage:**
```bash
# Generate newsletter with default date ranges
curl -X PUT \
  -H "X-aulasession-authenticate: your-token-here" \
  https://your-api-id.execute-api.eu-west-1.amazonaws.com/prod/api/sendNewsletter

# Generate newsletter for last 7 days and next 14 days
curl -X PUT \
  -H "X-aulasession-authenticate: your-token-here" \
  "https://your-api-id.execute-api.eu-west-1.amazonaws.com/prod/api/sendNewsletter?lastNumberOfDays=7&futureDays=14"
```

**Use Cases:**
- Generate an immediate newsletter outside of the scheduled time
- Create a custom newsletter covering a specific date range (e.g., weekly recap, monthly summary)
- Trigger newsletter generation after manually updating the session ID
- Test newsletter generation during development

## EventBridge Schedules

| Lambda Function | Cron Expression | Schedule | Default |
|----------------|-----------------|----------|---------|
| GetAulaAndPersist | `GET_AULA_SCHEDULE` | Configurable | `cron(0 9,17 * * ? *)` (9am & 5pm UTC) |
| GenerateNewsletter | `GENERATE_NEWSLETTER_SCHEDULE` | Configurable | `cron(0 18 * * ? *)` (6pm UTC) |
| AulaKeepSessionAlive | `KEEP_SESSION_ALIVE_SCHEDULE` | Configurable | `cron(0 0/4 * * ? *)` (Every 4 hours) |
| ManageSessionId | N/A - API Gateway triggered | No schedule | N/A |
| UpdateAndGenerateFullProcess | N/A - API Gateway triggered | No schedule | N/A |

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

### UpdateAndGenerateFullProcess Role (`updateAndGenerateFullProcessRole`)
- **CloudWatch Logs**: Write logs
- **Lambda**: InvokeFunction for GetAulaAndPersist and GenerateNewsletter lambdas only

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
  - `PUT /api/sendNewsletter` - Trigger on-demand newsletter generation (with optional query parameters)
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
- `UpdateAndGenerateFullProcessFunctionArn`: ARN of the on-demand newsletter Lambda
- `UpdateAndGenerateFullProcessFunctionName`: Function name for CLI invocation

### IAM Roles
- `GetAulaRoleArn`: IAM role ARN for GetAulaAndPersist
- `GenerateNewsletterRoleArn`: IAM role ARN for GenerateNewsletter
- `KeepSessionAliveRoleArn`: IAM role ARN for KeepSessionAlive
- `ManageSessionIdRoleArn`: IAM role ARN for ManageSessionId
- `UpdateAndGenerateFullProcessRoleArn`: IAM role ARN for UpdateAndGenerateFullProcess

### API Gateway
- `ApiGatewayUrl`: Full URL to the API Gateway endpoint
- `ApiGatewayId`: REST API ID
- `SessionIdEndpoint`: Full URL to session management endpoint (`/api/sessionID`)
- `SendNewsletterEndpoint`: Full URL to on-demand newsletter generation endpoint (`/api/sendNewsletter`)

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



## License

See parent project LICENSE file.

## Support

For issues or questions, refer to the main project documentation at `/CLAUDE.md`.
