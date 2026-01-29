import * as fs from 'fs';
import * as path from 'path';
import { Message, ConversationHistory } from './types';
import { DATA_DIR } from './config';

const HISTORY_FILE = path.join(DATA_DIR, '.conversation-history.json');
const MAX_MESSAGES = 20;

export function loadHistory(): Message[] {
  if (!fs.existsSync(HISTORY_FILE)) {
    return [];
  }

  try {
    const data: ConversationHistory = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    return data.messages || [];
  } catch {
    return [];
  }
}

export function saveHistory(messages: Message[]): void {
  const data: ConversationHistory = { messages };
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(data, null, 2));
}

export function addMessage(role: 'user' | 'assistant', content: string): Message[] {
  const history = loadHistory();

  history.push({
    role,
    content,
    timestamp: new Date().toISOString(),
  });

  const trimmed = history.slice(-MAX_MESSAGES);
  saveHistory(trimmed);

  return trimmed;
}

export function formatForPrompt(history: Message[]): string {
  if (history.length === 0) return '';

  const lines = history.map((msg) => {
    const role = msg.role === 'user' ? 'Alexander' : 'Claude';
    return `${role}: ${msg.content}`;
  });

  return `\n\nPrevious conversation:\n---\n${lines.join('\n')}\n---\n`;
}
