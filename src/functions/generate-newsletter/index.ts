/**
 * GenerateNewsletter Lambda Handler
 * Generates AI-powered newsletter from DynamoDB data and emails it
 * Runs on EventBridge schedule (daily at 6pm UTC)
 */

import { createDynamoDBDocClient } from '../../common/aws/dynamodb-client';
import { createBedrockClient } from '../../common/aws/bedrock-client';
import { createSESClient } from '../../common/aws/ses-client';
import { DynamoDBDataReader } from '../../common/dynamodb/data-access';
import { ParsedDataAccess } from '../../common/dynamodb/parsed-data-access';
import { DerivedEventsAccess } from '../../common/dynamodb/derived-events-access';
import { NewsletterSnapshotAccess } from '../../common/dynamodb/snapshot-access';
import { BedrockService } from './services/bedrock-service';
import { EmailService } from './services/email-service';
import { NewsletterDataService } from './services/newsletter-data-service';
import { AttachmentRetrievalService } from './services/attachment-retrieval-service';
import { TranslationCacheService } from './services/translation-cache-service';
import { EventExtractionService } from './services/event-extraction-service';
import { BulkTranslationService } from './services/bulk-translation-service';
import { BulkEventExtractionService } from './services/bulk-event-extraction-service';
import { SnapshotMergeService } from './services/snapshot-merge-service';
import { ContentChangeDetector } from './services/content-change-detector';
import { OverviewProcessor } from './processors/overview-processor';
import { ThreadProcessor } from './processors/thread-processor';
import { CalendarProcessor } from './processors/calendar-processor';
import { PostProcessor } from './processors/post-processor';
import { DerivedEventsProcessor } from './processors/derived-events-processor';
import { UnifiedEventsProcessor } from './processors/unified-events-processor';
import { ImportantInfoProcessor } from './processors/important-info-processor';
import { WeeklyHighlightsProcessor } from './processors/weekly-highlights-processor';
import { getConfig } from './config';
import { logInfo, logError, getErrorMessage, LambdaError } from '../../common/utils';
import { LambdaEvent, LambdaContext, LambdaResponse } from '../../common/types';

/**
 * Lambda handler function
 * Orchestrates the newsletter generation workflow
 */
