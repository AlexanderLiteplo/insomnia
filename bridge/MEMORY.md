# Memory System

A hybrid vector + keyword search memory system for persistent knowledge storage.

## Overview

The memory system provides:
- **Session transcripts** stored as JSONL files
- **Memory files** stored as markdown in `memory/`
- **Hybrid search** combining vector (semantic) and keyword (FTS5) matching
- **Smart syncing** via file watcher for real-time updates
- **Pre-orchestrator hooks** for context injection

## Architecture

```
memory/
├── types.ts          # TypeScript interfaces
├── config.ts         # Configuration management
├── embeddings.ts     # Embedding providers (local, OpenAI, Ollama)
├── sessions.ts       # JSONL session storage
├── store.ts          # SQLite + FTS5 store
├── sync.ts           # File watcher and syncing
├── writer.ts         # Memory file writing utilities
├── hooks.ts          # Pre/post conversation hooks
└── index.ts          # Main exports
```

## Quick Start

```bash
# Check status
npm run memory status

# Search memories (hybrid vector + keyword)
npm run memory search "authentication bug"

# Add a memory
npm run memory add "API Design" "Use REST for external APIs, gRPC for internal"

# List all entries
npm run memory list

# List sessions
npm run memory sessions

# Start file watcher
npm run memory watch
```

## How It Works

### 1. Memory Storage

Memories are simple markdown files in the `memory/` directory:

```markdown
# My Memory Title

Tags: tag1, tag2

Content goes here...
```

Agents write memories using the standard file write tool - no special API needed.

### 2. Session Transcripts

Sessions are stored as JSONL (JSON Lines) files:

```json
{"type":"session_start","sessionId":"session_123","startedAt":"2024-01-15T10:00:00Z"}
{"type":"message","role":"user","content":"Hello","timestamp":"2024-01-15T10:00:01Z"}
{"type":"message","role":"assistant","content":"Hi!","timestamp":"2024-01-15T10:00:02Z"}
{"type":"session_end","endedAt":"2024-01-15T10:05:00Z","summary":"Greeting exchange"}
```

### 3. Hybrid Search

Search combines two approaches:

- **Vector Search**: SQLite with embeddings for semantic similarity
  - Finds "auth issues" when searching for "authentication bug"
  - Configurable embedding provider (local, OpenAI, Ollama)

- **Keyword Search**: FTS5 for exact phrase matching
  - Finds exact text matches with BM25 ranking
  - Supports prefix matching and boolean operators

Results are merged with configurable weights (default 50/50).

### 4. Smart Syncing

The file watcher monitors:
- `memory/*.md` - Memory files
- `skills/*.md` - Skill files (from orchestrator)
- `sessions/*.jsonl` - Session transcripts

Changes trigger automatic re-indexing with embedding computation.

## API Usage

### Search Memories

```typescript
import { search } from './memory';

const results = await search({
  query: 'authentication bug',
  limit: 10,
  types: ['memory', 'skill'],  // Optional filter
  minScore: 0.3,
  vectorWeight: 0.5,
  keywordWeight: 0.5,
});

for (const result of results) {
  console.log(result.entry.title, result.score, result.matchType);
}
```

### Write Memories

```typescript
import { writeMemory, appendMemory } from './memory';

// Create new memory
writeMemory('API Design', 'Use REST for external, gRPC for internal', {
  tags: ['architecture', 'api'],
});

// Append to existing memory
appendMemory('API Design', 'Additional notes...');
```

### Session Management

```typescript
import {
  createSession,
  appendUserMessage,
  appendAssistantMessage,
  endSession,
} from './memory';

// Create session
const session = createSession('session_123', 'mgr_456');

// Add messages
appendUserMessage('session_123', 'Hello');
appendAssistantMessage('session_123', 'Hi there!');

// End and summarize
endSession('session_123', 'Brief conversation');
```

### Pre-Orchestrator Hook

```typescript
import { preOrchestratorHook } from './memory';

const context = await preOrchestratorHook({
  projectName: 'my-app',
  taskDescription: 'Add authentication',
  workDir: '/path/to/project',
});

console.log(context.skillsLoaded, context.memoriesLoaded);
console.log(context.context);  // Markdown context for the worker
```

## Configuration

Create `memory-config.json` to override defaults:

```json
{
  "embeddingProvider": "openai",
  "embeddingApiKey": "sk-...",
  "embeddingModel": "text-embedding-3-small",
  "defaultVectorWeight": 0.6,
  "defaultKeywordWeight": 0.4,
  "minRelevanceScore": 0.3,
  "maxSearchResults": 10,
  "watchEnabled": true
}
```

### Embedding Providers

- **local** (default): Hash-based embeddings, no external API needed
- **openai**: OpenAI's text-embedding models (requires API key)
- **ollama**: Local Ollama server (requires running Ollama)

## Design Philosophy

The memory system is intentionally simple:

1. **No special memory API** - Agents write markdown files with standard tools
2. **No memory merging** - Each memory is independent
3. **No forgetting curve** - Old memories have equal weight
4. **Explainable simplicity** - Easy to understand and debug

This approach prioritizes:
- Transparency (memories are human-readable markdown)
- Debuggability (inspect files directly)
- Flexibility (works with any file-writing tool)
