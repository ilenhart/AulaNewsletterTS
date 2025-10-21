/**
 * Reminder Condenser Service
 * Groups and condenses related reminders using AI to improve readability
 *
 * Example:
 * Input:
 *   - Bring a dish for the bingo event
 *   - Bring your own cutlery for the bingo event
 *
 * Output:
 *   - For the bingo event: Bring a dish and your own cutlery
 */

import { BedrockService } from './bedrock-service';
import { logInfo, logWarn } from '../../../common/utils';

export class ReminderCondenserService {
  // Minimum number of reminders to bother condensing (optimization)
  private static readonly MIN_REMINDERS_TO_CONDENSE = 3;

  constructor(private readonly bedrockService: BedrockService) {}

  /**
   * Condenses a string of reminders by grouping related items
   * @param rawReminders - Raw reminder text from important-info-processor
   * @returns Condensed reminder text with grouped items
   */
  async condenseReminders(rawReminders: string): Promise<string> {
    // Handle empty or "no reminders" cases
    if (!rawReminders || rawReminders.trim() === '') {
      return 'No general reminders to report.';
    }

    const trimmed = rawReminders.trim();
    if (trimmed.toLowerCase().includes('no general reminders')) {
      return trimmed;
    }

    // Parse reminders into array
    const reminders = this.parseReminders(trimmed);

    // If very few reminders, skip condensing (not worth the AI call)
    if (reminders.length < ReminderCondenserService.MIN_REMINDERS_TO_CONDENSE) {
      logInfo('Skipping reminder condensing - too few reminders', {
        count: reminders.length,
      });
      return rawReminders;
    }

    logInfo('Condensing reminders', {
      originalCount: reminders.length,
    });

    try {
      // Call Bedrock to group and condense
      const condensed = await this.groupAndCondenseWithAI(reminders);

      // Validate we got something back
      if (!condensed || condensed.trim() === '') {
        logWarn('Bedrock returned empty condensed reminders, using original');
        return rawReminders;
      }

      const condensedReminders = this.parseReminders(condensed);
      logInfo('Reminders condensed successfully', {
        originalCount: reminders.length,
        condensedCount: condensedReminders.length,
        reduction: `${Math.round(((reminders.length - condensedReminders.length) / reminders.length) * 100)}%`,
      });

      return condensed;
    } catch (error) {
      logWarn('Error condensing reminders, using original', {
        error: error instanceof Error ? error.message : String(error),
      });
      return rawReminders;
    }
  }

  /**
   * Parse reminder text into individual reminder items
   * Handles various formats:
   * - Bullet points with "- " or "• "
   * - Numbered lists "1. " or "1) "
   * - Lines starting with "Source:" are filtered out
   */
  private parseReminders(text: string): string[] {
    const lines = text.split('\n');
    const reminders: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) continue;

      // Skip source attribution lines
      if (trimmed.toLowerCase().startsWith('source:')) continue;

      // Remove common list markers
      let reminder = trimmed
        .replace(/^[-•]\s*/, '')           // Remove "- " or "• "
        .replace(/^\d+[.)]\s*/, '')        // Remove "1. " or "1) "
        .trim();

      // Remove trailing source attribution if present
      reminder = reminder.replace(/\s*\(Source:.*?\)\s*$/i, '').trim();

      if (reminder) {
        reminders.push(reminder);
      }
    }

    return reminders;
  }

  /**
   * Use Bedrock AI to intelligently group and condense reminders
   */
  private async groupAndCondenseWithAI(reminders: string[]): Promise<string> {
    // Build input text
    const inputText = reminders.map(r => `- ${r}`).join('\n');

    const instructions = `You are helping organize parent reminders for a school newsletter. Your goal is to make reminders clearer and less redundant by grouping related items.

TASK: Group related reminders together and condense them into clear, concise statements.

GROUPING RULES:
1. Group reminders about the SAME EVENT together (e.g., multiple items about "bingo event")
2. Group reminders about the SAME TOPIC together (e.g., multiple items about "no heat period")
3. Group reminders about the SAME TIMEFRAME together (e.g., multiple items for "next Monday")
4. Keep UNRELATED reminders separate

CONDENSING RULES:
1. Start with the context: "For the [event]:" or "During [period]:" or "For [timeframe]:"
2. List all action items in a natural, flowing sentence
3. Use "and" to connect related actions within the same sentence
4. Preserve ALL important details (dates, specific items, quantities, etc.)
5. Keep language clear, friendly, and parent-friendly
6. If a reminder stands alone (no related items), keep it as-is

OUTPUT FORMAT:
Return ONLY the condensed reminders, one per line, starting with "- "
Do NOT add explanations, headers, or extra commentary.

EXAMPLES:

Example 1 (Event-based grouping):
Input:
- Bring a dish for the shared buffet table before the bingo event
- Bring your own dishes, cutlery, kitchen roll, etc. for the bingo event

Output:
- For the bingo event: Bring a dish for the shared buffet table, and bring your own dishes, cutlery, kitchen roll, etc.

Example 2 (Topic-based grouping):
Input:
- Give your children warm clothes during the 14-day period with no heat from radiators
- Remember to provide indoor shoes or slippers for your children during the shoe-free period

Output:
- During the 14-day period with no heat from radiators: Give your children warm clothes and remember indoor shoes or slippers

Example 3 (Mixed - some group, some don't):
Input:
- Bring toilet paper rolls when returning to school next Monday
- Bring slippers when returning to school next Monday
- Label all children's clothing, especially jackets
- Sign and return the field trip permission form by Friday

Output:
- When returning to school next Monday: Bring toilet paper rolls and slippers
- Label all children's clothing, especially jackets
- Sign and return the field trip permission form by Friday

Now process these reminders:

${inputText}

Remember: Return ONLY the condensed reminders starting with "- ". No extra text.`;

    const condensed = await this.bedrockService.summarize(inputText, instructions);
    return condensed.trim();
  }
}
