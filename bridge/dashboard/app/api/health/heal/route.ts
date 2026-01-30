import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { authenticateRequest } from '../../../lib/auth';

const BRIDGE_DIR = process.env.BRIDGE_DIR || path.join(process.env.HOME || '', 'Documents', 'insomnia', 'bridge');
const HEAL_LOG_DIR = path.join(BRIDGE_DIR, 'heal-sessions');

interface HealthCheck {
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    telegramBridge: HealthCheck;
    orchestratorWorker: HealthCheck;
    orchestratorManager: HealthCheck;
    dashboard: HealthCheck;
  };
}

async function getHealthStatus(): Promise<HealthStatus> {
  const res = await fetch('http://localhost:3333/api/health');
  return res.json();
}

function generateHealPrompt(health: HealthStatus): string {
  const issues: string[] = [];

  if (health.checks.telegramBridge.status !== 'pass') {
    issues.push(`- Telegram Bridge: ${health.checks.telegramBridge.message} (status: ${health.checks.telegramBridge.status})`);
  }
  if (health.checks.orchestratorWorker.status !== 'pass') {
    issues.push(`- Orchestrator Worker: ${health.checks.orchestratorWorker.message} (status: ${health.checks.orchestratorWorker.status})`);
  }
  if (health.checks.orchestratorManager.status !== 'pass') {
    issues.push(`- Orchestrator Manager: ${health.checks.orchestratorManager.message} (status: ${health.checks.orchestratorManager.status})`);
  }

  const INSOMNIA_ROOT = path.join(BRIDGE_DIR, '..');

  return `You are a system healer agent for Insomnia - the autonomous AI agent system that never sleeps.

## CRITICAL: Scope Restriction
**You must ONLY work within the Insomnia project directory: ${INSOMNIA_ROOT}**

- DO NOT modify, read, or access any files outside of ${INSOMNIA_ROOT}
- DO NOT access ~/Documents/insomnia/ or any archived directories
- The ONLY valid working directories are:
  - ${INSOMNIA_ROOT} (project root)
  - ${BRIDGE_DIR} (bridge)
  - ${path.join(BRIDGE_DIR, 'dashboard')} (dashboard)
  - ${path.join(INSOMNIA_ROOT, 'orchestrator')} (orchestrator)
- If you find paths pointing elsewhere, they are STALE and should be updated to point to insomnia

## About Insomnia

Insomnia is an autonomous AI system that operates via Telegram, building projects around the clock without human intervention. It consists of two main components:

### 1. Telegram Bridge (Message Router & AI Interface)
The bridge receives messages from Telegram and routes them to specialized Claude agents:
- **Responder** (Haiku) - Fast classifier that decides how to route each message (CREATE new manager, QUEUE to existing, or INTERRUPT)
- **Manager Registry** - Tracks all active managers, their topics, and message queues
- **Managers** (Opus) - Long-running Claude Code sessions that handle specific topics and can spawn orchestrators
- **Dashboard** - Real-time monitoring UI at http://localhost:3333

Key files:
- Main server: ${path.join(BRIDGE_DIR, 'src/telegram-server.ts')}
- Responder: ${path.join(BRIDGE_DIR, 'src/telegram-responder.ts')}
- Manager agent spawner: ${path.join(BRIDGE_DIR, 'src/telegram-manager-agent.ts')}
- Manager registry: ${path.join(BRIDGE_DIR, 'src/manager-registry.ts')}
- Config: ${path.join(BRIDGE_DIR, 'config.json')}
- State files: ${path.join(BRIDGE_DIR, '.manager-registry.json')}, ${path.join(BRIDGE_DIR, '.telegram-state.json')}
- Main log: ${path.join(BRIDGE_DIR, 'bridge.log')}
- Session logs: ${path.join(BRIDGE_DIR, 'manager-sessions/')}, ${path.join(BRIDGE_DIR, 'responder-sessions/')}

### 2. Orchestrator (Autonomous Builder)
The orchestrator uses a Worker/Manager architecture to autonomously build projects:
- **Worker** (Opus) - Implements tasks from prds/tasks.json, runs tests, marks tasks done when passing
- **Manager** (Opus) - Reviews worker output, approves or requests changes, generates reusable skills
- **Skills** - Learned patterns saved for future use

Key files:
- Task definitions: ${path.join(BRIDGE_DIR, '..', 'orchestrator', 'prds/tasks.json')}
- Worker state: ${path.join(BRIDGE_DIR, '..', 'orchestrator', '.state/worker.pid')}
- Manager state: ${path.join(BRIDGE_DIR, '..', 'orchestrator', '.state/manager.pid')}
- Control script: ${path.join(BRIDGE_DIR, '..', 'orchestrator', 'scripts/orchestrator.sh')}
- Logs: ${path.join(BRIDGE_DIR, '..', 'orchestrator', 'logs/')}

## Current Health Issues Detected:
${issues.join('\n')}

## System Locations:
- Bridge directory: ${BRIDGE_DIR}
- Orchestrator directory: ${path.join(BRIDGE_DIR, '..', 'orchestrator')}
- Dashboard directory: ${path.join(BRIDGE_DIR, 'dashboard')}

## Your Task:
1. Investigate why the unhealthy/degraded services are not working properly
2. Check logs in the appropriate directories to understand what went wrong
3. Attempt to fix the issues by:
   - Checking if processes crashed (look for PIDs, check running processes)
   - Restarting services if they crashed or are stuck
   - Checking configuration files (config.json, state files)
   - Looking for common problems:
     * Missing or corrupted state files (.manager-registry.json, .telegram-state.json, .bridge.lock)
     * Permission issues on directories or files
     * Port conflicts (dashboard runs on 3333)
     * Missing dependencies or build issues
     * Lock files preventing restart

## Diagnostic Commands:
- Check bridge process: \`ps aux | grep "node dist/telegram-server.js" | grep -v grep\`
- Check orchestrator processes: \`cd ${path.join(BRIDGE_DIR, '..', 'orchestrator')} && ./scripts/orchestrator.sh status\`
- View recent bridge logs: \`tail -50 ${path.join(BRIDGE_DIR, 'bridge.log')}\`
- View orchestrator logs: \`cd ${path.join(BRIDGE_DIR, '..', 'orchestrator')} && ./scripts/orchestrator.sh logs\`
- Check manager registry: \`cat ${path.join(BRIDGE_DIR, '.manager-registry.json')}\`
- Check dashboard process: \`ps aux | grep "next dev" | grep -v grep\`
- List manager sessions: \`ls -lt ${path.join(BRIDGE_DIR, 'manager-sessions/')} | head -10\`

## Repair Commands:
- Restart bridge: \`pkill -f "node dist/telegram-server.js"; cd ${BRIDGE_DIR} && rm -f .bridge.lock && npm start &\`
- Restart orchestrator: \`cd ${path.join(BRIDGE_DIR, '..', 'orchestrator')} && ./scripts/orchestrator.sh restart\`
- Check/rebuild bridge: \`cd ${BRIDGE_DIR} && npm run build\`
- Remove stale lock file: \`rm -f ${path.join(BRIDGE_DIR, '.bridge.lock')}\`

## Architecture Flow:
1. User sends Telegram message → Bridge server receives it
2. Responder (Haiku) classifies message → Creates/queues to Manager
3. Manager (Opus) processes message → Can spawn Orchestrator for projects
4. Orchestrator Worker implements tasks → Manager reviews and approves
5. Results sent back via Telegram → Dashboard shows real-time status

## Important Guidelines:
- Be careful and conservative with fixes - don't delete data or state files unless they're clearly corrupted
- Always check logs first to understand the root cause before attempting fixes
- Log what you find and what you do for transparency
- If you cannot fix an issue automatically, describe what manual intervention is needed
- After making fixes, verify the services are healthy again by checking:
  * Process is running (ps aux)
  * Recent logs show normal operation
  * State files are valid JSON
  * Health check endpoint returns healthy status

## Success Criteria:
- All processes are running with valid PIDs
- Logs show recent activity without errors
- State files are valid and uncorrupted
- Health check shows all services as "pass"

Please investigate and fix the issues now. Start by checking logs to understand what went wrong, then apply appropriate fixes.`;
}

