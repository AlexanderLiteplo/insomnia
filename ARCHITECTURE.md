# Insomnia Architecture - Manager→Orchestrator Tree Structure

## Overview

Insomnia uses a hierarchical multi-agent architecture where:

```
User (Telegram)
       │
       ▼
   Responder (Haiku) ──── routes messages
       │
       ▼
   Managers (Opus) ──── handle topics, spawn orchestrators
       │
       ▼
   Orchestrators ──── execute PRD-based workflows per project
       │
       ├── Worker (Opus) ──── implements tasks
       └── Manager (Opus) ──── reviews/approves
```

## Core Principle: PRD-First Workflow

**ALL work on projects MUST go through an orchestrator with a PRD.** This is rigid and non-negotiable.

When a manager receives a request about a project:
1. If no orchestrator exists → Create PRD → Start orchestrator
2. If orchestrator exists → Update PRD if needed → Continue work
3. Bug fixes → Add to existing PRD or create fix PRD → Run through orchestrator

## Source of Truth: Config Files

All state is stored in config files within `/Users/alexander/Documents/insomnia/bridge/`:

### 1. `.manager-registry.json` - Manager Registry
Tracks all managers and their state:
```json
{
  "version": 2,
  "managers": [
    {
      "id": "mgr_<timestamp>",
      "name": "project-name-manager",
      "description": "Handles development for project-name",
      "topics": ["project-name", "feature-x"],
      "status": "idle|active|processing",
      "currentTask": "string or null",
      "pid": "number or null",
      "orchestrators": ["orch_123"],  // Orchestrators owned by this manager
      "messageQueue": [],
      "createdAt": "ISO timestamp",
      "lastActiveAt": "ISO timestamp"
    }
  ]
}
```

### 2. `.project-registry.json` - Project Registry (NEW)
Master file mapping projects to PRDs, scopes, and orchestrators:
```json
{
  "version": 1,
  "projects": [
    {
      "id": "proj_<timestamp>",
      "name": "my-project",
      "description": "What the project does",
      "outputDir": "/path/to/code",
      "managerId": "mgr_123",           // Manager responsible for this project
      "orchestratorId": "orch_123",     // Active orchestrator if any
      "prdFile": "prds/my-project.md",  // Path to PRD document
      "scopeFile": "scopes/my-project-scope.md",  // Optional scope doc
      "tasksFile": "projects/my-project/tasks.json",
      "status": "idle|active|completed",
      "createdAt": "ISO timestamp",
      "lastUpdatedAt": "ISO timestamp"
    }
  ]
}
```

### 3. `prds/<project-name>.md` - PRD Documents
Each project gets a PRD that defines the work:
```markdown
# Project: <name>

## Overview
<description>

## Goals
- Goal 1
- Goal 2

## Requirements
### Must Have
- Requirement 1

### Nice to Have
- Optional feature

## Technical Approach
<how to implement>

## Tasks
Generated from this PRD into tasks.json

## Success Criteria
- Tests pass
- Feature works as specified
```

### 4. `projects/<name>/tasks.json` - Task Files
Per-project task definitions (generated from PRDs):
```json
{
  "project": {
    "name": "my-project",
    "description": "Brief description",
    "outputDir": "/path/to/code",
    "prdFile": "../prds/my-project.md"
  },
  "tasks": [
    {
      "id": "task-001",
      "name": "Task name",
      "description": "What to do",
      "requirements": ["req1", "req2"],
      "testCommand": "npm test",
      "status": "pending|in_progress|worker_done|completed",
      "testsPassing": false,
      "workerNotes": "",
      "managerReview": ""
    }
  ]
}
```

## File Locations

All config files are stored in the bridge directory:
```
bridge/
├── .manager-registry.json     # Manager state (git-ignored)
├── .project-registry.json     # Project→PRD mappings (git-ignored)
├── prds/                      # PRD markdown files (git-ignored)
│   ├── project-a.md
│   └── project-b.md
├── scopes/                    # Optional scope docs (git-ignored)
│   └── project-a-scope.md
└── projects/                  # Per-project task files (git-ignored)
    ├── project-a/
    │   └── tasks.json
    └── project-b/
        └── tasks.json
```

## Responder System Prompt

The responder has access to:
1. **Manager Registry** - Who handles what topics
2. **Project Registry** - Which projects exist and their status
3. **Active Orchestrators** - What's currently running

The responder can:
- READ `.manager-registry.json` to find managers
- READ `.project-registry.json` to find projects
- Route messages to the appropriate manager
- See orchestrator status for each project

## Manager Workflow

When a manager receives a request:

### For New Projects:
1. Create PRD document in `prds/<project>.md`
2. Register project in `.project-registry.json`
3. Generate `tasks.json` from PRD
4. Start orchestrator for the project
5. Monitor orchestrator progress

### For Existing Projects:
1. Look up project in `.project-registry.json`
2. Check if orchestrator is running
3. If change needed → Update PRD → Regenerate tasks
4. If bug fix → Add task to existing tasks.json
5. Restart/continue orchestrator

### For Bug Fixes:
1. Find project in registry
2. Add bug fix task to tasks.json
3. Ensure orchestrator is running
4. Monitor until fixed

## UI Architecture Display

The dashboard displays the tree structure:

```
[Telegram Bridge] ── Running
        │
   [Responder] ── Haiku
        │
   ┌────┴────┐
   │         │
[Manager1] [Manager2]
   │         │
   │      [Orchestrator]
   │         ├── Worker
   │         └── Manager
   │
[Orchestrator]
   ├── Worker
   └── Manager

[Projects]
├── project-a (active - Manager1)
│   └── Orchestrator running
└── project-b (idle - Manager2)
```

## Key Principles

1. **One Manager Per Project Domain** - Each major project/domain gets one manager
2. **One Orchestrator Per Active Project** - When work is happening, there's one orchestrator
3. **PRD Before Work** - No code changes without a PRD defining the work
4. **Rigid Workflow** - All changes go through orchestrator (worker implements, manager reviews)
5. **Config as Source of Truth** - The JSON files are the single source of truth
6. **Git-Ignored State** - All state files are git-ignored for privacy

## Message Flow Example

User: "Add dark mode to my-app"

1. **Responder** classifies message:
   - Checks `.project-registry.json` - finds "my-app" project
   - Checks `.manager-registry.json` - finds manager for my-app
   - Routes to that manager

2. **Manager** handles request:
   - Checks project registry for existing PRD
   - If exists: Updates PRD with dark mode requirement
   - If not: Creates new PRD for dark mode feature
   - Updates/creates tasks.json from PRD
   - Starts/restarts orchestrator

3. **Orchestrator** executes:
   - Worker implements dark mode following PRD
   - Manager reviews the implementation
   - Loop until tests pass and work is approved

4. **Completion**:
   - Manager sends Telegram message with results
   - Updates project status in registry
   - Orchestrator goes idle
