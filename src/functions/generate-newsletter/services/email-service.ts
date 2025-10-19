/**
 * Email service for generating and sending newsletters
 * Now with JSON parsing and beautiful HTML generation
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { logInfo, logError, EmailError, extractJsonFromLLMResponse } from '../../../common/utils';
import { S3AttachmentGroup, AttachmentRetrievalService } from './attachment-retrieval-service';
import { NewsletterStructure } from '../../../common/types';

/**
 * Service for building and sending HTML emails
 */
export class EmailService {
  constructor(
    private readonly client: SESClient,
    private readonly fromAddress: string,
    private readonly toAddresses: string[]
  ) {}

  /**
   * Parses Bedrock JSON response into newsletter structure
   * Uses robust JSON extraction to handle LLM explanatory text
   */
  parseNewsletterJson(jsonResponse: string): NewsletterStructure {
    const parsed = extractJsonFromLLMResponse<any>(jsonResponse, 'newsletter generation');

    if (!parsed) {
      // Return empty structure on parse failure
      return {
        importantInformation: [],
        generalReminders: [],
        upcomingEvents: [],
        weeklyHighlights: [],
        threadSummaries: [],
      };
    }

    // Validate structure and provide defaults
    return {
      importantInformation: Array.isArray(parsed.importantInformation)
        ? parsed.importantInformation
        : [],
      generalReminders: Array.isArray(parsed.generalReminders) ? parsed.generalReminders : [],
      upcomingEvents: Array.isArray(parsed.upcomingEvents) ? parsed.upcomingEvents : [],
      weeklyHighlights: Array.isArray(parsed.weeklyHighlights) ? parsed.weeklyHighlights : [],
      threadSummaries: Array.isArray(parsed.threadSummaries) ? parsed.threadSummaries : [],
    };
  }

  /**
   * Builds HTML email content from structured newsletter data and S3 attachments
   */
  buildHtmlEmail(
    newsletterJson: string,
    s3Attachments?: {
      posts?: S3AttachmentGroup[];
      messages?: S3AttachmentGroup[];
    }
  ): string {
    const newsletter = this.parseNewsletterJson(newsletterJson);
    return this.buildHtmlEmailFromStructure(newsletter, s3Attachments);
  }

  /**
   * Builds HTML email content from NewsletterStructure directly
   * Used when we already have a parsed/merged newsletter structure
   */
  buildHtmlEmailFromStructure(
    newsletter: NewsletterStructure,
    s3Attachments?: {
      posts?: S3AttachmentGroup[];
      messages?: S3AttachmentGroup[];
    }
  ): string {
    let html = this.buildHtmlHeader();
    html += '<div class="container">';
    html += this.buildEmailHeader();
    html += this.buildIntro();

    // Build sections (each section handles its own empty state)
    html += this.buildImportantInfoSection(newsletter.importantInformation);
    html += this.buildGeneralRemindersSection(newsletter.generalReminders);
    html += this.buildUpcomingEventsSection(newsletter.upcomingEvents);
    html += this.buildWeeklyHighlightsSection(newsletter.weeklyHighlights);
    html += this.buildThreadSummariesSection(newsletter.threadSummaries);
    html += this.buildAttachmentsSection(s3Attachments);

    html += '</div></body></html>';
    return html;
  }

