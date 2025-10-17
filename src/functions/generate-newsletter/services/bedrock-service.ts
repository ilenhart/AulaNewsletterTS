/**
 * Bedrock AI service for translation and summarization
 */

import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import { logInfo, logError, BedrockError } from '../../../common/utils';

/**
 * Service for AI translation and summarization using Amazon Bedrock
 */
export class BedrockService {
  constructor(
    private readonly client: BedrockRuntimeClient,
    private readonly modelId: string,
    private readonly systemContext: {
      childName: string;
      parentNames: string;
      messageFamilyNames: string;
    }
  ) {}

  /**
   * Generates system prompt with personalization context
   */
  private generateSystemPrompt(): string {
    let prompt = '';
    prompt += 'You are a helper charged with collecting information from the Aula school system. ';
    prompt += 'The aula system is a school management system that is used by the school to manage the school\'s data. ';
    prompt += 'I am a parent retrieving information about my child\'s activities in different ways. ';
    prompt += `As parents, our names are ${this.systemContext.parentNames} and should be considered as part of your evaluation of this content. `;
    prompt += `Our child name is ${this.systemContext.childName}, for reference if the child is mentioned. `;
    prompt += 'When considering action items and todos, keep in mind which parent we are, and who our child is.\n';
    prompt += 'Whenever possible, we want to preserve date information, particularly for upcoming events that might be mentioned, as well as location. ';
    prompt += `We also want to pay close attention to events, threads, posts or messages that mention one of our flagged family names: ${this.systemContext.messageFamilyNames}.\n`;
    prompt += 'DO NOT HALLUCINATE OR VOLUNTEER ANY INFORMATION NOT SUGGESTED IN THE SOURCE.\n';
    prompt += 'EXTREMELY IMPORTANT: The source information from Aula is in almost all cases written in the Danish language. ';
    prompt += 'However, we want the outputted information from this to be in English. ';
    prompt += 'ALL GENERATED OUTPUTS MUST BE IN THE ENGLISH LANGUAGE, *NOT* DANISH\n';
    return prompt;
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
   * Translates text from Danish to English
   */
  async translate(text: string, context?: string): Promise<string> {
    let prompt = 'The following text is in Danish. Translate it to English.\n';
    if (context) {
      prompt += `Context: ${context}\n`;
    }
    prompt += `Text: ${text}\n`;

    return await this.invoke(prompt);
  }

  /**
   * Generates a summary with system context
   */
  async summarize(content: string, instructions: string): Promise<string> {
    const prompt = this.generateSystemPrompt() + '\n' + instructions + '\n\n' + content;
    return await this.invoke(prompt);
  }

  /**
   * Translates and summarizes in one call
   */
  async translateAndSummarize(content: string, instructions: string): Promise<string> {
    let prompt = this.generateSystemPrompt() + '\n';
    prompt += 'The content below is in Danish. Translate and summarize it according to these instructions:\n';
    prompt += instructions + '\n\n';
    prompt += content;

    return await this.invoke(prompt);
  }

  /**
   * Generates final consolidated summary
   */
  async generateFinalSummary(sections: {
    overview?: string;
    threads?: string;
    calendar?: string;
    posts?: string;
  }): Promise<string> {
    let prompt = 'You are a friendly assistant summarizing school information for parents.\n';
    prompt += `Parent names: ${this.systemContext.parentNames}\n`;
    prompt += `Child name: ${this.systemContext.childName}\n`;
    prompt += 'Provide a concise summary of important events, action items, and upcoming activities.\n\n';

    if (sections.overview) {
      prompt += `OVERVIEW: ${sections.overview}\n===\n`;
    }
    if (sections.threads) {
      prompt += `THREAD MESSAGES: ${sections.threads}\n===\n`;
    }
    if (sections.calendar) {
      prompt += `CALENDAR EVENTS: ${sections.calendar}\n===\n`;
    }
    if (sections.posts) {
      prompt += `POSTS: ${sections.posts}\n`;
    }

    return await this.invoke(prompt);
  }
}
