/**
 * Session Transcript Storage
 *
 * Stores session transcripts as JSONL (JSON Lines) format.
 * Each line is a JSON object representing a message or event.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SessionTranscript, SessionMessage, ToolCall } from './types';
import { loadMemoryConfig, ensureMemoryDirs, getSessionPath } from './config';

/**
 * Create a new session transcript
 */
export function createSession(
  sessionId: string,
  managerId?: string,
  projectId?: string,
  metadata?: Record<string, unknown>
): SessionTranscript {
  const session: SessionTranscript = {
    sessionId,
    managerId,
    projectId,
    startedAt: new Date().toISOString(),
    messages: [],
    metadata,
  };

  const config = loadMemoryConfig();
  ensureMemoryDirs(config);

  // Write initial session header
  const filePath = getSessionPath(config, sessionId);
  const header = {
    type: 'session_start',
    ...session,
    messages: undefined,  // Don't include empty messages array in header
  };
  fs.writeFileSync(filePath, JSON.stringify(header) + '\n');

  return session;
}

/**
 * Append a message to a session transcript
 */
export function appendMessage(
  sessionId: string,
  message: SessionMessage
): void {
  const config = loadMemoryConfig();
  const filePath = getSessionPath(config, sessionId);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Session ${sessionId} not found`);
  }

  const entry = {
    type: 'message',
    ...message,
  };

  fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
}

/**
 * Append a user message
 */
export function appendUserMessage(sessionId: string, content: string): void {
  appendMessage(sessionId, {
    role: 'user',
    content,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Append an assistant message with optional tool calls
 */
export function appendAssistantMessage(
  sessionId: string,
  content: string,
  toolCalls?: ToolCall[]
): void {
  appendMessage(sessionId, {
    role: 'assistant',
    content,
    timestamp: new Date().toISOString(),
    toolCalls,
  });
}

/**
 * End a session and optionally add a summary
 */
export function endSession(sessionId: string, summary?: string): void {
  const config = loadMemoryConfig();
  const filePath = getSessionPath(config, sessionId);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Session ${sessionId} not found`);
  }

  const endEntry = {
    type: 'session_end',
    endedAt: new Date().toISOString(),
    summary,
  };

  fs.appendFileSync(filePath, JSON.stringify(endEntry) + '\n');
}

/**
 * Load a complete session from JSONL file
 */
export function loadSession(sessionId: string): SessionTranscript | null {
  const config = loadMemoryConfig();
  const filePath = getSessionPath(config, sessionId);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const lines = fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(line => line.trim());

  let session: SessionTranscript | null = null;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      if (entry.type === 'session_start') {
        session = {
          sessionId: entry.sessionId,
          managerId: entry.managerId,
          projectId: entry.projectId,
          startedAt: entry.startedAt,
          messages: [],
          metadata: entry.metadata,
        };
      } else if (entry.type === 'message' && session) {
        session.messages.push({
          role: entry.role,
          content: entry.content,
          timestamp: entry.timestamp,
          toolCalls: entry.toolCalls,
        });
      } else if (entry.type === 'session_end' && session) {
        session.endedAt = entry.endedAt;
        session.summary = entry.summary;
      }
    } catch (e) {
      console.error(`Error parsing JSONL line: ${line}`, e);
    }
  }

  return session;
}

/**
 * List all session IDs
 */
export function listSessions(): string[] {
  const config = loadMemoryConfig();
  ensureMemoryDirs(config);

  const files = fs.readdirSync(config.sessionsDir);
  return files
    .filter(f => f.endsWith('.jsonl'))
    .map(f => f.replace('.jsonl', ''));
}

/**
 * Get session metadata without loading all messages
 */
export function getSessionMetadata(sessionId: string): {
  sessionId: string;
  managerId?: string;
  projectId?: string;
  startedAt: string;
  endedAt?: string;
  messageCount: number;
} | null {
  const config = loadMemoryConfig();
  const filePath = getSessionPath(config, sessionId);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  const lines = fs.readFileSync(filePath, 'utf8')
    .split('\n')
    .filter(line => line.trim());

  let metadata: any = null;
  let messageCount = 0;
  let endedAt: string | undefined;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.type === 'session_start') {
        metadata = {
          sessionId: entry.sessionId,
          managerId: entry.managerId,
          projectId: entry.projectId,
          startedAt: entry.startedAt,
        };
      } else if (entry.type === 'message') {
        messageCount++;
      } else if (entry.type === 'session_end') {
        endedAt = entry.endedAt;
      }
    } catch (e) {
      // Skip invalid lines
    }
  }

  if (!metadata) return null;

  return {
    ...metadata,
    endedAt,
    messageCount,
  };
}

/**
 * Get the full text content of a session for indexing
 */
export function getSessionContent(sessionId: string): string {
  const session = loadSession(sessionId);
  if (!session) return '';

  const parts: string[] = [];

  // Add summary if available
  if (session.summary) {
    parts.push(`Summary: ${session.summary}`);
  }

  // Add all messages
  for (const msg of session.messages) {
    parts.push(`[${msg.role}]: ${msg.content}`);
  }

  return parts.join('\n\n');
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `session_${timestamp}_${random}`;
}

/**
 * Delete a session
 */
export function deleteSession(sessionId: string): boolean {
  const config = loadMemoryConfig();
  const filePath = getSessionPath(config, sessionId);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

/**
 * Get recent sessions (sorted by start time, newest first)
 */
export function getRecentSessions(limit = 10): Array<{
  sessionId: string;
  managerId?: string;
  projectId?: string;
  startedAt: string;
  endedAt?: string;
  messageCount: number;
}> {
  const sessionIds = listSessions();
  const sessions: any[] = [];

  for (const id of sessionIds) {
    const meta = getSessionMetadata(id);
    if (meta) {
      sessions.push(meta);
    }
  }

  // Sort by start time, newest first
  sessions.sort((a, b) =>
    new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  return sessions.slice(0, limit);
}
