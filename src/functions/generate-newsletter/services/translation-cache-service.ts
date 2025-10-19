/**
 * Translation service with intelligent caching
 * Checks PARSED tables before calling Bedrock
 */

import { ParsedDataAccess } from '../../../common/dynamodb/parsed-data-access';
import { BedrockService } from './bedrock-service';
import { AulaPost, AulaMessage } from '../../../common/types';
import { logInfo, logError } from '../../../common/utils';

export class TranslationCacheService {
  constructor(
    private readonly parsedDataAccess: ParsedDataAccess,
    private readonly bedrockService: BedrockService,
    private readonly modelId: string
  ) {}

  /**
   * Translate post with caching
   * Returns translated post (either from cache or newly translated)
   */
  async translatePost(rawPost: AulaPost): Promise<AulaPost> {
    try {
      // Check cache first
      const cached = await this.parsedDataAccess.getParsedPost(rawPost.Id, rawPost.Timestamp);

      if (cached) {
        logInfo(`Using cached translation for post ${rawPost.Id}`);
        return {
          ...rawPost,
          Title: cached.TitleEnglish,
          Content: cached.ContentEnglish,
        };
      }

      // Not cached - translate via Bedrock
      logInfo(`Translating post ${rawPost.Id} via Bedrock`, {
        postId: rawPost.Id,
        titleLength: rawPost.Title?.length || 0,
        contentLength: rawPost.Content?.length || 0,
      });

      const translatePrompt = `Post title: ${rawPost.Title}\nPost content: ${rawPost.Content}`;
      const translatedContent = await this.bedrockService.translate(translatePrompt);

      logInfo(`Successfully translated post ${rawPost.Id}`, {
        translatedLength: translatedContent.length,
      });

      // Parse the translated content to extract title and content
      // For simplicity, we'll assume the AI returns the translated content directly
      // In a more sophisticated version, we could ask the AI to return structured JSON

      // Save to cache
      await this.parsedDataAccess.saveParsedPost({
        Id: `post-${rawPost.Id}`,
        SourcePostId: rawPost.Id,
        SourceTimestamp: rawPost.Timestamp,
        TitleOriginal: rawPost.Title,
        TitleEnglish: rawPost.Title, // Assuming title is included in translatedContent
        ContentOriginal: rawPost.Content,
        ContentEnglish: translatedContent,
        Author: rawPost.Author,
        AuthorRole: rawPost.AuthorRole,
        TranslatedAt: new Date().toISOString(),
        TranslationModel: this.modelId,
        ttl: 0, // Will be set by ParsedDataAccess
      });

      return {
        ...rawPost,
        Content: translatedContent,
      };
    } catch (error) {
      logError(`CRITICAL: Failed to translate post ${rawPost.Id}`, {
        error: error instanceof Error ? error.message : String(error),
        postId: rawPost.Id,
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Return original post untranslated rather than failing completely
      return rawPost;
    }
  }

  /**
   * Translate message with caching
   * Returns translated message (either from cache or newly translated)
   */
  async translateMessage(rawMessage: AulaMessage, context: string): Promise<AulaMessage> {
    try {
      // Check cache first
      const cached = await this.parsedDataAccess.getParsedMessage(
        rawMessage.Id,
        rawMessage.SentDate
      );

      if (cached) {
        logInfo(`Using cached translation for message ${rawMessage.Id}`);
        return {
          ...rawMessage,
          MessageText: cached.MessageTextEnglish,
        };
      }

      // Not cached - translate via Bedrock
      logInfo(`Translating message ${rawMessage.Id} via Bedrock`, {
        messageId: rawMessage.Id,
        messageLength: rawMessage.MessageText?.length || 0,
      });

      const translatedText = await this.bedrockService.translate(rawMessage.MessageText, context);

      logInfo(`Successfully translated message ${rawMessage.Id}`, {
        translatedLength: translatedText.length,
      });

      // Save to cache
      await this.parsedDataAccess.saveParsedMessage({
        Id: `message-${rawMessage.Id}`,
        SourceMessageId: rawMessage.Id,
        SourceThreadId: rawMessage.ThreadId,
        SentDate: rawMessage.SentDate,
        SenderFullName: rawMessage.Sender?.FullName || 'Unknown',
        SenderRole: rawMessage.Sender?.Role || 'Unknown',
        MessageTextOriginal: rawMessage.MessageText,
        MessageTextEnglish: translatedText,
        TranslatedAt: new Date().toISOString(),
        TranslationModel: this.modelId,
        ttl: 0, // Will be set by ParsedDataAccess
      });

      return {
        ...rawMessage,
        MessageText: translatedText,
      };
    } catch (error) {
      logError(`CRITICAL: Failed to translate message ${rawMessage.Id}`, {
        error: error instanceof Error ? error.message : String(error),
        messageId: rawMessage.Id,
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Return original message untranslated rather than failing completely
      return rawMessage;
    }
  }

  /**
   * Translate multiple posts in parallel
   */
  async translatePosts(rawPosts: AulaPost[]): Promise<AulaPost[]> {
    logInfo(`Translating ${rawPosts.length} posts (checking cache)`);
    return await Promise.all(rawPosts.map((post) => this.translatePost(post)));
  }

  /**
   * Translate multiple messages in parallel
   */
  async translateMessages(
    rawMessages: AulaMessage[],
    getContext: (message: AulaMessage) => string
  ): Promise<AulaMessage[]> {
    logInfo(`Translating ${rawMessages.length} messages (checking cache)`);
    return await Promise.all(
      rawMessages.map((message) => this.translateMessage(message, getContext(message)))
    );
  }
}
