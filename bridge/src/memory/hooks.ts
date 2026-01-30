/**
 * Memory Hooks
 *
 * Pre-orchestrator hooks for memory integration.
 * Runs before new conversations to load relevant context.
 */

import { search, initDatabase, getStats } from './store';
import { fullSync } from './sync';
import { writeSessionSummary, writeMemory } from './writer';
import { getRecentSessions, loadSession, endSession } from './sessions';
import { SearchOptions, SearchResult, ConversationSummary } from './types';
import { loadMemoryConfig } from './config';

/**
 * Pre-conversation hook
 * Called when a new conversation/session starts.
 * Returns relevant context from memory.
 */
export async function preConversationHook(options: {
  query?: string;           // Initial user query/task
  managerId?: string;       // Manager handling this conversation
  projectId?: string;       // Project context
  lastSessionId?: string;   // Previous session to summarize
}): Promise<{
  context: string;
  relevantMemories: SearchResult[];
  previousSummary?: ConversationSummary;
}> {
  // Ensure database is initialized and synced
  await initDatabase();
  await fullSync();

  const results: SearchResult[] = [];
  let context = '';

  // If there's a previous session, summarize it first
  let previousSummary: ConversationSummary | undefined;
  if (options.lastSessionId) {
    const session = loadSession(options.lastSessionId);
    if (session && session.messages.length > 0 && !session.endedAt) {
      // End the previous session and create summary
      endSession(options.lastSessionId);
      const summaryPath = writeSessionSummary(options.lastSessionId);
      if (summaryPath) {
        console.log(`[Memory Hook] Created summary for previous session: ${summaryPath}`);
      }
    }
  }

  // Search for relevant memories if we have a query
  if (options.query) {
    const searchOptions: SearchOptions = {
      query: options.query,
      limit: 5,
      minScore: 0.3,
    };

    const searchResults = await search(searchOptions);
    results.push(...searchResults);

    // Build context from relevant memories
    if (searchResults.length > 0) {
      context += '## Relevant Memories\n\n';
      for (const result of searchResults) {
        context += `### ${result.entry.title || result.entry.source}\n`;
        context += `Type: ${result.entry.type} | Score: ${result.score.toFixed(2)}\n\n`;

        // Truncate long content
        const content = result.entry.content;
        const preview = content.length > 500
          ? content.substring(0, 500) + '...'
          : content;
        context += preview + '\n\n';
      }
    }
  }

  // Add recent session context for the same project/manager
  if (options.managerId || options.projectId) {
    const recentSessions = getRecentSessions(3);
    const relevantSessions = recentSessions.filter(s =>
      (options.managerId && s.managerId === options.managerId) ||
      (options.projectId && s.projectId === options.projectId)
    );

    if (relevantSessions.length > 0) {
      context += '## Recent Sessions\n\n';
      for (const sessionMeta of relevantSessions) {
        context += `- ${sessionMeta.sessionId}: ${sessionMeta.messageCount} messages`;
        if (sessionMeta.endedAt) {
          context += ` (ended ${sessionMeta.endedAt})`;
        }
        context += '\n';
      }
      context += '\n';
    }
  }

  return {
    context,
    relevantMemories: results,
    previousSummary,
  };
}

/**
 * Post-conversation hook
 * Called when a conversation ends.
 * Creates summary and persists learnings.
 */
export async function postConversationHook(options: {
  sessionId: string;
  managerId?: string;
  projectId?: string;
}): Promise<{
  summaryPath?: string;
  memoryStats: any;
}> {
  // End the session if not already ended
  const session = loadSession(options.sessionId);
  if (session && !session.endedAt) {
    endSession(options.sessionId);
  }

  // Create summary
  const summaryPath = writeSessionSummary(options.sessionId);

  // Sync new content
  await fullSync();

  // Get updated stats
  const stats = await getStats();

  return {
    summaryPath: summaryPath || undefined,
    memoryStats: stats,
  };
}

/**
 * Memory search hook
 * Quick search for relevant context during a conversation.
 */
