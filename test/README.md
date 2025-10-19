# Integration Tests

This directory contains integration tests for the Lambda functions. These tests run **locally** but interact with **deployed AWS resources** (DynamoDB tables, S3 buckets, etc.).

## Purpose

Integration tests allow you to:
- **Debug locally** by stepping through Lambda code in your IDE
- **Verify behavior** against real AWS resources
- **Test end-to-end** without deploying each time
- **Catch issues early** before deployment

## Prerequisites

### 1. Deploy the CDK Stack

First, deploy your infrastructure to AWS:

```bash
npx cdk deploy
```

This creates:
- DynamoDB tables (AulaSessionIdTable, etc.)
- S3 buckets
- API Gateway endpoint
- IAM roles

### 2. Configure Environment Variables

Ensure your `.env` file has the required variables:

```bash
# Required for all tests
AWS_REGION=eu-west-1  # Or your region
TABLE_NAME=AulaSessionIdTable

# Required for manage-sessionid tests
AULASESSION_AUTHENTICATE_TOKEN=your-secret-token

# Required for get-aula-persist tests (example)
# AULA_SESSION_ID_TABLE=AulaSessionIdTable
# ATTACHMENTS_BUCKET=...
# ATTACHMENTS_TABLE=...
```

### 3. AWS Credentials

Ensure AWS credentials are configured:

```bash
# Check credentials
aws sts get-caller-identity

# Or set environment variables
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
export AWS_REGION=eu-west-1
```

## Running Tests

### Run All Tests

```bash
npm test
```

### Run Specific Test File

```bash
# Run only manage-sessionid tests
npm test -- manage-sessionid.integration.test.ts

# Run with verbose output
npm test -- manage-sessionid.integration.test.ts --verbose
```

### Run Tests in Watch Mode

```bash
npm test -- --watch
```

### Run Tests with Coverage

```bash
npm test -- --coverage
```

## Debugging Tests

### Using VS Code Debugger

1. Set breakpoints in your Lambda code (`src/functions/manage-sessionid/index.ts`)
2. Set breakpoints in your test file (`test/manage-sessionid.integration.test.ts`)
3. Run test in debug mode:
   - Open Command Palette (Ctrl+Shift+P)
   - Select "Debug: JavaScript Debug Terminal"
   - Run: `npm test -- manage-sessionid.integration.test.ts`
4. Step through code and inspect variables

### Using Console Logs

The tests output detailed information:

```typescript
console.log('Response:', JSON.stringify(response, null, 2));
console.log('Response Body:', JSON.stringify(body, null, 2));
```

## Test Structure

Each integration test follows this pattern:

```typescript
describe('LambdaName - Integration Tests', () => {
  beforeAll(() => {
    // Setup: verify environment variables, log configuration
  });

  describe('Feature/Endpoint', () => {
    it('should handle success case', async () => {
      // Arrange: Create mock event
      // Act: Call handler
      // Assert: Verify response
    });

    it('should handle error case', async () => {
      // Test error scenarios
    });
  });
});
```

## Available Integration Tests

| Test File | Lambda Function | What It Tests |
|-----------|----------------|---------------|
| `manage-sessionid.integration.test.ts` | ManageSessionId | GET/POST session management |
| `get-aula-persist.integration.test.ts` | GetAulaAndPersist | Data fetching & persistence *(planned)* |
| `generate-newsletter.integration.test.ts` | GenerateNewsletter | Newsletter generation *(planned)* |
| `aula-keep-session-alive.integration.test.ts` | AulaKeepSessionAlive | Session keep-alive *(planned)* |

## Common Issues

### "Cannot find module" errors

Ensure you've built the TypeScript code:

```bash
npm run build
```

### "Access Denied" errors

Check that:
- Your AWS credentials have the necessary permissions
- The IAM user/role can access DynamoDB, S3, etc.
- The table names in `.env` match your deployed resources

### "Table does not exist" errors

Verify the stack is deployed:

```bash
aws dynamodb describe-table --table-name AulaSessionIdTable
```

### Timeout errors

Integration tests make real AWS calls which can be slow. Default timeout is 30 seconds. Increase if needed:

```typescript
it('should handle slow operation', async () => {
  // Test code
}, 60000); // 60 second timeout
```

## Best Practices

1. **Isolate tests** - Each test should be independent
2. **Clean up** - Delete test data after each test (if needed)
3. **Use descriptive names** - Test names should clearly state what they verify
4. **Test error cases** - Don't just test the happy path
5. **Log output** - Use console.log for debugging, especially in CI/CD
6. **Set timeouts** - AWS calls can be slow, set realistic timeouts

## CI/CD Integration

To run these tests in CI/CD:

1. Set environment variables in your CI/CD system
2. Configure AWS credentials
3. Deploy the stack to a test environment
4. Run tests against the test environment
5. Optionally tear down the test stack after tests pass

Example GitHub Actions workflow:

```yaml
- name: Run Integration Tests
  env:
    AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
    AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
    AWS_REGION: eu-west-1
    TABLE_NAME: AulaSessionIdTable
    AULASESSION_AUTHENTICATE_TOKEN: ${{ secrets.AUTH_TOKEN }}
  run: npm test
```
