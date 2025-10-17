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

## Best Practices Implemented

### 1. **Modular Construct Design**
The infrastructure is organized into logical, reusable constructs:
- **DynamoDBTablesConstruct**: Manages all 12 DynamoDB tables
- **LambdaFunctionsConstruct**: Creates Lambda functions with proper IAM roles
- **EventSchedulesConstruct**: Sets up EventBridge scheduling rules

### 2. **Configuration Management**
- Environment variables loaded from `.env` file using `dotenv`
- Type-safe configuration interface (`LambdaFunctionsConfig`)
- Sensible defaults with override capability

### 3. **L2 Constructs**
Uses higher-level CDK constructs (L2) instead of CloudFormation-level (L1):
- `dynamodb.Table` instead of `CfnTable`
- `lambda.Function` instead of `CfnFunction`
- `events.Rule` with `targets.LambdaFunction`

### 4. **Security & Permissions**
- Dedicated IAM role for Lambda functions
- Principle of least privilege (only necessary managed policies)
- Automatic DynamoDB permission grants via `grantReadWriteData()`

### 5. **Maintainability**
- TypeScript for type safety
- Clear naming conventions
- Comprehensive documentation
- Separation of concerns

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
