/**
 * GenerateNewsletter Lambda Handler
 * Generates AI-powered newsletter from DynamoDB data and emails it
 * Runs on EventBridge schedule (daily at 6pm UTC)
 */

import { createDynamoDBDocClient } from '../../common/aws/dynamodb-client';
import { createBedrockClient } from '../../common/aws/bedrock-client';
import { createSESClient } from '../../common/aws/ses-client';
import { DynamoDBDataReader } from '../../common/dynamodb/data-access';
import { BedrockService } from './services/bedrock-service';
import { EmailService } from './services/email-service';
import { NewsletterDataService } from './services/newsletter-data-service';
import { OverviewProcessor } from './processors/overview-processor';
import { ThreadProcessor } from './processors/thread-processor';
import { CalendarProcessor } from './processors/calendar-processor';
import { PostProcessor } from './processors/post-processor';
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

    // Initialize services
    logInfo('Initializing services');
    const dataReader = new DynamoDBDataReader(docClient, config.dynamodb);
    const newsletterDataService = new NewsletterDataService(dataReader);

    const bedrockService = new BedrockService(bedrockClient, config.bedrock.modelId, {
      childName: config.personalization.childName,
      parentNames: config.personalization.parentNames,
      messageFamilyNames: config.personalization.messageFamilyNames,
    });

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

    const today = new Date();

    // Fetch all data in parallel
    logInfo('Fetching data from DynamoDB');
    const [overviews, threadsData, calendarEvents, postsData] = await Promise.all([
      newsletterDataService.getDailyOverviews(today),
      newsletterDataService.getThreadsWithMessages(config.dataRetrieval.threadMessagesDaysInPast),
      newsletterDataService.getCalendarEvents(
        config.dataRetrieval.calendarEventsDaysInPast,
        config.dataRetrieval.calendarEventsDaysInFuture
      ),
      newsletterDataService.getPostsWithAttachments(config.dataRetrieval.postsDaysInPast),
    ]);

    logInfo('Data fetched successfully', {
      overviews: overviews.length,
      threads: threadsData.threads.length,
      calendarEvents: calendarEvents.length,
      posts: postsData.posts.length,
    });

    // Process all data types in parallel
    logInfo('Processing data with AI');
    const [overviewResult, threadResult, calendarResult, postResult] = await Promise.all([
      overviewProcessor.process(overviews, today),
      threadProcessor.process(threadsData.threads, today),
      calendarProcessor.process(calendarEvents),
      postProcessor.process(postsData.posts),
    ]);

    logInfo('Data processing complete');

    // Generate final summary
    logInfo('Generating final summary');
    const finalSummary = await bedrockService.generateFinalSummary({
      overview: overviewResult.summary,
      threads: threadResult.summary,
      calendar: calendarResult.summary,
      posts: postResult.summary,
    });

    // Build and send email
    logInfo('Building email');
    const htmlContent = emailService.buildHtmlEmail(finalSummary, {
      posts: postsData.attachments,
      messages: threadsData.attachments,
    });

    const subject = emailService.generateSubject(today);

    logInfo('Sending email');
    await emailService.sendEmail(subject, htmlContent);

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    logInfo('GenerateNewsletter Lambda completed successfully', {
      duration: `${duration}ms`,
      emailSent: true,
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
