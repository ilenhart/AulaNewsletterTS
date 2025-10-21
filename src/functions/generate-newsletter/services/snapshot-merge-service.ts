/**
 * Snapshot Merge Service
 * Handles merging previous newsletter snapshots with new data
 * Implements smart filtering and deduplication
 */

import {
  NewsletterSnapshot,
  NewsletterStructure,
  NewsletterEvent,
  NewsletterImportantInfo,
} from '../../../common/types';
import { logInfo } from '../../../common/utils';

export class SnapshotMergeService {
  /**
   * Merge previous snapshot with new newsletter data
   * Phase 2: Smart merging for all sections with expiration rules
   * @param previousSnapshot - Yesterday's newsletter snapshot
   * @param newNewsletter - Newly generated newsletter structure
   * @param today - Current date
   * @param incrementalMode - If true, use expiration rules; if false, replace all sections
   * @returns Merged newsletter structure
   */
  mergeSnapshots(
    previousSnapshot: NewsletterSnapshot | null,
    newNewsletter: NewsletterStructure,
    today: Date,
    incrementalMode: boolean = true
  ): NewsletterStructure {
    if (!previousSnapshot) {
      logInfo('No previous snapshot found, returning new newsletter as-is');
      // Add timestamps to new items
      return this.addTimestampsToNewItems(newNewsletter, today);
    }

    if (!incrementalMode) {
      logInfo('Full mode: Returning new newsletter without merging');
      return this.addTimestampsToNewItems(newNewsletter, today);
    }

    logInfo('Incremental mode: Merging previous snapshot with new newsletter data');

    const merged: NewsletterStructure = {
      // Phase 2: Merge with expiration rules
      importantInformation: this.mergeImportantInfo(
        previousSnapshot.NewsletterJson.importantInformation,
        newNewsletter.importantInformation,
        today
      ),

      // Phase 2: Merge reminders with expiration
      generalReminders: this.mergeReminders(
        previousSnapshot.NewsletterJson.generalReminders,
        newNewsletter.generalReminders,
        today
      ),

      // CRITICAL: Merge and filter upcoming events
      upcomingEvents: this.mergeEvents(
        previousSnapshot.NewsletterJson.upcomingEvents,
        newNewsletter.upcomingEvents,
        today
      ),

      // Phase 2: Rolling window for highlights (last 7 days)
      weeklyHighlights: [...newNewsletter.weeklyHighlights].slice(0, 10),

      // Phase 2: Only show NEW thread summaries (not accumulated)
      threadSummaries: newNewsletter.threadSummaries,
    };

    logInfo('Snapshot merge complete', {
      importantInfo: {
        previous: previousSnapshot.NewsletterJson.importantInformation.length,
        new: newNewsletter.importantInformation.length,
        merged: merged.importantInformation.length,
      },
      events: {
        previous: previousSnapshot.NewsletterJson.upcomingEvents.length,
        new: newNewsletter.upcomingEvents.length,
        merged: merged.upcomingEvents.length,
      },
      reminders: {
        previous: previousSnapshot.NewsletterJson.generalReminders.length,
        new: newNewsletter.generalReminders.length,
        merged: merged.generalReminders.length,
      },
    });

    return merged;
  }

  /**
   * Add timestamps to new items for expiration tracking
   * Phase 3: Also mark all items as "new" on first generation
   */
  private addTimestampsToNewItems(
    newsletter: NewsletterStructure,
    today: Date
  ): NewsletterStructure {
    const nowISO = today.toISOString();

    return {
      ...newsletter,
      importantInformation: newsletter.importantInformation.map(item => ({
        ...item,
        createdAt: item.createdAt || nowISO,
        isNew: true, // Phase 3: Everything is new on first run
      })),
      upcomingEvents: newsletter.upcomingEvents.map(event => ({
        ...event,
        isNew: true, // Phase 3: All events are new
      })),
    };
  }

