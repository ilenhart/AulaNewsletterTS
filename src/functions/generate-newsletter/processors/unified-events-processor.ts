/**
 * Unified Events Processor
 * Combines events from ALL sources for newsletter generation:
 * - RAW_calendarEvents (official calendar - high confidence)
 * - DERIVED_EVENTS_FromPosts (AI-extracted and deduplicated in Phase 1.5)
 * - DERIVED_EVENTS_FromMessages (AI-extracted and deduplicated in Phase 1.5)
 *
 * NOTE: Semantic deduplication happens in Phase 1.5 (BulkEventExtractionService)
 * This processor simply formats and summarizes the already-deduplicated events
 */

import { BedrockService } from '../services/bedrock-service';
import { BedrockPrompts } from '../services/bedrock-prompts';
import {
  AulaCalendarEvent,
  DerivedEventExtracted,
  UnifiedEvent,
} from '../../../common/types';
import { logInfo, logWarn, logError, extractJsonFromLLMResponse } from '../../../common/utils';

export interface ProcessedUnifiedEvents {
  summary: string;
  totalEvents: number;
  calendarEvents: number;
  derivedEvents: number;
  deduplicatedEvents: number;
}

/**
 * Processes and deduplicates events from all sources for newsletter
 */
export class UnifiedEventsProcessor {
  private readonly prompts: BedrockPrompts;

  constructor(
    private readonly bedrockService: BedrockService,
    promptContext: {
      parentNames: string;
      childName: string;
      messageFamilyNames: string;
    }
  ) {
    this.prompts = new BedrockPrompts(promptContext);
  }

  /**
   * Process all events from all sources (deduplication already done in Phase 1.5)
   */
  async processAllEvents(
    calendarEvents: AulaCalendarEvent[],
    derivedFromPosts: DerivedEventExtracted[],
    derivedFromMessages: DerivedEventExtracted[]
  ): Promise<ProcessedUnifiedEvents> {
    logInfo('Processing unified events from all sources', {
      calendarEvents: calendarEvents.length,
      derivedFromPosts: derivedFromPosts.length,
      derivedFromMessages: derivedFromMessages.length,
    });

    // STEP 1: Convert all events to unified format
    const unifiedCalendarEvents = this.convertCalendarEvents(calendarEvents);
    const unifiedDerivedPosts = this.convertDerivedEvents(derivedFromPosts, 'derived_post');
    const unifiedDerivedMessages = this.convertDerivedEvents(
      derivedFromMessages,
      'derived_message'
    );

    const allUnifiedEvents = [
      ...unifiedCalendarEvents,
      ...unifiedDerivedPosts,
      ...unifiedDerivedMessages,
    ];

    if (allUnifiedEvents.length === 0) {
      return {
        summary: 'No upcoming events found.',
        totalEvents: 0,
        calendarEvents: 0,
        derivedEvents: 0,
        deduplicatedEvents: 0,
      };
    }

    logInfo(`Total events (already deduplicated in Phase 1.5): ${allUnifiedEvents.length}`);

    // STEP 2: REMOVED - AI deduplication now happens in Phase 1.5 (BulkEventExtractionService)
    // Events from DERIVED_EVENTS tables are already semantically deduplicated
    // Just use the events as-is without redundant Bedrock calls
    const deduplicatedEvents = allUnifiedEvents;

    // STEP 3: Generate parent-friendly summary
    const summary = await this.generateSummary(deduplicatedEvents);

    return {
      summary,
      totalEvents: allUnifiedEvents.length,
      calendarEvents: calendarEvents.length,
      derivedEvents: derivedFromPosts.length + derivedFromMessages.length,
      deduplicatedEvents: deduplicatedEvents.length,
    };
  }

