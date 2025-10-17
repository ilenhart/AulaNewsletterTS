/**
 * Aula API integration service
 * Handles data retrieval from Aula API and transformation
 */

import { AulaAPIClient } from 'aula-apiclient-ts';
import { AulaDataCollection, DataRetrievalConfig } from './types';
import {
  transformThread,
  transformPost,
  capitalizeKeys,
} from './data-transformers';
import { logInfo, logError, AulaAPIError } from './utils';

/**
 * Service class for retrieving and transforming Aula data
 */
export class AulaDataService {
  constructor(private readonly aulaClient: AulaAPIClient) {}

  /**
   * Retrieves all current information from Aula API
   * Fetches threads, posts, calendar events, daily overview, gallery albums, and MeeBook data
   */
  async retrieveCurrentInformation(config: DataRetrievalConfig): Promise<AulaDataCollection> {
    logInfo('Retrieving Aula information...', {
      threadMessagesDays: config.threadMessagesDays,
      postsDays: config.postsDays,
      calendarEventsPast: config.calendarEventsPast,
      calendarEventsFuture: config.calendarEventsFuture,
      galleryDays: config.galleryDays,
    });

    try {
      // Fetch all data in parallel for better performance
      const [
        rawThreads,
        rawPosts,
        rawCalendarEvents,
        rawDailyOverview,
        rawGalleryAlbums,
        meeBookInfo,
      ] = await Promise.all([
        this.fetchThreads(config.threadMessagesDays),
        this.fetchPosts(config.postsDays),
        this.fetchCalendarEvents(config.calendarEventsPast, config.calendarEventsFuture),
        this.fetchDailyOverview(),
        this.fetchGalleryAlbums(config.galleryDays),
        this.fetchMeeBookInfo(),
      ]);

      // Transform threads
      const threads = rawThreads.map((thread: any) => transformThread(thread));

      // Transform posts
      const posts = rawPosts.map((post: any) => transformPost(post));

      // Transform calendar events
      const calendarEvents = capitalizeKeys(rawCalendarEvents);

      // Transform daily overview
      const dailyOverview = capitalizeKeys(rawDailyOverview);

      // Transform gallery albums
      const galleryAlbums = capitalizeKeys(rawGalleryAlbums);

      logInfo('Successfully retrieved and transformed all Aula data');

      return {
        Aula: {
          Overview: { Overviews: dailyOverview },
          Messages: { Threads: threads },
          Calendar: { CalendarEvents: calendarEvents },
          Posts: { Posts: posts },
          Gallery: { Albums: galleryAlbums },
        },
        MeeBook: {
          WorkPlan: { Weeks: capitalizeKeys(meeBookInfo.workPlan) },
          BookList: { Weeks: capitalizeKeys(meeBookInfo.bookList) },
        },
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logError('Error retrieving Aula information', { error: errorMessage });
      throw new AulaAPIError('Failed to retrieve data from Aula API', { originalError: errorMessage });
    }
  }

  /**
   * Fetches thread messages from the past N days
   */
  private async fetchThreads(days: number): Promise<any[]> {
    logInfo(`Fetching threads from past ${days} days`);
    return await this.aulaClient.GetAulaThreads(days);
  }

  /**
   * Fetches posts from the past N days
   */
  private async fetchPosts(days: number): Promise<any[]> {
    logInfo(`Fetching posts from past ${days} days`);
    return await this.aulaClient.GetPosts(days);
  }

  /**
   * Fetches calendar events within date range
   */
  private async fetchCalendarEvents(pastDays: number, futureDays: number): Promise<any[]> {
    logInfo(`Fetching calendar events (${pastDays} days past, ${futureDays} days future)`);
    return await this.aulaClient.GetCalendarEvents(pastDays, futureDays);
  }

  /**
   * Fetches daily overview for current child
   */
  private async fetchDailyOverview(): Promise<any> {
    logInfo('Fetching daily overview');
    const childId = this.aulaClient.CurrentChild?.id;
    if (!childId) {
      throw new AulaAPIError('No current child found in Aula client');
    }
    return await this.aulaClient.GetDailyOverview(childId);
  }

  /**
   * Fetches gallery albums from the past N days
   */
  private async fetchGalleryAlbums(days: number): Promise<any[]> {
    logInfo(`Fetching gallery albums from past ${days} days`);
    // Parameters: take, skip, institutionProfileId, daysBack
    return await this.aulaClient.GetGalleryAlbumMedia(12, 30, undefined, days);
  }

  /**
   * Fetches MeeBook information (work plan and book list)
   */
  private async fetchMeeBookInfo(): Promise<{ workPlan: any; bookList: any }> {
    logInfo('Fetching MeeBook information');
    return await this.aulaClient.getMeeBookInformation();
  }
}
