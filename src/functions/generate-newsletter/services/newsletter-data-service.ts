/**
 * Newsletter data service
 * Aggregates data from DynamoDB for newsletter generation
 */

import { DynamoDBDataReader } from '../../../common/dynamodb/data-access';
import { AulaThread, AulaMessage, AttachmentGroup } from '../../../common/types';
import { getDateRange, logInfo } from '../../../common/utils';

export interface ThreadsWithAttachments {
  threads: AulaThread[];
  attachments: AttachmentGroup[];
  messages: Array<{ Id: string; ThreadSubject: string }>; // For S3 attachment retrieval
}

export interface PostsWithAttachments {
  posts: any[];
  attachments: AttachmentGroup[];
  postsWithIds: Array<{ Id: number; Title: string }>; // For S3 attachment retrieval
}

/**
 * Service for retrieving and organizing newsletter data
 */
export class NewsletterDataService {
  constructor(private readonly dataReader: DynamoDBDataReader) {}

  /**
   * Gets thread messages with their parent threads and attachments
   */
  async getThreadsWithMessages(daysInPast: number): Promise<ThreadsWithAttachments> {
    logInfo('Fetching thread messages for newsletter', { daysInPast });

    const { start, end } = getDateRange(daysInPast, 0);

    // Get messages in date range
    const messages = await this.dataReader.getThreadMessages(start, end);

    if (messages.length === 0) {
      return { threads: [], attachments: [] };
    }

    // Get unique thread IDs
    const threadIds = [...new Set(messages.map(msg => msg.ThreadId))];

    // Get thread metadata
    const threadMetadata = await this.dataReader.getThreadsByIds(threadIds);

    // Build threads with their messages
    const threads: AulaThread[] = threadMetadata.map(meta => ({
      ...meta,
      Messages: messages.filter(msg => msg.ThreadId === meta.Id),
    }));

    // Extract attachments
    const attachments: AttachmentGroup[] = [];
    threads.forEach(thread => {
      const threadAttachments = thread.Messages.flatMap(msg => msg.Attachments || []);
      if (threadAttachments.length > 0) {
        attachments.push({
          threadSubject: thread.Subject,
          attachments: threadAttachments,
        });
      }
    });

    // Build messages array with IDs and thread subjects for S3 attachment retrieval
    const messagesWithIds = messages.map(msg => ({
      Id: msg.Id,
      ThreadSubject: threads.find(t => t.Id === msg.ThreadId)?.Subject || 'Unknown Thread',
    }));

    logInfo(`Retrieved ${threads.length} threads with ${messages.length} messages`);
    return { threads, attachments, messages: messagesWithIds };
  }

  /**
   * Gets calendar events in date range
   */
  async getCalendarEvents(daysInPast: number, daysInFuture: number) {
    logInfo('Fetching calendar events for newsletter', { daysInPast, daysInFuture });

    const { start, end } = getDateRange(daysInPast, daysInFuture);
    const events = await this.dataReader.getCalendarEvents(start, end);

    logInfo(`Retrieved ${events.length} calendar events`);
    return events;
  }

  /**
   * Gets posts with attachments
   */
  async getPostsWithAttachments(daysInPast: number): Promise<PostsWithAttachments> {
    logInfo('Fetching posts for newsletter', { daysInPast });

    const { start, end } = getDateRange(daysInPast, 0);
    const posts = await this.dataReader.getPosts(start, end);

    // Extract attachments
    const attachments: AttachmentGroup[] = [];
    posts.forEach(post => {
      if (post.Attachments && post.Attachments.length > 0) {
        attachments.push({
          postSubject: post.Title,
          attachments: post.Attachments,
        });
      }
    });

    // Build posts array with IDs and titles for S3 attachment retrieval
    const postsWithIds = posts.map(post => ({
      Id: post.Id,
      Title: post.Title,
    }));

    logInfo(`Retrieved ${posts.length} posts`);
    return { posts, attachments, postsWithIds };
  }

  /**
   * Gets daily overviews
   */
  async getDailyOverviews(date: Date = new Date()) {
    logInfo('Fetching daily overviews for newsletter');

    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);

    const overviews = await this.dataReader.getDailyOverviews(startOfDay, endOfDay);

    logInfo(`Retrieved ${overviews.length} daily overviews`);
    return overviews;
  }
}
