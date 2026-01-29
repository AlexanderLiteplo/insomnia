/**
 * Telegram message sending helper
 * Used by managers to send messages back to the user
 */

import { loadConfig } from './config';
import { TelegramBot, TELEGRAM_PREFIX } from './telegram';
import { addMessage } from './history';
import { log } from './logger';

let botInstance: TelegramBot | null = null;

/**
 * Initialize the bot instance for sending (called by server on startup)
 */
export function initTelegramSender(bot: TelegramBot): void {
  botInstance = bot;
}

/**
 * Get or create the bot instance
 */
function getBot(): TelegramBot {
  if (botInstance) {
    return botInstance;
  }

  // Fallback: create new instance from config
  const config = loadConfig();
  if (!config.telegramBotToken) {
    throw new Error('Telegram bot token not configured');
  }

  botInstance = new TelegramBot(config.telegramBotToken);
  return botInstance;
}

/**
 * Send a message to a Telegram chat
 */
export async function sendTelegramMessage(chatId: number | string, message: string): Promise<void> {
  const bot = getBot();
  const prefixedMessage = `${TELEGRAM_PREFIX} ${message}`;

  try {
    await bot.sendMessage(chatId, prefixedMessage);
    addMessage('assistant', message);
    log(`[Telegram] Message sent to ${chatId}`);
  } catch (err: any) {
    log(`[Telegram] Failed to send message: ${err.message}`);
    throw err;
  }
}

/**
 * Send a message without the prefix (for raw output)
 */
export async function sendTelegramMessageRaw(chatId: number | string, message: string): Promise<void> {
  const bot = getBot();

  try {
    await bot.sendMessage(chatId, message);
    log(`[Telegram] Raw message sent to ${chatId}`);
  } catch (err: any) {
    log(`[Telegram] Failed to send raw message: ${err.message}`);
    throw err;
  }
}
