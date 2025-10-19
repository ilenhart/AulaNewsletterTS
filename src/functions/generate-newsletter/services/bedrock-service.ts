/**
 * Bedrock AI service for translation and summarization
 * Now uses centralized BedrockPrompts for all prompt generation
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { logInfo, logError, BedrockError } from '../../../common/utils';
import { BedrockPrompts } from './bedrock-prompts';

/**
 * Service for AI translation and summarization using Amazon Bedrock
 */
export class BedrockService {
  private readonly prompts: BedrockPrompts;

  constructor(
    private readonly client: BedrockRuntimeClient,
    private readonly modelId: string,
    private readonly systemContext: {
      childName: string;
      parentNames: string;
      messageFamilyNames: string;
    }
  ) {
    // Initialize centralized prompts with context
    this.prompts = new BedrockPrompts({
      parentNames: systemContext.parentNames,
      childName: systemContext.childName,
      messageFamilyNames: systemContext.messageFamilyNames,
    });
  }

  /**
   * Generates system prompt with personalization context
   * Now delegated to centralized BedrockPrompts class
   */
  private generateSystemPrompt(): string {
    return this.prompts.getSystemPrompt();
  }

  /**
   * Invokes Claude model with a prompt
   */
  async invoke(prompt: string): Promise<string> {
    try {
      const command = new InvokeModelCommand({
        modelId: this.modelId,
        contentType: 'application/json',
        accept: 'application/json',
        body: JSON.stringify({
          anthropic_version: 'bedrock-2023-05-31',
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 4096,
        }),
      });

      const response = await this.client.send(command);
      const responseBody = new TextDecoder().decode(response.body);
      const parsed = JSON.parse(responseBody);
      return parsed.content?.[0]?.text || '';
    } catch (error) {
      logError('Error invoking Claude model', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new BedrockError('Failed to invoke Claude model', { originalError: error });
    }
  }

  /**
   * Removes common XML/HTML wrapper tags from AI responses
   * Sometimes Claude wraps responses in tags despite instructions not to
   */
  private stripWrapperTags(text: string): string {
    // Remove common wrapper tags like <translation>, <result>, <output>, etc.
    let cleaned = text.trim();

    // Remove opening and closing tags for common wrappers
    const wrapperPatterns = [
      /^<translation>\s*/i,
      /\s*<\/translation>$/i,
      /^<result>\s*/i,
      /\s*<\/result>$/i,
      /^<output>\s*/i,
      /\s*<\/output>$/i,
      /^<response>\s*/i,
      /\s*<\/response>$/i,
      /^<text>\s*/i,
      /\s*<\/text>$/i,
    ];

    wrapperPatterns.forEach(pattern => {
      cleaned = cleaned.replace(pattern, '');
    });

    return cleaned.trim();
  }

  /**
   * Translates text from Danish to English
   * Now uses centralized prompts and strips wrapper tags
   */
  async translate(text: string, context?: string): Promise<string> {
    const prompt = this.prompts.getTranslationPrompt(text, context);
    const result = await this.invoke(prompt);
    return this.stripWrapperTags(result);
  }

  /**
   * Generates a summary with system context
   * Now uses centralized prompts
   */
  async summarize(content: string, instructions: string): Promise<string> {
    const prompt = this.prompts.getSummarizationPrompt(content, instructions);
    return await this.invoke(prompt);
  }

  /**
   * Translates and summarizes in one call
   * Now uses centralized prompts
   */
  async translateAndSummarize(content: string, instructions: string): Promise<string> {
    const prompt = this.prompts.getTranslateAndSummarizePrompt(content, instructions);
    return await this.invoke(prompt);
  }

  /**
   * Generates final consolidated summary as JSON
   * Now uses centralized prompts and returns structured JSON
   */
  async generateFinalSummary(sections: {
    overview?: string;
    threads?: string;
    calendar?: string;
    posts?: string;
    derivedEvents?: string;
    upcomingEvents?: string; // NEW: Unified events from all sources
    importantInfo?: string;   // NEW: Critical non-event information
    generalReminders?: string; // NEW: General reminders and non-critical actionable items
    weeklyHighlights?: string; // NEW: Stories and activities from the week
  }): Promise<string> {
    const prompt = this.prompts.getFinalSummaryPrompt(sections);
    return await this.invoke(prompt);
  }
}
