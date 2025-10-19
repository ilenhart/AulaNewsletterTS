/**
 * Thread message processor
 * Processes and summarizes message threads (now using pre-translated PARSED data)
 */

import { AulaThread } from '../../../common/types';
import { BedrockService } from '../services/bedrock-service';
import { logInfo } from '../../../common/utils';

export interface ProcessedThreads {
  summary: string;
  translatedThreads: AulaThread[];
}

/**
 * Processes thread messages: generates summary from pre-translated content
 * NOTE: Threads are expected to already contain English translations from PARSED_threadMessages
 */
export class ThreadProcessor {
  constructor(private readonly bedrockService: BedrockService) {}

  /**
   * Processes threads: generates summary with tone and outcome analysis
   * @param threads - Threads with messages already translated to English
   * @param today - Current date for context
   */
  async process(threads: AulaThread[], today: Date): Promise<ProcessedThreads> {
    if (threads.length === 0) {
      return { summary: 'No thread messages in this period.', translatedThreads: [] };
    }

    logInfo(`Processing ${threads.length} threads (using pre-translated content)`);

    // Build summary text from already-translated messages with full context
    let summaryText = `Analyze the following message threads and extract meaningful summaries.\n\n`;
    summaryText += `Today's date: ${today.toISOString().split('T')[0]}\n\n`;

    threads.forEach((thread, index) => {
      summaryText += `Thread ${index + 1}:\n`;
      summaryText += `Subject: ${thread.Subject}\n`;
      summaryText += `Messages:\n`;
      thread.Messages.forEach(msg => {
        const senderName = msg.Sender?.FullName || 'Unknown';
        const senderRole = msg.Sender?.Role || 'Unknown';
        const sentDate = msg.SentDate || 'Unknown date';
        summaryText += `  - [${sentDate}] ${senderName} (${senderRole}): ${msg.MessageText}\n`;
      });
      summaryText += '\n';
    });

    // Generate summary with tone and outcome analysis
    const instructions = `Analyze each thread and provide a structured summary.

For each thread, determine:
1. What the thread is about (topic and key points)
2. Any outcomes or decisions reached
3. The overall tone of the discussion

Tone categories:
- "happy": Positive, celebratory, grateful
- "friendly": Casual, supportive, collaborative
- "informational": Neutral, factual, announcement-style
- "concerned": Worried, seeking help, expressing concern
- "contentious": Disagreement, debate, conflicting views
- "urgent": Time-sensitive, requires immediate action

Focus on:
- Topics that have impact or require action
- Outcomes and decisions
- Skip simple "Thanks!" or "Sounds good" acknowledgments
- Highlight threads mentioning family names or important issues

Return a brief summary for each meaningful thread in this format:
[Thread Subject]: [What it's about and any outcomes]. Tone: [tone category]`;

    const summary = await this.bedrockService.summarize(summaryText, instructions);

    logInfo('Thread processing complete');
    return { summary, translatedThreads: threads };
  }
}
