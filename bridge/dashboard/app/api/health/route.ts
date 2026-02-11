import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { BRIDGE_DIR, ORCHESTRATOR_DIR } from '../../lib/paths';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    telegramBridge: HealthCheck;
    orchestratorWorker: HealthCheck;
    orchestratorManager: HealthCheck;
    dashboard: HealthCheck;
    rentahumanApi: HealthCheck;
  };
  summary: string;
}

interface HealthCheck {
  status: 'pass' | 'fail' | 'warn';
  message: string;
  pid?: number | null;
  uptime?: string;
  lastActivity?: string;
}

function checkTelegramBridge(): HealthCheck {
  try {
    const result = execSync('ps aux | grep "node dist/telegram-server.js" | grep -v grep', {
      encoding: 'utf8',
      timeout: 5000,
    });

    const match = result.match(/\s+(\d+)\s+/);
    const pid = match ? parseInt(match[1]) : null;

    let uptime = '—';
    if (pid) {
      try {
        uptime = execSync(`ps -o etime= -p ${pid}`, { encoding: 'utf8' }).trim();
      } catch {
        // Ignore
      }
    }

    // Check log for recent activity
    const logFile = path.join(BRIDGE_DIR, 'bridge.log');
    let lastActivity: string | undefined;

    if (fs.existsSync(logFile)) {
      try {
        const logContent = execSync(`tail -5 "${logFile}"`, { encoding: 'utf8', timeout: 2000 });
        const lines = logContent.split('\n').filter(l => l.trim());
        if (lines.length > 0) {
          const lastLine = lines[lines.length - 1];
          const timestampMatch = lastLine.match(/^\[(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
          if (timestampMatch) {
            lastActivity = timestampMatch[1];

            // Check if activity is recent (within 2 minutes)
            const lastTime = new Date(timestampMatch[1]);
            const diffMs = new Date().getTime() - lastTime.getTime();

            if (diffMs > 120000) {
              return {
                status: 'warn',
                message: 'No recent activity',
                pid,
                uptime,
                lastActivity,
              };
            }
          }
        }
      } catch {
        // Ignore
      }
    }

    return {
      status: 'pass',
      message: 'Running and healthy',
      pid,
      uptime,
      lastActivity,
    };

  } catch {
    return {
      status: 'fail',
      message: 'Not running',
    };
  }
}

async function checkRentahumanApi(): Promise<HealthCheck> {
  try {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch('https://rentahuman.ai', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const latency = Date.now() - start;

    if (res.ok) {
      return {
        status: latency > 3000 ? 'warn' : 'pass',
        message: latency > 3000 ? `Slow (${latency}ms)` : `Up (${latency}ms)`,
        uptime: `${latency}ms latency`,
      };
    }
    return {
      status: 'fail',
      message: `HTTP ${res.status}`,
    };
  } catch {
    return {
      status: 'fail',
      message: 'Not reachable',
    };
  }
}

function checkOrchestratorProcess(type: 'worker' | 'manager'): HealthCheck {
  const pidFile = path.join(ORCHESTRATOR_DIR, '.state', `${type}.pid`);

  if (!fs.existsSync(pidFile)) {
    return {
      status: 'warn',
      message: 'Not configured',
    };
  }

  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);

    // Check if process is running
    execSync(`ps -p ${pid} > /dev/null 2>&1`);

    let uptime = '—';
    try {
      uptime = execSync(`ps -o etime= -p ${pid}`, { encoding: 'utf8' }).trim();
    } catch {
      // Ignore
    }

    return {
      status: 'pass',
      message: 'Running',
      pid,
      uptime,
    };

  } catch {
    return {
      status: 'fail',
      message: 'Process not running',
    };
  }
}

export async function GET() {
  const checks = {
    telegramBridge: checkTelegramBridge(),
    orchestratorWorker: checkOrchestratorProcess('worker'),
    orchestratorManager: checkOrchestratorProcess('manager'),
    dashboard: {
      status: 'pass' as const,
      message: 'Running',
    },
    rentahumanApi: await checkRentahumanApi(),
  };

  // Determine overall status
  const failCount = Object.values(checks).filter(c => c.status === 'fail').length;
  const warnCount = Object.values(checks).filter(c => c.status === 'warn').length;

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  let summary: string;

  if (checks.telegramBridge.status === 'fail') {
    overallStatus = 'unhealthy';
    summary = 'Telegram bridge is not running';
  } else if (failCount > 0) {
    overallStatus = 'degraded';
    summary = `${failCount} service(s) down`;
  } else if (warnCount > 0) {
    overallStatus = 'degraded';
    summary = `${warnCount} service(s) with warnings`;
  } else {
    overallStatus = 'healthy';
    summary = 'All systems operational';
  }

  const healthStatus: HealthStatus = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    checks,
    summary,
  };

  // Return appropriate HTTP status
  const httpStatus = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

  return NextResponse.json(healthStatus, { status: httpStatus });
}