export const handler = async (event: LambdaEvent, context: LambdaContext): Promise<LambdaResponse> => {
  const startTime = new Date();

  logInfo('GenerateNewsletter Lambda started', {
    functionName: context.functionName,
    requestId: context.awsRequestId,
  });

  try {
    // Load configuration
    logInfo('Loading configuration from environment variables');
    const config = getConfig();

    // Initialize AWS clients
    logInfo('Initializing AWS clients');
    const docClient = createDynamoDBDocClient();
    const bedrockClient = createBedrockClient();
    const sesClient = createSESClient();

    // Initialize data access layers
    logInfo('Initializing data access layers');
    const dataReader = new DynamoDBDataReader(docClient, config.dynamodb);

    const parsedDataAccess = new ParsedDataAccess(
      docClient,
      config.dynamodb.parsedPostsTable!,
      config.dynamodb.parsedThreadMessagesTable!,
      config.dynamodb.parsedThreadsTable
    );

    const newsletterDataService = new NewsletterDataService(dataReader, parsedDataAccess);

    const derivedEventsAccess = new DerivedEventsAccess(
      docClient,
      config.dynamodb.derivedEventsFromPostsTable!,
      config.dynamodb.derivedEventsFromMessagesTable!
    );

    const snapshotAccess = new NewsletterSnapshotAccess(
      docClient,
      config.dynamodb.newsletterSnapshotsTable!
    );

    // Initialize Bedrock service
    const bedrockService = new BedrockService(bedrockClient, config.bedrock.modelId, {
      childName: config.personalization.childName,
      parentNames: config.personalization.parentNames,
      messageFamilyNames: config.personalization.messageFamilyNames,
    });

    // Initialize caching services
    logInfo('Initializing translation and event extraction services');
    const translationService = new TranslationCacheService(
      parsedDataAccess,
      bedrockService,
      config.bedrock.modelId
    );

    const eventExtractionService = new EventExtractionService(
      derivedEventsAccess,
      bedrockService,
      config.bedrock.modelId,
      {
        parentNames: config.personalization.parentNames,
        childName: config.personalization.childName,
        messageFamilyNames: config.personalization.messageFamilyNames,
      }
    );

    const emailService = new EmailService(
      sesClient,
      config.email.fromAddress,
      config.email.toAddresses
    );

    // Initialize processors
    const overviewProcessor = new OverviewProcessor(bedrockService);
    const threadProcessor = new ThreadProcessor(bedrockService);
    const calendarProcessor = new CalendarProcessor(bedrockService);
    const postProcessor = new PostProcessor(bedrockService);
    const derivedEventsProcessor = new DerivedEventsProcessor(bedrockService);
    const unifiedEventsProcessor = new UnifiedEventsProcessor(bedrockService, {
      parentNames: config.personalization.parentNames,
      childName: config.personalization.childName,
      messageFamilyNames: config.personalization.messageFamilyNames,
    });
    const importantInfoProcessor = new ImportantInfoProcessor(bedrockService);
    const weeklyHighlightsProcessor = new WeeklyHighlightsProcessor(bedrockService);

    // Initialize bulk translation service for 1:1 RAW to PARSED mapping
    const bulkTranslationService = new BulkTranslationService(
      docClient,
      config.dynamodb.postsTable!,
      config.dynamodb.threadMessagesTable!,
      parsedDataAccess,
      bedrockService,
      config.bedrock.modelId,
      config.dynamodb.threadsTable
    );

    const today = new Date();
    const todayDateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD

    // NEW: Load yesterday's snapshot for incremental generation
    logInfo('Loading previous newsletter snapshot');
    const previousSnapshot = await snapshotAccess.getYesterdaySnapshot();
    if (previousSnapshot) {
      logInfo('Previous snapshot loaded successfully', {
        snapshotDate: previousSnapshot.SnapshotDate,
        eventsCount: previousSnapshot.NewsletterJson.upcomingEvents.length,
      });
    } else {
      logInfo('No previous snapshot found - this will be a full generation');
    }

    // EARLY CIRCUIT BREAKER: Check if there's new content (incremental mode only)
    if (previousSnapshot && !config.behavior.generateIfNothingNew) {
      logInfo('Checking for new content before processing (circuit breaker enabled)');

      const contentChangeDetector = new ContentChangeDetector(docClient, config.dynamodb);
      const contentCheck = await contentChangeDetector.hasNewContentSince(
        previousSnapshot.GeneratedAt
      );

      if (!contentCheck.hasNewContent) {
        const endTime = new Date();
        const duration = endTime.getTime() - startTime.getTime();

        logInfo('No new content found - skipping newsletter generation', {
          lastNewsletterDate: previousSnapshot.SnapshotDate,
          lastGeneratedAt: previousSnapshot.GeneratedAt,
          newMessages: contentCheck.details.newMessages,
          newPosts: contentCheck.details.newPosts,
          duration: `${duration}ms`,
        });

        return {
          statusCode: 200,
          body: JSON.stringify({
            message: 'No new content since last newsletter - processing skipped',
            lastNewsletterDate: previousSnapshot.SnapshotDate,
            lastGeneratedAt: previousSnapshot.GeneratedAt,
            contentCheck: contentCheck.details,
            processingSkipped: true,
            emailSent: false,
            duration: `${duration}ms`,
          }),
        };
      }

      logInfo('New content found - proceeding with newsletter generation', {
        newMessages: contentCheck.details.newMessages,
        newPosts: contentCheck.details.newPosts,
        totalNewItems: contentCheck.details.totalNewItems,
      });
    }

    const snapshotMergeService = new SnapshotMergeService();

    // STEP 1: Ensure ALL RAW data is translated to PARSED tables (1:1 mapping)
    // This runs before fetching data for the newsletter to ensure complete translation coverage
    logInfo('Ensuring 1:1 mapping: translating ALL RAW data to PARSED tables');
    const [postTranslationStats, messageTranslationStats, threadTranslationStats] = await Promise.all([
      bulkTranslationService.translateAllPosts(),
      bulkTranslationService.translateAllMessages(),
      bulkTranslationService.translateAllThreadSubjects(),
    ]);

    logInfo('Bulk translation complete', {
      posts: postTranslationStats,
      messages: messageTranslationStats,
      threads: threadTranslationStats,
    });

    // STEP 1.5: Extract and deduplicate events from ALL PARSED items (last 14 days)
    // This ensures semantic deduplication across multiple posts/messages
    logInfo('Initializing bulk event extraction service');
    const bulkEventExtractionService = new BulkEventExtractionService(
      docClient,
      config.dynamodb.parsedPostsTable!,
      config.dynamodb.parsedThreadMessagesTable!,
      derivedEventsAccess,
      bedrockService,
      config.bedrock.modelId,
      {
        parentNames: config.personalization.parentNames,
        childName: config.personalization.childName,
        messageFamilyNames: config.personalization.messageFamilyNames,
      }
    );

    logInfo('Extracting and deduplicating events from last 14 days of PARSED data');
    const eventExtractionStats = await bulkEventExtractionService.extractAndDeduplicateAllEvents(14);

    logInfo('Bulk event extraction complete', {
      postsScanned: eventExtractionStats.postsScanned,
      messagesScanned: eventExtractionStats.messagesScanned,
      eventsExtracted: eventExtractionStats.eventsExtracted,
      eventsCreated: eventExtractionStats.eventsCreated,
      eventsUpdated: eventExtractionStats.eventsUpdated,
      eventsMerged: eventExtractionStats.eventsMerged,
      errors: eventExtractionStats.errors,
    });

    // STEP 2: Fetch data (incremental if previous snapshot exists, full otherwise)
    const incrementalMode = previousSnapshot !== null;
    let overviews, threadsData, calendarEvents, postsData;

    if (incrementalMode) {
      logInfo('INCREMENTAL MODE: Fetching only NEW data since last snapshot', {
        sinceTimestamp: previousSnapshot!.GeneratedAt,
      });

      [overviews, threadsData, calendarEvents, postsData] = await Promise.all([
        newsletterDataService.getDailyOverviews(today), // Always get today's overview
        newsletterDataService.getThreadsWithMessagesSince(previousSnapshot!.GeneratedAt),
        newsletterDataService.getCalendarEvents(
          config.dataRetrieval.calendarEventsDaysInPast,
          config.dataRetrieval.calendarEventsDaysInFuture
        ), // Calendar events always fetched in full
        newsletterDataService.getPostsWithAttachmentsSince(previousSnapshot!.GeneratedAt),
      ]);
    } else {
      logInfo('FULL MODE: Fetching all data (no previous snapshot)');

      [overviews, threadsData, calendarEvents, postsData] = await Promise.all([
        newsletterDataService.getDailyOverviews(today),
        newsletterDataService.getThreadsWithMessages(config.dataRetrieval.threadMessagesDaysInPast),
        newsletterDataService.getCalendarEvents(
          config.dataRetrieval.calendarEventsDaysInPast,
          config.dataRetrieval.calendarEventsDaysInFuture
        ),
        newsletterDataService.getPostsWithAttachments(config.dataRetrieval.postsDaysInPast),
      ]);
    }

    logInfo('Data fetched successfully', {
      overviews: overviews.length,
      threads: threadsData.threads.length,
      calendarEvents: calendarEvents.length,
      posts: postsData.posts.length,
    });

    // NEW: Flatten all messages from threads for translation
    const allMessages = threadsData.threads.flatMap((thread) => thread.Messages);

    // NEW: Translate posts and messages with caching
    logInfo('Translating posts and messages with caching');
    const [translatedPosts, translatedMessages] = await Promise.all([
      translationService.translatePosts(postsData.posts),
      translationService.translateMessages(
        allMessages,
        (message) =>
          `Today's date is ${today.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })} and the message was sent on ${message.SentDate}. ` +
          `The sender is ${message.Sender?.FullName || 'Unknown'} (${message.Sender?.Role || 'Unknown'}).`
      ),
    ]);

    logInfo('Translation complete', {
      translatedPosts: translatedPosts.length,
      translatedMessages: translatedMessages.length,
    });

    // NEW: Extract events from posts and messages with caching
    logInfo('Extracting events from posts and messages');
    const [derivedEventsFromPosts, derivedEventsFromMessages] = await Promise.all([
      eventExtractionService.extractEventsFromPosts(postsData.posts, translatedPosts),
      eventExtractionService.extractEventsFromMessages(allMessages, translatedMessages),
    ]);

    logInfo('Event extraction complete', {
      derivedEventsFromPosts: derivedEventsFromPosts.length,
      derivedEventsFromMessages: derivedEventsFromMessages.length,
    });

    // Apply translated content back to threads and posts for processors
    // Create a map of translated messages by ID for quick lookup
    const translatedMessageMap = new Map(
      translatedMessages.map((msg) => [msg.Id, msg.MessageText])
    );

    // Update threads with translated message text
    const threadsWithTranslations = threadsData.threads.map((thread) => ({
      ...thread,
      Messages: thread.Messages.map((msg) => ({
        ...msg,
        MessageText: translatedMessageMap.get(msg.Id) || msg.MessageText,
      })),
    }));

    // Combine all derived events
    const allDerivedEvents = [...derivedEventsFromPosts, ...derivedEventsFromMessages];

    // Process all data types in parallel with AI (using pre-translated content)
    logInfo('Processing data with AI (using PARSED translations)');
    const [overviewResult, threadResult, postResult, unifiedEventsResult, importantInfoResult, weeklyHighlightsResult] =
      await Promise.all([
        overviewProcessor.process(overviews, today),
        threadProcessor.process(threadsWithTranslations, today),
        postProcessor.process(translatedPosts),
        // NEW: Unified events processor combines calendar + derived events with deduplication
        unifiedEventsProcessor.processAllEvents(
          calendarEvents,
          derivedEventsFromPosts,
          derivedEventsFromMessages
        ),
        // NEW: Important info processor extracts critical non-event information
        importantInfoProcessor.process(translatedPosts, threadsWithTranslations),
        // NEW: Weekly highlights processor extracts activity stories
        weeklyHighlightsProcessor.process(overviews, threadsWithTranslations, translatedPosts),
      ]);

    logInfo('Data processing complete', {
      unifiedEventsTotal: unifiedEventsResult.totalEvents,
      unifiedEventsDedup: unifiedEventsResult.deduplicatedEvents,
      calendarEvents: unifiedEventsResult.calendarEvents,
      derivedEvents: unifiedEventsResult.derivedEvents,
    });

    // Generate final summary JSON (with unified events and new sections)
    logInfo('Generating final summary with structured sections');
    const finalSummary = await bedrockService.generateFinalSummary({
      overview: overviewResult.summary,
      threads: threadResult.summary,
      upcomingEvents: unifiedEventsResult.summary, // Unified events (calendar + derived)
      posts: postResult.summary,
      importantInfo: importantInfoResult.importantSummary, // NEW: Critical information
      generalReminders: importantInfoResult.remindersSummary, // NEW: Non-critical actionable items
      weeklyHighlights: weeklyHighlightsResult.summary, // NEW: Activity stories
    });

    // Parse the newsletter JSON
    const newNewsletter = emailService.parseNewsletterJson(finalSummary);

    // NEW: Merge with previous snapshot (Phase 2: Smart merging with expiration rules)
    logInfo('Merging with previous snapshot', { incrementalMode });
    const mergedNewsletter = snapshotMergeService.mergeSnapshots(
      previousSnapshot,
      newNewsletter,
      today,
      incrementalMode
    );

    logInfo('Snapshot merge complete', {
      newEventsCount: newNewsletter.upcomingEvents.length,
      mergedEventsCount: mergedNewsletter.upcomingEvents.length,
    });

    // Fetch S3 attachments (if configured)
    let s3Attachments;
    if (config.attachments) {
      logInfo('Fetching S3 attachments');
      const attachmentService = new AttachmentRetrievalService(docClient, config.attachments);

      const [postAttachments, messageAttachments] = await Promise.all([
        attachmentService.getAttachmentsForPosts(postsData.postsWithIds),
        attachmentService.getAttachmentsForMessages(threadsData.messages),
      ]);

      s3Attachments = {
        posts: postAttachments,
        messages: messageAttachments,
      };

      logInfo('S3 attachments fetched', {
        postAttachmentGroups: postAttachments.length,
        messageAttachmentGroups: messageAttachments.length,
      });
    } else {
      logInfo('S3 attachments not configured, skipping attachment retrieval');
    }

    // Build and send email (using merged newsletter)
    logInfo('Building email from merged newsletter');
    const htmlContent = emailService.buildHtmlEmailFromStructure(mergedNewsletter, s3Attachments);

    const subject = emailService.generateSubject(today);

    logInfo('Sending email');
    await emailService.sendEmail(subject, htmlContent);

    // NEW: Save today's snapshot for tomorrow's incremental generation
    logInfo('Saving today newsletter snapshot with processing stats');
    const ttl = Math.floor(Date.now() / 1000) + 60 * 24 * 60 * 60; // 60 days

    // Calculate approximate Bedrock calls
    const bedrockCallsEstimate =
      translatedPosts.length +          // Post translations
      translatedMessages.length +       // Message translations
      (derivedEventsFromPosts.length > 0 ? postsData.posts.length : 0) +  // Event extractions from posts
      (derivedEventsFromMessages.length > 0 ? allMessages.length : 0) +    // Event extractions from messages
      6;                                // Summary generations (overview, threads, calendar, posts, unified events, final)

    await snapshotAccess.saveSnapshot({
      SnapshotDate: todayDateStr,
      GeneratedAt: new Date().toISOString(),
      NewsletterJson: mergedNewsletter,
      ProcessedItemIds: {
        postIds: postsData.posts.map((p) => p.Id),
        messageIds: allMessages.map((m) => m.Id),
        eventIds: calendarEvents.map((e) => e.Id.toString()),
        derivedEventIds: allDerivedEvents.map((e) => e.Id),
      },
      ProcessingStats: {
        postsProcessed: postsData.posts.length,
        messagesProcessed: allMessages.length,
        eventsExtracted: derivedEventsFromPosts.length + derivedEventsFromMessages.length,
        bedrockCalls: bedrockCallsEstimate,
      },
      ttl,
    });

    logInfo('Snapshot saved successfully', { snapshotDate: todayDateStr });

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    logInfo('GenerateNewsletter Lambda completed successfully', {
      mode: incrementalMode ? 'INCREMENTAL' : 'FULL',
      duration: `${duration}ms`,
      emailSent: true,
      dataProcessed: {
        postsProcessed: postsData.posts.length,
        messagesProcessed: allMessages.length,
        translatedPosts: translatedPosts.length,
        translatedMessages: translatedMessages.length,
      },
      events: {
        unifiedEventsTotal: unifiedEventsResult.totalEvents,
        unifiedEventsDedup: unifiedEventsResult.deduplicatedEvents,
        calendarEventsCount: unifiedEventsResult.calendarEvents,
        derivedEventsCount: unifiedEventsResult.derivedEvents,
      },
      bedrockUsage: {
        estimatedCalls: bedrockCallsEstimate,
        note: incrementalMode
          ? 'Incremental mode: Only NEW data processed'
          : 'Full mode: All data from last N days processed',
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Successfully generated and sent newsletter',
        timestamp: endTime.toISOString(),
        duration: `${duration}ms`,
        stats: {
          overviews: overviews.length,
          threads: threadsData.threads.length,
          calendarEvents: calendarEvents.length,
          posts: postsData.posts.length,
          translatedPosts: translatedPosts.length,
          translatedMessages: translatedMessages.length,
          unifiedEventsTotal: unifiedEventsResult.totalEvents,
          unifiedEventsDedup: unifiedEventsResult.deduplicatedEvents,
        },
      }),
    };
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    logError('Error in GenerateNewsletter Lambda', {
      error: errorMessage,
      errorType: error instanceof Error ? error.constructor.name : typeof error,
    });

    // Determine appropriate status code
    let statusCode = 500;
    if (error instanceof LambdaError) {
      statusCode = error.statusCode;
    }

    return {
      statusCode,
      body: JSON.stringify({
        message: 'Error generating newsletter',
        error: errorMessage,
        timestamp: new Date().toISOString(),
      }),
    };
  }
};
