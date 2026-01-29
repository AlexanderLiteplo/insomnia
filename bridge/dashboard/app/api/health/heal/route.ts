import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { authenticateRequest } from '../../../lib/auth';

const BRIDGE_DIR = process.env.BRIDGE_DIR || path.join(process.env.HOME || '', 'claude-automation-system', 'bridge');
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

  return `You are a system healer agent for the Claude Automation System.

## Current Health Issues Detected:
${issues.join('\n')}

## System Locations:
- Bridge directory: ${BRIDGE_DIR}
- Orchestrator directory: ${path.join(BRIDGE_DIR, '..', 'orchestrator')}

## Your Task:
1. Investigate why the unhealthy/degraded services are not working properly
2. Check logs in the appropriate directories
3. Attempt to fix the issues by:
   - Restarting services if they crashed
   - Fixing configuration issues if found
   - Checking for common problems (missing files, wrong permissions, etc.)

## Commands to Know:
- Restart bridge: \`pkill -f "node dist/telegram-server.js"; cd ${BRIDGE_DIR} && rm -f .bridge.lock && npm start &\`
- Restart orchestrator: \`cd ${path.join(BRIDGE_DIR, '..', 'orchestrator')} && ./scripts/orchestrator.sh restart\`
- View bridge logs: \`tail -50 ${path.join(BRIDGE_DIR, 'bridge.log')}\`
- View orchestrator logs: \`cd ${path.join(BRIDGE_DIR, '..', 'orchestrator')} && ./scripts/orchestrator.sh logs\`

## Important:
- Be careful and conservative with fixes
- Log what you find and what you do
- If you cannot fix an issue automatically, describe what manual intervention is needed
- After making fixes, verify the services are healthy again

Please investigate and fix the issues now.`;
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
