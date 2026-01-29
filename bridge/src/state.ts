import * as fs from 'fs';
import * as path from 'path';
import { State } from './types';
import { DATA_DIR } from './config';

const STATE_FILE = path.join(DATA_DIR, '.imessage-state.json');

let lastMessageRowId = 0;

export function loadState(): void {
  if (fs.existsSync(STATE_FILE)) {
    try {
      const state: State = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
      lastMessageRowId = state.lastMessageRowId || 0;
    } catch {
      lastMessageRowId = 0;
    }
  }
}

export function saveState(): void {
  const state: State = { lastMessageRowId };
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

export function getLastRowId(): number {
  return lastMessageRowId;
}

export function setLastRowId(rowId: number): void {
  lastMessageRowId = Math.max(lastMessageRowId, rowId);
}

// Track full message content for fuzzy matching
const recentSentMessages: Map<string, number> = new Map();
const SENT_HASH_EXPIRY_MS = 120000; // 2 minutes

// Track recently PROCESSED incoming messages to prevent duplicate agent spawns
// This handles iCloud syncing the same message with different ROWIDs
const recentProcessedMessages: Map<string, number> = new Map();
const PROCESSED_EXPIRY_MS = 30000; // 30 seconds

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
  recentSentMessages.set(normalized, Date.now());
  // Also store first 30 chars as partial key for fragment matching
  if (normalized.length > 30) {
    recentSentMessages.set(normalized.substring(0, 30), Date.now());
  }
  // Auto-expire after 2 minutes
  setTimeout(() => {
    recentSentMessages.delete(normalized);
    if (normalized.length > 30) {
      recentSentMessages.delete(normalized.substring(0, 30));
    }
  }, SENT_HASH_EXPIRY_MS);
}

export function wasRecentlySent(text: string): boolean {
  const normalized = normalizeText(text);
  const now = Date.now();

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

// Check if message was already processed (prevents iCloud duplicate ROWID issue)
export function wasRecentlyProcessed(text: string): boolean {
  const normalized = normalizeText(text);
  const now = Date.now();

  // Clean up expired entries
  for (const [key, timestamp] of recentProcessedMessages.entries()) {
    if (now - timestamp > PROCESSED_EXPIRY_MS) {
      recentProcessedMessages.delete(key);
    }
  }

  // Debug: log current state
  if (recentProcessedMessages.size > 0) {
    console.log(`[DEBUG] Checking dedup for: "${normalized.substring(0, 40)}..."`);
    console.log(`[DEBUG] Recent processed (${recentProcessedMessages.size}):`, Array.from(recentProcessedMessages.keys()).map(k => k.substring(0, 40)));
  }

  if (recentProcessedMessages.has(normalized)) {
    return true;
  }

  // Also check partial match - same content appearing slightly different
  for (const [processed, timestamp] of recentProcessedMessages.entries()) {
    if (now - timestamp > PROCESSED_EXPIRY_MS) continue;
    if (processed.includes(normalized) || normalized.includes(processed)) {
      return true;
    }
  }

  return false;
}

export function markAsProcessed(text: string): void {
  const normalized = normalizeText(text);
  recentProcessedMessages.set(normalized, Date.now());
  // Auto-expire
  setTimeout(() => recentProcessedMessages.delete(normalized), PROCESSED_EXPIRY_MS);
}
