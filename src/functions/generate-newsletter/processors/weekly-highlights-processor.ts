/**
 * Weekly Highlights Processor
 * Extracts stories and narratives about activities that happened during the week
 * Focus on: teacher summaries, activities children did, accomplishments
 */

import { AulaDailyOverview, AulaThread, AulaPost } from '../../../common/types';
import { BedrockService } from '../services/bedrock-service';
import { logInfo } from '../../../common/utils';

export interface ProcessedWeeklyHighlights {
  summary: string;
}

/**
 * Processes overviews, messages, and posts to extract weekly highlights and stories
 */
export class WeeklyHighlightsProcessor {
  constructor(private readonly bedrockService: BedrockService) {}

  /**
   * Processes data to extract stories about what children did this week
   * @param overviews - Daily overviews from the week
   * @param threads - Message threads (often contain teacher summaries)
   * @param posts - Posts (may contain recap information)
   */
  async process(
    overviews: AulaDailyOverview[],
    threads: AulaThread[],
    posts: AulaPost[]
  ): Promise<ProcessedWeeklyHighlights> {
    if (overviews.length === 0 && threads.length === 0 && posts.length === 0) {
      return { summary: 'No weekly highlights to report.' };
    }

    logInfo(
      `Processing weekly highlights from ${overviews.length} overviews, ${threads.length} threads, ${posts.length} posts`
    );

    // Build content text
    let contentText = `Extract stories and highlights about activities that happened this week.\n\n`;

    // Add daily overviews
    if (overviews.length > 0) {
      contentText += `===== DAILY OVERVIEWS =====\n\n`;
      overviews.forEach((overview, index) => {
        contentText += `Overview ${index + 1}:\n`;
        contentText += `Date: ${overview.Date}\n`;
        if (overview.Text) {
          contentText += `Text: ${overview.Text}\n`;
        }
        contentText += '\n';
      });
    }

    // Add message threads (teachers often send weekly summaries via messages)
    if (threads.length > 0) {
      contentText += `\n===== MESSAGE THREADS =====\n\n`;
      threads.forEach((thread, index) => {
        contentText += `Thread ${index + 1}:\n`;
        contentText += `Subject: ${thread.Subject}\n`;
        thread.Messages.forEach(msg => {
          const senderName = msg.Sender?.FullName || 'Unknown';
          const senderRole = msg.Sender?.Role || 'Unknown';
          const sentDate = msg.SentDate || 'Unknown date';
          // Look for teacher messages with summaries
          contentText += `  - [${sentDate}] ${senderName} (${senderRole}): ${msg.MessageText}\n`;
        });
        contentText += '\n';
      });
    }

    // Add posts (may contain recaps)
    if (posts.length > 0) {
      contentText += `\n===== POSTS =====\n\n`;
      posts.forEach((post, index) => {
        contentText += `Post ${index + 1}:\n`;
        contentText += `Title: ${post.Title}\n`;
        contentText += `Content: ${post.Content}\n`;
        contentText += `Posted: ${post.CreatedTimestamp}\n\n`;
      });
    }

    // Generate weekly highlights summary
    const instructions = `Extract stories and highlights about activities that happened this week.

FOCUS ON:
1. Teacher Summaries:
   - Weekly recaps from teachers (often sent on Fridays)
   - "This week we..." narratives
   - Observations about class activities

2. Activities Children Did:
   - Field trips or outings
   - Special projects (art, science, etc.)
   - Learning activities
   - Examples: "Explored butterflies near the lake", "Created self-portraits", "Learned about fractions"

3. Accomplishments:
   - Class achievements
   - Individual student progress
   - Completed projects

4. Interesting Moments:
   - Fun or noteworthy experiences
   - Teacher observations
   - Things that engaged the children

IGNORE:
- Future events (those belong in events section)
- Routine daily schedule ("We had math and reading")
- Important alerts or policy changes (those belong in important information)
- Deadlines or action items (those belong in important information)

OUTPUT FORMAT:
Return a list of 2-5 brief, parent-friendly narratives. Each should be 1-2 sentences describing what happened.

Examples:
- "The class explored butterflies near the lake on Wednesday - children were fascinated by the monarch migration patterns and sketched their observations"
- "Friday art project: Students created self-portraits using mixed media, showing great creativity and attention to detail"
- "This week's reading focus was on character development - the class discussed how characters change throughout stories"
- "Tuesday nature walk: Children collected leaves and learned to identify different tree species, creating a class nature journal"

If there are no meaningful stories or highlights, return:
"No specific weekly highlights to report this period."`;

    const summary = await this.bedrockService.summarize(contentText, instructions);

    logInfo('Weekly highlights processing complete');
    return { summary };
  }
}
