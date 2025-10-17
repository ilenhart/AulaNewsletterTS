/**
 * Attachment Retrieval Service
 * Queries DynamoDB attachments table to get S3 URLs for posts and messages
 */

import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { AttachmentMetadata } from '../../../common/types';
import { logInfo, logError } from '../../../common/utils';

export interface S3AttachmentGroup {
  postId?: number;
  postTitle?: string;
  messageId?: string;
  threadSubject?: string;
  images: S3AttachmentInfo[];
  files: S3AttachmentInfo[];
}

export interface S3AttachmentInfo {
  fileName: string;
  s3Url: string; // Full HTTPS URL to S3 object
  contentType?: string;
  fileSize?: number;
  attachmentType: 'image' | 'file';
}

export interface AttachmentRetrievalConfig {
  tableName: string;
  bucketName: string;
  region: string;
}

/**
 * Service for retrieving attachment metadata from DynamoDB and generating S3 URLs
 */
export class AttachmentRetrievalService {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly config: AttachmentRetrievalConfig
  ) {}

  /**
   * Gets attachments for multiple posts
   * @param posts Array of post objects with Id and Title
   */
  async getAttachmentsForPosts(
    posts: Array<{ Id: number; Title: string }>
  ): Promise<S3AttachmentGroup[]> {
    if (!posts || posts.length === 0) {
      return [];
    }

    logInfo(`Retrieving S3 attachments for ${posts.length} posts`);

    // Query attachments for each post in parallel
    const attachmentPromises = posts.map(async (post) => {
      const attachments = await this.queryAttachmentsByPostId(post.Id);

      if (attachments.length === 0) {
        return null; // No attachments for this post
      }

      return this.buildAttachmentGroup({
        postId: post.Id,
        postTitle: post.Title,
        attachments,
      });
    });

    const results = await Promise.all(attachmentPromises);
    const groups = results.filter((group): group is S3AttachmentGroup => group !== null);

    logInfo(`Retrieved ${groups.length} post attachment groups`);
    return groups;
  }

  /**
   * Gets attachments for multiple messages
   * @param messages Array of message objects with Id and thread subject
   */
  async getAttachmentsForMessages(
    messages: Array<{ Id: string; ThreadSubject: string }>
  ): Promise<S3AttachmentGroup[]> {
    if (!messages || messages.length === 0) {
      return [];
    }

    logInfo(`Retrieving S3 attachments for ${messages.length} messages`);

    // Query attachments for each message in parallel
    const attachmentPromises = messages.map(async (message) => {
      const attachments = await this.queryAttachmentsByMessageId(message.Id);

      if (attachments.length === 0) {
        return null; // No attachments for this message
      }

      return this.buildAttachmentGroup({
        messageId: message.Id,
        threadSubject: message.ThreadSubject,
        attachments,
      });
    });

    const results = await Promise.all(attachmentPromises);
    const groups = results.filter((group): group is S3AttachmentGroup => group !== null);

    logInfo(`Retrieved ${groups.length} message attachment groups`);
    return groups;
  }

  /**
   * Queries DynamoDB for attachments by post ID using PostIdIndex GSI
   */
  private async queryAttachmentsByPostId(postId: number): Promise<AttachmentMetadata[]> {
    try {
      const response = await this.docClient.send(
        new QueryCommand({
          TableName: this.config.tableName,
          IndexName: 'PostIdIndex',
          KeyConditionExpression: 'PostId = :postId',
          ExpressionAttributeValues: {
            ':postId': postId,
          },
        })
      );

      return (response.Items || []) as AttachmentMetadata[];
    } catch (error) {
      logError(`Error querying attachments for post ${postId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Queries DynamoDB for attachments by message ID using MessageIdIndex GSI
   */
  private async queryAttachmentsByMessageId(messageId: string): Promise<AttachmentMetadata[]> {
    try {
      const response = await this.docClient.send(
        new QueryCommand({
          TableName: this.config.tableName,
          IndexName: 'MessageIdIndex',
          KeyConditionExpression: 'MessageId = :messageId',
          ExpressionAttributeValues: {
            ':messageId': messageId,
          },
        })
      );

      return (response.Items || []) as AttachmentMetadata[];
    } catch (error) {
      logError(`Error querying attachments for message ${messageId}`, {
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Builds an attachment group from metadata
   */
  private buildAttachmentGroup(params: {
    postId?: number;
    postTitle?: string;
    messageId?: string;
    threadSubject?: string;
    attachments: AttachmentMetadata[];
  }): S3AttachmentGroup {
    const images: S3AttachmentInfo[] = [];
    const files: S3AttachmentInfo[] = [];

    params.attachments.forEach((attachment) => {
      const s3Url = this.buildS3Url(attachment.S3Bucket, attachment.S3Key);

      const info: S3AttachmentInfo = {
        fileName: attachment.FileName,
        s3Url,
        contentType: attachment.ContentType,
        fileSize: attachment.FileSize,
        attachmentType: attachment.AttachmentType,
      };

      if (attachment.AttachmentType === 'image') {
        images.push(info);
      } else {
        files.push(info);
      }
    });

    return {
      postId: params.postId,
      postTitle: params.postTitle,
      messageId: params.messageId,
      threadSubject: params.threadSubject,
      images,
      files,
    };
  }

  /**
   * Builds S3 HTTPS URL from bucket and key
   */
  private buildS3Url(bucket: string, key: string): string {
    // URL encode the key to handle special characters
    const encodedKey = key.split('/').map(encodeURIComponent).join('/');
    return `https://${bucket}.s3.${this.config.region}.amazonaws.com/${encodedKey}`;
  }

  /**
   * Formats file size in human-readable format
   */
  static formatFileSize(bytes?: number): string {
    if (!bytes) return '';

    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
}