  /**
   * Convert calendar events to unified format
   */
  private convertCalendarEvents(events: AulaCalendarEvent[]): UnifiedEvent[] {
    return events.map((event) => ({
      EventTitle: event.Title,
      EventDescription: event.PrimaryResourceText || event.Title,
      EventDate: event.StartDate,
      EventTime: this.extractTimeFromDate(event.StartDate),
      EventLocation: '',
      EventType: event.Type || 'calendar',
      SourceType: 'calendar' as const,
      SourceConfidence: 'high' as const,
      SourceIds: [`calendar-${event.Id}`],
      CalendarEventId: event.Id,
      CreatorName: event.CreatorName,
      StartDate: event.StartDate,
      EndDate: event.EndDate,
    }));
  }

  /**
   * Convert derived events to unified format
   */
  private convertDerivedEvents(
    events: DerivedEventExtracted[],
    sourceType: 'derived_post' | 'derived_message'
  ): UnifiedEvent[] {
    return events.map((event) => {
      // Collect all source IDs
      const sourceIds: string[] = [];
      if (event.SourcePostIds && event.SourcePostIds.length > 0) {
        sourceIds.push(...event.SourcePostIds.map((id) => `post-${id}`));
      }
      if (event.SourceMessageIds && event.SourceMessageIds.length > 0) {
        sourceIds.push(...event.SourceMessageIds.map((id) => `message-${id}`));
      }

      return {
        EventTitle: event.EventTitle,
        EventDescription: event.EventDescription,
        EventDate: event.EventDate,
        EventTime: event.EventTime,
        EventLocation: event.EventLocation,
        EventType: event.EventType,
        SourceType: sourceType,
        SourceConfidence: event.Confidence || 'medium',
        SourceIds: sourceIds.length > 0 ? sourceIds : [`derived-${event.Id}`],
        DerivedEventId: event.Id,
        ExtractedFrom: sourceIds,
        UpdateCount: event.UpdateCount,
      };
    });
  }

  /**
   * Use Bedrock AI to intelligently deduplicate events
   */
  private async deduplicateEventsWithAI(events: UnifiedEvent[]): Promise<UnifiedEvent[]> {
    if (events.length === 0) {
      return [];
    }

    if (events.length === 1) {
      // No deduplication needed
      return events;
    }

    try {
      // Prepare simplified event data for the prompt
      const simplifiedEvents = events.map((e) => ({
        EventTitle: e.EventTitle,
        EventDescription: e.EventDescription,
        EventDate: e.EventDate,
        EventTime: e.EventTime,
        EventLocation: e.EventLocation,
        EventType: e.EventType,
        SourceType: e.SourceType,
        SourceConfidence: e.SourceConfidence,
        SourceIds: e.SourceIds,
      }));

      const prompt = this.prompts.getNewsletterEventDeduplicationPrompt(simplifiedEvents);
      const response = await this.bedrockService.invoke(prompt);

      // Parse AI response
      const deduplicatedData = this.parseDeduplicationResponse(response);

      logInfo('AI deduplication complete', {
        inputEvents: events.length,
        outputEvents: deduplicatedData.length,
      });

      // Convert deduplicated data back to UnifiedEvent format
      // Map merged events back to their original data
      return deduplicatedData.map((merged) => {
        // Find original events that contributed to this merged event
        const contributors = events.filter(
          (e) =>
            this.normalizeDate(e.EventDate) === this.normalizeDate(merged.EventDate) &&
            this.isSimilarTitle(e.EventTitle, merged.EventTitle)
        );

        // Combine source IDs from all contributors
        const allSourceIds = contributors.flatMap((c) => c.SourceIds);
        const uniqueSourceIds = Array.from(new Set(allSourceIds));

        // Determine highest confidence
        const highestConfidence =
          contributors.some((c) => c.SourceConfidence === 'high')
            ? 'high'
            : contributors.some((c) => c.SourceConfidence === 'medium')
            ? 'medium'
            : 'low';

        // Prefer calendar source type if any contributor is calendar
        const sourceType = contributors.some((c) => c.SourceType === 'calendar')
          ? 'calendar'
          : contributors[0]?.SourceType || 'derived_post';

        return {
          EventTitle: merged.EventTitle,
          EventDescription: merged.EventDescription,
          EventDate: merged.EventDate,
          EventTime: merged.EventTime,
          EventLocation: merged.EventLocation,
          EventType: merged.EventType,
          SourceType: sourceType as 'calendar' | 'derived_post' | 'derived_message',
          SourceConfidence: highestConfidence as 'high' | 'medium' | 'low',
          SourceIds: uniqueSourceIds,
          MergedFrom: merged.MergedFromIds,
        };
      });
    } catch (error) {
      logError('Failed to deduplicate events with AI, returning originals', {
        error: error instanceof Error ? error.message : String(error),
      });
      // Fall back to returning original events if AI deduplication fails
      return events;
    }
  }

