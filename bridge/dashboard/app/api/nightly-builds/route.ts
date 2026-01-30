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
};

interface NightlyBuildConfig {
  enabled: boolean;
  buildTime: string;
  wakeUpTime: string;
  model: ClaudeModel;
  customPrompt: string;
  lastRun?: string | null;
  nextRun?: string | null;
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
    const allowedFields = ['enabled', 'buildTime', 'wakeUpTime', 'model', 'customPrompt'];
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
    const buildPrompt = `You are running a nightly build for Insomnia. Current time: ${new Date().toISOString()}

${config.customPrompt}

IMPORTANT: When you're done, create a briefing summary with:
1. A TLDR section (1-2 sentences max)
2. A detailed summary of what was done
3. A list of all changes made

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
      "type": "improvement|fix|optimization|cleanup|scrape|new_tool",
      "title": "<short title>",
      "description": "<what was done>",
      "filesChanged": ["<file paths>"],
      "project": "<project name if applicable>"
    }
  ],
  "status": "success|partial|failed"
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
