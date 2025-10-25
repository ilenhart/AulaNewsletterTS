/**
 * Newsletter data service
 * Aggregates data from DynamoDB for newsletter generation
 */

import { DynamoDBDataReader } from '../../../common/dynamodb/data-access';
import { ParsedDataAccess } from '../../../common/dynamodb/parsed-data-access';
import { NewsletterSnapshotAccess } from '../../../common/dynamodb/snapshot-access';
import { AulaThread, AulaMessage, AttachmentGroup, NewsletterSnapshot } from '../../../common/types';
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
  constructor(
    private readonly dataReader: DynamoDBDataReader,
    private readonly parsedDataAccess?: ParsedDataAccess,
    private readonly snapshotAccess?: NewsletterSnapshotAccess
  ) {}

  /**
   * Gets thread messages with their parent threads and attachments
   * Phase 1 mode: Fetches last N days
   */
  async getThreadsWithMessages(daysInPast: number): Promise<ThreadsWithAttachments> {
    logInfo('Fetching thread messages for newsletter', { daysInPast });

    const { start, end} = getDateRange(daysInPast, 0);

    // Get messages in date range
    const messages = await this.dataReader.getThreadMessages(start, end);

    return await this.buildThreadsResponse(messages);
  }

  /**
   * Gets thread messages SINCE a specific timestamp (Phase 2 incremental mode)
   * @param sinceTimestamp - Only fetch messages sent after this timestamp
   */
  async getThreadsWithMessagesSince(sinceTimestamp: string): Promise<ThreadsWithAttachments> {
    logInfo('Fetching NEW thread messages since timestamp', { sinceTimestamp });

    const start = new Date(sinceTimestamp);
    const end = new Date(); // Now

    // Get NEW messages only
    const messages = await this.dataReader.getThreadMessages(start, end);

    logInfo(`Found ${messages.length} NEW messages since ${sinceTimestamp}`);
    return await this.buildThreadsResponse(messages);
  }

  /**
   * Helper to build threads response from messages
   */
  private async buildThreadsResponse(messages: AulaMessage[]): Promise<ThreadsWithAttachments> {

    if (messages.length === 0) {
      return { threads: [], attachments: [], messages: [] };
    }

    // Get unique thread IDs
    const threadIds = [...new Set(messages.map(msg => msg.ThreadId))];

    // Get thread metadata
    const threadMetadata = await this.dataReader.getThreadsByIds(threadIds);

    // Look up translated subjects from PARSED_threads table
    const translatedSubjectsMap = new Map<number, string>();
    if (this.parsedDataAccess) {
      for (const thread of threadMetadata) {
        const parsedThread = await this.parsedDataAccess.getParsedThread(thread.Id);
        if (parsedThread) {
          translatedSubjectsMap.set(thread.Id, parsedThread.SubjectEnglish);
          logInfo(`Using translated subject for thread ${thread.Id}`);
        }
      }
    }

    // Build threads with their messages, using translated subjects where available
    const threads: AulaThread[] = threadMetadata.map(meta => ({
      ...meta,
      Subject: translatedSubjectsMap.get(meta.Id) || meta.Subject, // Use English if available
      Messages: messages.filter(msg => msg.ThreadId === meta.Id),
    }));

    // Extract attachments
    const attachments: AttachmentGroup[] = [];
    threads.forEach(thread => {
      const threadAttachments = thread.Messages.flatMap(msg => msg.Attachments || []);
      if (threadAttachments.length > 0) {
        attachments.push({
          threadSubject: thread.Subject, // Now using English subject
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
   * Gets posts with attachments (Phase 1 mode: last N days)
   */
  async getPostsWithAttachments(daysInPast: number): Promise<PostsWithAttachments> {
    logInfo('Fetching posts for newsletter', { daysInPast });

    const { start, end } = getDateRange(daysInPast, 0);
    const posts = await this.dataReader.getPosts(start, end);

    return this.buildPostsResponse(posts);
  }

  /**
   * Gets posts SINCE a specific timestamp (Phase 2 incremental mode)
   * @param sinceTimestamp - Only fetch posts created after this timestamp
   */
  async getPostsWithAttachmentsSince(sinceTimestamp: string): Promise<PostsWithAttachments> {
    logInfo('Fetching NEW posts since timestamp', { sinceTimestamp });

    const start = new Date(sinceTimestamp);
    const end = new Date(); // Now

    const posts = await this.dataReader.getPosts(start, end);

    logInfo(`Found ${posts.length} NEW posts since ${sinceTimestamp}`);
    return this.buildPostsResponse(posts);
  }

  /**
   * Helper to build posts response
   */
  private buildPostsResponse(posts: any[]): PostsWithAttachments {

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

  /**
   * Gets the most recent newsletter snapshot
   * Tries to find yesterday's snapshot, then scans back up to 7 days
   * @returns Most recent newsletter snapshot or null if none found
   */
  async getMostRecentSnapshot(): Promise<NewsletterSnapshot | null> {
    if (!this.snapshotAccess) {
      logInfo('Snapshot access not configured - returning null');
      return null;
    }

    logInfo('Searching for most recent newsletter snapshot');

    // Try yesterday first (most likely case)
    const yesterdaySnapshot = await this.snapshotAccess.getYesterdaySnapshot();
    if (yesterdaySnapshot) {
      logInfo('Found yesterday\'s snapshot', {
        snapshotDate: yesterdaySnapshot.SnapshotDate,
        generatedAt: yesterdaySnapshot.GeneratedAt,
      });
      return yesterdaySnapshot;
    }

    // Scan back up to 7 days to find most recent snapshot
    for (let daysBack = 2; daysBack <= 7; daysBack++) {
      const date = new Date();
      date.setDate(date.getDate() - daysBack);
      const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD

      const snapshot = await this.snapshotAccess.getSnapshot(dateStr);
      if (snapshot) {
        logInfo(`Found snapshot from ${daysBack} days ago`, {
          snapshotDate: snapshot.SnapshotDate,
          generatedAt: snapshot.GeneratedAt,
        });
        return snapshot;
      }
    }

    logInfo('No recent snapshot found (searched back 7 days)');
    return null;
  }
}
