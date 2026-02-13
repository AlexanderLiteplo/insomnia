import * as fs from 'fs';
import * as path from 'path';
import { DATA_DIR } from './config';

const SENT_MESSAGES_FILE = path.join(DATA_DIR, '.sent-messages.json');

// Track recently PROCESSED incoming messages to prevent duplicate agent spawns
const PROCESSED_MESSAGES_FILE = path.join(DATA_DIR, '.processed-messages.json');
const PROCESSED_EXPIRY_MS = 30000; // 30 seconds
const COMMAND_EXPIRY_MS = 2000; // 2 seconds for commands (prevent spam, allow repeats)
const SENT_HASH_EXPIRY_MS = 120000; // 2 minutes

// Load processed messages from file (shared across processes)
function loadProcessedMessages(): Map<string, number> {
  try {
    if (fs.existsSync(PROCESSED_MESSAGES_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROCESSED_MESSAGES_FILE, 'utf8'));
      const now = Date.now();
      // Filter out expired entries while loading
      const filtered: Record<string, number> = {};
      for (const [key, timestamp] of Object.entries(data)) {
        if (now - (timestamp as number) < PROCESSED_EXPIRY_MS) {
          filtered[key] = timestamp as number;
        }
      }
      return new Map(Object.entries(filtered));
    }
  } catch {
    // Ignore errors, return empty map
  }
  return new Map();
}

// Save processed messages to file (shared across processes)
function saveProcessedMessages(messages: Map<string, number>): void {
  try {
    const obj: Record<string, number> = {};
    const now = Date.now();
    for (const [key, timestamp] of messages.entries()) {
      // Only save non-expired entries
      if (now - timestamp < PROCESSED_EXPIRY_MS) {
        obj[key] = timestamp;
      }
    }
    fs.writeFileSync(PROCESSED_MESSAGES_FILE, JSON.stringify(obj, null, 2));
  } catch {
    // Ignore write errors
  }
}

// Load sent messages from file (shared across processes)
function loadSentMessages(): Map<string, number> {
  try {
    if (fs.existsSync(SENT_MESSAGES_FILE)) {
      const data = JSON.parse(fs.readFileSync(SENT_MESSAGES_FILE, 'utf8'));
      const now = Date.now();
      // Filter out expired entries while loading
      const filtered: Record<string, number> = {};
      for (const [key, timestamp] of Object.entries(data)) {
        if (now - (timestamp as number) < SENT_HASH_EXPIRY_MS) {
          filtered[key] = timestamp as number;
        }
      }
      return new Map(Object.entries(filtered));
    }
  } catch {
    // Ignore errors, return empty map
  }
  return new Map();
}

// Save sent messages to file (shared across processes)
function saveSentMessages(messages: Map<string, number>): void {
  try {
    const obj: Record<string, number> = {};
    const now = Date.now();
    for (const [key, timestamp] of messages.entries()) {
      // Only save non-expired entries
      if (now - timestamp < SENT_HASH_EXPIRY_MS) {
        obj[key] = timestamp;
      }
    }
    fs.writeFileSync(SENT_MESSAGES_FILE, JSON.stringify(obj, null, 2));
  } catch {
    // Ignore write errors
  }
}

// Normalize text for comparison
function normalizeText(text: string): string {
  return text
    .replace(/^\[Claude\]\s*/, '')
    .replace(/^[+\x00-\x1F\d]+/, '')  // Remove leading corruption/control chars
    .toLowerCase()
    .trim();
}

export function markMessageSent(text: string): void {
  const normalized = normalizeText(text);
  const now = Date.now();

  // Load current state from file (shared with other processes)
  const recentSentMessages = loadSentMessages();

  recentSentMessages.set(normalized, now);
  // Also store first 30 chars as partial key for fragment matching
  if (normalized.length > 30) {
    recentSentMessages.set(normalized.substring(0, 30), now);
  }

  // Save back to file
  saveSentMessages(recentSentMessages);
}

export function wasRecentlySent(text: string): boolean {
  const normalized = normalizeText(text);
  const now = Date.now();

  // Load current state from file (shared with other processes)
  const recentSentMessages = loadSentMessages();

  // Check exact match
  if (recentSentMessages.has(normalized)) {
    return true;
  }

  // Check if incoming text is a fragment of any recently sent message
  for (const [sent, timestamp] of recentSentMessages.entries()) {
    if (now - timestamp > SENT_HASH_EXPIRY_MS) continue;

    // Check if the incoming message is contained in a sent message
    if (sent.includes(normalized) || normalized.includes(sent)) {
      return true;
    }

    // Check if it's a 15+ char substring match (fragment detection)
    if (normalized.length >= 15) {
      const fragment = normalized.substring(0, 15);
      if (sent.includes(fragment)) {
        return true;
      }
    }
  }

  return false;
}

// Check if message was already processed (prevents duplicate processing)
export function wasRecentlyProcessed(text: string): boolean {
  const normalized = normalizeText(text);
  const now = Date.now();
  const isCommand = normalized.startsWith('/');

  // Use shorter expiry for commands (2s vs 30s)
  const expiryTime = isCommand ? COMMAND_EXPIRY_MS : PROCESSED_EXPIRY_MS;

  // Load current state from file (shared with other processes)
  const recentProcessedMessages = loadProcessedMessages();

  const cachedTime = recentProcessedMessages.get(normalized);
  if (cachedTime && now - cachedTime < expiryTime) {
    return true;
  }

  // Also check partial match - same content appearing slightly different
  // Only for non-commands to avoid false positives
  if (!isCommand) {
    for (const [processed, timestamp] of recentProcessedMessages.entries()) {
      if (now - timestamp > PROCESSED_EXPIRY_MS) continue;
      if (processed.includes(normalized) || normalized.includes(processed)) {
        return true;
      }
    }
  }

  return false;
}

export function markAsProcessed(text: string): void {
  const normalized = normalizeText(text);
  const now = Date.now();

  // Load current state from file (shared with other processes)
  const recentProcessedMessages = loadProcessedMessages();

  recentProcessedMessages.set(normalized, now);
  // Also store first 30 chars as partial key for fragment matching (but not for commands)
  if (normalized.length > 30 && !normalized.startsWith('/')) {
    recentProcessedMessages.set(normalized.substring(0, 30), now);
  }

  // Save back to file
  saveProcessedMessages(recentProcessedMessages);
}
