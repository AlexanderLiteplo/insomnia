/**
 * Memory System Types
 *
 * Types for the hybrid vector + keyword search memory system.
 */

export interface MemoryEntry {
  id: string;
  type: 'session' | 'memory' | 'skill';
  source: string;           // File path or session ID
  content: string;          // Full text content
  title?: string;           // Optional title (from markdown H1)
  tags?: string[];          // Optional tags
  embedding?: number[];     // Vector embedding (if computed)
  createdAt: string;        // ISO timestamp
  updatedAt: string;        // ISO timestamp
  metadata?: Record<string, unknown>;
}

export interface SessionTranscript {
  sessionId: string;
  managerId?: string;
  projectId?: string;
  startedAt: string;
  endedAt?: string;
  messages: SessionMessage[];
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  toolCalls?: ToolCall[];
}

export interface ToolCall {
  name: string;
  input?: Record<string, unknown>;
  result?: string;
}

export interface SearchResult {
  entry: MemoryEntry;
  score: number;              // Combined relevance score (0-1)
  vectorScore?: number;       // Semantic similarity score
  keywordScore?: number;      // FTS5 match score
  matchType: 'vector' | 'keyword' | 'hybrid';
  highlights?: string[];      // Highlighted snippets
}

export interface SearchOptions {
  query: string;
  limit?: number;             // Max results (default: 10)
  types?: ('session' | 'memory' | 'skill')[];
  minScore?: number;          // Minimum relevance threshold (default: 0.3)
  vectorWeight?: number;      // Weight for vector score (default: 0.5)
  keywordWeight?: number;     // Weight for keyword score (default: 0.5)
  dateFrom?: string;          // Filter by date range
  dateTo?: string;
  tags?: string[];            // Filter by tags
}

export interface EmbeddingProvider {
  name: string;
  dimensions: number;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface MemoryConfig {
  // Paths
  memoryDir: string;          // Directory for memory/*.md files
  sessionsDir: string;        // Directory for session transcripts (JSONL)
  dbPath: string;             // SQLite database path

  // Embedding configuration
  embeddingProvider: 'openai' | 'local' | 'ollama';
  embeddingModel?: string;
  embeddingApiKey?: string;
  embeddingEndpoint?: string;

  // Search configuration
  defaultVectorWeight: number;
  defaultKeywordWeight: number;
  minRelevanceScore: number;
  maxSearchResults: number;

  // Sync configuration
  watchEnabled: boolean;
  syncIntervalMs: number;

  // Session configuration
  autoSummarize: boolean;
  summaryMaxTokens: number;
}

export interface SyncEvent {
  type: 'add' | 'change' | 'unlink';
  path: string;
  timestamp: string;
}

export interface MemoryStats {
  totalEntries: number;
  sessionCount: number;
  memoryCount: number;
  skillCount: number;
  lastSync: string;
  dbSizeBytes: number;
  embeddingsComputed: number;
}

export interface ConversationSummary {
  sessionId: string;
  title: string;
  summary: string;
  keyTopics: string[];
  decisions: string[];
  codeChanges: string[];
  createdAt: string;
}
