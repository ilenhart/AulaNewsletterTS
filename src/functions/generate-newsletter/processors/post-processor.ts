/**
 * Post processor
 * Processes and summarizes school posts
 */

import { AulaPost } from '../../../common/types';
import { BedrockService } from '../services/bedrock-service';
import { logInfo } from '../../../common/utils';

export interface ProcessedPosts {
  summary: string;
  translatedPosts: AulaPost[];
}

/**
 * Processes posts: translates and summarizes
 */
export class PostProcessor {
  constructor(private readonly bedrockService: BedrockService) {}

  /**
   * Processes posts: translates content and generates summary
   */
  async process(posts: AulaPost[]): Promise<ProcessedPosts> {
    if (posts.length === 0) {
      return { summary: 'No posts in this period.', translatedPosts: [] };
    }

    logInfo(`Processing ${posts.length} posts`);

    // Translate posts
    for (const post of posts) {
      const translatePrompt = `Post title: ${post.Title}\nPost content: ${post.Content}`;
      post.Content = await this.bedrockService.translate(translatePrompt);
    }

    // Build summary text
    let summaryText = `We have ${posts.length} posts:\n\n`;
    posts.forEach(post => {
      summaryText += `Post: ${post.Title}\n`;
      summaryText += `Author: ${post.Author} (${post.AuthorRole})\n`;
      summaryText += `Content: ${post.Content}\n`;
      summaryText += `Timestamp: ${post.Timestamp}\n\n`;
    });

    // Generate summary
    const instructions = 'Summarize these posts, highlighting important announcements, events, and action items.';
    const summary = await this.bedrockService.summarize(summaryText, instructions);

    logInfo('Post processing complete');
    return { summary, translatedPosts: posts };
  }
}
