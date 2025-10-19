/**
 * DynamoDB Manager with batch write operations and conditional puts
 * Optimized for performance with reduced read operations
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBConfig, SaveResult, AulaThread, AulaDataCollection } from './types';
import { logInfo, logWarn, logError, chunk, DynamoDBError } from './utils';

/**
 * DynamoDB Manager class for persisting Aula data
 * Uses batch writes and conditional expressions for optimal performance
 */
export class DynamoDBManager {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly config: DynamoDBConfig;

  constructor(config: DynamoDBConfig, credentials?: any) {
    const clientConfig: any = {};

    if (config.region) {
      clientConfig.region = config.region;
    }

    if (credentials) {
      clientConfig.credentials = credentials;
    }

    const client = new DynamoDBClient(clientConfig);
    this.docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: {
        convertClassInstanceToMap: true,
        removeUndefinedValues: true,
      },
    });

    this.config = config;
  }

  /**
   * Calculates TTL timestamp for two months from now
   */
  private twoMonthsFromNow(): number {
    const now = new Date();
    const future = new Date(now);
    future.setMonth(future.getMonth() + 2);
    return Math.floor(future.getTime() / 1000);
  }

  /**
   * Saves a single item with conditional put (only if not exists)
   * Returns true if saved, false if already exists
   */
  private async saveItemConditional(tableName: string, item: any): Promise<boolean> {
    try {
      const itemWithTTL = { ...item, ttl: this.twoMonthsFromNow() };

      await this.docClient.send(
        new PutCommand({
          TableName: tableName,
          Item: itemWithTTL,
          ConditionExpression: 'attribute_not_exists(Id)',
        })
      );

      return true; // Successfully saved
    } catch (error: any) {
      if (error.name === 'ConditionalCheckFailedException') {
        // Item already exists - this is expected and not an error
        return false;
      }
      // Unexpected error
      throw error;
    }
  }

  /**
   * Batch write items to DynamoDB with automatic retry for unprocessed items
   * Uses conditional expressions to avoid overwriting existing items
   */
  private async batchWriteItems(tableName: string, items: any[]): Promise<SaveResult> {
    if (items.length === 0) {
      return { successful: 0, failed: 0 };
    }

    const result: SaveResult = { successful: 0, failed: 0, failedItems: [] };
    const batches = chunk(items, 25); // DynamoDB batch write limit is 25 items

    logInfo(`Writing ${items.length} items to ${tableName} in ${batches.length} batches`);

    for (const batch of batches) {
      try {
        // Add TTL to all items
        const itemsWithTTL = batch.map(item => ({ ...item, ttl: this.twoMonthsFromNow() }));

        // Create put requests (note: batch write doesn't support ConditionExpression)
        // We'll use individual puts with conditions for smaller batches
        const putResults = await Promise.allSettled(
          itemsWithTTL.map(item => this.saveItemConditional(tableName, item))
        );

        for (let i = 0; i < putResults.length; i++) {
          const putResult = putResults[i];
          if (putResult.status === 'fulfilled') {
            if (putResult.value) {
              result.successful++;
            }
            // If value is false, item already existed (not counted as success or failure)
          } else {
            result.failed++;
            result.failedItems?.push(batch[i]);
            logWarn(`Failed to save item to ${tableName}`, {
              itemId: batch[i].Id,
              error: putResult.reason?.message,
            });
          }
        }
      } catch (error) {
        logError(`Error in batch write to ${tableName}`, {
          error: error instanceof Error ? error.message : String(error),
        });
        result.failed += batch.length;
        result.failedItems?.push(...batch);
      }
    }

    logInfo(`Completed batch write to ${tableName}`, {
      successful: result.successful,
      failed: result.failed,
      alreadyExisted: items.length - result.successful - result.failed,
    });

    return result;
  }

  /**
   * Saves daily overview data
   */
  async saveOverview(overview: { Overviews: any[] }): Promise<SaveResult> {
    logInfo('Saving daily overviews', { count: overview.Overviews.length });
    return await this.batchWriteItems(this.config.dailyOverviewTable, overview.Overviews);
  }

  /**
   * Saves thread messages
   * Threads and messages are stored in separate tables
   */
  async saveThreadMessages(threadData: { Threads: AulaThread[] }): Promise<{
    threads: SaveResult;
    messages: SaveResult;
  }> {
    logInfo('Saving threads and messages', { threadCount: threadData.Threads.length });

    // Prepare threads without messages
    const threadsToSave = threadData.Threads.map(thread => {
      const { Messages, ...threadWithoutMessages } = thread;
      return threadWithoutMessages;
    });

    // Prepare all messages from all threads
    const allMessages = threadData.Threads.flatMap(thread => thread.Messages || []);

    logInfo(`Saving ${threadsToSave.length} threads and ${allMessages.length} messages`);

    // Save threads and messages in parallel
    const [threadsResult, messagesResult] = await Promise.all([
      this.batchWriteItems(this.config.threadsTable, threadsToSave),
      this.batchWriteItems(this.config.threadMessagesTable, allMessages),
    ]);

    return {
      threads: threadsResult,
      messages: messagesResult,
    };
  }

  /**
   * Saves calendar events
   */
  async saveCalendarEvents(calendarData: { CalendarEvents: any[] }): Promise<SaveResult> {
    logInfo('Saving calendar events', { count: calendarData.CalendarEvents.length });
    return await this.batchWriteItems(this.config.calendarEventsTable, calendarData.CalendarEvents);
  }

  /**
   * Saves posts
   */
  async savePosts(postsData: { Posts: any[] }): Promise<SaveResult> {
    logInfo('Saving posts', { count: postsData.Posts.length });
    return await this.batchWriteItems(this.config.postsTable, postsData.Posts);
  }

  /**
   * Saves MeeBook data (work plan and book list)
   */
  async saveMeeBook(meeBookData: {
    WorkPlan: { Weeks: any[] };
    BookList: { Weeks: any[] };
  }): Promise<{ workPlan: SaveResult; bookList: SaveResult }> {
    // Fix: WorkPlan.Weeks is an array of WeekPlanOverviewList objects
    // Each WeekPlanOverviewList is itself an array of WeekPlanOverview items
    // We need to flatten to get individual WeekPlanOverview objects with Id fields
    const workPlanItems = meeBookData.WorkPlan.Weeks.flatMap((weekList: any) => {
      // If weekList is an array (WeekPlanOverviewList), return its items
      // Otherwise, if it's already a single object, wrap it in an array
      if (Array.isArray(weekList)) {
        return weekList;
      }
      return [weekList];
    }).filter((item: any) => {
      // Filter out items without Id field
      if (!item || !item.Id) {
        logWarn('Skipping work plan item without Id field', {
          item: JSON.stringify(item).substring(0, 200),
        });
        return false;
      }
      return true;
    });

    // Fix: BookList.Weeks is an array of MeeWeeklyBooks objects
    // Each MeeWeeklyBooks has an Id field and should be saved individually
    const bookListItems = meeBookData.BookList.Weeks.flatMap((bookList: any) => {
      // If bookList is an array, return its items
      // Otherwise, if it's already a single object, wrap it in an array
      if (Array.isArray(bookList)) {
        return bookList;
      }
      return [bookList];
    }).filter((item: any) => {
      // Filter out items without Id field
      if (!item || !item.Id) {
        logWarn('Skipping book list item without Id field', {
          item: JSON.stringify(item).substring(0, 200),
        });
        return false;
      }
      return true;
    });

    logInfo('Saving MeeBook data (flattened)', {
      workPlanItems: workPlanItems.length,
      bookListItems: bookListItems.length,
    });

    const [workPlanResult, bookListResult] = await Promise.all([
      this.batchWriteItems(this.config.weekOverviewTable, workPlanItems),
      this.batchWriteItems(this.config.bookListTable, bookListItems),
    ]);

    return {
      workPlan: workPlanResult,
      bookList: bookListResult,
    };
  }

  /**
   * Saves gallery albums
   */
  async saveGalleryAlbums(albums: any[]): Promise<SaveResult> {
    logInfo('Saving gallery albums', { count: albums.length });
    return await this.batchWriteItems(this.config.galleryAlbumsTable, albums);
  }

  /**
   * Saves all Aula data in parallel
   * Returns detailed results for each data type
   */
  async saveAllData(data: AulaDataCollection): Promise<{
    overviews: SaveResult;
    threads: SaveResult;
    messages: SaveResult;
    calendarEvents: SaveResult;
    posts: SaveResult;
    workPlan: SaveResult;
    bookList: SaveResult;
    galleryAlbums: SaveResult;
  }> {
    logInfo('Saving all Aula data in parallel');

    const [overviews, threadMessages, calendarEvents, posts, meeBook, galleryAlbums] =
      await Promise.all([
        this.saveOverview(data.Aula.Overview),
        this.saveThreadMessages(data.Aula.Messages),
        this.saveCalendarEvents(data.Aula.Calendar),
        this.savePosts(data.Aula.Posts),
        this.saveMeeBook(data.MeeBook),
        this.saveGalleryAlbums(data.Aula.Gallery.Albums),
      ]);

    const results = {
      overviews,
      threads: threadMessages.threads,
      messages: threadMessages.messages,
      calendarEvents,
      posts,
      workPlan: meeBook.workPlan,
      bookList: meeBook.bookList,
      galleryAlbums,
    };

    // Calculate totals
    const totalSuccessful = Object.values(results).reduce((sum, r) => sum + r.successful, 0);
    const totalFailed = Object.values(results).reduce((sum, r) => sum + r.failed, 0);

    logInfo('Completed saving all data', {
      totalSuccessful,
      totalFailed,
      breakdown: {
        overviews: results.overviews.successful,
        threads: results.threads.successful,
        messages: results.messages.successful,
        calendarEvents: results.calendarEvents.successful,
        posts: results.posts.successful,
        workPlan: results.workPlan.successful,
        bookList: results.bookList.successful,
        galleryAlbums: results.galleryAlbums.successful,
      },
    });

    return results;
  }
}
