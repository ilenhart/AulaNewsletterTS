/**
 * Email alert service for sending session expiration notifications
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { AulaSession } from '../../common/types';
import { logInfo, logError, EmailError } from '../../common/utils';
import { SessionFailureReason } from './session-keeper';

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
  async sendSessionExpiredAlert(
    session: AulaSession | null,
    error: Error,
    failureReason: SessionFailureReason | null
  ): Promise<void> {
    try {
      const subject = '🚨 Aula Session Expired - Action Required';
      const htmlContent = this.buildSessionExpiredEmail(session, error, failureReason);

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
   * Sends session success alert email with detailed context
   */
  async sendSessionSuccessAlert(session: AulaSession | null): Promise<void> {
    try {
      const subject = '✅ Aula Session Keep-Alive Success';
      const htmlContent = this.buildSessionSuccessEmail(session);

      logInfo('Sending session success alert via SES', {
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
      logInfo('Session success alert sent successfully');
    } catch (emailError) {
      logError('Error sending session success alert', {
        error: emailError instanceof Error ? emailError.message : String(emailError),
      });
      throw new EmailError('Failed to send session success alert', { originalError: emailError });
    }
  }

  /**
   * Builds HTML email content for session success notification
   */
  private buildSessionSuccessEmail(session: AulaSession | null): string {
    const now = new Date().toISOString();

    let html = '<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">';
    html += '<h2 style="color: #2e7d32;">✅ Aula Session Ping Successful</h2>';
    html += '<p>The <strong>Aula-keep-session-alive</strong> Lambda successfully pinged Aula and kept the session alive.</p>';

    html += '<h3>Success Details:</h3>';
    html += '<ul style="background-color: #e8f5e9; padding: 15px; border-left: 4px solid #4caf50;">';
    html += `<li><strong>Success Time:</strong> ${now}</li>`;
    html += '<li><strong>Status:</strong> Session is active and valid</li>';
    html += '</ul>';

    // Total Session Validity (prominent display for success case)
    if (session && session.created) {
      const createdDate = new Date(session.created);
      const validityMs = Date.now() - createdDate.getTime();
      const validityFormatted = this.formatDurationHoursMinutes(validityMs);

      html += '<div style="background-color: #e8f5e9; padding: 20px; margin: 20px 0; border-left: 4px solid #4caf50; border-radius: 4px;">';
      html += '<h3 style="margin-top: 0; color: #2e7d32;">⏱️ Total Session Validity</h3>';
      html += `<p style="font-size: 1.2em; margin: 10px 0; color: #1b5e20;"><strong>${validityFormatted}</strong></p>`;
      html += '<p style="margin-bottom: 0; color: #666; font-size: 0.95em;">Session has been working continuously since creation</p>';
      html += '</div>';
    }

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

      // Session validity duration (if we have the data)
      const validityInfo = this.calculateSessionValidityDuration(session);
      if (validityInfo) {
        html += '</ul>';
        html += '<div style="background-color: #e8f5e9; padding: 15px; margin: 15px 0; border-left: 4px solid #4caf50;">';
        html += '<p style="margin-top: 0;"><strong>⏱️ Session Validity Duration:</strong></p>';
        html += '<ul style="margin: 10px 0;">';

        const baselineLabel = validityInfo.baselineType === 'lastUsedSuccessfully'
          ? 'Last used successfully'
          : 'Last updated';

        html += `<li><strong>${baselineLabel}:</strong> ${validityInfo.baselineTimestamp}</li>`;
        html += `<li><strong>First failed:</strong> ${validityInfo.failureTimestamp}</li>`;
        html += `<li><strong>Maximum validity time:</strong> <span style="font-size: 1.1em; color: #2e7d32;">${this.formatDurationHoursMinutes(validityInfo.durationMs)}</span></li>`;
        html += '</ul>';

        if (validityInfo.baselineType === 'lastUpdated') {
          html += '<p style="font-size: 0.9em; color: #666; margin-bottom: 0;"><em>Note: Using "lastUpdated" as baseline since "lastUsedSuccessfully" was not recorded.</em></p>';
        }

        html += '</div>';
        html += '<ul style="background-color: #e3f2fd; padding: 15px; border-left: 4px solid #2196f3;">';
      }

      html += '</ul>';
    } else {
      html += '<p style="background-color: #fff3e0; padding: 15px; border-left: 4px solid #ff9800;">';
      html += '<strong>⚠️ No session record found in DynamoDB.</strong> This is unexpected for a successful ping.';
      html += '</p>';
    }

    html += '<hr style="margin-top: 30px; border: none; border-top: 1px solid #ccc;" />';
    html += '<p style="color: #666; font-size: 12px; text-align: center;">';
    html += 'This is an automated success notification from the Aula Newsletter system.<br/>';
    html += 'Lambda Function: <strong>AulaKeepSessionAlive</strong><br/>';
    html += 'To disable these success notifications, set <code>SESSION_ALIVE_SEND_EMAIL_ON_SUCCESS=false</code>';
    html += '</p>';

    html += '</body></html>';
    return html;
  }

  /**
   * Builds HTML email content for session expiration notification
   */
  private buildSessionExpiredEmail(
    session: AulaSession | null,
    error: Error,
    failureReason: SessionFailureReason | null
  ): string {
    const now = new Date().toISOString();

    let html = '<!DOCTYPE html><html><body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">';
    html += '<h2 style="color: #d32f2f;">⚠️ Aula Session Ping Failed</h2>';
    html += '<p>The <strong>Aula-keep-session-alive</strong> Lambda failed to ping Aula.</p>';

    // Add failure reason-specific explanation
    html += this.buildFailureReasonSection(failureReason, session);

    html += '<h3>Error Details:</h3>';
    html += '<ul style="background-color: #ffebee; padding: 15px; border-left: 4px solid #d32f2f;">';
    html += `<li><strong>Error Message:</strong> ${this.escapeHtml(error.message)}</li>`;
    html += `<li><strong>Failure Time:</strong> ${now}</li>`;
    html += `<li><strong>Failure Reason:</strong> ${failureReason || 'UNKNOWN'}</li>`;
    html += '</ul>';

    // Total Session Validity (prominent display for error case)
    if (session && session.created) {
      let validityMs: number;
      let baselineTimestamp: string;
      let baselineLabel: string;

      // Prefer lastUsedSuccessfully, fallback to lastUpdated
      if (session.lastUsedSuccessfully) {
        const lastSuccessDate = new Date(session.lastUsedSuccessfully);
        const createdDate = new Date(session.created);
        validityMs = lastSuccessDate.getTime() - createdDate.getTime();
        baselineTimestamp = session.lastUsedSuccessfully;
        baselineLabel = 'lastUsedSuccessfully';
      } else if (session.lastUpdated) {
        const lastUpdatedDate = new Date(session.lastUpdated);
        const createdDate = new Date(session.created);
        validityMs = lastUpdatedDate.getTime() - createdDate.getTime();
        baselineTimestamp = session.lastUpdated;
        baselineLabel = 'lastUpdated';
      } else {
        // If neither timestamp exists, we can't calculate validity
        validityMs = 0;
        baselineTimestamp = '';
        baselineLabel = '';
      }

      if (validityMs > 0 && baselineTimestamp) {
        const validityFormatted = this.formatDurationHoursMinutes(validityMs);

        html += '<div style="background-color: #fff8e1; padding: 20px; margin: 20px 0; border-left: 4px solid #ffa726; border-radius: 4px;">';
        html += '<h3 style="margin-top: 0; color: #e65100;">⏱️ Total Session Validity</h3>';
        html += `<p style="font-size: 1.2em; margin: 10px 0; color: #e65100;"><strong>${validityFormatted}</strong></p>`;
        html += '<p style="margin: 5px 0; color: #666; font-size: 0.95em;">Session worked from creation until first failure</p>';
        html += `<p style="margin-bottom: 0; color: #666; font-size: 0.85em;"><em>Calculated from: ${baselineLabel} (${baselineTimestamp})</em></p>`;
        html += '</div>';
      }
    }

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
        html += ` <em>(${ageDays} days, ${remainingHours} hours ago total, including failed time)</em></li>`;
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
   * Builds failure reason-specific explanation section
   */
  private buildFailureReasonSection(
    failureReason: SessionFailureReason | null,
    session: AulaSession | null
  ): string {
    let html = '<div style="background-color: #fff3e0; padding: 20px; margin: 20px 0; border-left: 4px solid #ff9800;">';
    html += '<h3 style="margin-top: 0; color: #e65100;">🔍 Diagnosis</h3>';

    switch (failureReason) {
      case SessionFailureReason.NO_SESSION_IN_DATABASE:
        html += '<p><strong>Problem:</strong> No session ID exists in DynamoDB.</p>';
        html += '<p><strong>Why:</strong> The session record was either never created, deleted manually, or the TTL expired and DynamoDB automatically removed it.</p>';
        html += '<p><strong>Solution:</strong> You need to <strong>create a new session ID</strong> by logging into Aula and extracting the session token.</p>';
        break;

      case SessionFailureReason.INVALID_SESSION_FORMAT:
        html += '<p><strong>Problem:</strong> A session ID exists in DynamoDB, but it\'s not in the correct format.</p>';
        html += '<p><strong>Why:</strong> Valid Aula session IDs must be exactly 32 alphanumeric characters. The current value doesn\'t match this format, indicating bad data was stored.</p>';
        if (session?.sessionId) {
          const maskedId = session.sessionId.length > 16
            ? `${session.sessionId.substring(0, 10)}...${session.sessionId.substring(session.sessionId.length - 6)}`
            : session.sessionId;
          html += `<p><strong>Current Value:</strong> <code>${maskedId}</code> (length: ${session.sessionId.length})</p>`;
        }
        html += '<p><strong>Solution:</strong> You need to <strong>update the session ID</strong> with a valid value from Aula.</p>';
        break;

      case SessionFailureReason.SESSION_REJECTED_BY_AULA:
        html += '<p><strong>Problem:</strong> The session ID exists and has valid format, but Aula rejected it with a 403 Forbidden response.</p>';
        html += '<p><strong>Why:</strong> The session has expired on Aula\'s servers. Aula sessions typically expire after a period of inactivity or after a certain time limit.</p>';

        // Show session age
        if (session?.created) {
          const createdDate = new Date(session.created);
          const ageMs = Date.now() - createdDate.getTime();
          const ageDays = Math.floor(ageMs / (1000 * 60 * 60 * 24));
          html += `<p><strong>Session Age:</strong> ${ageDays} days (created: ${session.created})</p>`;
        }

        // Calculate and show session validity duration
        const validityInfo = this.calculateSessionValidityDuration(session);
        if (validityInfo) {
          html += '<div style="background-color: #e8f5e9; padding: 15px; margin: 15px 0; border-left: 4px solid #4caf50;">';
          html += '<p style="margin-top: 0;"><strong>⏱️ Session Validity Duration:</strong></p>';
          html += '<ul style="margin: 10px 0;">';

          const baselineLabel = validityInfo.baselineType === 'lastUsedSuccessfully'
            ? 'Last used successfully'
            : 'Last updated';

          html += `<li><strong>${baselineLabel}:</strong> ${validityInfo.baselineTimestamp}</li>`;
          html += `<li><strong>First failed:</strong> ${validityInfo.failureTimestamp}</li>`;
          html += `<li><strong>Maximum validity time:</strong> <span style="font-size: 1.1em; color: #2e7d32;">${this.formatDurationHoursMinutes(validityInfo.durationMs)}</span></li>`;
          html += '</ul>';

          if (validityInfo.baselineType === 'lastUpdated') {
            html += '<p style="font-size: 0.9em; color: #666; margin-bottom: 0;"><em>Note: Using "lastUpdated" as baseline since "lastUsedSuccessfully" was not recorded.</em></p>';
          }

          html += '</div>';

          // Add recommendation based on validity duration
          const recommendedIntervalMs = validityInfo.durationMs * 0.75; // 75% of max validity
          const recommendedIntervalFormatted = this.formatDurationHoursMinutes(recommendedIntervalMs);

          html += '<div style="background-color: #fff8e1; padding: 15px; margin: 15px 0; border-left: 4px solid #ffc107;">';
          html += '<p style="margin-top: 0;"><strong>⚙️ Recommendation:</strong></p>';
          html += `<p style="margin-bottom: 0;">Configure the ping interval to run more frequently than <strong>${this.formatDurationHoursMinutes(validityInfo.durationMs)}</strong> to prevent future timeouts. `;
          html += `Consider setting it to approximately <strong>${recommendedIntervalFormatted}</strong> for a safety margin.</p>`;
          html += '</div>';
        } else {
          html += '<p style="color: #666; font-style: italic;">⏱️ <strong>Session Validity Duration:</strong> Unable to calculate (missing required timestamps).</p>';
        }

        html += '<p><strong>Solution:</strong> You need to <strong>update the session ID</strong> with a fresh session token from Aula.</p>';
        break;

      case SessionFailureReason.UNKNOWN_ERROR:
      default:
        html += '<p><strong>Problem:</strong> An unexpected error occurred while trying to ping Aula.</p>';
        html += '<p><strong>Why:</strong> The exact cause is unknown. This could be a network issue, AWS service problem, or an unexpected error in the Aula API.</p>';
        html += '<p><strong>Solution:</strong> Check the error details below and CloudWatch logs for more information. You may need to <strong>update the session ID</strong> as a precaution.</p>';
        break;
    }

    html += '</div>';
    return html;
  }

  /**
   * Calculates the maximum session validity duration
   * Returns object with duration info or null if cannot calculate
   */
  private calculateSessionValidityDuration(session: AulaSession | null): {
    durationMs: number;
    baselineType: 'lastUsedSuccessfully' | 'lastUpdated';
    baselineTimestamp: string;
    failureTimestamp: string;
  } | null {
    if (!session || !session.lastUsedFailure) {
      // Cannot calculate without failure timestamp
      return null;
    }

    const failureTime = new Date(session.lastUsedFailure).getTime();
    let baselineTime: number;
    let baselineType: 'lastUsedSuccessfully' | 'lastUpdated';
    let baselineTimestamp: string;

    // Prefer lastUsedSuccessfully if available, otherwise use lastUpdated
    if (session.lastUsedSuccessfully) {
      baselineTime = new Date(session.lastUsedSuccessfully).getTime();
      baselineType = 'lastUsedSuccessfully';
      baselineTimestamp = session.lastUsedSuccessfully;
    } else if (session.lastUpdated) {
      baselineTime = new Date(session.lastUpdated).getTime();
      baselineType = 'lastUpdated';
      baselineTimestamp = session.lastUpdated;
    } else {
      // No baseline available
      return null;
    }

    const durationMs = failureTime - baselineTime;

    // Sanity check: duration should be positive
    if (durationMs <= 0) {
      return null;
    }

    return {
      durationMs,
      baselineType,
      baselineTimestamp,
      failureTimestamp: session.lastUsedFailure,
    };
  }

  /**
   * Formats a duration in milliseconds to "X hours, Y minutes"
   */
  private formatDurationHoursMinutes(durationMs: number): string {
    const totalMinutes = Math.floor(durationMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours === 0) {
      return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    } else if (minutes === 0) {
      return `${hours} hour${hours !== 1 ? 's' : ''}`;
    } else {
      return `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
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
