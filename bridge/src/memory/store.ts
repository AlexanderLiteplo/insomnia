/**
 * Memory Store
 *
 * SQLite-based storage with vector embeddings and FTS5 for hybrid search.
 * Combines semantic (vector) and keyword (FTS5) search for best results.
 */

import * as fs from 'fs';
import * as path from 'path';
import { MemoryEntry, SearchResult, SearchOptions, MemoryStats } from './types';
import { loadMemoryConfig, ensureMemoryDirs } from './config';
import { getEmbeddingProvider, cosineSimilarity } from './embeddings';

// SQLite3 types - we use require since sqlite3 doesn't have good TS types
interface SqliteDatabase {
  run(sql: string, params?: any[], callback?: (err: Error | null) => void): void;
  run(sql: string, callback?: (err: Error | null) => void): void;
  get(sql: string, params: any[], callback: (err: Error | null, row: any) => void): void;
  all(sql: string, params: any[], callback: (err: Error | null, rows: any[]) => void): void;
  serialize(callback: () => void): void;
  close(callback?: (err: Error | null) => void): void;
}

interface SqliteModule {
  Database: new (path: string, callback?: (err: Error | null) => void) => SqliteDatabase;
  verbose(): SqliteModule;
}

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlite3: SqliteModule = require('sqlite3');

// Use verbose mode for better error messages
const sqlite = sqlite3.verbose();

let db: SqliteDatabase | null = null;
let dbInitialized = false;

/**
 * Initialize the SQLite database with required tables
 */
export async function initDatabase(): Promise<void> {
  if (dbInitialized && db) return;

  const config = loadMemoryConfig();
  ensureMemoryDirs(config);

  return new Promise((resolve, reject) => {
    db = new sqlite.Database(config.dbPath, (err: Error | null) => {
      if (err) {
        reject(err);
        return;
      }

      // Create tables
      db!.serialize(() => {
        // Main entries table
        db!.run(`
          CREATE TABLE IF NOT EXISTS entries (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            source TEXT NOT NULL,
            content TEXT NOT NULL,
            title TEXT,
            tags TEXT,
            embedding BLOB,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            metadata TEXT
          )
        `);

        // Create index on type for filtering
        db!.run(`CREATE INDEX IF NOT EXISTS idx_entries_type ON entries(type)`);

        // Create index on source for lookups
        db!.run(`CREATE INDEX IF NOT EXISTS idx_entries_source ON entries(source)`);

        // Create FTS5 virtual table for keyword search
        db!.run(`
          CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
            id,
            title,
            content,
            tags,
            content='entries',
            content_rowid='rowid'
          )
        `);

        // Create triggers to keep FTS in sync with main table
        db!.run(`
          CREATE TRIGGER IF NOT EXISTS entries_ai AFTER INSERT ON entries BEGIN
            INSERT INTO entries_fts(rowid, id, title, content, tags)
            VALUES (NEW.rowid, NEW.id, NEW.title, NEW.content, NEW.tags);
          END
        `);

        db!.run(`
          CREATE TRIGGER IF NOT EXISTS entries_ad AFTER DELETE ON entries BEGIN
            INSERT INTO entries_fts(entries_fts, rowid, id, title, content, tags)
            VALUES ('delete', OLD.rowid, OLD.id, OLD.title, OLD.content, OLD.tags);
          END
        `);

        db!.run(`
          CREATE TRIGGER IF NOT EXISTS entries_au AFTER UPDATE ON entries BEGIN
            INSERT INTO entries_fts(entries_fts, rowid, id, title, content, tags)
            VALUES ('delete', OLD.rowid, OLD.id, OLD.title, OLD.content, OLD.tags);
            INSERT INTO entries_fts(rowid, id, title, content, tags)
            VALUES (NEW.rowid, NEW.id, NEW.title, NEW.content, NEW.tags);
          END
        `, (err: Error | null) => {
          if (err && !err.message.includes('already exists')) {
            reject(err);
            return;
          }
          dbInitialized = true;
          resolve();
        });
      });
    });
  });
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (db) {
      db.close((err: Error | null) => {
        if (err) reject(err);
        else {
          db = null;
          dbInitialized = false;
          resolve();
        }
      });
    } else {
      resolve();
    }
  });
}

/**
 * Convert embedding array to Buffer for storage
 */
