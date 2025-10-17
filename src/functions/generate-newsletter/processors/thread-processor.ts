/**
 * Thread message processor
 * Processes and summarizes message threads
 */

import { AulaThread } from '../../../common/types';
import { BedrockService } from '../services/bedrock-service';
import { logInfo } from '../../../common/utils';

export interface ProcessedThreads {
  summary: string;
  translatedThreads: AulaThread[];
}

/**
 * Processes thread messages: translates and summarizes
 */
export class ThreadProcessor {
  constructor(private readonly bedrockService: BedrockService) {}

  /**
   * Processes threads: translates messages and generates summary
   */
  async process(threads: AulaThread[], today: Date): Promise<ProcessedThreads> {
    if (threads.length === 0) {
      return { summary: 'No thread messages in this period.', translatedThreads: [] };
    }

    logInfo(`Processing ${threads.length} threads`);

    // Translate individual messages
    for (const thread of threads) {
      for (const message of thread.Messages) {
        const context = `Today's date is ${today.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })} and the message was sent on ${message.SentDate}. ` +
          `The sender is ${message.Sender.FullName} (${message.Sender.Role}).`;

        message.MessageText = await this.bedrockService.translate(message.MessageText, context);
      }
    }

    // Build summary text
    let summaryText = `We have ${threads.length} message threads:\n\n`;
    threads.forEach(thread => {
      summaryText += `Thread: ${thread.Subject}\n`;
      thread.Messages.forEach(msg => {
        summaryText += `  - From ${msg.Sender.FullName}: ${msg.MessageText.substring(0, 300)}...\n`;
      });
      summaryText += '\n';
    });

    // Generate summary
    const instructions = 'Summarize these message threads, highlighting important information, action items, and anything mentioning our family names.';
    const summary = await this.bedrockService.summarize(summaryText, instructions);

    logInfo('Thread processing complete');
    return { summary, translatedThreads: threads };
  }
}
