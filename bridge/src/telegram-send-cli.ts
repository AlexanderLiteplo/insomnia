#!/usr/bin/env node
/**
 * CLI tool for sending Telegram messages
 * Used by managers to communicate back to users
 *
 * Usage: node telegram-send-cli.js <chat_id> "Your message"
 */

import { loadConfig } from './config';
import { TelegramBot, TELEGRAM_PREFIX } from './telegram';
import { addMessage } from './history';

const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('Usage: node telegram-send-cli.js <chat_id> "Your message"');
  console.error('Example: node telegram-send-cli.js 123456789 "Task completed!"');
  process.exit(1);
}

const chatId = args[0];
const message = args.slice(1).join(' ');

if (!chatId || !message) {
  console.error('Both chat_id and message are required');
  process.exit(1);
}

const config = loadConfig();

if (!config.telegramBotToken) {
  console.error('ERROR: Telegram bot token not configured');
  console.error('Run: npm run setup to configure the bot');
  process.exit(1);
}

const bot = new TelegramBot(config.telegramBotToken);
const prefixedMessage = `${TELEGRAM_PREFIX} ${message}`;

bot.sendMessage(chatId, prefixedMessage)
  .then(() => {
    addMessage('assistant', message);
    console.log(`✅ Telegram message sent to ${chatId}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`❌ Failed: ${err.message}`);
    process.exit(1);
  });
