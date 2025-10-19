/**
 * Event extraction service with caching
 * Extracts implied events from posts and messages using Bedrock
 * Now uses centralized BedrockPrompts for all prompt generation
 */

import { DerivedEventsAccess } from '../../../common/dynamodb/derived-events-access';
import { BedrockService } from './bedrock-service';
import { BedrockPrompts, PromptContext } from './bedrock-prompts';
import { AulaPost, AulaMessage, DerivedEventExtracted } from '../../../common/types';
import { logInfo, logWarn, logError, extractJsonFromLLMResponse } from '../../../common/utils';

export class EventExtractionService {
  private readonly prompts: BedrockPrompts;

  constructor(
    private readonly derivedEventsAccess: DerivedEventsAccess,
    private readonly bedrockService: BedrockService,
    private readonly modelId: string,
    promptContext: PromptContext
  ) {
    // Initialize centralized prompts
    this.prompts = new BedrockPrompts(promptContext);
  }

  /**
   * Extract events from a post
   * Returns derived events (either from cache or newly extracted)
   */
  async extractEventsFromPost(
    rawPost: AulaPost,
    translatedContent: string
  ): Promise<DerivedEventExtracted[]> {
    try {
      // Check if we've already extracted events for this post
      const cached = await this.derivedEventsAccess.getEventsForPost(
        rawPost.Id,
        rawPost.Timestamp
      );

      // If cached events exist and are not stale, return them
      if (cached.length > 0) {
        logInfo(`Using ${cached.length} cached events for post ${rawPost.Id}`);
        return cached;
      }

      // Not cached - extract via Bedrock
      logInfo(`Extracting events from post ${rawPost.Id} via Bedrock`, {
        postId: rawPost.Id,
        titleLength: rawPost.Title?.length || 0,
        contentLength: translatedContent?.length || 0,
      });

      const extractionPrompt = this.buildEventExtractionPrompt(
        rawPost.Title,
        translatedContent,
        rawPost.Timestamp
      );

      const extractionResult = await this.bedrockService.invoke(extractionPrompt);

      logInfo(`Received event extraction response for post ${rawPost.Id}`, {
        responseLength: extractionResult.length,
      });

      // Parse AI response (expect JSON array of events)
      const events = this.parseEventExtractionResponse(extractionResult);

      // Save to cache (even if empty - indicates we've processed this post)
      if (events.length > 0) {
        await this.derivedEventsAccess.saveEventsForPost(
          rawPost.Id,
          rawPost.Timestamp,
          events,
          this.modelId
        );

        logInfo(`Extracted and cached ${events.length} events from post ${rawPost.Id}`);
      } else {
        logInfo(`No events found in post ${rawPost.Id}`);
      }

      // Return events with full metadata
      return events.map((event, index) => ({
        Id: `post-${rawPost.Id}-event-${index + 1}`,
        SourceType: 'post' as const,
        SourcePostId: rawPost.Id,
        SourceTimestamp: rawPost.Timestamp,
        ...event,
        ExtractedAt: new Date().toISOString(),
        ExtractionModel: this.modelId,
        ttl: 0, // Will be set by DerivedEventsAccess
      })) as DerivedEventExtracted[];
    } catch (error) {
      logError(`CRITICAL: Failed to extract events from post ${rawPost.Id}`, {
        error: error instanceof Error ? error.message : String(error),
        postId: rawPost.Id,
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Return empty array rather than failing completely
      return [];
    }
  }

  /**
   * Extract events from a message
   * Returns derived events (either from cache or newly extracted)
   */
  async extractEventsFromMessage(
    rawMessage: AulaMessage,
    translatedText: string
  ): Promise<DerivedEventExtracted[]> {
    try {
      // Check if we've already extracted events for this message
      const cached = await this.derivedEventsAccess.getEventsForMessage(
        rawMessage.Id,
        rawMessage.SentDate
      );

      // If cached events exist and are not stale, return them
      if (cached.length > 0) {
        logInfo(`Using ${cached.length} cached events for message ${rawMessage.Id}`);
        return cached;
      }

      // Not cached - extract via Bedrock
      logInfo(`Extracting events from message ${rawMessage.Id} via Bedrock`, {
        messageId: rawMessage.Id,
        textLength: translatedText?.length || 0,
      });

      const extractionPrompt = this.buildEventExtractionPromptForMessage(
        translatedText,
        rawMessage.SentDate,
        rawMessage.Sender?.FullName || 'Unknown Sender'
      );

      const extractionResult = await this.bedrockService.invoke(extractionPrompt);

      logInfo(`Received event extraction response for message ${rawMessage.Id}`, {
        responseLength: extractionResult.length,
      });

      // Parse AI response (expect JSON array of events)
      const events = this.parseEventExtractionResponse(extractionResult);

      // Save to cache (even if empty - indicates we've processed this message)
      if (events.length > 0) {
        await this.derivedEventsAccess.saveEventsForMessage(
          rawMessage.Id,
          rawMessage.ThreadId,
          rawMessage.SentDate,
          events,
          this.modelId
        );

        logInfo(`Extracted and cached ${events.length} events from message ${rawMessage.Id}`);
      } else {
        logInfo(`No events found in message ${rawMessage.Id}`);
      }

      // Return events with full metadata
      return events.map((event, index) => ({
        Id: `message-${rawMessage.Id}-event-${index + 1}`,
        SourceType: 'message' as const,
        SourceMessageId: rawMessage.Id,
        SourceThreadId: rawMessage.ThreadId,
        SentDate: rawMessage.SentDate,
        ...event,
        ExtractedAt: new Date().toISOString(),
        ExtractionModel: this.modelId,
        ttl: 0, // Will be set by DerivedEventsAccess
      })) as DerivedEventExtracted[];
    } catch (error) {
      logError(`CRITICAL: Failed to extract events from message ${rawMessage.Id}`, {
        error: error instanceof Error ? error.message : String(error),
        messageId: rawMessage.Id,
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Return empty array rather than failing completely
      return [];
    }
  }

  /**
   * Extract events from multiple posts in parallel
   */
  async extractEventsFromPosts(
    rawPosts: AulaPost[],
    translatedPosts: AulaPost[]
  ): Promise<DerivedEventExtracted[]> {
    logInfo(`Extracting events from ${rawPosts.length} posts (checking cache)`);

    const allEvents = await Promise.all(
      rawPosts.map((post, index) =>
        this.extractEventsFromPost(post, translatedPosts[index].Content)
      )
    );

    return allEvents.flat();
  }

  /**
   * Extract events from multiple messages in parallel
   */
  async extractEventsFromMessages(
    rawMessages: AulaMessage[],
    translatedMessages: AulaMessage[]
  ): Promise<DerivedEventExtracted[]> {
    logInfo(`Extracting events from ${rawMessages.length} messages (checking cache)`);

    const allEvents = await Promise.all(
      rawMessages.map((message, index) =>
        this.extractEventsFromMessage(message, translatedMessages[index].MessageText)
      )
    );

    return allEvents.flat();
  }

  /**
   * Build event extraction prompt for a post
   * Now delegated to centralized BedrockPrompts class
   */
  private buildEventExtractionPrompt(
    title: string,
    content: string,
    timestamp: string
  ): string {
    return this.prompts.getEventExtractionPromptForPost(title, content, timestamp);
  }

  /**
   * Build event extraction prompt for a message
   * Now delegated to centralized BedrockPrompts class
   */
  private buildEventExtractionPromptForMessage(
    messageText: string,
    sentDate: string,
    senderName: string
  ): string {
    return this.prompts.getEventExtractionPromptForMessage(messageText, sentDate, senderName);
  }

  /**
   * Parse event extraction response from AI using robust extraction
   * Handles various JSON formats, explanatory text, and error cases
   */
  private parseEventExtractionResponse(
    response: string
  ): Partial<DerivedEventExtracted>[] {
    const parsed = extractJsonFromLLMResponse<any>(response, 'event extraction');

    if (!parsed) {
      return [];
    }

    if (!Array.isArray(parsed)) {
      logWarn('AI did not return array for event extraction', { parsed });
      return [];
    }

    // Validate each event has required fields
    const validEvents = parsed.filter((event) => {
      return event.EventTitle && event.EventDescription && event.EventDate;
    });

    if (validEvents.length !== parsed.length) {
      logWarn(`Filtered out ${parsed.length - validEvents.length} invalid events`);
    }

    return validEvents;
  }
}
