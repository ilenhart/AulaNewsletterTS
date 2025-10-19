/**
 * Session ID validation utilities
 * Ensures session IDs conform to expected Aula format
 */

/**
 * Valid Aula session ID format:
 * - Exactly 32 characters
 * - Only lowercase letters (a-z) and numbers (0-9)
 * - No special characters, spaces, or uppercase letters
 */
const SESSION_ID_REGEX = /^[a-z0-9]{32}$/;

/**
 * Validates that a session ID matches the expected Aula format
 *
 * @param sessionId - The session ID to validate
 * @returns true if valid, false otherwise
 */
export function isValidSessionId(sessionId: string | undefined | null): boolean {
  if (!sessionId || typeof sessionId !== 'string') {
    return false;
  }

  return SESSION_ID_REGEX.test(sessionId);
}

/**
 * Validates a session ID and throws an error if invalid
 *
 * @param sessionId - The session ID to validate
 * @throws Error if session ID is invalid
 */
export function validateSessionId(sessionId: string | undefined | null): void {
  if (!sessionId || typeof sessionId !== 'string') {
    throw new Error('Session ID is required and must be a string');
  }

  if (!SESSION_ID_REGEX.test(sessionId)) {
    throw new Error(
      'Invalid session ID format. Session ID must be exactly 32 characters containing only lowercase letters (a-z) and numbers (0-9)'
    );
  }
}

/**
 * Gets a descriptive error message for an invalid session ID
 *
 * @param sessionId - The invalid session ID
 * @returns A user-friendly error message
 */
export function getSessionIdErrorMessage(sessionId: string | undefined | null): string {
  if (!sessionId) {
    return 'Session ID is required';
  }

  if (typeof sessionId !== 'string') {
    return 'Session ID must be a string';
  }

  if (sessionId.length !== 32) {
    return `Session ID must be exactly 32 characters (received ${sessionId.length} characters)`;
  }

  if (/[A-Z]/.test(sessionId)) {
    return 'Session ID must not contain uppercase letters';
  }

  if (/[^a-z0-9]/.test(sessionId)) {
    return 'Session ID must only contain lowercase letters (a-z) and numbers (0-9)';
  }

  return 'Invalid session ID format';
}
