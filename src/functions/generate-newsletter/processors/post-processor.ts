/**
 * Post processor
 * Processes and summarizes school posts (now using pre-translated PARSED data)
 */

import { AulaPost } from '../../../common/types';
import { BedrockService } from '../services/bedrock-service';
import { logInfo } from '../../../common/utils';

export interface ProcessedPosts {
  summary: string;
  translatedPosts: AulaPost[];
}

/**
 * Processes posts: generates summary from pre-translated content
 * NOTE: Posts are expected to already contain English translations from PARSED_posts
 */
export class PostProcessor {
  constructor(private readonly bedrockService: BedrockService) {}

  /**
   * Processes posts: generates summary from already-translated content
   * @param posts - Posts with content already translated to English
   */
  async process(posts: AulaPost[]): Promise<ProcessedPosts> {
    if (posts.length === 0) {
      return { summary: 'No posts in this period.', translatedPosts: [] };
    }

    logInfo(`Processing ${posts.length} posts (using pre-translated content)`);

    // Build summary text from already-translated posts
    let summaryText = `We have ${posts.length} posts:\n\n`;
    posts.forEach(post => {
      summaryText += `Post: ${post.Title}\n`;
      summaryText += `Author: ${post.Author} (${post.AuthorRole})\n`;
      summaryText += `Content: ${post.Content}\n`;  // Already in English from PARSED_posts
      summaryText += `Timestamp: ${post.Timestamp}\n\n`;
    });

    // Generate summary
    const instructions = 'Summarize these posts, highlighting important announcements, events, and action items.';
    const summary = await this.bedrockService.summarize(summaryText, instructions);

    logInfo('Post processing complete');
    return { summary, translatedPosts: posts };
  }
}
