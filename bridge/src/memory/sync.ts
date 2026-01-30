/**
 * Memory Sync System
 *
 * File watcher for smart syncing of memory files.
 * Watches memory/*.md and skills/*.md for changes and syncs to SQLite.
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadMemoryConfig, ensureMemoryDirs } from './config';
import { upsertEntry, deleteBySource, getEntryBySource } from './store';
import { SyncEvent, MemoryEntry } from './types';
import { getSessionContent, listSessions, getSessionMetadata } from './sessions';

// Track active watchers
let memoryWatcher: fs.FSWatcher | null = null;
let skillsWatcher: fs.FSWatcher | null = null;
let syncInterval: NodeJS.Timeout | null = null;
let isWatching = false;

/**
 * Parse markdown file to extract metadata
 */
function parseMarkdown(content: string, filePath: string): {
  title: string;
  tags: string[];
  body: string;
} {
  const lines = content.split('\n');
  let title = path.basename(filePath, '.md');
  let tags: string[] = [];
  let bodyStartIdx = 0;

  // Look for H1 title
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const line = lines[i].trim();
    if (line.startsWith('# ')) {
      title = line.substring(2).trim();
      bodyStartIdx = i + 1;
      break;
    }
  }

  // Look for tags (common formats: tags: x, y, z or #tag1 #tag2)
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const line = lines[i].trim().toLowerCase();
    if (line.startsWith('tags:')) {
      tags = line.substring(5)
        .split(/[,;]/)
        .map(t => t.trim())
        .filter(t => t.length > 0);
      if (i >= bodyStartIdx) bodyStartIdx = i + 1;
      break;
    }
    // Also look for hashtags
    const hashTags = line.match(/#[\w-]+/g);
    if (hashTags && hashTags.length >= 2) {
      tags = hashTags.map(t => t.substring(1));
      break;
    }
  }

  const body = lines.slice(bodyStartIdx).join('\n').trim();

  return { title, tags, body };
}

/**
 * Sync a single markdown file to the store
 */
