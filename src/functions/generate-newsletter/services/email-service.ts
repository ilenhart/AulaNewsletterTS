/**
 * Email service for generating and sending newsletters
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { logInfo, logError, EmailError } from '../../../common/utils';
import { S3AttachmentGroup, AttachmentRetrievalService } from './attachment-retrieval-service';

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
   * Builds HTML email content from summary and S3 attachments
   */
  buildHtmlEmail(
    summary: string,
    s3Attachments?: {
      posts?: S3AttachmentGroup[];
      messages?: S3AttachmentGroup[];
    }
  ): string {
    let html = '<!DOCTYPE html><html><head>';
    html += '<meta charset="UTF-8">';
    html += '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
    html += '</head><body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">';

    // Introduction
    html += '<p style="margin-bottom: 20px;">Here is a summary of recent Aula activity. Check Aula itself for more precise details or information.</p>';

    // Summary section
    html += `<div style="white-space: pre-wrap; background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin-bottom: 30px;">${this.escapeHtml(summary)}</div>`;

    // Only add attachments section if we have attachments
    const hasPostAttachments = s3Attachments?.posts && s3Attachments.posts.length > 0;
    const hasMessageAttachments = s3Attachments?.messages && s3Attachments.messages.length > 0;

    if (hasPostAttachments || hasMessageAttachments) {
      html += '<hr style="border: none; border-top: 2px solid #ddd; margin: 30px 0;"/>';
      html += '<h2 style="color: #2c3e50; margin-top: 30px;">📎 Attachments</h2>';

      // Add post attachments
      if (hasPostAttachments) {
        html += '<h3 style="color: #34495e; margin-top: 25px;">Posts</h3>';
        s3Attachments!.posts!.forEach(group => {
          html += this.renderAttachmentGroup(group);
        });
      }

      // Add message attachments
      if (hasMessageAttachments) {
        html += '<h3 style="color: #34495e; margin-top: 25px;">Messages</h3>';
        s3Attachments!.messages!.forEach(group => {
          html += this.renderAttachmentGroup(group);
        });
      }
    }

    html += '</body></html>';
    return html;
  }

  /**
   * Renders an attachment group (post or message)
   */
  private renderAttachmentGroup(group: S3AttachmentGroup): string {
    let html = '<div style="margin-bottom: 25px; padding: 15px; background-color: #fafafa; border-left: 4px solid #3498db; border-radius: 3px;">';

    // Title
    const title = group.postTitle || group.threadSubject || 'Attachments';
    html += `<h4 style="margin-top: 0; color: #2c3e50;">${this.escapeHtml(title)}</h4>`;

    // Render images first
    if (group.images.length > 0) {
      html += '<div style="margin-bottom: 15px;">';
      html += '<p style="font-weight: bold; margin-bottom: 10px; color: #555;">Images:</p>';
      html += '<div style="display: flex; flex-wrap: wrap; gap: 10px;">';

      group.images.forEach(image => {
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

      group.files.forEach(file => {
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
