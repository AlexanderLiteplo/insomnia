#!/usr/bin/env node
/**
 * Health Check CLI
 * Run manual health checks and fixes on the Claude Automation System
 */

import { runHealthCheck, printHealthCheckResult, spawnBackgroundHealthMonitor } from './health-checker';
import { validatePaths, printValidationReport } from './paths';
import { loadRegistry, getAllManagers } from './manager-registry';

const args = process.argv.slice(2);
const command = args[0] || 'check';

function printHelp(): void {
  console.log(`
Health Check CLI - Claude Automation System

Usage:
  npm run health [command]

Commands:
  check      Run full health check (default)
  paths      Validate all paths only
  managers   Show manager registry status
  clean      Clean up invalid managers and stale PIDs
  spawn      Spawn background health monitor
  help       Show this help

Examples:
  npm run health              # Run full health check
  npm run health paths        # Check paths only
  npm run health managers     # Show managers
  npm run health clean        # Clean up issues
`);
}

function showManagers(): void {
  const managers = getAllManagers();
  console.log(`\n📋 Manager Registry (${managers.length} managers)\n`);

  if (managers.length === 0) {
    console.log('  No managers registered.');
    return;
  }

  // Group by status
  const processing = managers.filter(m => m.status === 'processing');
  const idle = managers.filter(m => m.status === 'idle');
  const active = managers.filter(m => m.status === 'active');

  if (processing.length > 0) {
    console.log('🔄 Processing:');
    for (const m of processing) {
      console.log(`   • ${m.name} (${m.id})`);
      if (m.currentTask) {
        console.log(`     Task: ${m.currentTask.substring(0, 60)}...`);
      }
    }
    console.log('');
  }

  if (active.length > 0) {
    console.log('⚡ Active:');
    for (const m of active) {
      console.log(`   • ${m.name} (${m.id}) - Queue: ${m.messageQueue.length}`);
    }
    console.log('');
  }

  if (idle.length > 0) {
    console.log('💤 Idle:');
    for (const m of idle) {
      console.log(`   • ${m.name} (${m.id})`);
    }
    console.log('');
  }

  // Show any potentially problematic managers
  const problematic = managers.filter(m =>
    !m.name ||
    m.name === 'undefined' ||
    m.name === 'null' ||
    m.name.trim() === ''
  );

  if (problematic.length > 0) {
    console.log('⚠️  Problematic (invalid names):');
    for (const m of problematic) {
      console.log(`   • "${m.name}" (${m.id})`);
    }
    console.log('');
  }
}

async function main(): Promise<void> {
  switch (command) {
    case 'check':
      const result = runHealthCheck();
      printHealthCheckResult(result);
      process.exit(result.healthy ? 0 : 1);
      break;

    case 'paths':
      const pathResult = validatePaths();
      printValidationReport(pathResult);
      process.exit(pathResult.valid ? 0 : 1);
      break;

    case 'managers':
      showManagers();
      break;

    case 'clean':
      console.log('🧹 Running cleanup...\n');
      const cleanResult = runHealthCheck();
      printHealthCheckResult(cleanResult);
      console.log(`\n✅ Cleanup complete. ${cleanResult.fixes.length} fixes applied.`);
      break;

    case 'spawn':
      console.log('🔄 Spawning background health monitor...');
      spawnBackgroundHealthMonitor();
      console.log('✅ Background health monitor spawned.');
      break;

    case 'help':
    case '--help':
    case '-h':
      printHelp();
      break;

    default:
      console.log(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
