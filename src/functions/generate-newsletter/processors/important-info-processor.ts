/**
 * Important Information Processor
 * Extracts critical non-event information from posts and messages
 * Focuses on: health alerts, policy changes, deadlines, family mentions
 */

import { AulaPost, AulaThread } from '../../../common/types';
import { BedrockService } from '../services/bedrock-service';
import { logInfo } from '../../../common/utils';

export interface ProcessedImportantInfo {
  importantSummary: string;
  remindersSummary: string;
}

/**
 * Processes posts and messages to extract important non-event information
 * AND general reminders/actionable items
 */
export class ImportantInfoProcessor {
  constructor(private readonly bedrockService: BedrockService) {}

  /**
   * Processes posts and threads to identify important information AND general reminders
   * @param posts - Already translated posts
   * @param threads - Already translated message threads
   */
  async process(posts: AulaPost[], threads: AulaThread[]): Promise<ProcessedImportantInfo> {
    if (posts.length === 0 && threads.length === 0) {
      return {
        importantSummary: 'No important information to report.',
        remindersSummary: 'No general reminders to report.'
      };
    }

    logInfo(`Processing important info and reminders from ${posts.length} posts and ${threads.length} threads`);

    // Build content text from posts
    let contentText = `Extract important non-event information from the following school communications.\n\n`;
    contentText += `===== POSTS =====\n\n`;

    posts.forEach((post, index) => {
      contentText += `Post ${index + 1}:\n`;
      contentText += `Title: ${post.Title}\n`;
      contentText += `Content: ${post.Content}\n`;
      contentText += `Posted: ${post.CreatedTimestamp || post.Timestamp}\n`;
      contentText += `Author: ${post.Author || 'Unknown'}\n\n`;
    });

    // Add message threads
    contentText += `\n===== MESSAGE THREADS =====\n\n`;

    threads.forEach((thread, index) => {
      contentText += `Thread ${index + 1}:\n`;
      contentText += `Subject: ${thread.Subject}\n`;
      thread.Messages.forEach(msg => {
        const senderName = msg.Sender?.FullName || 'Unknown';
        const sentDate = msg.SentDate || 'Unknown date';
        contentText += `  - [${sentDate}] ${senderName}: ${msg.MessageText}\n`;
      });
      contentText += '\n';
    });

    // Process important info and reminders in parallel
    const [importantSummary, remindersSummary] = await Promise.all([
      this.extractImportantInfo(contentText),
      this.extractGeneralReminders(contentText),
    ]);

    logInfo('Important info and reminders processing complete');
    return { importantSummary, remindersSummary };
  }

  /**
   * Extract CRITICAL/IMPORTANT information only
   */
  private async extractImportantInfo(contentText: string): Promise<string> {
    const instructions = `Identify and extract IMPORTANT NON-EVENT information from these communications.

FOCUS ON (CRITICAL ITEMS ONLY):
1. Health Alerts:
   - Illness outbreaks (lice, flu, COVID, etc.)
   - Allergy warnings
   - Safety concerns
   - Medical requirements

2. Policy Changes:
   - New pickup/dropoff procedures
   - Schedule changes
   - Rule changes
   - Administrative updates

3. Deadlines (URGENT):
   - Permission slip due dates
   - Payment deadlines
   - Registration deadlines
   - Form submissions

4. Family Mentions:
   - Any specific mentions of children or family names
   - Awards, recognition, concerns
   - Behavior reports (positive or negative)

5. Urgent Requests:
   - Items needed ASAP
   - Immediate responses needed
   - Teacher concerns requiring immediate parent action

IGNORE:
- Future events (those will be in the events section)
- General reminders/requests (those are in a separate section)
- Routine daily activities
- Past activities/stories (those are weekly highlights)
- Non-urgent "bring this sometime" requests

For each important item found, provide:
- Type (health_alert, policy_change, deadline, family_mention, urgent_request)
- Description (clear and concise)
- Source (Post or Message thread)

Return format:
[Type]: [Description]. Source: [Post/Message]

Example output:
Health Alert: Check children for lice - several cases reported in the class. Source: Post from teacher
Deadline: Permission slips for museum trip due by Friday October 20th. Source: Message thread
Family Mention: Isaac praised for excellent reading progress this week. Source: Daily overview

If no critical items found, return: "No critical information to report."`;

    return await this.bedrockService.summarize(contentText, instructions);
  }

  /**
   * Extract GENERAL REMINDERS and actionable items (non-critical)
   */
  private async extractGeneralReminders(contentText: string): Promise<string> {
    const instructions = `Identify and extract GENERAL REMINDERS and ACTIONABLE ITEMS from these communications.

FOCUS ON (NON-CRITICAL ACTIONABLE ITEMS):
1. Things to Bring:
   - Items to bring to school (toilet paper, slippers, supplies, etc.)
   - Food/dishes to bring for events
   - Not urgent, but parents should remember
   - "Don't forget to bring X next Monday"
   - "Please send in Y when you can"
   - "Bring a dish for the dinner before the bingo event"

2. General Requests:
   - Non-urgent parent actions
   - Optional participation items
   - Suggestions or recommendations
   - "It would be nice if you could..."

3. Preparation Reminders:
   - What to prepare for upcoming activities
   - Clothing requirements for specific days
   - Items to pack for trips (not urgent deadlines)

4. General Notifications:
   - Informational items parents should be aware of
   - Changes that aren't urgent policy changes
   - General announcements with mild action implications

IMPORTANT NOTE ABOUT EVENTS:
- If the reminder is ABOUT or FOR an event (e.g., "bring a dish for the bingo event on Tuesday"), INCLUDE the reminder
- The event itself will be in the events section
- The reminder is the ACTIONABLE part for parents (what they need to do/bring)
- Example: "Bring a dish for the communal dinner before the bingo event on Tuesday" - this IS a reminder even though it mentions an event

IGNORE:
- Critical/urgent items (health alerts, urgent deadlines - those are in important info)
- Past activities/stories (those are weekly highlights)
- Things with no parent action needed

For each reminder found, provide a brief, friendly description.

Return format:
- [Description] (Source: [Post/Message])

Example output:
- Bring 20 toilet paper rolls and slippers when you return to school next Monday (Source: Message from teacher)
- Bring a dish for the communal dinner before the bingo event on Tuesday (Source: Post)
- Please send in extra snacks for the classroom pantry when you have a chance (Source: Post)
- Remember to label all children's clothing, especially jackets and hats (Source: Message thread)

If no general reminders found, return: "No general reminders to report."`;

    return await this.bedrockService.summarize(contentText, instructions);
  }
}
