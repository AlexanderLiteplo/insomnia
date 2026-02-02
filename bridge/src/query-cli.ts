#!/usr/bin/env node
/**
 * Query CLI for Telegram Responder/Managers
 *
 * A fast, focused CLI for querying system state without loading everything.
 * Designed to be called by Claude agents during message processing.
 *
 * Usage:
 *   npx ts-node src/query-cli.ts <command> [args]
 *   node dist/query-cli.js <command> [args]
 *
 * Commands:
 *   help                          Show this help
 *   messages list [n]             List last N messages (default: 10)
 *   messages search <keyword>     Search message history
 *   managers list                 List all managers with status
 *   managers count                Count managers by status
 *   managers search <keyword>     Search managers by name/topic/description
 *   managers get <name>           Get details for a specific manager
 *   projects list                 List all projects
 *   projects count                Count projects by status
 *   projects search <keyword>     Search projects
 *   stats                         Quick system overview
 */

import * as fs from 'fs';
import * as path from 'path';

const BRIDGE_DIR = path.resolve(__dirname, '..');
const HISTORY_FILE = path.join(BRIDGE_DIR, '.conversation-history.json');
const MANAGER_REGISTRY = path.join(BRIDGE_DIR, '.manager-registry.json');
const PROJECT_REGISTRY = path.join(BRIDGE_DIR, '.project-registry.json');

// Types
interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface Manager {
  id: string;
  name: string;
  description: string;
  topics: string[];
  status: 'active' | 'idle' | 'processing';
  currentTask: string | null;
  pid: number | null;
  messageQueue: { content: string; priority: string }[];
  orchestrators: string[];
  projectIds: string[];
  createdAt: string;
  lastActiveAt: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'idle' | 'completed';
  prdFile?: string;
  orchestratorId?: string;
}

// Loaders
function loadHistory(): Message[] {
  try {
    if (!fs.existsSync(HISTORY_FILE)) return [];
    const data = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    return data.messages || [];
  } catch {
    return [];
  }
}

function loadManagers(): Manager[] {
  try {
    if (!fs.existsSync(MANAGER_REGISTRY)) return [];
    const data = JSON.parse(fs.readFileSync(MANAGER_REGISTRY, 'utf-8'));
    return data.managers || [];
  } catch {
    return [];
  }
}

function loadProjects(): Project[] {
  try {
    if (!fs.existsSync(PROJECT_REGISTRY)) return [];
    const data = JSON.parse(fs.readFileSync(PROJECT_REGISTRY, 'utf-8'));
    return data.projects || [];
  } catch {
    return [];
  }
}

// Commands
function showHelp() {
  console.log(`
Query CLI - Fast state queries for Telegram Responder/Managers

COMMANDS:
  help                          Show this help message

  messages list [n]             List last N messages (default: 10)
  messages search <keyword>     Search message history for keyword

  managers list                 List all managers with status
  managers count                Count managers by status
  managers search <keyword>     Search managers by name/topic/description
  managers get <name>           Get full details for a manager

  projects list                 List all projects
  projects count                Count projects by status
  projects search <keyword>     Search projects by name/description

  stats                         Quick system overview (counts + recent activity)

EXAMPLES:
  query messages list 5         # Last 5 messages
  query messages search "error" # Find messages containing "error"
  query managers search api     # Find managers related to "api"
  query managers get rentahuman # Get details for rentahuman manager
  query stats                   # Quick overview
`);
}

function listMessages(n: number = 10) {
  const messages = loadHistory();
  const recent = messages.slice(-n);

  if (recent.length === 0) {
    console.log('No messages in history');
    return;
  }

  console.log(`Last ${recent.length} messages:\n`);
  recent.forEach((msg, i) => {
    const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '';
    const role = msg.role.toUpperCase().padEnd(9);
    const content = msg.content.length > 150
      ? msg.content.substring(0, 150) + '...'
      : msg.content;
    console.log(`[${i + 1}] ${role} ${time}`);
    console.log(`    ${content.replace(/\n/g, '\n    ')}\n`);
  });
}

function searchMessages(keyword: string) {
  const messages = loadHistory();
  const kw = keyword.toLowerCase();
  const matches = messages.filter(m => m.content.toLowerCase().includes(kw));

  if (matches.length === 0) {
    console.log(`No messages found containing "${keyword}"`);
    return;
  }

  console.log(`Found ${matches.length} messages containing "${keyword}":\n`);
  matches.forEach((msg, i) => {
    const time = msg.timestamp ? new Date(msg.timestamp).toLocaleString() : '';
    const role = msg.role.toUpperCase().padEnd(9);
    // Highlight keyword in content
    const content = msg.content.length > 200
      ? msg.content.substring(0, 200) + '...'
      : msg.content;
    console.log(`[${i + 1}] ${role} ${time}`);
    console.log(`    ${content.replace(/\n/g, '\n    ')}\n`);
  });
}

