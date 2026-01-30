/**
 * Memory System - Main Export
 *
 * Hybrid vector + keyword search memory system with:
 * - Session transcripts as JSONL
 * - Memory files as markdown
 * - SQLite with vector embeddings
 * - FTS5 for keyword search
 * - Smart syncing via file watcher
 */

// Types
export * from './types';

// Configuration
export { loadMemoryConfig, saveMemoryConfig, ensureMemoryDirs } from './config';

// Session management
export {
  createSession,
  appendMessage,
  appendUserMessage,
  appendAssistantMessage,
  endSession,
  loadSession,
  listSessions,
  getSessionMetadata,
  getSessionContent,
  generateSessionId,
  deleteSession,
  getRecentSessions,
} from './sessions';

// Store operations
export {
  initDatabase,
  closeDatabase,
  upsertEntry,
  deleteEntry,
  deleteBySource,
  getEntry,
  getEntryBySource,
  search,
  getStats,
  listEntries,
  rebuildFtsIndex,
} from './store';

// Sync operations
export {
  fullSync,
  startWatching,
  stopWatching,
  isWatchingActive,
  handleSyncEvent,
} from './sync';

// Memory writing
export {
  writeMemory,
  appendMemory,
  generateConversationSummary,
  writeSessionSummary,
  readMemory,
  listMemories,
  deleteMemory,
} from './writer';

// Hooks for integration
export {
  preConversationHook,
  postConversationHook,
  memorySearchHook,
  memoryWriteHook,
  getMemoryStatus,
  preOrchestratorHook,
} from './hooks';

// Embeddings
export { getEmbeddingProvider, cosineSimilarity } from './embeddings';