  /**
   * Merge important information with expiration rules
   * Phase 2: Different expiration times based on type
   * Phase 3: Mark new items with isNew flag
   */
  private mergeImportantInfo(
    previous: NewsletterImportantInfo[],
    newItems: NewsletterImportantInfo[],
    today: Date
  ): NewsletterImportantInfo[] {
    const nowISO = today.toISOString();

    // Phase 3: Create a set of previous item descriptions for "new" detection
    const previousDescriptions = new Set(
      previous.map(item => item.description.toLowerCase().trim())
    );

    // Add timestamps to new items and mark truly new ones
    const newWithTimestamps = newItems.map(item => {
      const normalized = item.description.toLowerCase().trim();
      const isNew = !previousDescriptions.has(normalized);

      return {
        ...item,
        createdAt: item.createdAt || nowISO,
        isNew, // Phase 3: Mark if this is genuinely new
      };
    });

    // Mark previous items as NOT new
    const previousWithFlags = previous.map(item => ({
      ...item,
      isNew: false,
    }));

    // Combine and filter by expiration rules
    const combined = [...previousWithFlags, ...newWithTimestamps];

    const filtered = combined.filter(item => {
      const createdAt = new Date(item.createdAt || nowISO);
      const daysSinceCreated = this.daysBetween(createdAt, today);

      // Expiration rules by type
      switch (item.type) {
        case 'health_alert':
          return daysSinceCreated <= 7; // Show for 7 days
        case 'family_mention':
          return daysSinceCreated <= 14; // Show for 2 weeks
        case 'deadline':
          // Show until deadline passes
          if (item.deadline) {
            const deadlineDate = new Date(item.deadline);
            return deadlineDate >= today;
          }
          return daysSinceCreated <= 7; // Default: 7 days
        case 'policy_change':
          return daysSinceCreated <= 30; // Show for 1 month
        case 'urgent_request':
          return daysSinceCreated <= 3; // Show for 3 days
        default:
          return daysSinceCreated <= 7; // Default: 7 days
      }
    });

    // Deduplicate by description
    const seen = new Set<string>();
    return filtered.filter(item => {
      const normalized = item.description.toLowerCase().trim();
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
  }

  /**
   * Merge general reminders with simple deduplication
   * Phase 2: Keep unique reminders, no expiration (they're time-bound by nature)
   */
  private mergeReminders(
    previous: string[],
    newReminders: string[],
    today: Date
  ): string[] {
    // Combine all reminders
    const combined = [...previous, ...newReminders];

    // Deduplicate
    const seen = new Set<string>();
    const unique = combined.filter(reminder => {
      const normalized = reminder.toLowerCase().trim();
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });

    // Limit to most recent 20 reminders
    return unique.slice(-20);
  }

  /**
   * Calculate days between two dates
   */
  private daysBetween(date1: Date, date2: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24;
    const diffMs = date2.getTime() - date1.getTime();
    return Math.floor(diffMs / msPerDay);
  }

  /**
   * Merge events from previous snapshot with new events
   * Phase 3: Detect changes and mark new/updated events
   * CRITICAL FIX: Filter past events BEFORE merging to prevent carrying forward old events
   * - Remove past events from BOTH lists first
   * - Combine only upcoming events
   * - Deduplicate based on title and date
   * - Detect changes (time, location, description updates)
   * @param previousEvents - Events from yesterday's snapshot
   * @param newEvents - Newly extracted events
   * @param today - Current date
   * @returns Merged and filtered event list
   */
  private mergeEvents(
    previousEvents: NewsletterEvent[],
    newEvents: NewsletterEvent[],
    today: Date
  ): NewsletterEvent[] {
    // CRITICAL FIX: Filter past events BEFORE merging
    // This prevents past events from yesterday's snapshot from being carried forward
    logInfo('Filtering past events before merging', {
      previousCount: previousEvents.length,
      newCount: newEvents.length,
    });

    const previousFiltered = this.filterPastEvents(previousEvents, today, false);
    const newFiltered = this.filterPastEvents(newEvents, today, false);

    logInfo('Past events filtered', {
      previousRemaining: previousFiltered.length,
      previousFiltered: previousEvents.length - previousFiltered.length,
      newRemaining: newFiltered.length,
      newFiltered: newEvents.length - newFiltered.length,
    });

    // Phase 3: Mark previous events as NOT new (only upcoming events from previous snapshot)
    const previousWithFlags = previousFiltered.map(e => ({
      ...e,
      isNew: false,
      isUpdated: false,
    }));

    // Phase 3: Detect which new events are truly new vs updates
    const newWithChangeDetection = newFiltered.map(newEvent => {
      const existing = this.findMatchingEvent(previousWithFlags, newEvent);

      if (!existing) {
        // Truly new event
        return {
          ...newEvent,
          isNew: true,
          isUpdated: false,
        };
      } else {
        // Event exists - check for changes
        const changes = this.detectEventChanges(existing, newEvent);
        return {
          ...newEvent,
          isNew: false,
          isUpdated: changes.length > 0,
          changes: changes.length > 0 ? changes : undefined,
        };
      }
    });

    // Combine only upcoming events
    const allEvents = [...previousWithFlags, ...newWithChangeDetection];

    // Deduplicate by title and date (keeps the version with most info)
    const deduplicated = this.deduplicateEvents(allEvents);

    // Sort by date (earliest first)
    deduplicated.sort((a, b) => {
      const dateA = this.parseEventDate(a.date);
      const dateB = this.parseEventDate(b.date);
      return dateA.getTime() - dateB.getTime();
    });

    return deduplicated;
  }

  /**
   * Find a matching event by title and date
   * Phase 3 helper
   */
  private findMatchingEvent(
    events: NewsletterEvent[],
    target: NewsletterEvent
  ): NewsletterEvent | undefined {
    const targetKey = `${this.normalizeTitle(target.title)}_${target.date}`;
    return events.find(e => {
      const key = `${this.normalizeTitle(e.title)}_${e.date}`;
      return key === targetKey;
    });
  }

  /**
   * Detect changes between two versions of the same event
   * Phase 3: Returns array of change descriptions
   */
  private detectEventChanges(
    oldEvent: NewsletterEvent,
    newEvent: NewsletterEvent
  ): string[] {
    const changes: string[] = [];

    // Time changed
    if (oldEvent.time !== newEvent.time) {
      if (oldEvent.time && newEvent.time) {
        changes.push(`Time changed from ${oldEvent.time} to ${newEvent.time}`);
      } else if (!oldEvent.time && newEvent.time) {
        changes.push(`Time added: ${newEvent.time}`);
      } else if (oldEvent.time && !newEvent.time) {
        changes.push(`Time removed (was ${oldEvent.time})`);
      }
    }

    // Location changed
    if (oldEvent.location !== newEvent.location) {
      if (oldEvent.location && newEvent.location) {
        changes.push(`Location changed from "${oldEvent.location}" to "${newEvent.location}"`);
      } else if (!oldEvent.location && newEvent.location) {
        changes.push(`Location added: ${newEvent.location}`);
      }
    }

    // Description changed significantly (more than 20% different)
    if (oldEvent.description && newEvent.description) {
      const oldNorm = oldEvent.description.toLowerCase().trim();
      const newNorm = newEvent.description.toLowerCase().trim();
      if (oldNorm !== newNorm && !oldNorm.includes(newNorm) && !newNorm.includes(oldNorm)) {
        changes.push('Description updated');
      }
    }

    // Requirements changed
    const oldReqs = oldEvent.requirements?.join(',') || '';
    const newReqs = newEvent.requirements?.join(',') || '';
    if (oldReqs !== newReqs && newEvent.requirements && newEvent.requirements.length > 0) {
      changes.push('Requirements updated');
    }

    return changes;
  }

  /**
   * Filter out events that have already passed
   * HYBRID APPROACH:
   * - Events with time: Filter if date-time has passed
   * - Events without time: Filter if date is today or past (conservative - assume past)
   * @param events - List of events
   * @param now - Current date-time
   * @param includeTodayIfNoTime - If true, include all-day events from today (default: false)
   * @returns Events that are in the future
   */
  private filterPastEvents(
    events: NewsletterEvent[],
    now: Date,
    includeTodayIfNoTime: boolean = false
  ): NewsletterEvent[] {
    const nowTimestamp = now.getTime();
    const todayDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    return events.filter((event) => {
      try {
        const eventDate = this.parseEventDate(event.date);

        if (event.time) {
          // Event has specific time - parse full date-time and compare
          try {
            const eventDateTime = this.parseEventDateTime(event.date, event.time);
            const isUpcoming = eventDateTime.getTime() > nowTimestamp;

            if (!isUpcoming) {
              logInfo('Filtering past event with time', {
                eventTitle: event.title,
                eventDate: event.date,
                eventTime: event.time,
                eventDateTime: eventDateTime.toISOString(),
                now: now.toISOString(),
              });
            }

            return isUpcoming;
          } catch (timeParseError) {
            // If time parsing fails, fall back to date-only comparison
            logInfo('Could not parse event time, using date-only comparison', {
              eventTitle: event.title,
              eventTime: event.time,
            });
            const eventDateOnly = new Date(
              eventDate.getFullYear(),
              eventDate.getMonth(),
              eventDate.getDate()
            );
            return eventDateOnly > todayDateOnly;
          }
        } else {
          // Event has NO time - be conservative about filtering
          const eventDateOnly = new Date(
            eventDate.getFullYear(),
            eventDate.getMonth(),
            eventDate.getDate()
          );

          if (includeTodayIfNoTime) {
            // Keep events that are today or future
            const isUpcoming = eventDateOnly >= todayDateOnly;

            if (!isUpcoming) {
              logInfo('Filtering past all-day event', {
                eventTitle: event.title,
                eventDate: event.date,
              });
            }

            return isUpcoming;
          } else {
            // Only keep events in the FUTURE (not today)
            // Rationale: Without a time, we can't tell if it already happened today
            const isUpcoming = eventDateOnly > todayDateOnly;

            if (!isUpcoming) {
              logInfo('Filtering all-day event (today or past)', {
                eventTitle: event.title,
                eventDate: event.date,
                reason: eventDateOnly.getTime() === todayDateOnly.getTime() ? 'today-no-time' : 'past',
              });
            }

            return isUpcoming;
          }
        }
      } catch (error) {
        // If we can't parse the date, keep the event to be safe
        logInfo('Could not parse event date, keeping event', {
          eventTitle: event.title,
          eventDate: event.date,
          error: error instanceof Error ? error.message : String(error),
        });
        return true;
      }
    });
  }

  /**
   * Remove duplicate events based on title and date
   * If same title and date found, keep the one with more details
   * @param events - List of events
   * @returns Deduplicated event list
   */
  private deduplicateEvents(events: NewsletterEvent[]): NewsletterEvent[] {
    const seen = new Map<string, NewsletterEvent>();

    events.forEach((event) => {
      // Create a key based on normalized title and date
      const key = `${this.normalizeTitle(event.title)}_${event.date}`;

      const existing = seen.get(key);
      if (!existing) {
        seen.set(key, event);
      } else {
        // Keep the event with more complete information
        const newDetailsLength = this.calculateEventDetailsLength(event);
        const existingDetailsLength = this.calculateEventDetailsLength(existing);

        if (newDetailsLength > existingDetailsLength) {
          seen.set(key, event);
        }
      }
    });

    return Array.from(seen.values());
  }

  /**
   * Normalize event title for comparison
   * @param title - Event title
   * @returns Normalized title
   */
  private normalizeTitle(title: string | undefined): string {
    if (!title) {
      return '';
    }
    return title.toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Calculate how much detail an event has (for choosing which duplicate to keep)
   * @param event - Newsletter event
   * @returns Score representing completeness
   */
  private calculateEventDetailsLength(event: NewsletterEvent): number {
    let score = event.description?.length || 0;
    score += event.location ? 50 : 0;
    score += event.time ? 30 : 0;
    score += event.whoShouldAttend ? 40 : 0;
    score += (event.requirements?.length || 0) * 20;
    return score;
  }

  /**
   * Parse event date string to Date object
   * Handles multiple formats: YYYY-MM-DD, ISO timestamps, etc.
   * @param dateStr - Date string
   * @returns Parsed date
   */
  private parseEventDate(dateStr: string): Date {
    // Try ISO format first (YYYY-MM-DD or full ISO timestamp)
    const date = new Date(dateStr);

    if (isNaN(date.getTime())) {
      throw new Error(`Invalid date format: ${dateStr}`);
    }

    return date;
  }

  /**
   * Parse event date and time into a single Date object
   * Handles various time formats: "14:00", "2:00 PM", "14:00:00"
   * @param dateStr - Date string (YYYY-MM-DD)
   * @param timeStr - Time string (HH:MM or H:MM AM/PM)
   * @returns Parsed date-time
   */
  private parseEventDateTime(dateStr: string, timeStr: string): Date {
    const date = this.parseEventDate(dateStr);

    // Parse time string
    const timeLower = timeStr.toLowerCase().trim();
    let hours = 0;
    let minutes = 0;

    // Check for AM/PM format
    const isPM = timeLower.includes('pm');
    const isAM = timeLower.includes('am');

    // Remove AM/PM and extract numbers
    const timeOnly = timeLower.replace(/[ap]m/g, '').trim();
    const parts = timeOnly.split(':');

    if (parts.length >= 1) {
      hours = parseInt(parts[0], 10);
      if (parts.length >= 2) {
        minutes = parseInt(parts[1], 10);
      }
    }

    // Convert 12-hour to 24-hour format
    if (isPM && hours !== 12) {
      hours += 12;
    } else if (isAM && hours === 12) {
      hours = 0;
    }

    // Set the time on the date
    date.setHours(hours, minutes, 0, 0);

    return date;
  }
}
