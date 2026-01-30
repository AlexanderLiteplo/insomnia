#!/usr/bin/env node
/**
 * Memory System CLI
 *
 * Command-line interface for the memory system.
 *
 * Usage:
 *   npm run memory search "query"      - Search memories
 *   npm run memory status              - Show memory stats
 *   npm run memory sync                - Full sync
 *   npm run memory list                - List all entries
 *   npm run memory add "title" "text"  - Add a memory
 *   npm run memory sessions            - List sessions
 *   npm run memory summarize <id>      - Summarize a session
 */

import {
  initDatabase,
  closeDatabase,
  search,
  getStats,
  fullSync,
  listEntries,
  writeMemory,
  listSessions,
  getSessionMetadata,
  writeSessionSummary,
  startWatching,
  stopWatching,
  getMemoryStatus,
} from './memory';

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  try {
    switch (command) {
      case 'search':
        await searchCommand(args.slice(1));
        break;

      case 'status':
        await statusCommand();
        break;

      case 'sync':
        await syncCommand();
        break;

      case 'list':
        await listCommand(args.slice(1));
        break;

      case 'add':
        await addCommand(args.slice(1));
        break;

      case 'sessions':
        await sessionsCommand();
        break;

      case 'summarize':
        await summarizeCommand(args[1]);
        break;

      case 'watch':
        await watchCommand();
        break;

      case 'help':
      default:
        showHelp();
        break;
    }
  } catch (error: any) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

function showHelp() {
  console.log(`
Memory System CLI

Usage:
  npm run memory <command> [options]

Commands:
  search <query>          Search memories using hybrid vector + keyword search
  status                  Show memory system status and statistics
  sync                    Perform full sync of all memory sources
  list [type]             List entries (type: memory|session|skill)
  add <title> <content>   Add a new memory
  sessions                List all sessions
  summarize <session-id>  Create summary for a session
  watch                   Start watching for file changes
  help                    Show this help message

Examples:
  npm run memory search "authentication bug"
  npm run memory list memory
  npm run memory add "API Design" "Use REST for external, gRPC for internal"
  npm run memory summarize session_1234567890_abc123
`);
}

async function searchCommand(args: string[]) {
  if (args.length === 0) {
    console.error('Usage: npm run memory search <query>');
    process.exit(1);
  }

  const query = args.join(' ');
  console.log(`Searching for: "${query}"\n`);

  await initDatabase();
  await fullSync();

  const results = await search({
    query,
    limit: 10,
    minScore: 0.2,
  });

  if (results.length === 0) {
    console.log('No results found.');
    return;
  }

  console.log(`Found ${results.length} results:\n`);

  for (const result of results) {
    console.log(`-------------------------------------------`);
    console.log(`Title: ${result.entry.title || 'Untitled'}`);
    console.log(`Type: ${result.entry.type} | Score: ${result.score.toFixed(3)} (${result.matchType})`);
    console.log(`Source: ${result.entry.source}`);

    if (result.vectorScore !== undefined) {
      console.log(`Vector: ${result.vectorScore.toFixed(3)} | Keyword: ${result.keywordScore?.toFixed(3) || 'N/A'}`);
    }

    console.log();

    // Show preview or highlights
    if (result.highlights && result.highlights.length > 0) {
      console.log('Highlights:');
      for (const hl of result.highlights) {
        console.log(`  > ${hl}`);
      }
    } else {
      const preview = result.entry.content.substring(0, 200);
      console.log(`Preview: ${preview}${result.entry.content.length > 200 ? '...' : ''}`);
    }
    console.log();
  }
}

