/**
 * Email alert service for sending session expiration notifications
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { AulaSession } from '../../common/types';
import { logInfo, logError, EmailError } from '../../common/utils';

/**
 * Service for sending email alerts when session expires
 */
export class EmailAlertService {
  constructor(
    private readonly client: SESClient,
    private readonly fromAddress: string,
    private readonly toAddresses: string[]
  ) {}

  /**
   * Sends session expiration alert email with detailed context
   */
  async sendSessionExpiredAlert(session: AulaSession | null, error: Error): Promise<void> {
    try {
      const subject = '🚨 Aula Session Expired - Action Required';
      const htmlContent = this.buildSessionExpiredEmail(session, error);

      logInfo('Sending session expiration alert via SES', {
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
      logInfo('Session expiration alert sent successfully');
    } catch (emailError) {
      logError('Error sending session expiration alert', {
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
      throw new EmailError('Failed to send session expiration alert', { originalError: emailError });
    }
  }

  /**
   * Builds HTML email content for session expiration notification
   */
  private buildSessionExpiredEmail(session: AulaSession | null, error: Error): string {
    const now = new Date().toISOString();

    let html = '<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">';
    html += '<h2 style="color: #d32f2f;">⚠️ Aula Session Expired</h2>';
    html += '<p>The <strong>Aula-keep-session-alive</strong> Lambda failed to ping Aula due to an expired or invalid session.</p>';

    html += '<h3>Error Details:</h3>';
    html += '<ul style="background-color: #ffebee; padding: 15px; border-left: 4px solid #d32f2f;">';
    html += `<li><strong>Error Message:</strong> ${this.escapeHtml(error.message)}</li>`;
    html += `<li><strong>Failure Time:</strong> ${now}</li>`;
    html += '</ul>';

    if (session) {
      html += '<h3>Session Information:</h3>';
      html += '<ul style="background-color: #e3f2fd; padding: 15px; border-left: 4px solid #2196f3;">';

      // Session ID (partially masked for security)
      const maskedSessionId = session.sessionId.length > 16
        ? `${session.sessionId.substring(0, 10)}...${session.sessionId.substring(session.sessionId.length - 6)}`
        : session.sessionId;
      html += `<li><strong>Session ID:</strong> <code>${maskedSessionId}</code></li>`;

      // Session age (if created timestamp exists)
      if (session.created) {
        const createdDate = new Date(session.created);
        const ageMs = Date.now() - createdDate.getTime();
        const ageHours = Math.floor(ageMs / (1000 * 60 * 60));
        const ageDays = Math.floor(ageHours / 24);
        const remainingHours = ageHours % 24;

        html += `<li><strong>Session Created:</strong> ${session.created}`;
        html += ` <em>(${ageDays} days, ${remainingHours} hours ago)</em></li>`;
      } else {
        html += '<li><strong>Session Created:</strong> <em>Unknown (field not set)</em></li>';
      }

      // Time since last successful ping
      if (session.lastUpdated) {
        const lastPingDate = new Date(session.lastUpdated);
        const timeSincePingMs = Date.now() - lastPingDate.getTime();
        const hoursSincePing = Math.floor(timeSincePingMs / (1000 * 60 * 60));
        const minutesSincePing = Math.floor((timeSincePingMs % (1000 * 60 * 60)) / (1000 * 60));

        html += `<li><strong>Last Successful Ping:</strong> ${session.lastUpdated}`;
        html += ` <em>(${hoursSincePing} hours, ${minutesSincePing} minutes ago)</em></li>`;
      } else {
        html += '<li><strong>Last Successful Ping:</strong> <em>Unknown</em></li>';
      }

      // TTL expiration
      if (session.ttl) {
        const ttlDate = new Date(session.ttl * 1000);
        const isExpired = Date.now() > session.ttl * 1000;
        html += `<li><strong>TTL Expiration:</strong> ${ttlDate.toISOString()}`;
        html += isExpired ? ' <span style="color: #d32f2f;">(EXPIRED)</span>' : ' <span style="color: #4caf50;">(Valid)</span>';
        html += '</li>';
      }

      html += '</ul>';
    } else {
      html += '<p style="background-color: #fff3e0; padding: 15px; border-left: 4px solid #ff9800;">';
      html += '<strong>⚠️ No session record found in DynamoDB.</strong> This may indicate the session was never created or has been deleted.';
      html += '</p>';
    }

    html += '<h3>Action Required:</h3>';
    html += '<ol style="background-color: #f1f8e9; padding: 15px; border-left: 4px solid #8bc34a;">';
    html += '<li>Log into <a href="https://www.aula.dk" style="color: #1976d2;">Aula.dk</a> manually using your credentials</li>';
    html += '<li>Extract the new session ID from your browser cookies (look for <code>Aula.Session.Id</code>) or network requests</li>';
    html += '<li>Update the session ID using one of these methods:</li>';
    html += '<ul>';
    html += '<li><strong>API Gateway:</strong> Use the <code>POST /api/sessionID</code> endpoint with the new session ID</li>';
    html += '<li><strong>AWS Console:</strong> Update the record in the DynamoDB <code>AulaSessionIdTable</code> directly</li>';
    html += '</ul>';
    html += '</ol>';

    html += '<hr style="margin-top: 30px; border: none; border-top: 1px solid #ccc;" />';
    html += '<p style="color: #666; font-size: 12px; text-align: center;">';
    html += 'This is an automated alert from the Aula Newsletter system.<br/>';
    html += 'Lambda Function: <strong>AulaKeepSessionAlive</strong>';
    html += '</p>';

    html += '</body></html>';
    return html;
  }

  /**
   * Escapes HTML special characters to prevent XSS
   */
  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }
}
