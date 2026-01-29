#!/usr/bin/env node
import * as fs from 'fs';
import * as path from 'path';
import {
  getAllManagers,
  getActiveManagers,
  getManager,
  deleteManager,
  loadRegistry,
} from './manager-registry';
import { isManagerRunning, getManagerSessions } from './telegram-manager-agent';
import { PATHS, getOrchestratorDir } from './paths';

const MANAGER_SESSIONS_DIR = PATHS.bridge.managerSessions;
const ORCHESTRATOR_DIR = getOrchestratorDir();

function printUsage() {
  console.log(`
Telegram Bridge Manager CLI

Usage: node dist/managers-cli.js <command> [options]

Commands:
  status              Show all managers and their status
  list                List all managers (alias for status)
  sessions            Show recent manager sessions
  orchestrators       Show all orchestrator/project status
  delete <id|name>    Delete a manager
  logs <id|name>      Show recent logs for a manager
  help                Show this help message

Examples:
  node dist/managers-cli.js status
  node dist/managers-cli.js orchestrators
  node dist/managers-cli.js delete kaado
  node dist/managers-cli.js logs coaching
`);
}

function formatDate(isoString: string): string {
  const d = new Date(isoString);
  return d.toLocaleString();
}

function showStatus() {
  const managers = getAllManagers();

  if (managers.length === 0) {
    console.log('\n📭 No managers registered\n');
    return;
  }

  console.log('\n=== Manager Status ===\n');

  for (const m of managers) {
    const running = isManagerRunning(m.id);
    const statusIcon = m.status === 'processing' ? '🔄' : m.status === 'active' ? '✅' : '⏸️';
    const runIcon = running ? '🟢' : '⚪';

    console.log(`${statusIcon} ${m.name} (${m.id})`);
    console.log(`   Status: ${m.status} ${runIcon}`);
    console.log(`   Topics: ${m.topics.join(', ') || 'none'}`);
    console.log(`   Queue: ${m.messageQueue.length} messages`);
    console.log(`   Current: ${m.currentTask || 'idle'}`);
    console.log(`   Last active: ${formatDate(m.lastActiveAt)}`);
    console.log('');
  }

  const active = managers.filter(m => m.status === 'processing').length;
  const totalQueued = managers.reduce((sum, m) => sum + m.messageQueue.length, 0);

  console.log(`Summary: ${managers.length} managers, ${active} processing, ${totalQueued} queued\n`);
}

function showSessions() {
  const sessions = getManagerSessions();

  if (sessions.length === 0) {
    console.log('\n📭 No manager sessions found\n');
    return;
  }

  console.log('\n=== Recent Manager Sessions ===\n');

  // Show last 10 sessions
  for (const session of sessions.slice(0, 10)) {
    const sessionPath = path.join(MANAGER_SESSIONS_DIR, session);
    const stats = fs.statSync(sessionPath);
    const size = (stats.size / 1024).toFixed(1);

    console.log(`📄 ${session}`);
    console.log(`   Size: ${size}KB | Modified: ${stats.mtime.toLocaleString()}`);
  }

  console.log(`\nTotal: ${sessions.length} sessions\n`);
}

function showOrchestrators() {
  console.log('\n=== Orchestrator / Project Status ===\n');

  // Check if projects.sh exists
  const projectsScript = path.join(ORCHESTRATOR_DIR, 'scripts', 'projects.sh');

  if (!fs.existsSync(projectsScript)) {
    console.log('❌ projects.sh not found at:', projectsScript);
    return;
  }

  try {
    const { execSync } = require('child_process');
    const output = execSync(`"${projectsScript}" status`, {
      cwd: ORCHESTRATOR_DIR,
      encoding: 'utf8',
      timeout: 30000,
    });
    console.log(output);
  } catch (err) {
    console.log('❌ Failed to get orchestrator status:', err);
  }
}

function deleteManagerCmd(identifier: string) {
  // Try by ID first, then by name
  let manager = getManager(identifier);

  if (!manager) {
    const managers = getAllManagers();
    manager = managers.find(m => m.name.toLowerCase() === identifier.toLowerCase());
  }

  if (!manager) {
    console.log(`❌ Manager not found: ${identifier}`);
    return;
  }

  const success = deleteManager(manager.id);

  if (success) {
    console.log(`✅ Deleted manager: ${manager.name} (${manager.id})`);
  } else {
    console.log(`❌ Failed to delete manager: ${identifier}`);
  }
}

function showLogs(identifier: string) {
  // Try by ID first, then by name
  let manager = getManager(identifier);

  if (!manager) {
    const managers = getAllManagers();
    manager = managers.find(m => m.name.toLowerCase() === identifier.toLowerCase());
  }

  if (!manager) {
    console.log(`❌ Manager not found: ${identifier}`);
    return;
  }

  // Find session files for this manager
  const sessions = getManagerSessions().filter(s => s.startsWith(manager!.id));

  if (sessions.length === 0) {
    console.log(`📭 No sessions found for manager: ${manager.name}`);
    return;
  }

  // Show latest session
  const latestSession = sessions[0];
  const sessionPath = path.join(MANAGER_SESSIONS_DIR, latestSession);

  console.log(`\n=== Latest Session for ${manager.name} ===\n`);
  console.log(`File: ${latestSession}\n`);

  const content = fs.readFileSync(sessionPath, 'utf8');
  // Show last 50 lines
  const lines = content.split('\n');
  const lastLines = lines.slice(-50);
  console.log(lastLines.join('\n'));
}

// Main
const args = process.argv.slice(2);
const command = args[0] || 'help';

switch (command) {
  case 'status':
  case 'list':
    showStatus();
    break;

  case 'sessions':
    showSessions();
    break;

  case 'orchestrators':
  case 'projects':
    showOrchestrators();
    break;

  case 'delete':
    if (!args[1]) {
      console.log('❌ Usage: delete <id|name>');
    } else {
      deleteManagerCmd(args[1]);
    }
    break;

  case 'logs':
    if (!args[1]) {
      console.log('❌ Usage: logs <id|name>');
    } else {
      showLogs(args[1]);
    }
    break;

  case 'help':
  default:
    printUsage();
    break;
}
