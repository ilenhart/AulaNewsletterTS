# Aula Newsletter CDK Infrastructure

This directory contains the AWS CDK infrastructure for the Aula Newsletter application - an automated newsletter system that fetches data from the Aula school management platform, stores it in DynamoDB, and generates AI-powered newsletter summaries using Amazon Bedrock (Claude AI).

## Architecture Overview

The application uses a **two-Lambda architecture** with scheduled execution:

1. **GetAulaAndPersist Lambda**: Runs twice daily (9am & 5pm UTC) to fetch and store Aula data
2. **GenerateNewsletter Lambda**: Runs daily (6pm UTC) to generate and email AI-summarized newsletters

### AWS Services Used

- **AWS Lambda**: Two functions for data fetching and newsletter generation
- **Amazon DynamoDB**: 12 tables for storing RAW, PARSED, and session data
- **Amazon EventBridge**: Scheduled rules for automatic Lambda execution
- **Amazon Bedrock**: Claude 3 Sonnet for AI translation and summarization
- **Amazon SES**: Email delivery service
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
cdk/
├── bin/
│   └── cdk.ts                        # CDK app entry point
├── lib/
│   ├── aula-newsletter-stack.ts      # Main stack definition
│   └── constructs/
│       ├── dynamodb-tables.ts        # DynamoDB tables construct
│       ├── lambda-functions.ts       # Lambda functions construct
│       └── event-schedules.ts        # EventBridge schedules construct
├── lambda/
│   ├── get-aula-persist/
│   │   └── index.ts                  # GetAulaAndPersist Lambda code
│   └── generate-newsletter/
│       └── index.ts                  # GenerateNewsletter Lambda code
├── test/
│   └── cdk.test.ts                   # Stack tests
├── .env.example                      # Example environment configuration
├── cdk.json                          # CDK configuration
├── package.json                      # Node.js dependencies
└── tsconfig.json                     # TypeScript configuration
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
   cp .env.example .env
   # Edit .env with your actual values
   ```

3. **Bootstrap CDK (first time only)**:
   ```bash
   cdk bootstrap
   ```

### Configuration

Edit the `.env` file with your specific values:

#### Required Configuration
- `AULA_USERNAME`: Your Aula login username
- `AULA_PASSWORD`: Your Aula login password
- `EMAIL_FROM_ADDRESS`: SES-verified sender email
- `EMAIL_TO_ADDRESSES`: Recipient email addresses (comma-separated)

#### User Information
- `PARENT_FIRSTNAME`, `CHILD_FIRSTNAME`: Used in AI prompts
- `CHILD_NAME`, `PARENT_NAMES`: Full names for newsletter context
- `MESSAGE_FAMILY_NAMES_TO_FLAG`: Names to highlight in messages
- `PARENT_MAILBOX_IDS`: Aula mailbox IDs (comma-separated)

#### Optional Configuration
- `API_URL`: Aula API endpoint (default: https://www.aula.dk/api/)
- `THREADMESSAGES_DAYS_IN_PAST`: Days to retrieve messages (default: 3)
- `CALENDAR_EVENTS_DAYS_IN_PAST`: Past calendar events (default: 3)
- `CALENDAR_EVENTS_DAYS_IN_FUTURE`: Future calendar events (default: 7)
- `POSTS_DAYS_IN_PAST`: Days to retrieve posts (default: 3)

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

## Lambda Functions

### GetAulaAndPersist
- **Runtime**: Node.js 18.x
- **Timeout**: 900 seconds (15 minutes)
- **Schedule**: Twice daily at 9am and 5pm UTC
- **Function**: Authenticates to Aula, fetches data, persists to DynamoDB
- **Code**: `lambda/get-aula-persist/index.ts`

### GenerateNewsletter
- **Runtime**: Node.js 18.x
- **Timeout**: 900 seconds (15 minutes)
- **Schedule**: Daily at 6pm UTC
- **Function**: Retrieves data, translates/summarizes with AI, sends email
- **Code**: `lambda/generate-newsletter/index.ts`

## EventBridge Schedules

| Lambda Function | Cron Expression | Schedule |
|----------------|-----------------|----------|
| GetAulaAndPersist | `cron(0 9,17 * * ? *)` | 9am & 5pm UTC daily |
| GenerateNewsletter | `cron(0 18 * * ? *)` | 6pm UTC daily |

## IAM Permissions

The Lambda execution role includes:
- **AWSLambdaBasicExecutionRole**: CloudWatch Logs access
- **AmazonBedrockFullAccess**: Bedrock AI model access
- **AmazonSESFullAccess**: Email sending capability
- **DynamoDB**: Read/Write access to all application tables (via grant)

## Outputs

After deployment, the stack exports:
- `GetAulaAndPersistFunctionArn`: ARN of the data fetching Lambda
- `GenerateNewsletterFunctionArn`: ARN of the newsletter Lambda
- `GetAulaAndPersistFunctionName`: Function name for CLI invocation
- `GenerateNewsletterFunctionName`: Function name for CLI invocation

## Testing Locally

To test the Lambda functions locally before deployment:

```bash
# Install dependencies in lambda directories
cd lambda/get-aula-persist
npm install
cd ../generate-newsletter
npm install
cd ../..

# Run TypeScript compiler
npm run build
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
