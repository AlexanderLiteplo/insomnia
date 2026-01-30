/**
 * Memory System Configuration
 *
 * Loads and manages memory system configuration.
 */

import * as fs from 'fs';
import * as path from 'path';
import { MemoryConfig } from './types';

const CONFIG_PATH = path.join(__dirname, '..', '..', 'memory-config.json');
const BRIDGE_DIR = path.join(__dirname, '..', '..');

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  // Paths - relative to bridge directory
  memoryDir: path.join(BRIDGE_DIR, 'memory'),
  sessionsDir: path.join(BRIDGE_DIR, 'sessions'),
  dbPath: path.join(BRIDGE_DIR, '.memory.db'),

  // Embedding configuration
  embeddingProvider: 'local',
  embeddingModel: undefined,
  embeddingApiKey: undefined,
  embeddingEndpoint: undefined,

  // Search configuration
  defaultVectorWeight: 0.5,
  defaultKeywordWeight: 0.5,
  minRelevanceScore: 0.3,
  maxSearchResults: 10,

  // Sync configuration
  watchEnabled: true,
  syncIntervalMs: 5000,

  // Session configuration
  autoSummarize: true,
  summaryMaxTokens: 500,
};

export function loadMemoryConfig(): MemoryConfig {
  if (fs.existsSync(CONFIG_PATH)) {
    const fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return { ...DEFAULT_MEMORY_CONFIG, ...fileConfig };
  }
  return DEFAULT_MEMORY_CONFIG;
}

export function saveMemoryConfig(config: Partial<MemoryConfig>): void {
  let existing: Partial<MemoryConfig> = {};

  if (fs.existsSync(CONFIG_PATH)) {
    existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  }

  const merged = { ...existing, ...config };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
}

/**
 * Ensure all required directories exist
 */
export function ensureMemoryDirs(config: MemoryConfig): void {
  const dirs = [config.memoryDir, config.sessionsDir];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Get the path for a session JSONL file
 */
export function getSessionPath(config: MemoryConfig, sessionId: string): string {
  return path.join(config.sessionsDir, `${sessionId}.jsonl`);
}

/**
 * Get the path for a memory markdown file
 */
export function getMemoryPath(config: MemoryConfig, name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9-_]/g, '-');
  return path.join(config.memoryDir, `${sanitized}.md`);
}
