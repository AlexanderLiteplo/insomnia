/**
 * Telegram Bot Bridge Server
 * Uses Telegram Bot API for message routing
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { loadConfig, DATA_DIR, isTelegramUserAllowed, isTelegramUserRestricted } from './config';
import { wasRecentlyProcessed, markAsProcessed } from './state';
import { setLastChatId } from './human-tasks';
import { handleIncomingMessage } from './telegram-responder';
import { log } from './logger';
import { getAllManagers, getActiveManagers } from './manager-registry';
import { TelegramBot, TelegramUpdate, TELEGRAM_PREFIX, isBotMessage } from './telegram';
import { loadTelegramState, saveTelegramState } from './telegram-state';
import { runStartupHealthCheck } from './health-checker';
import { PATHS, getOrchestratorDir, isOrchestratorAvailable } from './paths';

// Lock file to prevent multiple instances
const LOCK_FILE = path.join(DATA_DIR, '.bridge.lock');

function acquireLock(): boolean {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
      try {
        process.kill(pid, 0);
        log(`Another instance is already running (PID: ${pid}). Exiting.`);
        return false;
      } catch {
        log(`Removing stale lock file (PID ${pid} not running)`);
        fs.unlinkSync(LOCK_FILE);
      }
    }
    fs.writeFileSync(LOCK_FILE, process.pid.toString());
    return true;
  } catch (err) {
    log(`Failed to acquire lock: ${err}`);
    return false;
  }
}

function releaseLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch {
    // Ignore errors on cleanup
  }
}

// Orchestrator monitoring - use paths from centralized path config
const ORCHESTRATOR_DIR = getOrchestratorDir();
const WORKER_PID_FILE = PATHS.orchestrator.workerPid;
const MANAGER_PID_FILE = PATHS.orchestrator.managerPid;
const TASKS_FILE = PATHS.orchestrator.tasks;

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isOrchestratorRunning(): { worker: boolean; manager: boolean } {
  let workerRunning = false;
  let managerRunning = false;

  if (fs.existsSync(WORKER_PID_FILE)) {
    const pid = parseInt(fs.readFileSync(WORKER_PID_FILE, 'utf8').trim(), 10);
    workerRunning = isProcessRunning(pid);
  }

  if (fs.existsSync(MANAGER_PID_FILE)) {
    const pid = parseInt(fs.readFileSync(MANAGER_PID_FILE, 'utf8').trim(), 10);
    managerRunning = isProcessRunning(pid);
  }

  return { worker: workerRunning, manager: managerRunning };
}

function hasPendingTasks(): boolean {
  try {
    if (!fs.existsSync(TASKS_FILE)) {
      return false;
    }
    const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    return tasks.tasks?.some((t: { status: string }) =>
      t.status === 'pending' || t.status === 'in_progress' || t.status === 'worker_done'
    ) ?? false;
  } catch {
    return false;
  }
}

function checkAndRestartOrchestrator(): void {
  // Check if orchestrator is even available on this device
  if (!isOrchestratorAvailable()) {
    return; // Orchestrator not set up on this device
  }

  const status = isOrchestratorRunning();

  if (!hasPendingTasks()) {
    return;
  }

  if (!status.worker || !status.manager) {
    const missing = [];
    if (!status.worker) missing.push('Worker');
    if (!status.manager) missing.push('Manager');

    log(`🔄 Orchestrator ${missing.join(' and ')} not running, restarting...`);

    try {
      const orchestratorScript = PATHS.orchestrator.orchestratorScript;
      if (fs.existsSync(orchestratorScript)) {
        execSync(`"${orchestratorScript}" start`, {
          cwd: ORCHESTRATOR_DIR,
          stdio: 'ignore',
          timeout: 30000
        });
        log(`✅ Orchestrator restarted successfully`);
      } else {
        log(`⚠️  Orchestrator script not found at: ${orchestratorScript}`);
      }
    } catch (err) {
      log(`❌ Failed to restart orchestrator: ${err}`);
    }
  }
}

// Global state
let bot: TelegramBot;
let isPolling = false;

async function pollForUpdates(): Promise<void> {
  if (isPolling) return;
  isPolling = true;

  const config = loadConfig();

  try {
    // Long polling with 30 second timeout
    const updates = await bot.getUpdates({ timeout: 30 });

    for (const update of updates) {
      await processUpdate(update, config);
    }

    // Save state after processing
    saveTelegramState({ lastUpdateId: bot.getLastUpdateId() });

  } catch (err: any) {
    // Don't log timeout errors (they're normal for long polling)
    if (!err.message?.includes('ETIMEDOUT') && !err.message?.includes('ECONNRESET')) {
      log(`[Telegram] Poll error: ${err.message}`);
    }
  } finally {
    isPolling = false;
  }
}

async function processUpdate(update: TelegramUpdate, config: any): Promise<void> {
  const message = update.message;
  if (!message || !message.text) return;

  const chatId = message.chat.id;
  const userId = message.from?.id;
  const text = message.text;
  const senderName = message.from?.first_name || message.from?.username || 'Unknown';

  log(`[Telegram] Message from ${senderName} (${userId}): "${text.substring(0, 50)}..."`);

  // Check if user is allowed (if restriction is enabled)
  if (userId && !isTelegramUserAllowed(config, userId)) {
    log(`[Telegram] Ignoring message from unauthorized user ${userId}`);
    await bot.sendMessage(chatId, `${TELEGRAM_PREFIX} Sorry, you're not authorized to use this bot.`);
    return;
  }

  // Skip bot's own messages
  if (isBotMessage(text)) {
    log(`[Telegram] Skipping bot's own message`);
    return;
  }

  // Skip already processed messages (deduplication)
  if (wasRecentlyProcessed(text)) {
    log(`[Telegram] Skipping duplicate message`);
    return;
  }

  // Mark as processed
  markAsProcessed(text);

  // Process the message through the responder
  try {
    await handleIncomingMessage(chatId, text, userId);
  } catch (err) {
    log(`[Telegram] Error processing message: ${err}`);
    await bot.sendMessage(chatId, `${TELEGRAM_PREFIX} Error processing your message. Please try again.`);
  }
}

async function main(): Promise<void> {
  // Run startup health check first
  log('🚀 Starting Telegram Bridge...');
  const healthResult = runStartupHealthCheck();

  if (!healthResult.healthy) {
    log('⚠️  Health check found issues, but continuing startup...');
  }

  // Acquire lock
  if (!acquireLock()) {
    process.exit(1);
  }

  const config = loadConfig();

  // Validate Telegram token
  if (!config.telegramBotToken) {
    log('❌ Telegram bot token not configured!');
    log('Run: npm run setup to configure the bot');
    releaseLock();
    process.exit(1);
  }

  // Initialize bot
  bot = new TelegramBot(config.telegramBotToken);

  try {
    // Verify token and get bot info
    const botInfo = await bot.getMe();
    log(`🤖 Connected as @${botInfo.username} (${botInfo.first_name})`);

    // Delete any existing webhook (we use long polling)
    await bot.deleteWebhook();

    // Set bot commands
    await bot.setMyCommands([
      { command: 'status', description: 'Check bridge and manager status' },
      { command: 'managers', description: 'List active managers' },
      { command: 'help', description: 'Show help information' },
    ]);

    // Load previous state
    const telegramState = loadTelegramState();
    if (telegramState.lastUpdateId) {
      bot.setLastUpdateId(telegramState.lastUpdateId);
      log(`📊 Resuming from update ID: ${telegramState.lastUpdateId}`);
    }

  } catch (err: any) {
    log(`❌ Failed to connect to Telegram: ${err.message}`);
    log('Please check your bot token is correct.');
    releaseLock();
    process.exit(1);
  }

  log('🚀 Telegram Bridge started');
  log(`🤖 Work directory: ${config.claudeWorkDir}`);
  log(`📊 Poll interval: Long polling (30s timeout)`);
  log(`🎯 Multi-manager mode: messages routed via responder`);

  if (isTelegramUserRestricted(config)) {
    log(`🔒 User restriction enabled: ${config.telegramAllowedUserIds!.length} allowed user(s)`);
  }

  // Log active managers on startup
  const activeManagers = getActiveManagers();
  if (activeManagers.length > 0) {
    log(`📋 Active managers: ${activeManagers.map(m => m.name).join(', ')}`);
  } else {
    log(`📋 No active managers (will create on first message)`);
  }

  // Start polling loop
  const poll = async () => {
    await pollForUpdates();
    // Use setImmediate for continuous polling without stack overflow
    setImmediate(poll);
  };
  poll();

  // Check orchestrator health every 60 seconds
  const ORCHESTRATOR_CHECK_INTERVAL = 60000;
  log(`🔧 Orchestrator monitor: checking every ${ORCHESTRATOR_CHECK_INTERVAL / 1000}s`);
  setInterval(checkAndRestartOrchestrator, ORCHESTRATOR_CHECK_INTERVAL);
  setTimeout(checkAndRestartOrchestrator, 5000);

  // Graceful shutdown
  const shutdown = () => {
    log('Shutting down...');
    releaseLock();
    saveTelegramState({ lastUpdateId: bot.getLastUpdateId() });
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

// Export bot instance for use in other modules
export function getBot(): TelegramBot {
  return bot;
}

// Run
main().catch((err) => {
  log(`Fatal error: ${err}`);
  releaseLock();
  process.exit(1);
});