function listManagers() {
  const managers = loadManagers();

  if (managers.length === 0) {
    console.log('No managers found');
    return;
  }

  // Sort by lastActiveAt descending
  const sorted = [...managers].sort((a, b) =>
    new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
  );

  console.log(`Managers (${managers.length} total):\n`);
  sorted.forEach(m => {
    const status = m.status.toUpperCase().padEnd(10);
    const queue = m.messageQueue?.length || 0;
    const projects = m.projectIds?.length || 0;
    const lastActive = m.lastActiveAt
      ? timeSince(new Date(m.lastActiveAt))
      : 'never';

    console.log(`  ${status} ${m.name}`);
    console.log(`           Queue: ${queue} | Projects: ${projects} | Last: ${lastActive}`);
    if (m.currentTask) {
      console.log(`           Task: ${m.currentTask.substring(0, 60)}...`);
    }
    console.log('');
  });
}

function countManagers() {
  const managers = loadManagers();
  const counts = {
    total: managers.length,
    active: managers.filter(m => m.status === 'active').length,
    processing: managers.filter(m => m.status === 'processing').length,
    idle: managers.filter(m => m.status === 'idle').length,
    withQueue: managers.filter(m => (m.messageQueue?.length || 0) > 0).length,
    withProjects: managers.filter(m => (m.projectIds?.length || 0) > 0).length,
  };

  console.log('Manager Counts:');
  console.log(`  Total:      ${counts.total}`);
  console.log(`  Active:     ${counts.active}`);
  console.log(`  Processing: ${counts.processing}`);
  console.log(`  Idle:       ${counts.idle}`);
  console.log(`  With Queue: ${counts.withQueue}`);
  console.log(`  With Projects: ${counts.withProjects}`);
}

function searchManagers(keyword: string) {
  const managers = loadManagers();
  const kw = keyword.toLowerCase();

  const matches = managers.filter(m =>
    m.name.toLowerCase().includes(kw) ||
    m.description?.toLowerCase().includes(kw) ||
    m.topics?.some(t => t.toLowerCase().includes(kw)) ||
    m.currentTask?.toLowerCase().includes(kw)
  );

  if (matches.length === 0) {
    console.log(`No managers found matching "${keyword}"`);
    return;
  }

  console.log(`Found ${matches.length} managers matching "${keyword}":\n`);
  matches.forEach(m => {
    console.log(`  ${m.status.toUpperCase().padEnd(10)} ${m.name}`);
    console.log(`             ${m.description?.substring(0, 80) || 'No description'}`);
    if (m.topics?.length) {
      console.log(`             Topics: ${m.topics.join(', ')}`);
    }
    console.log('');
  });
}

function getManager(name: string) {
  const managers = loadManagers();
  const kw = name.toLowerCase();

  const manager = managers.find(m =>
    m.name.toLowerCase() === kw ||
    m.name.toLowerCase().includes(kw)
  );

  if (!manager) {
    console.log(`Manager "${name}" not found`);
    // Suggest similar
    const similar = managers.filter(m =>
      m.name.toLowerCase().includes(kw.substring(0, 3))
    ).slice(0, 3);
    if (similar.length) {
      console.log(`\nDid you mean: ${similar.map(m => m.name).join(', ')}?`);
    }
    return;
  }

  console.log(`Manager: ${manager.name}`);
  console.log(`ID: ${manager.id}`);
  console.log(`Status: ${manager.status}`);
  console.log(`Description: ${manager.description || 'None'}`);
  console.log(`Topics: ${manager.topics?.join(', ') || 'None'}`);
  console.log(`Current Task: ${manager.currentTask || 'None'}`);
  console.log(`Queue: ${manager.messageQueue?.length || 0} messages`);
  if (manager.messageQueue?.length) {
    console.log('  Queued:');
    manager.messageQueue.slice(0, 3).forEach((msg, i) => {
      console.log(`    [${i + 1}] ${msg.content.substring(0, 60)}...`);
    });
  }
  console.log(`Projects: ${manager.projectIds?.join(', ') || 'None'}`);
  console.log(`Orchestrators: ${manager.orchestrators?.join(', ') || 'None'}`);
  console.log(`Created: ${manager.createdAt}`);
  console.log(`Last Active: ${manager.lastActiveAt}`);
}

