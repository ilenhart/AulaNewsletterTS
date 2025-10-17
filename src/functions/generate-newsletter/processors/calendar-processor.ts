/**
 * Calendar event processor
 * Processes and summarizes calendar events
 */

import { AulaCalendarEvent } from '../../../common/types';
import { BedrockService } from '../services/bedrock-service';
import { logInfo } from '../../../common/utils';

export interface ProcessedCalendarEvents {
  summary: string;
}

/**
 * Processes calendar events: filters and summarizes
 */
export class CalendarProcessor {
  constructor(private readonly bedrockService: BedrockService) {}

  /**
   * Processes calendar events: generates summary excluding routine lessons
   */
  async process(events: AulaCalendarEvent[]): Promise<ProcessedCalendarEvents> {
    if (events.length === 0) {
      return { summary: 'No calendar events in this period.' };
    }

    logInfo(`Processing ${events.length} calendar events`);

    // Filter out routine lessons
    const lessonEvents = events.filter(e => e.Type === 'lesson');
    const importantEvents = events.filter(e => e.Type !== 'lesson');

    let eventsText = '';

    if (lessonEvents.length === events.length) {
      eventsText = `There were ${events.length} calendar events, but they are all only school lessons, so there is no need to describe them.`;
    } else {
      eventsText = `We have ${events.length} calendar events (${importantEvents.length} non-lesson events):\n\n`;
      importantEvents.forEach(event => {
        eventsText += `Event: ${event.Title}\n`;
        eventsText += `Creator: ${event.CreatorName}\n`;
        eventsText += `Type: ${event.Type}\n`;
        eventsText += `Start: ${event.StartDate}\n`;
        eventsText += `End: ${event.EndDate}\n`;
        if (event.PrimaryResourceText) {
          eventsText += `Details: ${event.PrimaryResourceText}\n`;
        }
        eventsText += '\n';
      });
    }

    // Generate summary
    const instructions = 'Summarize the important calendar events, excluding routine lessons. Focus on trips, meetings, and special events that parents should be aware of.';
    const summary = await this.bedrockService.summarize(eventsText, instructions);

    logInfo('Calendar processing complete');
    return { summary };
  }
}
