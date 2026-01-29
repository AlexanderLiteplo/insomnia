import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Config, ModelConfig, ClaudeModel } from './types';

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

export const DEFAULT_MODELS: ModelConfig = {
  responder: 'haiku',
  defaultManager: 'opus',
  orchestratorWorker: 'opus',
  orchestratorManager: 'opus',
};

export function loadConfig(): Config {
  const defaults: Config = {
    // Telegram configuration
    telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || '',
    telegramAllowedUserIds: undefined,

    // Common
    claudeWorkDir: process.env.HOME || os.homedir(),
    pollInterval: 5000,

    // Models
    models: DEFAULT_MODELS,
  };

  if (fs.existsSync(CONFIG_PATH)) {
    const fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    // Merge models with defaults to ensure all fields exist
    const mergedModels = { ...DEFAULT_MODELS, ...fileConfig.models };
    return { ...defaults, ...fileConfig, models: mergedModels };
  }

  return defaults;
}

/**
 * Get a specific model setting, with fallback to defaults
 */
export function getModel(key: keyof ModelConfig): ClaudeModel {
  const config = loadConfig();
  return config.models?.[key] || DEFAULT_MODELS[key];
}

export function saveConfig(config: Partial<Config>): void {
  let existing: Partial<Config> = {};

  if (fs.existsSync(CONFIG_PATH)) {
    existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }

  const merged = { ...existing, ...config };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
}

/**
 * Check if Telegram is configured
 */
export function isTelegramConfigured(config: Config): boolean {
  return !!config.telegramBotToken && config.telegramBotToken.length > 0;
}

/**
 * Check if Telegram user restriction is enabled
 */
export function isTelegramUserRestricted(config: Config): boolean {
  return Array.isArray(config.telegramAllowedUserIds) && config.telegramAllowedUserIds.length > 0;
}

/**
 * Check if a Telegram user is allowed
 */
export function isTelegramUserAllowed(config: Config, userId: number): boolean {
  if (!isTelegramUserRestricted(config)) {
    return true;  // No restriction
  }
  return config.telegramAllowedUserIds!.includes(userId);
}

export const DATA_DIR = path.join(__dirname, '..');
