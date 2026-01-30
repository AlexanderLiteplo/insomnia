import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { authenticateRequest, authenticateReadRequest } from '../../lib/auth';

const BRIDGE_DIR = process.env.BRIDGE_DIR || path.join(process.env.HOME || '', 'claude-automation-system', 'bridge');
const CONFIG_PATH = path.join(BRIDGE_DIR, '.nightly-builds.json');
const BRIEFINGS_PATH = path.join(BRIDGE_DIR, '.nightly-briefings.json');

// Valid Claude models
const VALID_MODELS = ['sonnet', 'haiku', 'opus'] as const;
type ClaudeModel = typeof VALID_MODELS[number];

// Default nightly builds configuration
const DEFAULT_CONFIG = {
  enabled: false,
  buildTime: '03:00',
  wakeUpTime: '08:00',
  model: 'opus' as ClaudeModel,
  customPrompt: 'Look for friction points in my projects, scrape useful data, optimize existing code, clean up old files, or build small improvements. Focus on Insomnia and other active projects.',
  lastRun: null as string | null,
  nextRun: null as string | null,
  // Earnings extraction feature
  earningsExtraction: {
    enabled: false,
    sources: ['stripe'],
    customSourcePath: undefined,
  },
  // Priority tasks feature
  priorityTasks: {
    enabled: false,
    maxTasks: 4,
    sources: ['orchestrator', 'human-tasks'] as ('orchestrator' | 'human-tasks' | 'github-issues')[],
  },
  // Manager distribution feature
  managerDistribution: {
    enabled: false,
    maxManagersToSpawn: 4,
    taskAssignmentStrategy: 'priority-based' as 'round-robin' | 'priority-based' | 'skill-match',
  },
};

interface NightlyBuildConfig {
  enabled: boolean;
  buildTime: string;
  wakeUpTime: string;
  model: ClaudeModel;
  customPrompt: string;
  lastRun?: string | null;
  nextRun?: string | null;
  earningsExtraction: {
    enabled: boolean;
    sources: string[];
    customSourcePath?: string;
  };
  priorityTasks: {
    enabled: boolean;
    maxTasks: number;
    sources: ('orchestrator' | 'human-tasks' | 'github-issues')[];
  };
  managerDistribution: {
    enabled: boolean;
    maxManagersToSpawn: number;
    taskAssignmentStrategy: 'round-robin' | 'priority-based' | 'skill-match';
  };
}

interface NightlyBriefing {
  id: string;
  createdAt: string;
  buildStartedAt: string;
  buildCompletedAt: string;
  model: string;
  tldr: string;
  summary: string;
  changes: Array<{
    type: string;
    title: string;
    description: string;
    filesChanged?: string[];
    project?: string;
  }>;
  status: 'success' | 'partial' | 'failed';
  error?: string;
}

function calculateNextRun(buildTime: string, enabled: boolean): string | null {
  if (!enabled) return null;

  const [hours, minutes] = buildTime.split(':').map(Number);
  const now = new Date();
  const next = new Date();

  next.setHours(hours, minutes, 0, 0);

  // If the time has passed today, schedule for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next.toISOString();
}

function loadConfig(): NightlyBuildConfig {
  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      return { ...DEFAULT_CONFIG, ...fileConfig };
    } catch (err) {
      console.error('Error loading nightly builds config:', err);
    }
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config: Partial<NightlyBuildConfig>): NightlyBuildConfig {
  const existing = loadConfig();
  const merged = { ...existing, ...config };

  // Validate model
  if (config.model && !VALID_MODELS.includes(config.model)) {
    throw new Error(`Invalid model "${config.model}". Valid models: ${VALID_MODELS.join(', ')}`);
  }

  // Validate time format
  const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  if (config.buildTime && !timeRegex.test(config.buildTime)) {
    throw new Error('Invalid build time format. Use HH:MM (24-hour format)');
  }
  if (config.wakeUpTime && !timeRegex.test(config.wakeUpTime)) {
    throw new Error('Invalid wake-up time format. Use HH:MM (24-hour format)');
  }

  // Calculate next run time
  merged.nextRun = calculateNextRun(merged.buildTime, merged.enabled);

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2));
  return merged;
}

function loadBriefings(): NightlyBriefing[] {
  if (fs.existsSync(BRIEFINGS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(BRIEFINGS_PATH, 'utf8'));
    } catch (err) {
      console.error('Error loading briefings:', err);
    }
  }
  return [];
}

/**
 * GET /api/nightly-builds
 * Returns the current nightly builds configuration and recent briefings
 */
export async function GET(request: Request) {
  const auth = authenticateReadRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  const config = loadConfig();
  const briefings = loadBriefings();

  return NextResponse.json({
    config,
    briefings: briefings.slice(0, 10), // Last 10 briefings
    availableModels: VALID_MODELS,
  });
}

/**
 * PATCH /api/nightly-builds
 * Updates nightly builds configuration
 * Body: { enabled?: boolean, buildTime?: string, wakeUpTime?: string, model?: string, customPrompt?: string }
 */
