# Integration Tests

This directory contains integration tests that execute the **local Lambda code** against **live AWS resources**.

## What These Tests Do

Unlike unit tests that mock dependencies, integration tests:
- Run the actual Lambda handler code from your local machine
- Connect to the real Aula API
- Read from and write to actual DynamoDB tables in AWS
- Use your local AWS credentials

## Prerequisites

Before running integration tests, ensure you have:

1. **AWS Credentials Configured**
   ```bash
   aws configure
   # OR set AWS_PROFILE environment variable
   export AWS_PROFILE=your-profile
   ```

2. **DynamoDB Tables Deployed**
   ```bash
   npm run cdk deploy
   ```

3. **Environment Variables Set**
   - Copy `.env.example` to `.env`
   - Fill in your Aula credentials and other required values
   ```bash
   cp .env.example .env
   # Edit .env with your actual credentials
   ```

4. **Amazon Bedrock Access** (for GenerateNewsletter test)
   - Enable Amazon Bedrock in your AWS account
   - Request access to Claude models (if required in your region)
   - Verify IAM permissions include `bedrock:InvokeModel`

5. **Amazon SES Email Verification** (for GenerateNewsletter test)
   - Verify sender email address (`EMAIL_FROM_ADDRESS`) in SES
   - Verify recipient email addresses (`EMAIL_TO_ADDRESSES`) in SES
   - If in SES sandbox mode, both sender and all recipients must be verified

## Running Integration Tests

### Recommended Test Workflow

For a complete end-to-end test, run tests in this order:

1. **First, fetch and persist data from Aula:**
   ```bash
   npm test -- test/integration/get-aula-persist.integration.test.ts
   ```
   This populates your DynamoDB tables with fresh data.

2. **Then, generate newsletter from that data:**
   ```bash
   npm test -- test/integration/generate-newsletter.integration.test.ts
   ```
   This processes the data and sends an email.

### Run All Integration Tests
```bash
npm test -- test/integration
```

### Run Specific Integration Test
```bash
# Test data fetching and persistence
npm test -- test/integration/get-aula-persist.integration.test.ts

# Test newsletter generation and email sending
npm test -- test/integration/generate-newsletter.integration.test.ts
```

### Run with Verbose Output
```bash
npm test -- test/integration --verbose
```

## Test Files

- **`get-aula-persist.integration.test.ts`** - Tests the GetAulaAndPersist Lambda function
  - Verifies connection to Aula API
  - Confirms data is persisted to DynamoDB tables
  - Tests error handling for missing credentials

- **`generate-newsletter.integration.test.ts`** - Tests the GenerateNewsletter Lambda function
  - Reads data from DynamoDB tables
  - Invokes Amazon Bedrock (Claude AI) for translation and summarization
  - Generates HTML newsletter content
  - Sends email via Amazon SES
  - Tests error handling and DynamoDB connectivity

## Important Notes

⚠️ **These tests interact with live systems:**
- They will write real data to your DynamoDB tables
- They will consume Aula API requests
- They will incur AWS costs (minimal for DynamoDB on-demand)
- **GenerateNewsletter test will:**
  - Call Amazon Bedrock multiple times (incurs costs)
  - Send actual emails via Amazon SES
  - Process all data in your DynamoDB tables

✅ **Best Practices:**
- Run integration tests before deploying to production
- Use a separate AWS environment/account for testing if possible
- Check DynamoDB tables after test runs to verify data
- Integration tests have longer timeouts (5-10 minutes) to accommodate API calls
- Ensure SES email addresses are verified before running GenerateNewsletter test
- Review Bedrock pricing before running tests extensively

## Troubleshooting

### "AWS credentials not configured" error
```bash
aws configure
# OR
export AWS_PROFILE=your-profile-name
```

### "Table does not exist" error
```bash
npm run cdk deploy
```

### "AULA_USERNAME not defined" error
- Ensure `.env` file exists with correct credentials
- Check that `dotenv` is loading the file correctly

### Test timeout
- Integration tests have 5-10 minute timeouts
- If tests timeout, check:
  - Network connectivity
  - Aula API availability
  - AWS region configuration
  - Bedrock service availability (for GenerateNewsletter)

### "Access Denied" from Bedrock
- Ensure Amazon Bedrock is enabled in your AWS account
- Check IAM permissions include `bedrock:InvokeModel`
- Verify the Claude model is available in your region
- Some regions may require requesting access to Bedrock

### "Email not verified" from SES
- Both sender and recipient email addresses must be verified in SES
- In sandbox mode, only verified addresses can be used
- Request production access if needed

### "No data found" in DynamoDB
- Run the `get-aula-persist.integration.test.ts` test first to populate data
- Check that DynamoDB tables contain recent data
- Verify date filtering in environment variables
