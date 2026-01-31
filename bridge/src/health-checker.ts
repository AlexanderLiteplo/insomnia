/**
 * Health Checker and Healer System
 * Validates system state at startup and automatically fixes common issues
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { log } from './logger';
import { validatePaths, printValidationReport, PATHS, ensureDirectories } from './paths';
import { loadRegistry, saveRegistry, Manager, ManagerRegistry } from './manager-registry';

export interface HealthCheckResult {
  healthy: boolean;
  timestamp: string;
  checks: HealthCheck[];
  fixes: string[];
  warnings: string[];
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn' | 'fixed';
  message: string;
}

/**
 * Validate manager name is not undefined or empty
 */
function isValidManagerName(name: string | undefined | null): boolean {
  if (!name) return false;
  if (typeof name !== 'string') return false;
  const trimmed = name.trim().toLowerCase();
  if (trimmed === '') return false;
  if (trimmed === 'undefined') return false;
  if (trimmed === 'null') return false;
  return true;
}

/**
 * Clean up invalid managers from registry
 */
function cleanupInvalidManagers(): { removed: number; cleaned: string[] } {
  const registry = loadRegistry();
  const originalCount = registry.managers.length;
  const cleaned: string[] = [];

  // Filter out managers with invalid names
  registry.managers = registry.managers.filter((m: Manager) => {
    if (!isValidManagerName(m.name)) {
      cleaned.push(`Removed manager with invalid name: "${m.name}" (${m.id})`);
      return false;
    }
    return true;
  });

  // Also clean up duplicate "general" managers (keep only the newest one)
  const generalManagers = registry.managers.filter((m: Manager) => m.name.toLowerCase() === 'general');
  if (generalManagers.length > 1) {
    // Sort by creation date (newest first)
    generalManagers.sort((a: Manager, b: Manager) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    // Keep only the first (newest) and remove the rest
    const toRemove = generalManagers.slice(1);
    for (const m of toRemove) {
      cleaned.push(`Removed duplicate 'general' manager: ${m.id}`);
    }

    const toRemoveIds = new Set(toRemove.map((m: Manager) => m.id));
    registry.managers = registry.managers.filter((m: Manager) => !toRemoveIds.has(m.id));
  }

  if (cleaned.length > 0) {
    saveRegistry(registry);
  }

  return {
    removed: originalCount - registry.managers.length,
    cleaned,
  };
}

/**
 * Clean up stale PID files
 */
function cleanupStalePidFiles(): string[] {
  const cleaned: string[] = [];

  const pidFiles = [
    PATHS.orchestrator.workerPid,
    PATHS.orchestrator.managerPid,
    PATHS.bridge.lockFile,
  ];

  for (const pidFile of pidFiles) {
    if (fs.existsSync(pidFile)) {
      try {
        const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
        try {
          process.kill(pid, 0); // Check if process is running
        } catch {
          // Process not running, remove stale PID file
          fs.unlinkSync(pidFile);
          cleaned.push(`Removed stale PID file: ${pidFile}`);
        }
      } catch {
        // Invalid PID file, remove it
        fs.unlinkSync(pidFile);
        cleaned.push(`Removed invalid PID file: ${pidFile}`);
      }
    }
  }

  return cleaned;
}

/**
 * Fix manager statuses (reset stuck "processing" managers)
 */
function fixStuckManagers(): string[] {
  const registry = loadRegistry();
  const fixed: string[] = [];

  for (const manager of registry.managers) {
    // Check if manager is marked as processing but has no active PID
    if (manager.status === 'processing' && manager.pid) {
      try {
        process.kill(manager.pid, 0); // Check if process is running
      } catch {
        // Process not running, reset status
        manager.status = 'idle';
        manager.currentTask = null;
        manager.pid = null;
        fixed.push(`Reset stuck manager: ${manager.name} (${manager.id})`);
      }
    }
  }

  if (fixed.length > 0) {
    saveRegistry(registry);
  }

  return fixed;
}

/**
 * Run comprehensive health check
 */
export function runHealthCheck(): HealthCheckResult {
  const result: HealthCheckResult = {
    healthy: true,
    timestamp: new Date().toISOString(),
    checks: [],
    fixes: [],
    warnings: [],
  };

  log('🏥 Running health check...');

  // 1. Validate paths
  const pathValidation = validatePaths();
  result.checks.push({
    name: 'Path Validation',
    status: pathValidation.valid ? 'pass' : 'fail',
    message: pathValidation.valid
      ? `All paths validated (${pathValidation.autoFixed.length} auto-fixed)`
      : `${pathValidation.errors.length} path errors`,
  });

  if (!pathValidation.valid) {
    result.healthy = false;
  }
  result.fixes.push(...pathValidation.autoFixed);
  result.warnings.push(...pathValidation.warnings);

  // 2. Ensure required directories exist
  try {
    ensureDirectories();
    result.checks.push({
      name: 'Directory Setup',
      status: 'pass',
      message: 'All required directories exist',
    });
  } catch (err) {
    result.checks.push({
      name: 'Directory Setup',
      status: 'fail',
      message: `Failed to create directories: ${err}`,
    });
    result.healthy = false;
  }

  // 3. Clean up invalid managers
  const managerCleanup = cleanupInvalidManagers();
  if (managerCleanup.removed > 0) {
    result.checks.push({
      name: 'Manager Cleanup',
      status: 'fixed',
      message: `Removed ${managerCleanup.removed} invalid/duplicate managers`,
    });
    result.fixes.push(...managerCleanup.cleaned);
  } else {
    result.checks.push({
      name: 'Manager Cleanup',
      status: 'pass',
      message: 'No invalid managers found',
    });
  }

  // 4. Fix stuck managers
  const stuckFixes = fixStuckManagers();
  if (stuckFixes.length > 0) {
    result.checks.push({
      name: 'Stuck Manager Fix',
      status: 'fixed',
      message: `Reset ${stuckFixes.length} stuck managers`,
    });
    result.fixes.push(...stuckFixes);
  } else {
    result.checks.push({
      name: 'Stuck Manager Fix',
      status: 'pass',
      message: 'No stuck managers found',
    });
  }

  // 5. Clean up stale PID files
  const stalePidCleanup = cleanupStalePidFiles();
  if (stalePidCleanup.length > 0) {
    result.checks.push({
      name: 'PID Cleanup',
      status: 'fixed',
      message: `Removed ${stalePidCleanup.length} stale PID files`,
    });
    result.fixes.push(...stalePidCleanup);
  } else {
    result.checks.push({
      name: 'PID Cleanup',
      status: 'pass',
      message: 'No stale PID files found',
    });
  }

  // 6. Check config.json exists and is valid
  if (fs.existsSync(PATHS.bridge.config)) {
    try {
      const config = JSON.parse(fs.readFileSync(PATHS.bridge.config, 'utf8'));
      if (config.telegramBotToken || config.yourPhoneNumber || config.yourEmail) {
        result.checks.push({
          name: 'Config Validation',
          status: 'pass',
          message: 'Configuration is valid',
        });
      } else {
        result.checks.push({
          name: 'Config Validation',
          status: 'warn',
          message: 'No transport configured (run setup)',
        });
        result.warnings.push('No Telegram transport configured');
      }
    } catch {
      result.checks.push({
        name: 'Config Validation',
        status: 'fail',
        message: 'Config file is not valid JSON',
      });
      result.healthy = false;
    }
  } else {
    result.checks.push({
      name: 'Config Validation',
      status: 'warn',
      message: 'Config file missing (run setup)',
    });
    result.warnings.push('config.json not found - run npm run setup');
  }

  return result;
}

/**
 * Print health check results
 */
export function printHealthCheckResult(result: HealthCheckResult): void {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('🏥 Health Check Report');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const check of result.checks) {
    const icon = check.status === 'pass' ? '✅'
      : check.status === 'fixed' ? '🔧'
      : check.status === 'warn' ? '⚠️'
      : '❌';
    log(`${icon} ${check.name}: ${check.message}`);
  }

  if (result.fixes.length > 0) {
    log('');
    log('🔧 Auto-fixes applied:');
    for (const fix of result.fixes) {
      log(`   • ${fix}`);
    }
  }

  if (result.warnings.length > 0) {
    log('');
    log('⚠️  Warnings:');
    for (const warning of result.warnings) {
      log(`   • ${warning}`);
    }
  }

  log('');
  log(result.healthy ? '✅ System is healthy' : '❌ System has issues that need attention');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

/**
 * Spawn background health monitor Claude process
 */
export function spawnBackgroundHealthMonitor(): void {
  const HEALTH_LOG = path.join(PATHS.bridge.root, 'health-monitor.log');

  log('🔄 Spawning background health monitor...');

  const prompt = `You are a background health monitor for Insomnia - the autonomous AI agent system.

## CRITICAL: Scope Restriction
You must ONLY work within the Insomnia project directory: ~/Documents/insomnia
DO NOT access any archived or deprecated directories.

Your job is to:
1. Check that all required directories exist in ~/Documents/insomnia/
2. Validate the manager registry for any "undefined" or invalid managers
3. Clean up stale processes and PID files
4. Report any issues found

Run the health check by executing:
cd ${PATHS.bridge.root} && node -e "require('./dist/health-checker.js').runHealthCheck()"

If you find issues, document them in ${HEALTH_LOG}

This is a one-time background check. Complete the checks and exit.`;

  const claude = spawn(
    'claude',
    ['--model', 'haiku', '--dangerously-skip-permissions', '-p', prompt],
    {
      cwd: PATHS.bridge.root,
      stdio: 'ignore',
      detached: true,
    }
  );

  claude.unref();
  log(`🔄 Background health monitor spawned (PID: ${claude.pid})`);
}

/**
 * Run health check on startup (called from main server)
 */
export function runStartupHealthCheck(): HealthCheckResult {
  const result = runHealthCheck();
  printHealthCheckResult(result);
  return result;
}
