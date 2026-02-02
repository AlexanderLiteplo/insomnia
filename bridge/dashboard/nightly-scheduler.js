#!/usr/bin/env node
/**
 * Nightly Builds Scheduler (Standalone Version)
 *
 * This script runs periodically to check if a nightly build should be triggered.
 * It reads the config and triggers a build if:
 * 1. Nightly builds are enabled
 * 2. Current time has passed the scheduled build time
 * 3. A build hasn't already run today
 *
 * NO DASHBOARD REQUIRED - spawns Claude agent directly
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BRIDGE_DIR = path.join(process.env.HOME, 'Documents', 'insomnia', 'bridge');
const CONFIG_PATH = path.join(BRIDGE_DIR, '.nightly-builds.json');
const BRIEFINGS_PATH = path.join(BRIDGE_DIR, '.nightly-briefings.json');
const LOG_PATH = path.join(BRIDGE_DIR, 'nightly-scheduler.log');

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());
  fs.appendFileSync(LOG_PATH, logMessage);
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    log('Config file not found, skipping check');
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    log(`Error loading config: ${err.message}`);
    return null;
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function calculateNextRun(buildTime, enabled) {
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

function shouldRunBuild(config) {
  if (!config || !config.enabled) {
    return false;
  }

  const now = new Date();
  const [hours, minutes] = config.buildTime.split(':').map(Number);
  const scheduledTime = new Date();
  scheduledTime.setHours(hours, minutes, 0, 0);

  // Check if we've passed the scheduled time today
  if (now < scheduledTime) {
    log(`Not yet time for build. Scheduled: ${scheduledTime.toLocaleString()}, Current: ${now.toLocaleString()}`);
    return false;
  }

  // Check if we already ran today
  if (config.lastRun) {
    const lastRun = new Date(config.lastRun);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    if (lastRun >= todayStart) {
      log(`Build already ran today at ${lastRun.toLocaleString()}`);
      return false;
    }
  }

  // Check that we're not too far past the build time (grace period of 6 hours)
  const gracePeriodEnd = new Date(scheduledTime);
  gracePeriodEnd.setHours(gracePeriodEnd.getHours() + 6);

  if (now > gracePeriodEnd) {
    log(`Past grace period. Scheduled: ${scheduledTime.toLocaleString()}, Grace ends: ${gracePeriodEnd.toLocaleString()}`);
    return false;
  }

  return true;
}

function buildPrompt(config) {
  // Build the feature-specific prompts
  let featurePrompts = '';

  if (config.earningsExtraction && config.earningsExtraction.enabled) {
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

  if (config.priorityTasks && config.priorityTasks.enabled) {
    featurePrompts += `
## PRIORITY TASKS FETCHING
Fetch top ${config.priorityTasks.maxTasks} priority tasks from: ${config.priorityTasks.sources.join(', ')}

Steps:
1. For orchestrator: Read ~/Documents/insomnia/orchestrator/prds/tasks.json - find tasks with status "pending" or "in_progress", prioritize by phase
2. For human-tasks: Read ~/Documents/insomnia/bridge/.human-tasks.json - filter by status="pending", sort by priority (urgent > high > medium > low)
3. For github-issues: Use 'gh issue list --state open --limit 10' to fetch open issues, prioritize by labels

Collect the top ${config.priorityTasks.maxTasks} highest priority tasks across all sources.
Include task ID, title, description, source, and priority level.
`;
  }

  if (config.managerDistribution && config.managerDistribution.enabled) {
    featurePrompts += `
## MANAGER DISTRIBUTION
After fetching priority tasks, distribute them across managers using the ${config.managerDistribution.taskAssignmentStrategy} strategy.
Maximum managers to spawn: ${config.managerDistribution.maxManagersToSpawn}

Steps:
1. Read the manager registry from ~/Documents/insomnia/bridge/.manager-registry.json
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

  const prompt = `You are running a nightly build for Insomnia. Current time: ${new Date().toISOString()}

${config.customPrompt || 'Look for friction points in my projects, scrape useful data, optimize existing code, clean up old files, or build small improvements.'}
${featurePrompts}

IMPORTANT: When you're done, create a briefing summary with:
1. A TLDR section (1-2 sentences max)
2. A detailed summary of what was done
3. A list of all changes made
${config.earningsExtraction && config.earningsExtraction.enabled ? '4. Earnings data for the day' : ''}
${config.priorityTasks && config.priorityTasks.enabled ? '5. List of priority tasks fetched' : ''}
${config.managerDistribution && config.managerDistribution.enabled ? '6. Managers spawned and tasks assigned' : ''}

Save the briefing to: ${BRIEFINGS_PATH}

The briefing should be JSON in this format:
{
  "id": "brief_<timestamp>",
  "createdAt": "<ISO timestamp>",
  "buildStartedAt": "<ISO timestamp>",
  "buildCompletedAt": "<ISO timestamp when you finish>",
  "model": "${config.model || 'opus'}",
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
  "status": "success|partial|failed"${config.earningsExtraction && config.earningsExtraction.enabled ? `,
  "earnings": {
    "date": "<YYYY-MM-DD>",
    "total": <number>,
    "currency": "USD",
    "breakdown": [
      { "source": "<source>", "amount": <number>, "transactions": <number> }
    ]
  }` : ''}${config.priorityTasks && config.priorityTasks.enabled ? `,
  "priorityTasks": [
    {
      "id": "<task-id>",
      "title": "<task-title>",
      "description": "<task-description>",
      "source": "orchestrator|human-tasks|github-issues",
      "priority": "low|medium|high|urgent",
      "project": "<project-name>"
    }
  ]` : ''}${config.managerDistribution && config.managerDistribution.enabled ? `,
  "managersSpawned": [
    {
      "managerId": "<manager-id>",
      "managerName": "<manager-name>",
      "assignedTask": "<task-title>"
    }
  ]` : ''}
}

Be thorough but efficient. Focus on high-value improvements.`;

  return prompt;
}

function triggerBuild(config) {
  log('Triggering nightly build directly (no dashboard required)...');

  try {
    const prompt = buildPrompt(config);
    const model = config.model || 'opus';

    log(`Spawning Claude agent with model: ${model}`);

    const child = spawn('claude', [
      '--model', model,
      '--dangerously-skip-permissions',
      '-p', prompt
    ], {
      detached: true,
      stdio: 'ignore',
      cwd: process.env.HOME
    });

    child.unref();

    log(`Build started with PID: ${child.pid}`);

    // Update config
    config.lastRun = new Date().toISOString();
    config.nextRun = calculateNextRun(config.buildTime, config.enabled);
    saveConfig(config);

    log('Config updated with lastRun and nextRun');

  } catch (err) {
    log(`Error triggering build: ${err.message}`);
  }
}

// Main execution
log('=== Nightly Build Scheduler Check ===');

const config = loadConfig();

if (shouldRunBuild(config)) {
  log('Conditions met, triggering build...');
  triggerBuild(config);
} else {
  log('No build needed at this time');
}

log('=== Check Complete ===\n');