async function statusCommand() {
  const status = await getMemoryStatus();

  console.log('Memory System Status');
  console.log('====================\n');

  console.log(`Initialized: ${status.initialized ? 'Yes' : 'No'}`);

  if (status.stats) {
    console.log('\nStatistics:');
    console.log(`  Total entries: ${status.stats.totalEntries}`);
    console.log(`  Sessions: ${status.stats.sessionCount}`);
    console.log(`  Memories: ${status.stats.memoryCount}`);
    console.log(`  Skills: ${status.stats.skillCount}`);
    console.log(`  Embeddings: ${status.stats.embeddingsComputed}`);
    console.log(`  DB Size: ${(status.stats.dbSizeBytes / 1024).toFixed(1)} KB`);
  }

  if (status.config) {
    console.log('\nConfiguration:');
    console.log(`  Embedding Provider: ${status.config.embeddingProvider}`);
    console.log(`  Watch Enabled: ${status.config.watchEnabled}`);
    console.log(`  Memory Dir: ${status.config.memoryDir}`);
    console.log(`  Sessions Dir: ${status.config.sessionsDir}`);
  }
}

async function syncCommand() {
  console.log('Starting full sync...\n');

  await initDatabase();
  const result = await fullSync();

  console.log('Sync complete:');
  console.log(`  Memories: ${result.memories}`);
  console.log(`  Skills: ${result.skills}`);
  console.log(`  Sessions: ${result.sessions}`);
}

async function listCommand(args: string[]) {
  const type = args[0] as 'memory' | 'session' | 'skill' | undefined;

  await initDatabase();
  const entries = await listEntries(type, 50, 0);

  if (entries.length === 0) {
    console.log('No entries found.');
    return;
  }

  console.log(`Found ${entries.length} entries:\n`);

  for (const entry of entries) {
    console.log(`[${entry.type.padEnd(7)}] ${entry.title || entry.source}`);
    console.log(`         ID: ${entry.id}`);
    console.log(`         Updated: ${entry.updatedAt}`);
    if (entry.tags && entry.tags.length > 0) {
      console.log(`         Tags: ${entry.tags.join(', ')}`);
    }
    console.log();
  }
}

async function addCommand(args: string[]) {
  if (args.length < 2) {
    console.error('Usage: npm run memory add <title> <content>');
    process.exit(1);
  }

  const title = args[0];
  const content = args.slice(1).join(' ');

  const path = writeMemory(title, content);
  console.log(`Memory written to: ${path}`);

  // Sync to index
  await initDatabase();
  await fullSync();
  console.log('Memory indexed.');
}

async function sessionsCommand() {
  const sessions = listSessions();

  if (sessions.length === 0) {
    console.log('No sessions found.');
    return;
  }

  console.log(`Found ${sessions.length} sessions:\n`);

  for (const sessionId of sessions.slice(0, 20)) {
    const meta = getSessionMetadata(sessionId);
    if (meta) {
      console.log(`${sessionId}`);
      console.log(`  Messages: ${meta.messageCount}`);
      console.log(`  Started: ${meta.startedAt}`);
      if (meta.endedAt) {
        console.log(`  Ended: ${meta.endedAt}`);
      }
      if (meta.managerId) {
        console.log(`  Manager: ${meta.managerId}`);
      }
      console.log();
    }
  }

  if (sessions.length > 20) {
    console.log(`... and ${sessions.length - 20} more sessions`);
  }
}

async function summarizeCommand(sessionId: string) {
  if (!sessionId) {
    console.error('Usage: npm run memory summarize <session-id>');
    process.exit(1);
  }

  console.log(`Summarizing session: ${sessionId}\n`);

  const path = writeSessionSummary(sessionId);

  if (path) {
    console.log(`Summary written to: ${path}`);

    // Sync to index
    await initDatabase();
    await fullSync();
    console.log('Summary indexed.');
  } else {
    console.log('Failed to create summary (session may be empty or not found).');
  }
}

async function watchCommand() {
  console.log('Starting file watcher...');
  console.log('Press Ctrl+C to stop.\n');

  await initDatabase();
  startWatching();

  // Keep process running
  process.on('SIGINT', () => {
    console.log('\nStopping watcher...');
    stopWatching();
    process.exit(0);
  });

  // Keep alive
  setInterval(() => {}, 1000);
}

main().catch(console.error);
