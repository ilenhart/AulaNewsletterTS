# Aula Newsletter - AI-Powered School Updates

An AWS serverless application that automatically generates AI-summarized email newsletters from [Aula.dk](https://www.aula.dk), Denmark's school communication platform.

## What This Does

**Aula can be overwhelming.** Teachers and parents constantly post messages, create threads, share photos, and announce events. This project solves that problem by:

- **Fetching** the latest messages, posts, calendar events, and attachments from Aula
- **Translating** content from Danish to English using AI (Claude 3 Sonnet)
- **Summarizing** everything into a clean, actionable email newsletter
- **Delivering** it to your inbox with images, attachments, and important reminders highlighted

**Why this matters:** Aula's built-in email notifications just say "you have a new message" - they don't include the actual content. This newsletter gives you the full story in one consolidated email, so you can stay informed without constantly checking Aula.

---

## On-Demand vs Scheduled Execution

### 🚀 **Recommended: On-Demand Execution**

Due to Aula's unpredictable session timeouts, **on-demand execution is more reliable** than scheduled execution. Simply call the API when you want a newsletter:

```bash
curl -X PUT \
  -H "X-aulasession-authenticate: your-secret-token" \
  https://your-api-id.execute-api.eu-west-1.amazonaws.com/prod/api/sendNewsletter
```

**Why on-demand is better:**
- ✅ **Session control** - Generate newsletters only when you know the session is valid
- ✅ **No wasted runs** - Avoid failures during Aula maintenance windows or session expirations
- ✅ **Custom timing** - Get newsletters when YOU want them, not on a fixed schedule
- ✅ **Lower costs** - No EventBridge charges, fewer failed Lambda executions

**Typical workflow:**
1. Log into Aula using the [AulaLoginBrowserExtension](#related-projects) (updates session automatically)
2. Trigger newsletter generation via API call
3. Receive email within 1-2 minutes

**Custom date ranges:**
```bash
# Get a weekly recap (last 7 days)
curl -X PUT \
  -H "X-aulasession-authenticate: your-token" \
  "https://your-api-id.execute-api.eu-west-1.amazonaws.com/prod/api/sendNewsletter?lastNumberOfDays=7&futureDays=14"
```

### ⏰ **Optional: Scheduled Execution**

You can also enable automatic newsletter generation on a schedule (e.g., daily at 6pm). However, **be aware**:

⚠️ **Aula sessions have absolute timeouts** that occur even with the keep-alive lambda running. This means:
- Scheduled runs may fail if the session expires between browser logins
- Failed runs waste AWS resources and don't send emails
- You'll need to manually update the session to resume automatic newsletters

**To enable schedules:**
```bash
# In .env file
ENABLE_EVENTBRIDGE_SCHEDULES=true

# Deploy
npx cdk deploy
```

**Default schedule:**
- **GetAulaAndPersist**: 9am & 5pm UTC (fetch data twice daily)
- **GenerateNewsletter**: 6pm UTC (send newsletter once daily)
- **KeepSessionAlive**: Every 3 hours (attempt to maintain session)

**When scheduled execution makes sense:**
- You have stable session reliability (rare)
- You log into Aula via browser frequently (session stays fresh)
- You don't mind occasional failures during maintenance windows

---

## Architecture

### Five Lambda Functions

1. **GetAulaAndPersist** - Fetches data from Aula and stores in DynamoDB
   - Retrieves messages, posts, calendar events, gallery albums, MeeBook data
   - Downloads attachments to S3
   - Smart date range calculation (fetches only what's needed)

2. **GenerateNewsletter** - Creates and emails AI-powered newsletters
   - Queries DynamoDB for recent data (incremental mode)
   - Translates Danish → English using Bedrock (Claude 3 Sonnet)
   - Summarizes messages, extracts action items, highlights family names
   - Generates HTML email with inline images and file links
   - Sends via Amazon SES

3. **AulaKeepSessionAlive** - Maintains session validity
   - Pings Aula API every 3 hours to keep session alive
   - Sends email alerts if session expires
   - **Note**: Cannot prevent absolute session timeouts

4. **ManageSessionId** (API) - Session management REST endpoint
   - `GET /api/sessionID` - Retrieve current session
   - `POST /api/sessionID` - Update session (called by browser extension)
   - Used by [AulaLoginBrowserExtension](#related-projects)

5. **UpdateAndGenerateFullProcess** (API) - On-demand newsletter generation
   - `PUT /api/sendNewsletter` - Trigger immediate newsletter
   - Orchestrates GetAulaAndPersist → GenerateNewsletter
   - Supports custom date range overrides
   - Returns 202 Accepted (runs asynchronously)

### AWS Services

- **Lambda**: Serverless compute for all five functions
- **DynamoDB**: 13 tables for raw data, parsed data, sessions, attachments
- **S3**: Storage for downloaded Aula attachments (images and files)
- **Bedrock**: Claude 3 Sonnet for AI translation and summarization
- **SES**: Email delivery service
- **API Gateway**: REST API for session management and on-demand newsletters
- **EventBridge**: (Optional) Scheduled Lambda execution
- **IAM**: Least-privilege roles for each Lambda function

---

## Getting Started

### Prerequisites

- **Node.js** 18.x or later
- **AWS CLI** configured with credentials
- **AWS CDK** installed globally: `npm install -g aws-cdk`
- **Amazon SES** verified sender email address
- **Amazon Bedrock** access to Claude 3 Sonnet model

### Installation

1. **Clone and install dependencies:**
   ```bash
   git clone https://github.com/ilenhart/AulaNewsletterTS.git
   cd AulaNewsletterTS
   npm install
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.default .env
   # Edit .env with your actual values
   ```

3. **Bootstrap CDK (first time only):**
   ```bash
   cdk bootstrap
   ```

### Required Configuration

Edit [.env](.env) and set these required values:

```bash
# Email Configuration (REQUIRED)
EMAIL_FROM_ADDRESS=your-verified-email@example.com
EMAIL_TO_ADDRESSES=recipient1@example.com,recipient2@example.com

# API Authentication Token (REQUIRED)
# Generate with: openssl rand -hex 32
AULASESSION_AUTHENTICATE_TOKEN=your-secret-token-here

# User Information (REQUIRED for AI prompts)
PARENT_FIRSTNAME=YourFirstName
CHILD_FIRSTNAME=ChildFirstName
CHILD_NAME=Child FullName
PARENT_NAMES=Parent1 FullName, Parent2 FullName
PARENT_MAILBOX_IDS=1234567,1234568
```

### Optional Configuration

```bash
# Execution Mode (default: false - on-demand only)
ENABLE_EVENTBRIDGE_SCHEDULES=false

# Newsletter Data Retrieval (defaults shown)
THREADMESSAGES_DAYS_IN_PAST=3
CALENDAR_EVENTS_DAYS_IN_PAST=3
CALENDAR_EVENTS_DAYS_IN_FUTURE=7
POSTS_DAYS_IN_PAST=3

# Lambda Timeouts (seconds)
GET_AULA_TIMEOUT=900                    # 15 minutes
GENERATE_NEWSLETTER_TIMEOUT=900         # 15 minutes
KEEP_SESSION_ALIVE_TIMEOUT=60           # 1 minute

# EventBridge Schedules (only used if ENABLE_EVENTBRIDGE_SCHEDULES=true)
GET_AULA_SCHEDULE=0 9,17 * * ? *               # 9am & 5pm UTC
GENERATE_NEWSLETTER_SCHEDULE=0 18 * * ? *      # 6pm UTC
KEEP_SESSION_ALIVE_SCHEDULE=0 0/3 * * ? *      # Every 3 hours
```

See [.env.default](.env.default) for all available options.

### Deploy to AWS

```bash
# Compile TypeScript
npm run build

# Preview CloudFormation changes
npx cdk diff

# Deploy to AWS
npx cdk deploy
```

After deployment, note the outputs:
- `SessionIdEndpoint` - URL for session management (used by browser extension)
- `SendNewsletterEndpoint` - URL for on-demand newsletter generation
- `ApiGatewayUrl` - Base URL for API Gateway

---

## Session Management

### How Sessions Work

Aula uses PHP session IDs (`PHPSESSID`) for authentication. This project:
1. Stores the session ID in DynamoDB (`AulaSessionIdTable`)
2. Uses it to authenticate all Aula API calls
3. Pings Aula periodically to keep the session alive (best effort)

**Important:** Sessions have absolute timeouts (typically 24-48 hours) that cannot be prevented. When this happens, you must log into Aula again via browser and update the session.

### Getting a Session ID

Use the **[AulaLoginBrowserExtension](#related-projects)** Chrome extension:
1. Install the extension
2. Configure it to use your `SessionIdEndpoint` URL
3. Log into Aula.dk with MitID
4. Extension automatically captures and syncs session ID

**No MitID credentials are stored** - the extension only captures the session cookie after you've logged in.

### Session State Tracking

The system tracks session health:
- `created` - When this session was first added
- `lastUsedSuccessfully` - Last successful Aula API call
- `lastUsedFailure` - First failure timestamp (if session expired)

If `lastUsedFailure` is set, lambdas will exit early to avoid wasted processing.

### Session Expiration Alerts

When the session expires, you'll receive an email alert with:
- Session age and last successful ping time
- TTL expiration status
- Steps to resolve (login via browser, update session)

---

## Related Projects

This project is part of a three-project ecosystem:

### 🔐 [AulaLoginBrowserExtension](https://github.com/ilenhart/AulaLoginBrowserExtension)

Chrome extension that captures your Aula session ID and syncs it with this backend.

**What it does:**
- Detects PHPSESSID from www.aula.dk
- Real-time session display
- Syncs with AulaNewsletterTS via REST API
- Automatic session updates after login

**Use this when:** You need to capture and persist your Aula session ID.

---

### 📡 [AulaApiClient](https://github.com/ilenhart/AulaApiClient)

TypeScript library for interacting with Aula's API endpoints.

**What it does:**
- Clean, typed interface for Aula.dk `/api` endpoints
- Handles authentication via PHPSESSID
- Wraps messages, calendars, profiles, galleries, MeeBook, etc.
- Can be integrated into any Node.js/TypeScript project

**Use this when:** You want to build your own Aula integration.

---

### 📰 AulaNewsletterTS (This Project)

AWS serverless backend for session management and AI-powered newsletters.

**What it does:**
- REST API for session storage (compatible with browser extension)
- Periodic session keep-alive pings
- Automated newsletter generation with AI summarization
- Complete AWS infrastructure (Lambda, DynamoDB, S3, Bedrock, SES)

**Use this when:** You want a turnkey solution for Aula automation.

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
                    │ POST /api/sessionID
                    ▼
┌─────────────────────────────────────────────────────────────┐
│  AWS (AulaNewsletterTS)                                     │
│  ┌────────────────────────────────────┐                     │
│  │  • Stores session in DynamoDB      │                     │
│  │  • Keeps session alive (ping)      │                     │
│  │  • Generates newsletters (on-demand)│                    │
│  │  • Uses AulaApiClient ────────┐    │                     │
│  └────────────────────────────────┼────┘                    │
└───────────────────────────────────┼─────────────────────────┘
                                    │
                                    │ Uses library
                                    ▼
┌─────────────────────────────────────────────────────────────┐
│  AulaApiClient (npm package)                                │
│  ┌────────────────────────────────────┐                     │
│  │  • Makes API calls to Aula.dk      │                     │
│  │  • Fetches messages, calendar, etc │                     │
│  │  • Returns structured data         │                     │
│  └────────────────────────────────────┘                     │
└─────────────────────────────────────────────────────────────┘
```

**Recommended Setup:**
1. Deploy **AulaNewsletterTS** to AWS
2. Install **AulaLoginBrowserExtension** in Chrome
3. Configure extension to use your `SessionIdEndpoint`
4. Log into Aula - extension auto-syncs session
5. Call `/api/sendNewsletter` whenever you want a newsletter

---

## API Endpoints

### Session Management

**GET /api/sessionID**
- Retrieves current session record
- Returns: `{ Id, sessionId, lastUpdated, ttl, created, lastUsedSuccessfully, lastUsedFailure }`
- Auth: `X-aulasession-authenticate` header

**POST /api/sessionID**
- Updates session with new sessionId
- Body: `{ "sessionId": "session-token-string" }`
- Auth: `X-aulasession-authenticate` header
- Clears failure state when posting new session

### On-Demand Newsletter

**PUT /api/sendNewsletter**
- Triggers immediate newsletter generation
- Query params (optional):
  - `lastNumberOfDays` (0-365) - Days in past to retrieve
  - `futureDays` (0-365) - Days in future for calendar events
- Auth: `X-aulasession-authenticate` header
- Returns: 202 Accepted (runs asynchronously)

**Examples:**
```bash
# Default date ranges
curl -X PUT \
  -H "X-aulasession-authenticate: your-token" \
  https://abc123.execute-api.eu-west-1.amazonaws.com/prod/api/sendNewsletter

# Custom date ranges (last 7 days, next 14 days)
curl -X PUT \
  -H "X-aulasession-authenticate: your-token" \
  "https://abc123.execute-api.eu-west-1.amazonaws.com/prod/api/sendNewsletter?lastNumberOfDays=7&futureDays=14"
```

---

## Data Storage

### DynamoDB Tables (13 total)

**Session Table:**
- `AulaSessionIdTable` - Stores authentication session tokens

**RAW Data Tables:** (TTL: 1 month)
- `RAW_dailyOverview` - Daily school activity summaries
- `RAW_threads` - Message thread metadata
- `RAW_threadMessages` - Individual messages (⚠️ Id is STRING type)
- `RAW_calendarEvents` - Calendar events
- `RAW_posts` - School posts and announcements
- `RAW_weekOverview` - MeeBook weekly work plans
- `RAW_bookList` - MeeBook reading lists
- `RAW_galleryAlbums` - Photo gallery albums
- `RAW_derivedEvents` - AI-extracted events from posts

**Metadata Table:**
- `AulaAttachmentsTable` - S3 attachment locations with metadata

**PARSED Tables:** (Future use)
- `PARSED_posts`
- `DERIVED_EVENTS_FromPostsTable`

### S3 Bucket

**AulaAttachmentsBucket:**
- Stores downloaded Aula images and files
- Encryption: S3-managed
- Lifecycle: Delete after 1 year
- Structure: `attachments/YYYY-MM-DD/{attachmentId}/{filename}`

---

## IAM Permissions (Least Privilege)

Each Lambda has its own restricted IAM role:

| Lambda | Permissions |
|--------|-------------|
| **GetAulaAndPersist** | DynamoDB read/write (all tables), S3 read/write (attachments) |
| **GenerateNewsletter** | DynamoDB read-only, S3 read-only, Bedrock InvokeModel (Claude 3 Sonnet only), SES SendEmail |
| **KeepSessionAlive** | DynamoDB read/write (session table only), SES SendEmail |
| **ManageSessionId** | DynamoDB read/write (session table only) |
| **UpdateAndGenerateFullProcess** | Lambda InvokeFunction (GetAulaAndPersist, GenerateNewsletter only) |

No functions have `*FullAccess` policies. All permissions are scoped to specific resources.

---

## Newsletter Features

### Intelligent Data Fetching

**Incremental Mode** (default):
- Searches for most recent newsletter snapshot (up to 7 days back)
- Fetches only NEW data since last `GeneratedAt` timestamp
- Reduces costs and processing time

**Full Mode** (fallback):
- Used on first run or if no recent snapshot found
- Fetches configured days in past (default: 3 days)

**Smart Date Ranges:**
- GetAulaAndPersist uses session history to determine optimal start date
- Priority: `lastUsedSuccessfully` → `created` → config defaults
- Minimizes redundant data fetching

### AI-Powered Summarization

Uses **Claude 3 Sonnet** via Amazon Bedrock:
- **Translation**: Danish → English (configurable)
- **Summarization**: Concise bullet points for each data type
- **Action Item Extraction**: Highlights tasks, reminders, deadlines
- **Family Name Highlighting**: Flags messages mentioning your family
- **Event Extraction**: Identifies implied events in posts (e.g., "bring raincoat Friday")

### Email Formatting

**HTML email includes:**
- Executive summary (AI-generated overview)
- Grouped message threads with attachments
- Calendar events (past and future)
- School posts with attachments
- Inline image thumbnails
- File download links (S3 pre-signed URLs)
- Action items and reminders highlighted

**Smart sending:**
- Default: Skip email if no new content since last run
- Configurable: `GENERATE_NEWSLETTER_IF_NOTHING_NEW=true` to always send

---

## Monitoring & Troubleshooting

### CloudWatch Logs

All lambdas use structured JSON logging:
```json
{
  "level": "info",
  "message": "Processing complete",
  "itemsProcessed": 42,
  "executionTime": 1234,
  "successful": 40,
  "failed": 2
}
```

Use CloudWatch Logs Insights to query:
```sql
fields @timestamp, message, itemsProcessed, executionTime
| filter level = "error"
| sort @timestamp desc
```

### Common Issues

**Session expired:**
- Symptom: Lambdas exit early with "Session is in failed state"
- Solution: Log into Aula via browser, extension will auto-update session

**Newsletter not sent:**
- Check CloudWatch logs for GenerateNewsletter lambda
- Verify SES sender email is verified
- Check if incremental mode found no new data

**Attachments not downloading:**
- Verify S3 bucket exists and is accessible
- Check GetAulaAndPersist CloudWatch logs for download errors
- Ensure sufficient Lambda timeout (default: 15 minutes)

**API Gateway errors:**
- 401 Unauthorized: Check `X-aulasession-authenticate` header
- 500 Internal Server Error: Check Lambda CloudWatch logs
- 502 Bad Gateway: Lambda timeout (increase timeout setting)

---

## Costs

Typical monthly costs (assumes on-demand execution, 1 newsletter per day):

- **Lambda**: $1-2 (30 executions/month, 15 min avg runtime)
- **DynamoDB**: $1-2 (pay-per-request, ~100 items read/write per run)
- **S3**: $0.10 (storage + requests for ~50 attachments/month)
- **Bedrock**: $10-15 (Claude 3 Sonnet, ~4 API calls per newsletter)
- **SES**: $0.10 (1 email/day)
- **API Gateway**: $0.10 (30 requests/month)
- **EventBridge**: $0 (if schedules disabled)

**Total: ~$13-20/month** for daily newsletters with AI summarization.

**Cost savings with on-demand execution:**
- No wasted Lambda runs during session failures
- No EventBridge schedule charges
- Lower DynamoDB costs (no keep-alive polling)

---

## Development

### Project Structure

```
AulaNewsletterTS/
├── bin/app.ts                                    # CDK app entry point
├── lib/
│   ├── config/stack-config.ts                    # Configuration loader
│   ├── constructs/                               # CDK constructs
│   │   ├── dynamodb-tables.ts
│   │   ├── lambda-functions.ts
│   │   ├── s3-buckets.ts
│   │   ├── api-gateway.ts
│   │   └── event-schedules.ts
│   └── stacks/aula-newsletter-stack.ts           # Main stack
├── src/
│   ├── functions/                                # Lambda handlers
│   │   ├── get-aula-persist/
│   │   ├── generate-newsletter/
│   │   ├── aula-keep-session-alive/
│   │   ├── manage-sessionid/
│   │   └── update-and-generate-full-process/
│   └── common/                                   # Shared library
│       ├── aws/                                  # AWS clients
│       ├── dynamodb/                             # DynamoDB utilities
│       ├── types.ts
│       ├── config.ts
│       └── utils.ts
├── test/
└── CLAUDE.md                                     # Detailed technical docs
```

### Commands

```bash
# Development
npm run build                # Compile TypeScript
npm run watch                # Watch mode for development
npm test                     # Run tests

# CDK
npx cdk synth                # Generate CloudFormation template
npx cdk diff                 # Show changes since last deployment
npx cdk deploy               # Deploy to AWS
npx cdk destroy              # Destroy stack (WARNING: deletes resources)

# Testing lambdas locally
npm test                     # Runs test/default.test.ts
```

### CDK Features

- **TypeScript-native bundling**: Uses `NodejsFunction` with esbuild (no manual compilation)
- **Type-safe configuration**: Validates environment variables at synth time
- **Modular constructs**: Clean separation of concerns
- **Cost tags**: Automatic tagging for cost allocation

---

## Aula Maintenance

Aula has scheduled maintenance windows (typically Saturday nights). Check status:
- **Driftsstatus**: https://aulainfoprod.heyday.dk/driftsstatus

During maintenance:
- Sessions may be invalidated
- API calls will fail
- Newsletter generation will fail

**Recommendation:** Use on-demand execution to avoid wasted runs during maintenance.

---

## Security Considerations

### Authentication Flow
1. User logs into Aula with **MitID** (government-issued digital identity)
2. Browser extension captures PHPSESSID cookie
3. Extension posts session ID to AWS API Gateway
4. API Gateway validates `X-aulasession-authenticate` header
5. ManageSessionId lambda stores session in DynamoDB (encrypted at rest)
6. Other lambdas retrieve session from DynamoDB for API calls

**No MitID credentials are ever stored or transmitted** - only the session cookie.

### Session Security
- Sessions stored in DynamoDB with encryption at rest
- API Gateway requires custom auth header
- All Lambda functions use IAM roles (no hardcoded credentials)
- S3 attachments are private (no public access)

### Email Security
- SES sender restricted to verified email addresses
- IAM conditions prevent unauthorized email sending
- Newsletter emails sent via TLS

---

## License

See [LICENSE](LICENSE) file.

## Support

For detailed technical documentation, see [CLAUDE.md](CLAUDE.md).

For issues or questions, open a GitHub issue.