function embeddingToBuffer(embedding: number[]): Buffer {
  const buffer = Buffer.alloc(embedding.length * 4);
  for (let i = 0; i < embedding.length; i++) {
    buffer.writeFloatLE(embedding[i], i * 4);
  }
  return buffer;
}

/**
 * Convert Buffer back to embedding array
 */
function bufferToEmbedding(buffer: Buffer): number[] {
  const embedding: number[] = [];
  for (let i = 0; i < buffer.length; i += 4) {
    embedding.push(buffer.readFloatLE(i));
  }
  return embedding;
}

/**
 * Generate a unique entry ID
 */
function generateId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `mem_${timestamp}_${random}`;
}

/**
 * Add or update a memory entry
 */
export async function upsertEntry(entry: Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<MemoryEntry> {
  await initDatabase();

  const now = new Date().toISOString();
  const id = entry.id || generateId();

  // Get embedding if not provided
  let embedding = entry.embedding;
  if (!embedding) {
    const provider = getEmbeddingProvider();
    const textToEmbed = [entry.title, entry.content].filter(Boolean).join('\n');
    embedding = await provider.embed(textToEmbed);
  }

  const fullEntry: MemoryEntry = {
    id,
    type: entry.type,
    source: entry.source,
    content: entry.content,
    title: entry.title,
    tags: entry.tags,
    embedding,
    createdAt: now,
    updatedAt: now,
    metadata: entry.metadata,
  };

  return new Promise((resolve, reject) => {
    const embeddingBuffer = embeddingToBuffer(embedding!);
    const tagsJson = entry.tags ? entry.tags.join(',') : null;
    const metadataJson = entry.metadata ? JSON.stringify(entry.metadata) : null;

    db!.run(
      `INSERT OR REPLACE INTO entries
       (id, type, source, content, title, tags, embedding, created_at, updated_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, entry.type, entry.source, entry.content, entry.title, tagsJson, embeddingBuffer, now, now, metadataJson],
      (err: Error | null) => {
        if (err) reject(err);
        else resolve(fullEntry);
      }
    );
  });
}

/**
 * Delete an entry by ID
 */
export async function deleteEntry(id: string): Promise<boolean> {
  await initDatabase();

  return new Promise((resolve, reject) => {
    let changes = 0;
    db!.run('DELETE FROM entries WHERE id = ?', [id], function(this: { changes: number }, err: Error | null) {
      if (err) reject(err);
      else resolve((this?.changes || 0) > 0);
    });
  });
}

/**
 * Delete entries by source path
 */
export async function deleteBySource(source: string): Promise<number> {
  await initDatabase();

  return new Promise((resolve, reject) => {
    db!.run('DELETE FROM entries WHERE source = ?', [source], function(this: { changes: number }, err: Error | null) {
      if (err) reject(err);
      else resolve(this?.changes || 0);
    });
  });
}

/**
 * Get an entry by ID
 */
export async function getEntry(id: string): Promise<MemoryEntry | null> {
  await initDatabase();

  return new Promise((resolve, reject) => {
    db!.get('SELECT * FROM entries WHERE id = ?', [id], (err: Error | null, row: any) => {
      if (err) reject(err);
      else if (!row) resolve(null);
      else {
        resolve({
          id: row.id,
          type: row.type,
          source: row.source,
          content: row.content,
          title: row.title,
          tags: row.tags ? row.tags.split(',') : undefined,
          embedding: row.embedding ? bufferToEmbedding(row.embedding) : undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        });
      }
    });
  });
}

/**
 * Get entry by source path
 */
export async function getEntryBySource(source: string): Promise<MemoryEntry | null> {
  await initDatabase();

  return new Promise((resolve, reject) => {
    db!.get('SELECT * FROM entries WHERE source = ?', [source], (err: Error | null, row: any) => {
      if (err) reject(err);
      else if (!row) resolve(null);
      else {
        resolve({
          id: row.id,
          type: row.type,
          source: row.source,
          content: row.content,
          title: row.title,
          tags: row.tags ? row.tags.split(',') : undefined,
          embedding: row.embedding ? bufferToEmbedding(row.embedding) : undefined,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        });
      }
    });
  });
}

/**
 * Perform FTS5 keyword search
 */
async function keywordSearch(query: string, limit: number, types?: string[]): Promise<Map<string, number>> {
  await initDatabase();

  // Escape special FTS5 characters and prepare query
  const escapedQuery = query
    .replace(/['"]/g, '')
    .split(/\s+/)
    .filter(t => t.length > 0)
    .map(t => `"${t}"*`)
    .join(' OR ');

  if (!escapedQuery) {
    return new Map();
  }

  let sql = `
    SELECT e.id, bm25(entries_fts) as score
    FROM entries_fts
    JOIN entries e ON entries_fts.id = e.id
    WHERE entries_fts MATCH ?
  `;

  const params: any[] = [escapedQuery];

  if (types && types.length > 0) {
    sql += ` AND e.type IN (${types.map(() => '?').join(',')})`;
    params.push(...types);
  }

  sql += ` ORDER BY score LIMIT ?`;
  params.push(limit * 2);  // Get more for merging

  return new Promise((resolve, reject) => {
    const scores = new Map<string, number>();

    db!.all(sql, params, (err: Error | null, rows: any[]) => {
      if (err) {
        // FTS5 match errors are not fatal, just return empty
        if (err.message.includes('fts5')) {
          resolve(scores);
        } else {
          reject(err);
        }
        return;
      }

      for (const row of rows || []) {
        // BM25 returns negative scores, lower is better
        // Normalize to 0-1 range where higher is better
        const normalizedScore = 1 / (1 - row.score);
        scores.set(row.id, normalizedScore);
      }

      resolve(scores);
    });
  });
}

/**
 * Perform vector similarity search
 */
async function vectorSearch(query: string, limit: number, types?: string[]): Promise<Map<string, number>> {
  await initDatabase();

  // Get query embedding
  const provider = getEmbeddingProvider();
  const queryEmbedding = await provider.embed(query);

  let sql = 'SELECT id, embedding FROM entries WHERE embedding IS NOT NULL';
  const params: any[] = [];

  if (types && types.length > 0) {
    sql += ` AND type IN (${types.map(() => '?').join(',')})`;
    params.push(...types);
  }

  return new Promise((resolve, reject) => {
    const scores = new Map<string, number>();

    db!.all(sql, params, (err: Error | null, rows: any[]) => {
      if (err) {
        reject(err);
        return;
      }

      // Calculate cosine similarity for each entry
      const similarities: Array<{ id: string; score: number }> = [];

      for (const row of rows || []) {
        if (row.embedding) {
          const embedding = bufferToEmbedding(row.embedding);
          const similarity = cosineSimilarity(queryEmbedding, embedding);
          similarities.push({ id: row.id, score: similarity });
        }
      }

      // Sort by similarity (descending) and take top results
      similarities.sort((a, b) => b.score - a.score);

      for (const item of similarities.slice(0, limit * 2)) {
        scores.set(item.id, item.score);
      }

      resolve(scores);
    });
  });
}

/**
 * Perform hybrid search combining vector and keyword results
 */
export async function search(options: SearchOptions): Promise<SearchResult[]> {
  await initDatabase();

  const config = loadMemoryConfig();
  const limit = options.limit || config.maxSearchResults;
  const vectorWeight = options.vectorWeight ?? config.defaultVectorWeight;
  const keywordWeight = options.keywordWeight ?? config.defaultKeywordWeight;
  const minScore = options.minScore ?? config.minRelevanceScore;

  // Run both searches in parallel
  const [vectorScores, keywordScores] = await Promise.all([
    vectorSearch(options.query, limit, options.types),
    keywordSearch(options.query, limit, options.types),
  ]);

  // Merge results
  const allIds = new Set([...vectorScores.keys(), ...keywordScores.keys()]);
  const combinedResults: Array<{
    id: string;
    vectorScore: number;
    keywordScore: number;
    combinedScore: number;
    matchType: 'vector' | 'keyword' | 'hybrid';
  }> = [];

  for (const id of allIds) {
    const vScore = vectorScores.get(id) || 0;
    const kScore = keywordScores.get(id) || 0;

    // Normalize scores to 0-1 range
    const normalizedVScore = Math.max(0, Math.min(1, vScore));
    const normalizedKScore = Math.max(0, Math.min(1, kScore));

    // Combined weighted score
    const combinedScore = (normalizedVScore * vectorWeight) + (normalizedKScore * keywordWeight);

    // Determine match type
    let matchType: 'vector' | 'keyword' | 'hybrid';
    if (vScore > 0 && kScore > 0) {
      matchType = 'hybrid';
    } else if (vScore > 0) {
      matchType = 'vector';
    } else {
      matchType = 'keyword';
    }

    if (combinedScore >= minScore) {
      combinedResults.push({
        id,
        vectorScore: normalizedVScore,
        keywordScore: normalizedKScore,
        combinedScore,
        matchType,
      });
    }
  }

  // Sort by combined score (descending)
  combinedResults.sort((a, b) => b.combinedScore - a.combinedScore);

  // Fetch full entries for top results
  const results: SearchResult[] = [];

  for (const result of combinedResults.slice(0, limit)) {
    const entry = await getEntry(result.id);
    if (entry) {
      // Generate highlights (simple substring matching)
      const highlights = generateHighlights(entry.content, options.query);

      results.push({
        entry,
        score: result.combinedScore,
        vectorScore: result.vectorScore,
        keywordScore: result.keywordScore,
        matchType: result.matchType,
        highlights,
      });
    }
  }

  // Apply date filters if specified
  if (options.dateFrom || options.dateTo) {
    return results.filter(r => {
      const date = new Date(r.entry.createdAt);
      if (options.dateFrom && date < new Date(options.dateFrom)) return false;
      if (options.dateTo && date > new Date(options.dateTo)) return false;
      return true;
    });
  }

  // Apply tag filters if specified
  if (options.tags && options.tags.length > 0) {
    return results.filter(r => {
      if (!r.entry.tags) return false;
      return options.tags!.some(tag => r.entry.tags!.includes(tag));
    });
  }

  return results;
}

/**
 * Generate highlighted snippets for search results
 */
function generateHighlights(content: string, query: string): string[] {
  const highlights: string[] = [];
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  const contentLower = content.toLowerCase();

  for (const term of terms) {
    let pos = 0;
    while (pos < content.length && highlights.length < 3) {
      const idx = contentLower.indexOf(term, pos);
      if (idx === -1) break;

      // Extract context around match
      const start = Math.max(0, idx - 50);
      const end = Math.min(content.length, idx + term.length + 50);
      let snippet = content.substring(start, end);

      if (start > 0) snippet = '...' + snippet;
      if (end < content.length) snippet = snippet + '...';

      highlights.push(snippet);
      pos = idx + term.length;
    }
  }

  return highlights;
}

/**
 * Get memory statistics
 */
export async function getStats(): Promise<MemoryStats> {
  await initDatabase();

  const config = loadMemoryConfig();

  return new Promise((resolve, reject) => {
    db!.get(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN type = 'session' THEN 1 ELSE 0 END) as sessions,
        SUM(CASE WHEN type = 'memory' THEN 1 ELSE 0 END) as memories,
        SUM(CASE WHEN type = 'skill' THEN 1 ELSE 0 END) as skills,
        SUM(CASE WHEN embedding IS NOT NULL THEN 1 ELSE 0 END) as withEmbeddings
      FROM entries
    `, [], (err: Error | null, row: any) => {
      if (err) {
        reject(err);
        return;
      }

      // Get database file size
      let dbSize = 0;
      if (fs.existsSync(config.dbPath)) {
        dbSize = fs.statSync(config.dbPath).size;
      }

      resolve({
        totalEntries: row?.total || 0,
        sessionCount: row?.sessions || 0,
        memoryCount: row?.memories || 0,
        skillCount: row?.skills || 0,
        lastSync: new Date().toISOString(),
        dbSizeBytes: dbSize,
        embeddingsComputed: row?.withEmbeddings || 0,
      });
    });
  });
}

/**
 * List all entries with pagination
 */
export async function listEntries(
  type?: string,
  limit = 50,
  offset = 0
): Promise<MemoryEntry[]> {
  await initDatabase();

  let sql = 'SELECT * FROM entries';
  const params: any[] = [];

  if (type) {
    sql += ' WHERE type = ?';
    params.push(type);
  }

  sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return new Promise((resolve, reject) => {
    db!.all(sql, params, (err: Error | null, rows: any[]) => {
      if (err) reject(err);
      else {
        resolve((rows || []).map(row => ({
          id: row.id,
          type: row.type,
          source: row.source,
          content: row.content,
          title: row.title,
          tags: row.tags ? row.tags.split(',') : undefined,
          embedding: undefined,  // Don't return embedding in list
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
        })));
      }
    });
  });
}

/**
 * Rebuild FTS index
 */
export async function rebuildFtsIndex(): Promise<void> {
  await initDatabase();

  return new Promise((resolve, reject) => {
    db!.run("INSERT INTO entries_fts(entries_fts) VALUES('rebuild')", (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    });
  });
}