  /**
   * Builds HTML header with styles
   */
  private buildHtmlHeader(): string {
    return `<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; margin: 0; padding: 20px; }
.container { max-width: 800px; margin: 0 auto; background-color: #ffffff; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
.header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; margin: -30px -30px 30px -30px; }
.header h1 { margin: 0; font-size: 28px; }
.intro { font-size: 16px; color: #666; margin-bottom: 30px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #667eea; border-radius: 4px; }
.section { margin-bottom: 35px; }
.section-title { font-size: 22px; font-weight: 600; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 2px solid #e0e0e0; display: flex; align-items: center; }
.section-title .emoji { margin-right: 10px; font-size: 24px; }
.important-alert { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 12px 15px; margin-bottom: 12px; border-radius: 4px; }
.important-alert.health { background-color: #f8d7da; border-left-color: #dc3545; }
.important-alert.family { background-color: #d1ecf1; border-left-color: #17a2b8; }
.important-alert.deadline { background-color: #fff3cd; border-left-color: #ffc107; }
.important-alert.policy { background-color: #d4edda; border-left-color: #28a745; }
.alert-type { font-weight: 600; text-transform: uppercase; font-size: 11px; color: #666; margin-bottom: 4px; }
.alert-desc { margin: 0; font-size: 15px; }
.alert-source { font-size: 12px; color: #888; margin-top: 4px; font-style: italic; }
.event-card { background-color: #f8f9fa; border-left: 4px solid #28a745; padding: 15px; margin-bottom: 15px; border-radius: 4px; }
.event-title { font-size: 18px; font-weight: 600; color: #28a745; margin: 0 0 8px 0; }
.event-meta { display: flex; flex-wrap: wrap; gap: 15px; margin-bottom: 10px; font-size: 14px; color: #666; }
.event-meta-item { display: flex; align-items: center; }
.event-meta-item .icon { margin-right: 5px; }
.event-desc { margin: 10px 0; font-size: 15px; line-height: 1.5; }
.event-requirements { background-color: #fff; padding: 10px; border-radius: 4px; margin-top: 10px; }
.event-requirements ul { margin: 5px 0; padding-left: 20px; }
.event-requirements li { margin: 3px 0; }
.highlight { background-color: #f8f9fa; padding: 12px 15px; margin-bottom: 10px; border-left: 3px solid #667eea; border-radius: 4px; font-size: 15px; }
.thread-summary { background-color: #f8f9fa; padding: 12px 15px; margin-bottom: 12px; border-radius: 4px; }
.thread-title { font-weight: 600; color: #333; margin-bottom: 5px; }
.thread-content { font-size: 14px; color: #666; margin-bottom: 5px; }
.thread-tone { display: inline-block; font-size: 12px; padding: 2px 8px; border-radius: 12px; font-weight: 500; }
.tone-happy { background-color: #d4edda; color: #155724; }
.tone-friendly { background-color: #d1ecf1; color: #0c5460; }
.tone-informational { background-color: #e2e3e5; color: #383d41; }
.tone-concerned { background-color: #fff3cd; color: #856404; }
.tone-contentious { background-color: #f8d7da; color: #721c24; }
.tone-urgent { background-color: #f5c6cb; color: #721c24; font-weight: 600; }
.reminder { background-color: #e7f3ff; border-left: 4px solid #2196F3; padding: 12px 15px; margin-bottom: 10px; border-radius: 4px; font-size: 15px; }
.empty-section { font-style: italic; color: #999; padding: 10px 0; }
.badge-new { background-color: #28a745; color: white; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-left: 8px; text-transform: uppercase; }
.badge-updated { background-color: #ffc107; color: #333; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 600; margin-left: 8px; text-transform: uppercase; }
.changes-list { font-size: 13px; color: #666; margin-top: 12px; padding-left: 15px; background-color: #fffbf0; border-left: 3px solid #ffc107; padding: 10px 15px; border-radius: 4px; }
.changes-list strong { display: block; margin-bottom: 5px; color: #333; }
.changes-list ul { margin: 5px 0 0 0; padding-left: 20px; }
.changes-list li { margin: 3px 0; }
</style>
</head><body>`;
  }

  /**
   * Builds email header section
   */
  private buildEmailHeader(): string {
    return '<div class="header"><h1>📬 Aula Newsletter</h1></div>';
  }

  /**
   * Builds intro text
   */
  private buildIntro(): string {
    return '<div class="intro">Here is your personalized summary of recent Aula activity. Check Aula directly for full details and to respond to messages.</div>';
  }

  /**
   * Builds important information section
   */
  private buildImportantInfoSection(items: any[]): string {
    let html = '<div class="section">';
    html += '<div class="section-title"><span class="emoji">⚠️</span> Important Information</div>';

    if (items.length === 0) {
      html += '<div class="empty-section">No important information to report for this period.</div>';
    } else {
      items.forEach((item) => {
        const cssClass = this.getImportantInfoClass(item.type);
        html += `<div class="important-alert ${cssClass}">`;
        html += `<div class="alert-type">${this.escapeHtml(item.type.replace('_', ' '))}`;
        // Phase 3: Show NEW badge if item is new
        if (item.isNew) {
          html += '<span class="badge-new">New</span>';
        }
        html += '</div>';
        html += `<div class="alert-desc">${this.escapeHtml(item.description)}</div>`;
        if (item.source) {
          html += `<div class="alert-source">Source: ${this.escapeHtml(item.source)}</div>`;
        }
        html += '</div>';
      });
    }

    html += '</div>';
    return html;
  }

  /**
   * Builds general reminders section
   */
  private buildGeneralRemindersSection(reminders: string[]): string {
    let html = '<div class="section">';
    html += '<div class="section-title"><span class="emoji">📝</span> General Reminders</div>';

    if (reminders.length === 0) {
      html += '<div class="empty-section">No general reminders to report for this period.</div>';
    } else {
      reminders.forEach((reminder) => {
        html += `<div class="reminder">${this.escapeHtml(reminder)}</div>`;
      });
    }

    html += '</div>';
    return html;
  }