function listProjects() {
  const projects = loadProjects();

  if (projects.length === 0) {
    console.log('No projects found');
    return;
  }

  console.log(`Projects (${projects.length} total):\n`);
  projects.forEach(p => {
    const status = (p.status || 'unknown').toUpperCase().padEnd(10);
    console.log(`  ${status} ${p.name}`);
    console.log(`           ${p.description?.substring(0, 70) || 'No description'}`);
    console.log('');
  });
}

function countProjects() {
  const projects = loadProjects();
  const counts = {
    total: projects.length,
    active: projects.filter(p => p.status === 'active').length,
    idle: projects.filter(p => p.status === 'idle').length,
    completed: projects.filter(p => p.status === 'completed').length,
  };

  console.log('Project Counts:');
  console.log(`  Total:     ${counts.total}`);
  console.log(`  Active:    ${counts.active}`);
  console.log(`  Idle:      ${counts.idle}`);
  console.log(`  Completed: ${counts.completed}`);
}

function searchProjects(keyword: string) {
  const projects = loadProjects();
  const kw = keyword.toLowerCase();

  const matches = projects.filter(p =>
    p.name.toLowerCase().includes(kw) ||
    p.description?.toLowerCase().includes(kw)
  );

  if (matches.length === 0) {
    console.log(`No projects found matching "${keyword}"`);
    return;
  }

  console.log(`Found ${matches.length} projects matching "${keyword}":\n`);
  matches.forEach(p => {
    console.log(`  ${(p.status || 'unknown').toUpperCase().padEnd(10)} ${p.name}`);
    console.log(`             ${p.description?.substring(0, 80) || 'No description'}`);
    console.log('');
  });
}

function showStats() {
  const messages = loadHistory();
  const managers = loadManagers();
  const projects = loadProjects();

  console.log('=== System Stats ===\n');

  // Messages
  console.log(`Messages: ${messages.length} in history`);
  if (messages.length > 0) {
    const last = messages[messages.length - 1];
    const time = last.timestamp ? timeSince(new Date(last.timestamp)) : 'unknown';
    console.log(`  Last message: ${time} ago`);
  }

  // Managers
  console.log(`\nManagers: ${managers.length} total`);
  const activeManagers = managers.filter(m => m.status === 'active' || m.status === 'processing');
  console.log(`  Active/Processing: ${activeManagers.length}`);
  const totalQueue = managers.reduce((sum, m) => sum + (m.messageQueue?.length || 0), 0);
  console.log(`  Total Queue: ${totalQueue} messages`);

  // Recently active (last hour)
  const hourAgo = Date.now() - 60 * 60 * 1000;
  const recentManagers = managers.filter(m =>
    m.lastActiveAt && new Date(m.lastActiveAt).getTime() > hourAgo
  );
  if (recentManagers.length > 0) {
    console.log(`  Active last hour: ${recentManagers.map(m => m.name).join(', ')}`);
  }

  // Projects
  console.log(`\nProjects: ${projects.length} total`);
  const activeProjects = projects.filter(p => p.status === 'active');
  console.log(`  Active: ${activeProjects.length}`);
}

// Helpers
function timeSince(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// Main
function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === 'help' || args[0] === '--help' || args[0] === '-h') {
    showHelp();
    return;
  }

  const command = args[0];
  const subcommand = args[1];
  const arg = args[2];

  switch (command) {
    case 'messages':
      if (subcommand === 'list') {
        listMessages(parseInt(arg) || 10);
      } else if (subcommand === 'search' && arg) {
        searchMessages(args.slice(2).join(' '));
      } else {
        console.log('Usage: messages list [n] | messages search <keyword>');
      }
      break;

    case 'managers':
      if (subcommand === 'list') {
        listManagers();
      } else if (subcommand === 'count') {
        countManagers();
      } else if (subcommand === 'search' && arg) {
        searchManagers(args.slice(2).join(' '));
      } else if (subcommand === 'get' && arg) {
        getManager(args.slice(2).join(' '));
      } else {
        console.log('Usage: managers list | count | search <keyword> | get <name>');
      }
      break;

    case 'projects':
      if (subcommand === 'list') {
        listProjects();
      } else if (subcommand === 'count') {
        countProjects();
      } else if (subcommand === 'search' && arg) {
        searchProjects(args.slice(2).join(' '));
      } else {
        console.log('Usage: projects list | count | search <keyword>');
      }
      break;

    case 'stats':
      showStats();
      break;

    default:
      console.log(`Unknown command: ${command}`);
      console.log('Run "query help" for usage');
  }
}

main();
