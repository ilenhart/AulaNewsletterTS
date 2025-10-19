/**
 * Data transformation utilities for Aula API responses
 * Converts API response formats to DynamoDB-compatible structures
 */

import { AulaThread, AulaPost, AulaCalendarEvent, AulaMessage } from './types';

/**
 * Transform property names from lowercase to uppercase for DynamoDB
 * Recursively processes objects and arrays
 */
export function capitalizeKeys(obj: any): any {
  if (Array.isArray(obj)) {
    return obj.map(item => capitalizeKeys(item));
  } else if (obj !== null && typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      // Map specific lowercase keys to uppercase equivalents
      const newKey =
        key === 'id' ? 'Id' :
        key === 'messages' ? 'Messages' :
        key === 'subject' ? 'Subject' :
        key;
      newObj[newKey] = capitalizeKeys(obj[key]);
    }
    return newObj;
  }
  return obj;
}

/**
 * Transforms raw thread data from Aula API to DynamoDB format
 * Ensures Id and Subject are capitalized, and Messages are properly structured
 */
export function transformThread(rawThread: any): AulaThread {
  return {
    Id: rawThread.id || rawThread.Id,
    Subject: rawThread.subject || rawThread.Subject,
    Messages: (rawThread.messages || rawThread.Messages || []).map((msg: any) => transformMessage(msg)),
    ...rawThread,
  };
}

/**
 * Transforms raw message data from Aula API to DynamoDB format
 * Extracts text from text.html and capitalizes keys
 */
export function transformMessage(rawMessage: any): AulaMessage {
  return {
    Id: String(rawMessage.id || rawMessage.Id),
    ThreadId: rawMessage.threadId || rawMessage.ThreadId,
    MessageText: rawMessage.text?.html || rawMessage.MessageText || '',
    SentDate: rawMessage.sendDateTime || rawMessage.SentDate,
    Sender: rawMessage.sender ? {
      FullName: rawMessage.sender.fullName || '',
      Role: rawMessage.sender.mailBoxOwner?.portalRole || '',
    } : (rawMessage.Sender || {
      FullName: 'Unknown',
      Role: 'Unknown',
    }),
    Attachments: rawMessage.attachments || rawMessage.Attachments || [],
    ...rawMessage,
  };
}

/**
 * Transforms raw post data from Aula API to DynamoDB format
 * Extracts content from content.html and capitalizes keys
 */
export function transformPost(rawPost: any): AulaPost {
  return {
    Id: rawPost.id || rawPost.Id,
    Title: rawPost.title || rawPost.Title || '',
    Content: rawPost.content?.html || rawPost.Content || '',
    Timestamp: rawPost.timestamp || rawPost.Timestamp,
    Author: rawPost.ownerProfile?.fullName || rawPost.Author || '',
    AuthorRole: rawPost.ownerProfile?.role || rawPost.AuthorRole || '',
    Attachments: rawPost.attachments || rawPost.Attachments || [],
    ...rawPost,
  };
}

/**
 * Transforms raw calendar event data from Aula API to DynamoDB format
 */
export function transformCalendarEvent(rawEvent: any): AulaCalendarEvent {
  return capitalizeKeys(rawEvent);
}

/**
 * Transforms raw daily overview data from Aula API to DynamoDB format
 */
export function transformDailyOverview(rawOverview: any): any {
  return capitalizeKeys(rawOverview);
}

/**
 * Transforms raw gallery album data from Aula API to DynamoDB format
 */
export function transformGalleryAlbum(rawAlbum: any): any {
  return capitalizeKeys(rawAlbum);
}

/**
 * Transforms raw MeeBook week data from Aula API to DynamoDB format
 */
export function transformWeekOverview(rawWeek: any): any {
  return capitalizeKeys(rawWeek);
}

/**
 * Transforms raw book list data from Aula API to DynamoDB format
 */
export function transformBookList(rawBookList: any): any {
  return capitalizeKeys(rawBookList);
}
