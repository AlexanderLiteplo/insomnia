/**
 * Memory Writer
 *
 * Utilities for writing memory files as markdown.
 * The agent uses standard file write operations - no special API needed.
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadMemoryConfig, ensureMemoryDirs, getMemoryPath } from './config';
import { ConversationSummary, SessionTranscript } from './types';
import { loadSession } from './sessions';

/**
 * Write a memory file
 */
export function writeMemory(
  name: string,
  content: string,
  options?: {
    tags?: string[];
    overwrite?: boolean;
  }
): string {
  const config = loadMemoryConfig();
  ensureMemoryDirs(config);

  const filePath = getMemoryPath(config, name);

  // Check if file exists and overwrite is false
  if (fs.existsSync(filePath) && !options?.overwrite) {
    throw new Error(`Memory file already exists: ${filePath}`);
  }

  // Build markdown content
  let markdown = `# ${name}\n\n`;

  if (options?.tags && options.tags.length > 0) {
    markdown += `Tags: ${options.tags.join(', ')}\n\n`;
  }

  markdown += content;

  fs.writeFileSync(filePath, markdown);
  console.log(`[Memory] Written: ${filePath}`);

  return filePath;
}

/**
 * Append to a memory file
 */
export function appendMemory(name: string, content: string): string {
  const config = loadMemoryConfig();
  ensureMemoryDirs(config);

  const filePath = getMemoryPath(config, name);

  if (!fs.existsSync(filePath)) {
    return writeMemory(name, content);
  }

  const existing = fs.readFileSync(filePath, 'utf8');
  const updated = existing + '\n\n---\n\n' + content;

  fs.writeFileSync(filePath, updated);
  console.log(`[Memory] Appended: ${filePath}`);

  return filePath;
}

/**
 * Generate a conversation summary from a session
 */
export function generateConversationSummary(
  session: SessionTranscript
): ConversationSummary {
  const messages = session.messages;

  // Extract key information from messages
  const topics: Set<string> = new Set();
  const decisions: string[] = [];
  const codeChanges: string[] = [];

  // Simple heuristics to identify key content
  for (const msg of messages) {
    const content = msg.content.toLowerCase();

    // Look for decision indicators
    if (content.includes('decided') || content.includes('will use') || content.includes('going to')) {
      const sentence = extractSentence(msg.content, ['decided', 'will use', 'going to']);
      if (sentence) decisions.push(sentence);
    }

    // Look for code changes
    if (content.includes('created') || content.includes('updated') || content.includes('modified')) {
      const sentence = extractSentence(msg.content, ['created', 'updated', 'modified']);
      if (sentence) codeChanges.push(sentence);
    }

    // Extract topics from tool calls
    if (msg.toolCalls) {
      for (const call of msg.toolCalls) {
        topics.add(call.name);
      }
    }
  }

  // Generate title from first user message
  const firstUserMsg = messages.find(m => m.role === 'user');
  const title = firstUserMsg
    ? firstUserMsg.content.substring(0, 100).replace(/\n/g, ' ')
    : `Session ${session.sessionId}`;

  // Generate summary
  const summary = summarizeConversation(messages);

  return {
    sessionId: session.sessionId,
    title,
    summary,
    keyTopics: Array.from(topics).slice(0, 10),
    decisions: decisions.slice(0, 5),
    codeChanges: codeChanges.slice(0, 10),
    createdAt: new Date().toISOString(),
  };
}

/**
 * Extract a sentence containing one of the keywords
 */
function extractSentence(text: string, keywords: string[]): string | null {
  const sentences = text.split(/[.!?]+/);

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        const trimmed = sentence.trim();
        if (trimmed.length > 10 && trimmed.length < 200) {
          return trimmed;
        }
      }
    }
  }

  return null;
}

/**
 * Simple conversation summarizer
 */
