/**
 * Derived events processor
 * Processes and summarizes AI-extracted events from posts and messages
 */

import { DerivedEventExtracted } from '../../../common/types';
import { BedrockService } from '../services/bedrock-service';
import { logInfo } from '../../../common/utils';

export interface ProcessedDerivedEvents {
  summary: string;
  eventCount: number;
}

/**
 * Processes derived events: generates summary of AI-extracted events
 */
export class DerivedEventsProcessor {
  constructor(private readonly bedrockService: BedrockService) {}

  /**
   * Processes derived events: generates parent-friendly summary
   * @param events - AI-extracted events from posts and messages (already in English)
   */
  async process(events: DerivedEventExtracted[]): Promise<ProcessedDerivedEvents> {
    if (events.length === 0) {
      return { summary: 'No derived events found in posts or messages.', eventCount: 0 };
    }

    logInfo(`Processing ${events.length} derived events`);

    // Build summary text from events
    let eventsText = `We found ${events.length} events mentioned in posts and messages:\n\n`;

    events.forEach((event, index) => {
      eventsText += `Event ${index + 1}: ${event.EventTitle}\n`;
      eventsText += `Description: ${event.EventDescription}\n`;
      eventsText += `Date: ${event.EventDate}\n`;

      if (event.EventTime) {
        eventsText += `Time: ${event.EventTime}\n`;
      }

      if (event.EventLocation) {
        eventsText += `Location: ${event.EventLocation}\n`;
      }

      if (event.EventType) {
        eventsText += `Type: ${event.EventType}\n`;
      }

      // Determine source type from which source arrays have data
      const sourceTypes = [];
      if (event.SourcePostIds && event.SourcePostIds.length > 0) {
        sourceTypes.push(`Post (ID: ${event.SourcePostIds.join(', ')})`);
      }
      if (event.SourceMessageIds && event.SourceMessageIds.length > 0) {
        sourceTypes.push(`Message (ID: ${event.SourceMessageIds.join(', ')})`);
      }
      if (sourceTypes.length > 0) {
        eventsText += `Sources: ${sourceTypes.join('; ')}\n`;
      }

      if (event.Confidence) {
        eventsText += `Confidence: ${event.Confidence}\n`;
      }

      if (event.UpdateCount > 0) {
        eventsText += `Updated ${event.UpdateCount} time(s) (last: ${event.LastUpdatedAt})\n`;
      }

      eventsText += '\n';
    });

    // Generate summary
    const instructions = `Summarize these events that were extracted from school communications.
Focus on upcoming events that parents should be aware of and prepare for.
Highlight any action items, deadlines, or things parents need to do or bring.
Group similar events together if appropriate.
IMPORTANT: Prioritize events happening soon (in the next few days).`;

    const summary = await this.bedrockService.summarize(eventsText, instructions);

    logInfo('Derived events processing complete');
    return { summary, eventCount: events.length };
  }
}
