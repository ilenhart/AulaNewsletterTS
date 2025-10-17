/**
 * Attachment Download Service
 * Downloads attachments from Aula API URLs and stores them in S3 with DynamoDB metadata
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import fetch from 'node-fetch';
import { AttachmentMetadata } from '../../common/types';
import { logInfo, logError, AulaAPIError } from '../../common/utils';
import { Attachment, ImageAttachment, FileAttachment } from 'aula-apiclient-ts';

export interface AttachmentDownloadConfig {
  s3Bucket: string;
  attachmentsTableName: string;
}

/**
 * Service for downloading attachments from Aula and storing them in S3
 */
export class AttachmentDownloadService {
  constructor(
    private readonly s3Client: S3Client,
    private readonly dynamoClient: DynamoDBDocumentClient,
    private readonly config: AttachmentDownloadConfig
  ) {}

  /**
   * Downloads attachments from a post and stores in S3
   */
  async downloadPostAttachments(
    postId: number,
    attachments: Attachment[]
  ): Promise<AttachmentMetadata[]> {
    const results: AttachmentMetadata[] = [];

    for (const attachment of attachments) {
      try {
        let metadata: AttachmentMetadata | null = null;

        if (attachment.IsImage()) {
          metadata = await this.downloadImageAttachment(
            attachment.AsImage()!,
            postId,
            null
          );
        } else if (attachment.IsFile()) {
          metadata = await this.downloadFileAttachment(
            attachment.AsFile()!,
            postId,
            null
          );
        }

        if (metadata) {
          results.push(metadata);
        }
      } catch (error) {
        logError(`Failed to download attachment for post ${postId}`, {
          attachmentId: attachment.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Downloads attachments from a message and stores in S3
   */
  async downloadMessageAttachments(
    messageId: string,
    attachments: Attachment[]
  ): Promise<AttachmentMetadata[]> {
    const results: AttachmentMetadata[] = [];

    for (const attachment of attachments) {
      try {
        let metadata: AttachmentMetadata | null = null;

        if (attachment.IsImage()) {
          metadata = await this.downloadImageAttachment(
            attachment.AsImage()!,
            null,
            messageId
          );
        } else if (attachment.IsFile()) {
          metadata = await this.downloadFileAttachment(
            attachment.AsFile()!,
            null,
            messageId
          );
        }

        if (metadata) {
          results.push(metadata);
        }
      } catch (error) {
        logError(`Failed to download attachment for message ${messageId}`, {
          attachmentId: attachment.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return results;
  }

  /**
   * Downloads an image attachment
   */
  private async downloadImageAttachment(
    image: ImageAttachment,
    postId: number | null,
    messageId: string | null
  ): Promise<AttachmentMetadata | null> {
    const url = image.GetFullSizeUrl();
    if (!url) {
      logError('Image attachment has no URL', { attachmentId: image.id });
      return null;
    }

    const attachmentId = this.generateAttachmentId(image.id, postId, messageId);
    const fileName = image.name || `image-${image.id}.jpg`;

    return await this.downloadAndStore(
      url,
      attachmentId,
      fileName,
      'image',
      postId,
      messageId
    );
  }

  /**
   * Downloads a file attachment
   */
  private async downloadFileAttachment(
    file: FileAttachment,
    postId: number | null,
    messageId: string | null
  ): Promise<AttachmentMetadata | null> {
    const url = file.GetFileUrl();
    if (!url) {
      logError('File attachment has no URL', { attachmentId: file.id });
      return null;
    }

    const attachmentId = this.generateAttachmentId(file.id, postId, messageId);
    const fileName = file.GetFileName() || `file-${file.id}`;

    return await this.downloadAndStore(
      url,
      attachmentId,
      fileName,
      'file',
      postId,
      messageId
    );
  }

  /**
   * Downloads file from URL and stores in S3 and DynamoDB
   */
  private async downloadAndStore(
    url: string,
    attachmentId: string,
    fileName: string,
    attachmentType: 'image' | 'file',
    postId: number | null,
    messageId: string | null
  ): Promise<AttachmentMetadata> {
    try {
      // Download file from URL
      logInfo(`Downloading attachment from ${url}`);
      const response = await fetch(url);

      if (!response.ok) {
        throw new AulaAPIError(`Failed to download attachment: HTTP ${response.status}`);
      }

      const buffer = await response.buffer();
      const contentType = response.headers.get('content-type') || 'application/octet-stream';

      // Generate S3 key
      const s3Key = this.generateS3Key(attachmentId, fileName);

      // Upload to S3
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.config.s3Bucket,
          Key: s3Key,
          Body: buffer,
          ContentType: contentType,
        })
      );

      logInfo(`Uploaded attachment to S3`, {
        attachmentId,
        s3Key,
        bucket: this.config.s3Bucket,
      });

      // Create metadata record
      const metadata: AttachmentMetadata = {
        AttachmentId: attachmentId,
        PostId: postId,
        MessageId: messageId,
        AttachmentType: attachmentType,
        FileName: fileName,
        OriginalUrl: url,
        S3Key: s3Key,
        S3Bucket: this.config.s3Bucket,
        DownloadedAt: new Date().toISOString(),
        FileSize: buffer.length,
        ContentType: contentType,
        ttl: this.calculateTTL(365), // 1 year from now
      };

      // Save metadata to DynamoDB
      await this.dynamoClient.send(
        new PutCommand({
          TableName: this.config.attachmentsTableName,
          Item: metadata,
        })
      );

      logInfo(`Saved attachment metadata to DynamoDB`, { attachmentId });

      return metadata;
    } catch (error) {
      logError(`Error downloading and storing attachment`, {
        url,
        attachmentId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Generates a unique attachment ID
   */
  private generateAttachmentId(
    attachmentId: number,
    postId: number | null,
    messageId: string | null
  ): string {
    if (postId !== null) {
      return `post-${postId}-${attachmentId}`;
    } else if (messageId !== null) {
      return `message-${messageId}-${attachmentId}`;
    }
    throw new Error('Either postId or messageId must be provided');
  }

  /**
   * Generates S3 key for attachment
   */
  private generateS3Key(attachmentId: string, fileName: string): string {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `attachments/${timestamp}/${attachmentId}/${sanitizedFileName}`;
  }

  /**
   * Calculates TTL timestamp (Unix epoch seconds)
   */
  private calculateTTL(daysFromNow: number): number {
    const now = Date.now();
    const ttlDate = now + daysFromNow * 24 * 60 * 60 * 1000;
    return Math.floor(ttlDate / 1000);
  }
}
