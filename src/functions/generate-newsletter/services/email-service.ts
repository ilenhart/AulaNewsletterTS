/**
 * Email service for generating and sending newsletters
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { AttachmentGroup } from '../../../common/types';
import { logInfo, logError, EmailError } from '../../../common/utils';

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
   * Builds HTML email content from summary and attachments
   */
  buildHtmlEmail(
    summary: string,
    attachments: {
      posts?: AttachmentGroup[];
      messages?: AttachmentGroup[];
    }
  ): string {
    let html = '<!DOCTYPE html><html><body>';
    html += '<p>Here is a summary of recent Aula activity. Check Aula itself for more precise details or information.</p>';
    html += `<div style="white-space: pre-wrap;">${summary}</div>`;
    html += '<br/><br/>';

    // Add post attachments
    if (attachments.posts && attachments.posts.length > 0) {
      html += '<h2>Post Attachments</h2>';
      attachments.posts.forEach(group => {
        const images = group.attachments.filter(a => a.Type === 'image');
        const files = group.attachments.filter(a => a.Type !== 'image');

        html += `<h3>Post: ${group.postSubject}</h3>`;

        if (files.length > 0) {
          html += '<h4>File attachments:</h4><ul>';
          files.forEach(file => {
            html += `<li><a href="${file.DownloadUrl}">${file.Name}</a></li>`;
          });
          html += '</ul>';
        }

        if (images.length > 0) {
          html += '<h4>Image attachments:</h4><div>';
          images.forEach(img => {
            html += `<span style="margin: 5px;"><a href="${img.DownloadUrl}">`;
            html += `<img src="${img.ThumbnailUrl}" alt="${img.Name}" style="max-width: 200px;"/>`;
            html += `</a></span>`;
          });
          html += '</div>';
        }
      });
    }

    // Add message attachments
    if (attachments.messages && attachments.messages.length > 0) {
      html += '<h2>Message Board Attachments</h2>';
      attachments.messages.forEach(group => {
        const images = group.attachments.filter(a => a.Type === 'image');
        const files = group.attachments.filter(a => a.Type !== 'image');

        html += `<h3>Message Thread: ${group.threadSubject}</h3>`;

        if (files.length > 0) {
          html += '<h4>File attachments:</h4><ul>';
          files.forEach(file => {
            html += `<li><a href="${file.DownloadUrl}">${file.Name}</a></li>`;
          });
          html += '</ul>';
        }

        if (images.length > 0) {
          html += '<h4>Image attachments:</h4><div>';
          images.forEach(img => {
            html += `<span style="margin: 5px;"><a href="${img.DownloadUrl}">`;
            html += `<img src="${img.ThumbnailUrl}" alt="${img.Name}" style="max-width: 200px;"/>`;
            html += `</a></span>`;
          });
          html += '</div>';
        }
      });
    }

    html += '</body></html>';
    return html;
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