  /**
   * Generate parent-friendly summary from deduplicated events
   */
  private async generateSummary(events: UnifiedEvent[]): Promise<string> {
    if (events.length === 0) {
      return 'No upcoming events scheduled.';
    }

    // Build comprehensive event listing
    let eventsText = `We have ${events.length} upcoming event(s):\n\n`;

    events.forEach((event, index) => {
      eventsText += `Event ${index + 1}: ${event.EventTitle}\n`;
      eventsText += `Date: ${event.EventDate}\n`;

      if (event.EventTime) {
        eventsText += `Time: ${event.EventTime}\n`;
      }

      if (event.EventLocation) {
        eventsText += `Location: ${event.EventLocation}\n`;
      }

      eventsText += `Description: ${event.EventDescription}\n`;

      // Source information
      const sourceLabel =
        event.SourceType === 'calendar'
          ? 'Official Calendar'
          : event.SourceType === 'derived_post'
          ? 'Mentioned in Post'
          : 'Mentioned in Message';
      eventsText += `Source: ${sourceLabel} (Confidence: ${event.SourceConfidence})\n`;

      if (event.SourceIds.length > 1) {
        eventsText += `Multiple sources: ${event.SourceIds.length} mentions\n`;
      }

      eventsText += '\n';
    });

    // Generate summary using Bedrock
    const instructions = this.prompts.getDerivedEventsInstructions();
    const summary = await this.bedrockService.summarize(eventsText, instructions);

    return summary;
  }

  /**
   * Extract time from ISO date string
   */
  private extractTimeFromDate(dateString: string): string | undefined {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return undefined;
      }

      const hours = date.getHours();
      const minutes = date.getMinutes();

      // Only return time if it's not midnight (00:00)
      if (hours === 0 && minutes === 0) {
        return undefined;
      }

      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    } catch {
      return undefined;
    }
  }

  /**
   * Parse AI deduplication response using robust extraction
   */
  private parseDeduplicationResponse(response: string): any[] {
    const parsed = extractJsonFromLLMResponse<any>(response, 'event deduplication');

    if (!parsed) {
      return [];
    }

    if (!Array.isArray(parsed)) {
      logWarn('AI did not return array for deduplication', { parsed });
      return [];
    }

    return parsed;
  }

  /**
   * Normalize date for comparison
   */
  private normalizeDate(dateString: string): string {
    if (!dateString) return '';

    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
        return dateString;
      }

      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }

      return dateString;
    } catch {
      return dateString;
    }
  }

  /**
   * Check if two titles are similar (basic heuristic for fallback matching)
   */
  private isSimilarTitle(title1: string, title2: string): boolean {
    const normalize = (s: string) => s.toLowerCase().trim();
    const n1 = normalize(title1);
    const n2 = normalize(title2);

    // Exact match
    if (n1 === n2) return true;

    // One contains the other (handles "Zoo Trip" vs "Trip to Zoo")
    if (n1.includes(n2) || n2.includes(n1)) return true;

    return false;
  }
}