export async function PATCH(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  try {
    const body = await request.json();

    // Validate allowed fields
    const allowedFields = ['enabled', 'buildTime', 'wakeUpTime', 'model', 'customPrompt', 'earningsExtraction', 'priorityTasks', 'managerDistribution'];
    for (const key of Object.keys(body)) {
      if (!allowedFields.includes(key)) {
        return NextResponse.json(
          { error: 'Invalid field', message: `Unknown field: ${key}` },
          { status: 400 }
        );
      }
    }

    const config = saveConfig(body);

    return NextResponse.json({
      success: true,
      config,
    });
  } catch (err) {
    console.error('Error updating nightly builds config:', err);
    return NextResponse.json(
      { error: 'Server error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/nightly-builds
 * Triggers a manual nightly build run
 */
export async function POST(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  try {
    const config = loadConfig();

    // Spawn the nightly build agent
    const { spawn } = await import('child_process');

    // Build the feature-specific prompts
    let featurePrompts = '';

    if (config.earningsExtraction.enabled) {
      featurePrompts += `
## EARNINGS EXTRACTION
Extract earnings data from the following sources: ${config.earningsExtraction.sources.join(', ')}
${config.earningsExtraction.customSourcePath ? `Custom source path: ${config.earningsExtraction.customSourcePath}` : ''}

Steps:
1. For Stripe: Use the Stripe CLI or API to fetch yesterday's transactions (stripe payments list --created.gte=<yesterday> --created.lt=<today>)
2. For Gumroad: Check ~/Documents or common locations for Gumroad export data
3. For custom sources: Read from the specified path
4. Aggregate total earnings, count transactions, and break down by source

Include in briefing:
- Total earnings for the day
- Breakdown by source
- Number of transactions
`;
    }

    if (config.priorityTasks.enabled) {
      featurePrompts += `
## PRIORITY TASKS FETCHING
Fetch top ${config.priorityTasks.maxTasks} priority tasks from: ${config.priorityTasks.sources.join(', ')}

Steps:
1. For orchestrator: Read ~/claude-automation-system/orchestrator/prds/tasks.json - find tasks with status "pending" or "in_progress", prioritize by phase
2. For human-tasks: Read ~/claude-automation-system/bridge/.human-tasks.json - filter by status="pending", sort by priority (urgent > high > medium > low)
3. For github-issues: Use 'gh issue list --state open --limit 10' to fetch open issues, prioritize by labels

Collect the top ${config.priorityTasks.maxTasks} highest priority tasks across all sources.
Include task ID, title, description, source, and priority level.
`;
    }

    if (config.managerDistribution.enabled) {
      featurePrompts += `
## MANAGER DISTRIBUTION
After fetching priority tasks, distribute them across managers using the ${config.managerDistribution.taskAssignmentStrategy} strategy.
Maximum managers to spawn: ${config.managerDistribution.maxManagersToSpawn}

Steps:
1. Read the manager registry from ~/claude-automation-system/bridge/.manager-registry.json
2. Match tasks to existing managers based on topics/skills, or create new managers for unmatched tasks
3. For each task assignment, spawn a new Claude agent as a manager:

   claude --model ${config.model} --dangerously-skip-permissions -p "You are manager '<manager-name>' handling task: <task-description>"

4. Track which manager received which task

Assignment strategies:
- round-robin: Distribute tasks evenly across managers
- priority-based: Assign highest priority tasks first to most capable managers
- skill-match: Match task topics to manager expertise areas

Include in briefing which managers were spawned and what tasks they received.
`;
    }

    const buildPrompt = `You are running a nightly build for Insomnia. Current time: ${new Date().toISOString()}

${config.customPrompt}
${featurePrompts}

IMPORTANT: When you're done, create a briefing summary with:
1. A TLDR section (1-2 sentences max)
2. A detailed summary of what was done
3. A list of all changes made
4. ${config.earningsExtraction.enabled ? 'Earnings data for the day' : ''}
5. ${config.priorityTasks.enabled ? 'List of priority tasks fetched' : ''}
6. ${config.managerDistribution.enabled ? 'Managers spawned and tasks assigned' : ''}

Save the briefing to: ${BRIEFINGS_PATH}

The briefing should be JSON in this format:
{
  "id": "brief_<timestamp>",
  "createdAt": "<ISO timestamp>",
  "buildStartedAt": "<ISO timestamp>",
  "buildCompletedAt": "<ISO timestamp when you finish>",
  "model": "${config.model}",
  "tldr": "<1-2 sentence summary>",
  "summary": "<detailed summary>",
  "changes": [
    {
      "type": "improvement|fix|optimization|cleanup|scrape|new_tool|earnings|task_distribution",
      "title": "<short title>",
      "description": "<what was done>",
      "filesChanged": ["<file paths>"],
      "project": "<project name if applicable>"
    }
  ],
  "status": "success|partial|failed",
  ${config.earningsExtraction.enabled ? `"earnings": {
    "date": "<YYYY-MM-DD>",
    "total": <number>,
    "currency": "USD",
    "breakdown": [
      { "source": "<source>", "amount": <number>, "transactions": <number> }
    ]
  },` : ''}
  ${config.priorityTasks.enabled ? `"priorityTasks": [
    {
      "id": "<task-id>",
      "title": "<task-title>",
      "description": "<task-description>",
      "source": "orchestrator|human-tasks|github-issues",
      "priority": "low|medium|high|urgent",
      "project": "<project-name>"
    }
  ],` : ''}
  ${config.managerDistribution.enabled ? `"managersSpawned": [
    {
      "managerId": "<manager-id>",
      "managerName": "<manager-name>",
      "assignedTask": "<task-title>"
    }
  ],` : ''}
}

Be thorough but efficient. Focus on high-value improvements.`;

    const child = spawn('claude', [
      '--model', config.model,
      '--dangerously-skip-permissions',
      '-p', buildPrompt
    ], {
      detached: true,
      stdio: 'ignore',
      cwd: process.env.HOME
    });

    child.unref();

    // Update last run time
    const updatedConfig = saveConfig({ lastRun: new Date().toISOString() });

    return NextResponse.json({
      success: true,
      message: 'Nightly build started',
      pid: child.pid,
      config: updatedConfig,
    });
  } catch (err) {
    console.error('Error starting nightly build:', err);
    return NextResponse.json(
      { error: 'Server error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
