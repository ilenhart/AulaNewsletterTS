/**
 * Bulk Translation Service
 * Ensures 1:1 mapping between RAW_ and PARSED_ tables
 * Scans ALL items in RAW_ tables and translates any that don't exist in PARSED_ tables
 */

import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ParsedDataAccess } from '../../../common/dynamodb/parsed-data-access';
import { BedrockService } from './bedrock-service';
import { AulaPost, AulaMessage, AulaThread } from '../../../common/types';
import { logInfo, logError, stripHtml } from '../../../common/utils';

export class BulkTranslationService {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly rawPostsTable: string,
    private readonly rawMessagesTable: string,
    private readonly parsedDataAccess: ParsedDataAccess,
    private readonly bedrockService: BedrockService,
    private readonly modelId: string,
    private readonly rawThreadsTable?: string
  ) {}

  /**
   * Translates ALL posts from RAW_posts to PARSED_posts
   * Only translates items that don't already exist in PARSED_posts
   */
  async translateAllPosts(): Promise<{
    scanned: number;
    alreadyTranslated: number;
    newlyTranslated: number;
    failed: number;
  }> {
    logInfo('Starting bulk translation of all RAW posts');

    const stats = {
      scanned: 0,
      alreadyTranslated: 0,
      newlyTranslated: 0,
      failed: 0,
    };

    try {
      // Scan ALL items in RAW_posts table
      const scanResult = await this.docClient.send(
        new ScanCommand({
          TableName: this.rawPostsTable,
        })
      );

      const rawPosts = (scanResult.Items || []) as AulaPost[];
      stats.scanned = rawPosts.length;

      logInfo(`Scanned ${stats.scanned} posts from RAW_posts table`);

      // Process each post
      for (const rawPost of rawPosts) {
        try {
          // Check if already translated
          const cached = await this.parsedDataAccess.getParsedPost(
            rawPost.Id,
            rawPost.Timestamp
          );

          if (cached) {
            stats.alreadyTranslated++;
            continue;
          }

          // Not translated yet - translate it
          logInfo(`Translating post ${rawPost.Id}`, {
            id: rawPost.Id,
            title: rawPost.Title?.substring(0, 50),
          });

          // Strip HTML from title and content
          const titlePlainText = stripHtml(rawPost.Title || '');
          const contentPlainText = stripHtml(rawPost.Content || '');

          // Translate both title and content
          const translatePrompt = `Title: ${titlePlainText}\n\nContent: ${contentPlainText}`;
          const translatedText = await this.bedrockService.translate(translatePrompt);

          // Try to split response into title and content
          // Expect AI to return "Title: ... Content: ..." format
          let translatedTitle = titlePlainText; // Fallback to plain text
          let translatedContent = translatedText;

          const titleMatch = translatedText.match(/Title:\s*(.+?)(?:\n|Content:)/is);
          const contentMatch = translatedText.match(/Content:\s*(.+)/is);

          if (titleMatch && contentMatch) {
            translatedTitle = titleMatch[1].trim();
            translatedContent = contentMatch[1].trim();
          }

          // Save to PARSED_posts
          await this.parsedDataAccess.saveParsedPost({
            Id: `post-${rawPost.Id}`,
            SourcePostId: rawPost.Id,
            SourceTimestamp: rawPost.Timestamp,
            TitleOriginal: rawPost.Title || '',
            TitleEnglish: translatedTitle,
            ContentOriginal: rawPost.Content || '',
            ContentEnglish: translatedContent,
            Author: rawPost.Author || '',
            AuthorRole: rawPost.AuthorRole || '',
            TranslatedAt: new Date().toISOString(),
            TranslationModel: this.modelId,
            ttl: 0, // Will be set by ParsedDataAccess
          });

          stats.newlyTranslated++;
          logInfo(`Successfully translated post ${rawPost.Id}`);
        } catch (error) {
          stats.failed++;
          logError(`Failed to translate post ${rawPost.Id}`, {
            error: error instanceof Error ? error.message : String(error),
            postId: rawPost.Id,
          });
          // Continue with next post
        }
      }

      logInfo('Completed bulk translation of posts', stats);
      return stats;
    } catch (error) {
      logError('Failed to scan RAW_posts table', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Translates ALL messages from RAW_threadMessages to PARSED_threadMessages
   * Only translates items that don't already exist in PARSED_threadMessages
   */
  async translateAllMessages(): Promise<{
    scanned: number;
    alreadyTranslated: number;
    newlyTranslated: number;
    failed: number;
  }> {
    logInfo('Starting bulk translation of all RAW messages');

    const stats = {
      scanned: 0,
      alreadyTranslated: 0,
      newlyTranslated: 0,
      failed: 0,
    };

    try {
      // Scan ALL items in RAW_threadMessages table
      const scanResult = await this.docClient.send(
        new ScanCommand({
          TableName: this.rawMessagesTable,
        })
      );

      const rawMessages = (scanResult.Items || []) as AulaMessage[];
      stats.scanned = rawMessages.length;

      logInfo(`Scanned ${stats.scanned} messages from RAW_threadMessages table`);

      // Process each message
      for (const rawMessage of rawMessages) {
        try {
          // Check if already translated
          const cached = await this.parsedDataAccess.getParsedMessage(
            rawMessage.Id,
            rawMessage.SentDate
          );

          if (cached) {
            stats.alreadyTranslated++;
            continue;
          }

          // Not translated yet - translate it
          logInfo(`Translating message ${rawMessage.Id}`, {
            id: rawMessage.Id,
            sender: rawMessage.Sender?.FullName,
          });

          // Strip HTML from message text
          const messageTextPlainText = stripHtml(rawMessage.MessageText || '');

          // Translate
          const context = `Message sent on ${rawMessage.SentDate} by ${rawMessage.Sender?.FullName} (${rawMessage.Sender?.Role})`;
          const translatedText = await this.bedrockService.translate(
            messageTextPlainText,
            context
          );

          // Save to PARSED_threadMessages
          await this.parsedDataAccess.saveParsedMessage({
            Id: `message-${rawMessage.Id}`,
            SourceMessageId: rawMessage.Id,
            SourceThreadId: rawMessage.ThreadId,
            SentDate: rawMessage.SentDate,
            SenderFullName: rawMessage.Sender?.FullName || '',
            SenderRole: rawMessage.Sender?.Role || '',
            MessageTextOriginal: rawMessage.MessageText || '',
            MessageTextEnglish: translatedText,
            TranslatedAt: new Date().toISOString(),
            TranslationModel: this.modelId,
            ttl: 0, // Will be set by ParsedDataAccess
          });

          stats.newlyTranslated++;
          logInfo(`Successfully translated message ${rawMessage.Id}`);
        } catch (error) {
          stats.failed++;
          logError(`Failed to translate message ${rawMessage.Id}`, {
            error: error instanceof Error ? error.message : String(error),
            messageId: rawMessage.Id,
          });
          // Continue with next message
        }
      }

      logInfo('Completed bulk translation of messages', stats);
      return stats;
    } catch (error) {
      logError('Failed to scan RAW_threadMessages table', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Translates ALL thread subjects from RAW_threads to PARSED_threads
   * Only translates items that don't already exist in PARSED_threads
   */
  async translateAllThreadSubjects(): Promise<{
    scanned: number;
    alreadyTranslated: number;
    newlyTranslated: number;
    failed: number;
  }> {
    if (!this.rawThreadsTable) {
      logInfo('RAW_threads table not configured, skipping thread subject translation');
      return { scanned: 0, alreadyTranslated: 0, newlyTranslated: 0, failed: 0 };
    }

    logInfo('Starting bulk translation of all RAW thread subjects');

    const stats = {
      scanned: 0,
      alreadyTranslated: 0,
      newlyTranslated: 0,
      failed: 0,
    };

    try {
      // Scan ALL items in RAW_threads table
      const scanResult = await this.docClient.send(
        new ScanCommand({
          TableName: this.rawThreadsTable,
        })
      );

      const rawThreads = (scanResult.Items || []) as AulaThread[];
      stats.scanned = rawThreads.length;

      logInfo(`Scanned ${stats.scanned} threads from RAW_threads table`);

      // Process each thread
      for (const rawThread of rawThreads) {
        try {
          // Check if already translated
          const cached = await this.parsedDataAccess.getParsedThread(rawThread.Id);

          if (cached) {
            stats.alreadyTranslated++;
            continue;
          }

          // Not translated yet - translate it
          logInfo(`Translating thread subject ${rawThread.Id}`, {
            id: rawThread.Id,
            subject: rawThread.Subject?.substring(0, 50),
          });

          // Translate subject
          const translatedSubject = await this.bedrockService.translate(
            rawThread.Subject || '',
            'Thread subject'
          );

          // Save to PARSED_threads
          await this.parsedDataAccess.saveParsedThread({
            Id: `thread-${rawThread.Id}`,
            SourceThreadId: rawThread.Id,
            SubjectOriginal: rawThread.Subject || '',
            SubjectEnglish: translatedSubject,
            TranslatedAt: new Date().toISOString(),
            TranslationModel: this.modelId,
            ttl: 0, // Will be set by ParsedDataAccess
          });

          stats.newlyTranslated++;
          logInfo(`Successfully translated thread subject ${rawThread.Id}`);
        } catch (error) {
          stats.failed++;
          logError(`Failed to translate thread subject ${rawThread.Id}`, {
            error: error instanceof Error ? error.message : String(error),
            threadId: rawThread.Id,
          });
          // Continue with next thread
        }
      }

      logInfo('Completed bulk translation of thread subjects', stats);
      return stats;
    } catch (error) {
      logError('Failed to scan RAW_threads table', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}
