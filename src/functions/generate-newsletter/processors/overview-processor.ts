/**
 * Daily overview processor
 * Processes and summarizes daily overviews
 */

import { AulaDailyOverview } from '../../../common/types';
import { BedrockService } from '../services/bedrock-service';
import { logInfo } from '../../../common/utils';

export interface ProcessedOverview {
  summary: string;
}

/**
 * Processes daily overviews: generates summary
 */
export class OverviewProcessor {
  constructor(private readonly bedrockService: BedrockService) {}

  /**
   * Processes daily overviews: generates summary
   */
  async process(overviews: AulaDailyOverview[], date: Date): Promise<ProcessedOverview> {
    if (overviews.length === 0) {
      return { summary: 'No daily overviews available for this date.' };
    }

    logInfo(`Processing ${overviews.length} daily overviews`);

    let overviewText = `Daily overviews for ${date.toLocaleDateString()}:\n\n`;
    overviews.forEach(overview => {
      overviewText += `Overview for ${overview.Date}:\n`;
      if (overview.Content) {
        overviewText += `${overview.Content}\n`;
      }
      overviewText += '\n';
    });

    // Generate summary
    const instructions = 'Summarize the daily overviews. These are brief descriptions of how the day went at school.';
    const summary = await this.bedrockService.summarize(overviewText, instructions);

    logInfo('Overview processing complete');
    return { summary };
  }
}