async function syncMarkdownFile(
  filePath: string,
  type: 'memory' | 'skill'
): Promise<void> {
  try {
    if (!fs.existsSync(filePath)) {
      // File was deleted
      await deleteBySource(filePath);
      console.log(`[Memory Sync] Deleted: ${path.basename(filePath)}`);
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const { title, tags, body } = parseMarkdown(content, filePath);

    // Check if we need to update (compare content hash)
    const existing = await getEntryBySource(filePath);
    if (existing && existing.content === body) {
      // No changes
      return;
    }

    await upsertEntry({
      id: existing?.id,  // Preserve ID if updating
      type,
      source: filePath,
      content: body,
      title,
      tags: tags.length > 0 ? tags : undefined,
      metadata: {
        fileName: path.basename(filePath),
        lastModified: fs.statSync(filePath).mtime.toISOString(),
      },
    });

    console.log(`[Memory Sync] ${existing ? 'Updated' : 'Added'}: ${title}`);
  } catch (error) {
    console.error(`[Memory Sync] Error syncing ${filePath}:`, error);
  }
}

/**
 * Sync a session to the store
 */
async function syncSession(sessionId: string): Promise<void> {
  try {
    const metadata = getSessionMetadata(sessionId);
    if (!metadata) return;

    const content = getSessionContent(sessionId);
    if (!content) return;

    const existing = await getEntryBySource(`session:${sessionId}`);
    if (existing && existing.content === content) {
      return;
    }

    await upsertEntry({
      id: existing?.id,
      type: 'session',
      source: `session:${sessionId}`,
      content,
      title: `Session ${sessionId}`,
      metadata: {
        sessionId,
        managerId: metadata.managerId,
        projectId: metadata.projectId,
        startedAt: metadata.startedAt,
        endedAt: metadata.endedAt,
        messageCount: metadata.messageCount,
      },
    });

    console.log(`[Memory Sync] Session indexed: ${sessionId}`);
  } catch (error) {
    console.error(`[Memory Sync] Error syncing session ${sessionId}:`, error);
  }
}

/**
 * Sync all markdown files in a directory
 */
async function syncDirectory(
  dirPath: string,
  type: 'memory' | 'skill'
): Promise<number> {
  if (!fs.existsSync(dirPath)) {
    return 0;
  }

  const files = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.md'));

  let count = 0;
  for (const file of files) {
    await syncMarkdownFile(path.join(dirPath, file), type);
    count++;
  }

  return count;
}

/**
 * Sync all sessions
 */
async function syncAllSessions(): Promise<number> {
  const sessionIds = listSessions();
  let count = 0;

  for (const sessionId of sessionIds) {
    await syncSession(sessionId);
    count++;
  }

  return count;
}

/**
 * Perform a full sync of all memory sources
 */
export async function fullSync(): Promise<{
  memories: number;
  skills: number;
  sessions: number;
}> {
  const config = loadMemoryConfig();
  ensureMemoryDirs(config);

  // Also check for skills directory in orchestrator
  const orchestratorSkillsDir = path.join(__dirname, '..', '..', '..', 'orchestrator', 'skills');

  const [memories, skills, orchestratorSkills, sessions] = await Promise.all([
    syncDirectory(config.memoryDir, 'memory'),
    syncDirectory(path.join(__dirname, '..', '..', 'skills'), 'skill'),
    fs.existsSync(orchestratorSkillsDir)
      ? syncDirectory(orchestratorSkillsDir, 'skill')
      : Promise.resolve(0),
    syncAllSessions(),
  ]);

  console.log(`[Memory Sync] Full sync complete: ${memories} memories, ${skills + orchestratorSkills} skills, ${sessions} sessions`);

  return {
    memories,
    skills: skills + orchestratorSkills,
    sessions,
  };
}

/**
 * Start watching for file changes
 */
export function startWatching(): void {
  if (isWatching) {
    console.log('[Memory Sync] Already watching');
    return;
  }

  const config = loadMemoryConfig();
  ensureMemoryDirs(config);

  // Watch memory directory
  if (fs.existsSync(config.memoryDir)) {
    memoryWatcher = fs.watch(config.memoryDir, { persistent: false }, (eventType, filename) => {
      if (filename && filename.endsWith('.md')) {
        const filePath = path.join(config.memoryDir, filename);
        syncMarkdownFile(filePath, 'memory').catch(console.error);
      }
    });

    memoryWatcher.on('error', (error) => {
      console.error('[Memory Sync] Memory watcher error:', error);
    });
  }

  // Watch skills directory if it exists
  const skillsDir = path.join(__dirname, '..', '..', 'skills');
  if (fs.existsSync(skillsDir)) {
    skillsWatcher = fs.watch(skillsDir, { persistent: false }, (eventType, filename) => {
      if (filename && filename.endsWith('.md')) {
        const filePath = path.join(skillsDir, filename);
        syncMarkdownFile(filePath, 'skill').catch(console.error);
      }
    });

    skillsWatcher.on('error', (error) => {
      console.error('[Memory Sync] Skills watcher error:', error);
    });
  }

  // Periodic sync for sessions and missed changes
  if (config.watchEnabled) {
    syncInterval = setInterval(async () => {
      try {
        await syncAllSessions();
      } catch (error) {
        console.error('[Memory Sync] Periodic sync error:', error);
      }
    }, config.syncIntervalMs);
  }

  isWatching = true;
  console.log('[Memory Sync] Started watching for changes');
}

/**
 * Stop watching for file changes
 */
export function stopWatching(): void {
  if (memoryWatcher) {
    memoryWatcher.close();
    memoryWatcher = null;
  }

  if (skillsWatcher) {
    skillsWatcher.close();
    skillsWatcher = null;
  }

  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }

  isWatching = false;
  console.log('[Memory Sync] Stopped watching');
}

/**
 * Check if watching is active
 */
export function isWatchingActive(): boolean {
  return isWatching;
}

/**
 * Handle a sync event manually
 */
export async function handleSyncEvent(event: SyncEvent): Promise<void> {
  const ext = path.extname(event.path);
  if (ext !== '.md' && ext !== '.jsonl') {
    return;
  }

  const config = loadMemoryConfig();

  // Determine type based on path
  if (event.path.includes(config.memoryDir)) {
    if (event.type === 'unlink') {
      await deleteBySource(event.path);
    } else {
      await syncMarkdownFile(event.path, 'memory');
    }
  } else if (event.path.includes('skills')) {
    if (event.type === 'unlink') {
      await deleteBySource(event.path);
    } else {
      await syncMarkdownFile(event.path, 'skill');
    }
  } else if (event.path.includes(config.sessionsDir)) {
    const sessionId = path.basename(event.path, '.jsonl');
    if (event.type === 'unlink') {
      await deleteBySource(`session:${sessionId}`);
    } else {
      await syncSession(sessionId);
    }
  }
}