function summarizeConversation(messages: SessionTranscript['messages']): string {
  if (messages.length === 0) return 'Empty conversation';

  // Get key points from the conversation
  const points: string[] = [];

  // First user message (the initial request)
  const firstUser = messages.find(m => m.role === 'user');
  if (firstUser) {
    const preview = firstUser.content.substring(0, 200).replace(/\n/g, ' ');
    points.push(`Request: ${preview}${firstUser.content.length > 200 ? '...' : ''}`);
  }

  // Count assistant responses
  const assistantCount = messages.filter(m => m.role === 'assistant').length;
  points.push(`${assistantCount} assistant responses`);

  // Count tool calls
  const toolCalls = messages
    .filter(m => m.toolCalls && m.toolCalls.length > 0)
    .flatMap(m => m.toolCalls!)
    .map(tc => tc.name);

  if (toolCalls.length > 0) {
    const toolCounts = new Map<string, number>();
    for (const tool of toolCalls) {
      toolCounts.set(tool, (toolCounts.get(tool) || 0) + 1);
    }

    const toolSummary = Array.from(toolCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => `${name}(${count})`)
      .join(', ');

    points.push(`Tools used: ${toolSummary}`);
  }

  return points.join('\n');
}

/**
 * Write a session summary as a memory file
 */
export function writeSessionSummary(sessionId: string): string | null {
  const session = loadSession(sessionId);
  if (!session) {
    console.error(`[Memory] Session not found: ${sessionId}`);
    return null;
  }

  if (session.messages.length === 0) {
    console.log(`[Memory] Session has no messages: ${sessionId}`);
    return null;
  }

  const summary = generateConversationSummary(session);

  // Build markdown content
  let content = `## Summary\n\n${summary.summary}\n\n`;

  if (summary.keyTopics.length > 0) {
    content += `## Key Topics\n\n`;
    for (const topic of summary.keyTopics) {
      content += `- ${topic}\n`;
    }
    content += '\n';
  }

  if (summary.decisions.length > 0) {
    content += `## Decisions\n\n`;
    for (const decision of summary.decisions) {
      content += `- ${decision}\n`;
    }
    content += '\n';
  }

  if (summary.codeChanges.length > 0) {
    content += `## Code Changes\n\n`;
    for (const change of summary.codeChanges) {
      content += `- ${change}\n`;
    }
    content += '\n';
  }

  // Add session metadata
  content += `## Session Info\n\n`;
  content += `- Session ID: ${session.sessionId}\n`;
  content += `- Started: ${session.startedAt}\n`;
  if (session.endedAt) {
    content += `- Ended: ${session.endedAt}\n`;
  }
  if (session.managerId) {
    content += `- Manager: ${session.managerId}\n`;
  }
  if (session.projectId) {
    content += `- Project: ${session.projectId}\n`;
  }
  content += `- Messages: ${session.messages.length}\n`;

  // Write with date prefix for organization
  const date = new Date(session.startedAt).toISOString().split('T')[0];
  const name = `session-${date}-${sessionId.substring(0, 8)}`;

  return writeMemory(name, content, {
    tags: ['session', 'summary', ...(summary.keyTopics.slice(0, 5))],
    overwrite: true,
  });
}

/**
 * Read a memory file
 */
export function readMemory(name: string): string | null {
  const config = loadMemoryConfig();
  const filePath = getMemoryPath(config, name);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  return fs.readFileSync(filePath, 'utf8');
}

/**
 * List all memory files
 */
export function listMemories(): Array<{
  name: string;
  path: string;
  size: number;
  modified: Date;
}> {
  const config = loadMemoryConfig();
  ensureMemoryDirs(config);

  const files = fs.readdirSync(config.memoryDir)
    .filter(f => f.endsWith('.md'));

  return files.map(f => {
    const filePath = path.join(config.memoryDir, f);
    const stats = fs.statSync(filePath);
    return {
      name: f.replace('.md', ''),
      path: filePath,
      size: stats.size,
      modified: stats.mtime,
    };
  });
}

/**
 * Delete a memory file
 */
export function deleteMemory(name: string): boolean {
  const config = loadMemoryConfig();
  const filePath = getMemoryPath(config, name);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}
