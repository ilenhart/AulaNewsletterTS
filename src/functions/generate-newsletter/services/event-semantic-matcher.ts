/**
 * Event Semantic Matcher Service
 * Uses Bedrock AI to determine if two events are semantically the same
 * and to merge event information from multiple sources
 */

import { BedrockService } from './bedrock-service';
import { BedrockPrompts } from './bedrock-prompts';
import { DerivedEventExtracted, ExtractedEventCandidate } from '../../../common/types';
import { logInfo, logWarn, logError, extractJsonFromLLMResponse } from '../../../common/utils';

/**
 * Result of semantic comparison
 */
export interface EventComparisonResult {
  isSameEvent: boolean;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

/**
 * Result of event merging
 */
export interface EventMergeResult {
  EventTitle: string;
  EventDate: string;
  EventTime?: string;
  EventLocation?: string;
  EventDescription: string;
  EventType?: string;
  MergeNotes: string;
}

/**
 * Service for semantically matching and merging events
 */
export class EventSemanticMatcher {
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
   * Determine if a new event candidate matches an existing event
   * Uses Bedrock AI for semantic comparison
   */
  async areEventsTheSame(
    newEvent: ExtractedEventCandidate,
    existingEvent: DerivedEventExtracted
  ): Promise<EventComparisonResult> {
    try {
      const prompt = this.prompts.getEventComparisonPrompt(
        {
          EventTitle: newEvent.EventTitle,
          EventDescription: newEvent.EventDescription,
          EventDate: newEvent.EventDate,
          EventTime: newEvent.EventTime,
          EventLocation: newEvent.EventLocation,
          EventType: newEvent.EventType,
        },
        {
          EventTitle: existingEvent.EventTitle,
          EventDescription: existingEvent.EventDescription,
          EventDate: existingEvent.EventDate,
          EventTime: existingEvent.EventTime,
          EventLocation: existingEvent.EventLocation,
          EventType: existingEvent.EventType,
        }
      );

      const response = await this.bedrockService.invoke(prompt);

      // Parse JSON response
      const result = this.parseComparisonResponse(response);

      logInfo('Event comparison result', {
        newEventTitle: newEvent.EventTitle,
        existingEventTitle: existingEvent.EventTitle,
        isSameEvent: result.isSameEvent,
        confidence: result.confidence,
      });

      return result;
    } catch (error) {
      logError('Failed to compare events', {
        error: error instanceof Error ? error.message : String(error),
        newEventTitle: newEvent.EventTitle,
        existingEventTitle: existingEvent.EventTitle,
      });

      // Default to not same if comparison fails
      return {
        isSameEvent: false,
        confidence: 'low',
        reason: 'Comparison failed due to error',
      };
    }
  }

  /**
   * Merge information from a new event into an existing event
   * Uses Bedrock AI to intelligently combine information
   */
  async mergeEvents(
    existingEvent: DerivedEventExtracted,
    newEvent: ExtractedEventCandidate
  ): Promise<EventMergeResult> {
    try {
      const prompt = this.prompts.getEventMergingPrompt(
        {
          EventTitle: existingEvent.EventTitle,
          EventDescription: existingEvent.EventDescription,
          EventDate: existingEvent.EventDate,
          EventTime: existingEvent.EventTime,
          EventLocation: existingEvent.EventLocation,
          EventType: existingEvent.EventType,
          FirstMentionedAt: existingEvent.FirstMentionedAt,
          LastUpdatedAt: existingEvent.LastUpdatedAt,
        },
        {
          EventTitle: newEvent.EventTitle,
          EventDescription: newEvent.EventDescription,
          EventDate: newEvent.EventDate,
          EventTime: newEvent.EventTime,
          EventLocation: newEvent.EventLocation,
          EventType: newEvent.EventType,
        },
        newEvent.SourceTimestamp
      );

      const response = await this.bedrockService.invoke(prompt);

      // Parse JSON response
      const result = this.parseMergeResponse(response);

      logInfo('Event merge result', {
        eventId: existingEvent.Id,
        mergeNotes: result.MergeNotes,
      });

      return result;
    } catch (error) {
      logError('Failed to merge events', {
        error: error instanceof Error ? error.message : String(error),
        eventId: existingEvent.Id,
      });

      // Fall back to keeping existing event unchanged
      return {
        EventTitle: existingEvent.EventTitle,
        EventDate: existingEvent.EventDate,
        EventTime: existingEvent.EventTime,
        EventLocation: existingEvent.EventLocation,
        EventDescription: existingEvent.EventDescription,
        EventType: existingEvent.EventType,
        MergeNotes: 'Merge failed, kept original information',
      };
    }
  }

  /**
   * Parse comparison response from Bedrock
   */
  private parseComparisonResponse(response: string): EventComparisonResult {
    const parsed = extractJsonFromLLMResponse<any>(response, 'event comparison');

    if (!parsed) {
      return {
        isSameEvent: false,
        confidence: 'low',
        reason: 'Failed to parse AI response',
      };
    }

    // Validate required fields
    if (
      typeof parsed.isSameEvent !== 'boolean' ||
      !parsed.confidence ||
      !parsed.reason
    ) {
      logWarn('Invalid comparison response format', { parsed });
      return {
        isSameEvent: false,
        confidence: 'low',
        reason: 'Invalid response format',
      };
    }

    return {
      isSameEvent: parsed.isSameEvent,
      confidence: parsed.confidence,
      reason: parsed.reason,
    };
  }

  /**
   * Parse merge response from Bedrock
   */
  private parseMergeResponse(response: string): EventMergeResult {
    const parsed = extractJsonFromLLMResponse<any>(response, 'event merge');

    if (!parsed) {
      throw new Error('Failed to extract JSON from merge response');
    }

    // Validate required fields
    if (
      !parsed.EventTitle ||
      !parsed.EventDate ||
      !parsed.EventDescription ||
      !parsed.MergeNotes
    ) {
      logWarn('Invalid merge response format', { parsed });
      throw new Error('Invalid merge response format');
    }

    return {
      EventTitle: parsed.EventTitle,
      EventDate: parsed.EventDate,
      EventTime: parsed.EventTime || undefined,
      EventLocation: parsed.EventLocation || undefined,
      EventDescription: parsed.EventDescription,
      EventType: parsed.EventType || undefined,
      MergeNotes: parsed.MergeNotes,
    };
  }
}