export async function memorySearchHook(
  query: string,
  options?: Partial<SearchOptions>
): Promise<string> {
  await initDatabase();

  const searchResults = await search({
    query,
    limit: options?.limit || 3,
    minScore: options?.minScore || 0.4,
    types: options?.types,
    ...options,
  });

  if (searchResults.length === 0) {
    return 'No relevant memories found.';
  }

  let response = `Found ${searchResults.length} relevant memories:\n\n`;

  for (const result of searchResults) {
    response += `### ${result.entry.title || 'Untitled'}\n`;
    response += `Source: ${result.entry.source}\n`;
    response += `Score: ${result.score.toFixed(2)} (${result.matchType})\n\n`;

    // Include highlights or preview
    if (result.highlights && result.highlights.length > 0) {
      response += 'Highlights:\n';
      for (const hl of result.highlights.slice(0, 2)) {
        response += `> ${hl}\n`;
      }
    } else {
      const preview = result.entry.content.substring(0, 200);
      response += `${preview}${result.entry.content.length > 200 ? '...' : ''}\n`;
    }
    response += '\n---\n\n';
  }

  return response;
}

/**
 * Quick memory write hook
 * For agents to quickly persist a learning or note.
 */
export async function memoryWriteHook(options: {
  title: string;
  content: string;
  tags?: string[];
  type?: 'learning' | 'note' | 'decision' | 'error';
}): Promise<string> {
  const typePrefix = options.type ? `[${options.type.toUpperCase()}] ` : '';
  const name = `${typePrefix}${options.title}`;

  const path = writeMemory(name, options.content, {
    tags: options.tags || [options.type || 'note'],
    overwrite: false,
  });

  // Trigger sync to index the new file
  await fullSync();

  return path;
}

/**
 * Get memory system status
 */
export async function getMemoryStatus(): Promise<{
  initialized: boolean;
  stats: any;
  config: any;
}> {
  try {
    await initDatabase();
    const stats = await getStats();
    const config = loadMemoryConfig();

    return {
      initialized: true,
      stats,
      config: {
        embeddingProvider: config.embeddingProvider,
        watchEnabled: config.watchEnabled,
        memoryDir: config.memoryDir,
        sessionsDir: config.sessionsDir,
      },
    };
  } catch (error) {
    return {
      initialized: false,
      stats: null,
      config: null,
    };
  }
}

/**
 * Pre-orchestrator hook
 * Called before starting an orchestrator worker session.
 * Loads relevant skills and project context.
 */
export async function preOrchestratorHook(options: {
  projectName: string;
  taskDescription: string;
  workDir: string;
}): Promise<{
  context: string;
  skillsLoaded: number;
  memoriesLoaded: number;
}> {
  await initDatabase();
  await fullSync();

  let context = '## Memory Context\n\n';
  let skillsLoaded = 0;
  let memoriesLoaded = 0;

  // Search for relevant skills
  const skillResults = await search({
    query: options.taskDescription,
    types: ['skill'],
    limit: 5,
    minScore: 0.3,
  });

  if (skillResults.length > 0) {
    context += '### Relevant Skills\n\n';
    for (const result of skillResults) {
      context += `**${result.entry.title || 'Skill'}** (score: ${result.score.toFixed(2)})\n\n`;
      context += result.entry.content + '\n\n---\n\n';
      skillsLoaded++;
    }
  }

  // Search for relevant project memories
  const memoryResults = await search({
    query: `${options.projectName} ${options.taskDescription}`,
    types: ['memory', 'session'],
    limit: 3,
    minScore: 0.35,
  });

  if (memoryResults.length > 0) {
    context += '### Related Memories\n\n';
    for (const result of memoryResults) {
      context += `**${result.entry.title}** (${result.entry.type})\n`;
      const preview = result.entry.content.substring(0, 300);
      context += `${preview}${result.entry.content.length > 300 ? '...' : ''}\n\n`;
      memoriesLoaded++;
    }
  }

  return {
    context,
    skillsLoaded,
    memoriesLoaded,
  };
}
