/**
 * Telegram Bot API Client
 * Handles all communication with Telegram's Bot API
 */

import * as https from 'https';
import * as http from 'http';
import { log } from './logger';

const TELEGRAM_API_BASE = 'https://api.telegram.org/bot';

export interface TelegramUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
}

export interface TelegramChat {
  id: number;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  reply_to_message?: TelegramMessage;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
}

export interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
}

export class TelegramBot {
  private token: string;
  private lastUpdateId: number = 0;

  constructor(token: string) {
    this.token = token;
  }

  private async request<T>(method: string, params: Record<string, any> = {}): Promise<T> {
    return new Promise((resolve, reject) => {
      const url = `${TELEGRAM_API_BASE}${this.token}/${method}`;
      const postData = JSON.stringify(params);

      const urlObj = new URL(url);
      const options: https.RequestOptions = {
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const response: TelegramResponse<T> = JSON.parse(data);
            if (response.ok && response.result !== undefined) {
              resolve(response.result);
            } else {
              reject(new Error(response.description || 'Unknown Telegram API error'));
            }
          } catch (err) {
            reject(new Error(`Failed to parse Telegram response: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }

  /**
   * Verify the bot token is valid and get bot info
   */
  async getMe(): Promise<TelegramUser> {
    return this.request<TelegramUser>('getMe');
  }

  /**
   * Send a text message
   */
  async sendMessage(chatId: number | string, text: string, options: {
    parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
    disable_notification?: boolean;
    reply_to_message_id?: number;
  } = {}): Promise<TelegramMessage> {
    // Telegram has a 4096 character limit per message
    const MAX_LENGTH = 4000; // Leave some buffer

    if (text.length <= MAX_LENGTH) {
      return this.request<TelegramMessage>('sendMessage', {
        chat_id: chatId,
        text,
        ...options,
      });
    }

    // Split long messages
    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
      if (remaining.length <= MAX_LENGTH) {
        chunks.push(remaining);
        break;
      }

      // Try to split at a newline or space
      let splitAt = remaining.lastIndexOf('\n', MAX_LENGTH);
      if (splitAt < MAX_LENGTH / 2) {
        splitAt = remaining.lastIndexOf(' ', MAX_LENGTH);
      }
      if (splitAt < MAX_LENGTH / 2) {
        splitAt = MAX_LENGTH;
      }

      chunks.push(remaining.substring(0, splitAt));
      remaining = remaining.substring(splitAt).trimStart();
    }

    // Send all chunks
    let lastMessage: TelegramMessage | null = null;
    for (const chunk of chunks) {
      lastMessage = await this.request<TelegramMessage>('sendMessage', {
        chat_id: chatId,
        text: chunk,
        ...options,
      });
      // Small delay between messages to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return lastMessage!;
  }

  /**
   * Get updates using long polling
   */
  async getUpdates(options: {
    offset?: number;
    limit?: number;
    timeout?: number;
    allowed_updates?: string[];
  } = {}): Promise<TelegramUpdate[]> {
    const updates = await this.request<TelegramUpdate[]>('getUpdates', {
      offset: options.offset ?? this.lastUpdateId + 1,
      limit: options.limit ?? 100,
      timeout: options.timeout ?? 30, // Long polling timeout in seconds
      allowed_updates: options.allowed_updates ?? ['message'],
    });

    // Track the last update ID
    if (updates.length > 0) {
      this.lastUpdateId = Math.max(this.lastUpdateId, ...updates.map(u => u.update_id));
    }

    return updates;
  }

  /**
   * Set the last update ID (for persistence)
   */
  setLastUpdateId(id: number): void {
    this.lastUpdateId = id;
  }

  /**
   * Get the last update ID
   */
  getLastUpdateId(): number {
    return this.lastUpdateId;
  }

  /**
   * Delete webhook (needed if previously set)
   */
  async deleteWebhook(): Promise<boolean> {
    return this.request<boolean>('deleteWebhook', { drop_pending_updates: false });
  }

  /**
   * Set bot commands (shown in the menu)
   */
  async setMyCommands(commands: { command: string; description: string }[]): Promise<boolean> {
    return this.request<boolean>('setMyCommands', { commands });
  }
}

/**
 * Message prefix for bot responses
 */
export const TELEGRAM_PREFIX = '🤖';

/**
 * Check if a message is from the bot itself (to avoid loops)
 */
export function isBotMessage(text: string): boolean {
  return text.startsWith(TELEGRAM_PREFIX);
}