  /**
   * Builds upcoming events section
   */
  private buildUpcomingEventsSection(events: any[]): string {
    let html = '<div class="section">';
    html += '<div class="section-title"><span class="emoji">📅</span> Upcoming Events</div>';

    if (events.length === 0) {
      html += '<div class="empty-section">No upcoming events to report for this period.</div>';
    } else {
      events.forEach((event) => {
        html += '<div class="event-card">';
        html += `<div class="event-title">${this.escapeHtml(event.title)}`;

        // Phase 3: Show NEW or UPDATED badge
        if (event.isNew) {
          html += '<span class="badge-new">New</span>';
        } else if (event.isUpdated) {
          html += '<span class="badge-updated">Updated</span>';
        }
        html += '</div>';

        html += '<div class="event-meta">';
        if (event.date) {
          html += `<div class="event-meta-item"><span class="icon">📆</span> ${this.formatDate(event.date)}</div>`;
        }
        if (event.time) {
          html += `<div class="event-meta-item"><span class="icon">🕐</span> ${this.escapeHtml(event.time)}</div>`;
        }
        if (event.location) {
          html += `<div class="event-meta-item"><span class="icon">📍</span> ${this.escapeHtml(event.location)}</div>`;
        }
        html += '</div>';

        // Phase 3: Show what changed if event was updated
        if (event.isUpdated && event.changes && event.changes.length > 0) {
          html += '<div class="changes-list">';
          html += '<strong>What changed:</strong>';
          html += '<ul>';
          event.changes.forEach((change: string) => {
            html += `<li>${this.escapeHtml(change)}</li>`;
          });
          html += '</ul></div>';
        }

        html += `<div class="event-desc">${this.escapeHtml(event.description)}</div>`;

        if (event.whoShouldAttend) {
          html += `<div style="font-size: 14px; color: #666; margin-top: 8px;">`;
          html += `<strong>Who:</strong> ${this.escapeHtml(event.whoShouldAttend)}`;
          html += `</div>`;
        }

        if (event.requirements && event.requirements.length > 0) {
          html += '<div class="event-requirements">';
          html += '<strong>Requirements:</strong>';
          html += '<ul>';
          event.requirements.forEach((req: string) => {
            html += `<li>${this.escapeHtml(req)}</li>`;
          });
          html += '</ul></div>';
        }

        html += '</div>';
      });
    }

    html += '</div>';
    return html;
  }

  /**
   * Builds weekly highlights section
   */
  private buildWeeklyHighlightsSection(highlights: string[]): string {
    let html = '<div class="section">';
    html += '<div class="section-title"><span class="emoji">✨</span> This Week\'s Highlights</div>';

    if (highlights.length === 0) {
      html += '<div class="empty-section">No weekly highlights to report for this period.</div>';
    } else {
      highlights.forEach((highlight) => {
        html += `<div class="highlight">${this.escapeHtml(highlight)}</div>`;
      });
    }

    html += '</div>';
    return html;
  }

  /**
   * Builds thread summaries section
   */
  private buildThreadSummariesSection(threads: any[]): string {
    let html = '<div class="section">';
    html += '<div class="section-title"><span class="emoji">💬</span> Message Thread Summaries</div>';

    if (threads.length === 0) {
      html += '<div class="empty-section">No message thread summaries to report for this period.</div>';
    } else {
      threads.forEach((thread) => {
        html += '<div class="thread-summary">';
        html += `<div class="thread-title">${this.escapeHtml(thread.title)}</div>`;
        html += `<div class="thread-content">${this.escapeHtml(thread.summary)}</div>`;
        html += `<span class="thread-tone tone-${thread.tone}">${this.escapeHtml(thread.tone)}</span>`;
        html += '</div>';
      });
    }

    html += '</div>';
    return html;
  }

  /**
   * Builds attachments section
   */
  private buildAttachmentsSection(s3Attachments?: {
    posts?: S3AttachmentGroup[];
    messages?: S3AttachmentGroup[];
  }): string {
    const hasPostAttachments = s3Attachments?.posts && s3Attachments.posts.length > 0;
    const hasMessageAttachments = s3Attachments?.messages && s3Attachments.messages.length > 0;

    let html = '<div class="section">';
    html += '<div class="section-title"><span class="emoji">📎</span> Attachments</div>';

    if (!hasPostAttachments && !hasMessageAttachments) {
      html += '<div class="empty-section">No attachments to report for this period.</div>';
    } else {
      if (hasPostAttachments) {
        html += '<h3 style="color: #34495e; margin-top: 20px; margin-bottom: 15px;">From Posts</h3>';
        s3Attachments!.posts!.forEach((group) => {
          html += this.renderAttachmentGroup(group);
        });
      }

      if (hasMessageAttachments) {
        html +=
          '<h3 style="color: #34495e; margin-top: 20px; margin-bottom: 15px;">From Messages</h3>';
        s3Attachments!.messages!.forEach((group) => {
          html += this.renderAttachmentGroup(group);
        });
      }
    }

    html += '</div>';
    return html;
  }