export async function POST(request: Request) {
  // Authenticate the request
  const authResult = authenticateRequest(request);
  if (!authResult.authorized) {
    return authResult.error || NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get current health status
    const health = await getHealthStatus();

    if (health.status === 'healthy') {
      return NextResponse.json({
        message: 'System is already healthy, no healing needed',
        status: 'healthy'
      });
    }

    // Create heal log directory if it doesn't exist
    if (!fs.existsSync(HEAL_LOG_DIR)) {
      fs.mkdirSync(HEAL_LOG_DIR, { recursive: true });
    }

    // Generate a unique session ID
    const sessionId = `heal_${Date.now()}`;
    const logFile = path.join(HEAL_LOG_DIR, `${sessionId}.log`);

    // Generate the heal prompt
    const healPrompt = generateHealPrompt(health);

    // Spawn Claude Code in the background
    const claude = spawn('claude', [
      '--model', 'sonnet',
      '--dangerously-skip-permissions',
      '-p', healPrompt
    ], {
      cwd: BRIDGE_DIR,
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    // Create log file with initial info
    const logStream = fs.createWriteStream(logFile);
    logStream.write(`=== Heal Session: ${sessionId} ===\n`);
    logStream.write(`Started: ${new Date().toISOString()}\n`);
    logStream.write(`Health Status: ${health.status}\n`);
    logStream.write(`Prompt:\n${healPrompt}\n\n`);
    logStream.write(`=== Claude Output ===\n`);

    // Pipe output to log file
    claude.stdout?.pipe(logStream, { end: false });
    claude.stderr?.pipe(logStream, { end: false });

    claude.on('exit', (code) => {
      logStream.write(`\n=== Session Ended ===\n`);
      logStream.write(`Exit Code: ${code}\n`);
      logStream.write(`Finished: ${new Date().toISOString()}\n`);
      logStream.end();
    });

    // Unref to allow the parent process to exit independently
    claude.unref();

    return NextResponse.json({
      message: 'Healer agent spawned successfully',
      sessionId,
      logFile,
      issues: Object.entries(health.checks)
        .filter(([_, check]) => check.status !== 'pass')
        .map(([name, check]) => ({ name, ...check }))
    });

  } catch (error) {
    console.error('Failed to spawn healer agent:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to spawn healer agent' },
      { status: 500 }
    );
  }
}
