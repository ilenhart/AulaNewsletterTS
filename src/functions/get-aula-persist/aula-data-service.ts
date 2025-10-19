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
import { AttachmentDownloadService } from './attachment-download-service';

/**
 * Service class for retrieving and transforming Aula data
 */
export class AulaDataService {
  constructor(
    private readonly aulaClient: AulaAPIClient,
    private readonly attachmentService?: AttachmentDownloadService
  ) {}

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

      // Transform gallery albums and fix null IDs
      const galleryAlbums = capitalizeKeys(rawGalleryAlbums).map((album: any, index: number) => {
        // Fix: Gallery albums can have Id: null for default "My Child" albums
        // DynamoDB requires a valid numeric Id, so we generate a synthetic negative ID
        if (album.Id === null || album.Id === undefined || album.Id === 0 || album.Id === -1) {
          logInfo(`Gallery album has null/invalid Id, generating synthetic Id`, {
            originalId: album.Id,
            syntheticId: -(index + 1),
            title: album.Title,
          });
          return {
            ...album,
            Id: -(index + 1), // Use negative IDs to avoid conflicts with real album IDs
            IsDefaultMyChildAlbum: true,
          };
        }
        return album;
      });

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
    const threads = await this.aulaClient.GetAulaThreads(days);

    // Download attachments from messages if attachment service is available
    if (this.attachmentService) {
      await this.downloadThreadAttachments(threads);
    }

    return threads;
  }

  /**
   * Fetches posts from the past N days
   */
  private async fetchPosts(days: number): Promise<any[]> {
    logInfo(`Fetching posts from past ${days} days`);
    const posts = await this.aulaClient.GetPosts(days);

    // Download attachments if attachment service is available
    if (this.attachmentService) {
      await this.downloadPostAttachments(posts);
    }

    return posts;
  }

  /**
   * Downloads attachments from all posts
   */
  private async downloadPostAttachments(posts: any[]): Promise<void> {
    logInfo(`Downloading attachments for ${posts.length} posts`);
    let totalAttachments = 0;

    for (const post of posts) {
      if (post.attachments && post.attachments.length > 0) {
        try {
          const metadata = await this.attachmentService!.downloadPostAttachments(
            post.id,
            post.attachments
          );
          totalAttachments += metadata.length;
        } catch (error) {
          logError(`Failed to download attachments for post ${post.id}`, {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    logInfo(`Downloaded ${totalAttachments} post attachments`);
  }

  /**
   * Downloads attachments from all thread messages
   */
  private async downloadThreadAttachments(threads: any[]): Promise<void> {
    logInfo(`Downloading attachments for ${threads.length} threads`);
    let totalAttachments = 0;

    for (const thread of threads) {
      if (thread.messages) {
        for (const message of thread.messages) {
          if (message.attachments && message.attachments.length > 0) {
            try {
              const metadata = await this.attachmentService!.downloadMessageAttachments(
                message.id,
                message.attachments
              );
              totalAttachments += metadata.length;
            } catch (error) {
              logError(`Failed to download attachments for message ${message.id}`, {
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }
      }
    }

    logInfo(`Downloaded ${totalAttachments} message attachments`);
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