  /**
   * Checks if newsletter is completely empty
   */
  private isNewsletterEmpty(
    newsletter: NewsletterStructure,
    s3Attachments?: { posts?: S3AttachmentGroup[]; messages?: S3AttachmentGroup[] }
  ): boolean {
    const hasPostAttachments = s3Attachments?.posts && s3Attachments.posts.length > 0;
    const hasMessageAttachments = s3Attachments?.messages && s3Attachments.messages.length > 0;

    return (
      newsletter.importantInformation.length === 0 &&
      newsletter.generalReminders.length === 0 &&
      newsletter.upcomingEvents.length === 0 &&
      newsletter.weeklyHighlights.length === 0 &&
      newsletter.threadSummaries.length === 0 &&
      !hasPostAttachments &&
      !hasMessageAttachments
    );
  }

  /**
   * Renders an attachment group (post or message)
   */
  private renderAttachmentGroup(group: S3AttachmentGroup): string {
    let html =
      '<div style="margin-bottom: 25px; padding: 15px; background-color: #fafafa; border-left: 4px solid #3498db; border-radius: 3px;">';

    // Title
    const title = group.postTitle || group.threadSubject || 'Attachments';
    html += `<h4 style="margin-top: 0; color: #2c3e50;">${this.escapeHtml(title)}</h4>`;

    // Render images first
    if (group.images.length > 0) {
      html += '<div style="margin-bottom: 15px;">';
      html += '<p style="font-weight: bold; margin-bottom: 10px; color: #555;">Images:</p>';
      html += '<div style="display: flex; flex-wrap: wrap; gap: 10px;">';

      group.images.forEach((image) => {
        html += `<div style="margin: 5px;">`;
        html += `<a href="${this.escapeHtml(image.s3Url)}" target="_blank" style="text-decoration: none;">`;
        html += `<img src="${this.escapeHtml(image.s3Url)}" alt="${this.escapeHtml(image.fileName)}" `;
        html += `style="max-width: 300px; max-height: 300px; border: 1px solid #ddd; border-radius: 4px; display: block;"/>`;
        html += `</a>`;
        html += `<p style="margin: 5px 0 0 0; font-size: 12px; color: #777; text-align: center;">${this.escapeHtml(image.fileName)}</p>`;
        html += `</div>`;
      });

      html += '</div></div>';
    }

    // Render files
    if (group.files.length > 0) {
      html += '<div>';
      html += '<p style="font-weight: bold; margin-bottom: 10px; color: #555;">Files:</p>';
      html += '<ul style="list-style-type: none; padding-left: 0;">';

      group.files.forEach((file) => {
        const fileSize = AttachmentRetrievalService.formatFileSize(file.fileSize);
        const fileSizeText = fileSize ? ` (${fileSize})` : '';

        html += `<li style="margin-bottom: 8px;">`;
        html += `📄 <a href="${this.escapeHtml(file.s3Url)}" target="_blank" style="color: #3498db; text-decoration: none;">`;
        html += `${this.escapeHtml(file.fileName)}${this.escapeHtml(fileSizeText)}`;
        html += `</a></li>`;
      });

      html += '</ul></div>';
    }

    html += '</div>';
    return html;
  }

  /**
   * Gets CSS class for important info type
   */
  private getImportantInfoClass(type: string): string {
    if (type === 'health_alert') return 'health';
    if (type === 'family_mention') return 'family';
    if (type === 'deadline') return 'deadline';
    if (type === 'policy_change') return 'policy';
    return '';
  }

  /**
   * Formats ISO date to human-readable format
   */
  private formatDate(isoDate: string): string {
    try {
      const date = new Date(isoDate);
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
    } catch {
      return isoDate;
    }
  }

  /**
   * Escapes HTML special characters to prevent XSS
   */
  private escapeHtml(text: string): string {
    const map: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }

  /**
   * Sends email via SES
   */
  async sendEmail(subject: string, htmlContent: string): Promise<void> {
    try {
      logInfo('Sending email via SES', {
        from: this.fromAddress,
        to: this.toAddresses,
        subject,
      });

      const command = new SendEmailCommand({
        Destination: {
          ToAddresses: this.toAddresses,
        },
        Message: {
          Body: {
            Html: {
              Charset: 'UTF-8',
              Data: htmlContent,
            },
          },
          Subject: {
            Charset: 'UTF-8',
            Data: subject,
          },
        },
        Source: this.fromAddress,
      });

      await this.client.send(command);
      logInfo('Email sent successfully');
    } catch (error) {
      logError('Error sending email', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new EmailError('Failed to send email', { originalError: error });
    }
  }

  /**
   * Generates email subject with date
   */
  generateSubject(date: Date = new Date()): string {
    return `AULA Update - ${date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })}`;
  }
}
