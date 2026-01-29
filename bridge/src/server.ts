import * as sqlite3 from 'sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { loadConfig, IMESSAGE_DB } from './config';
import { loadState, saveState, getLastRowId, setLastRowId, wasRecentlySent, wasRecentlyProcessed, markAsProcessed } from './state';
import { extractTextFromAttributedBody, isClaudeMessage } from './imessage';
import { handleIncomingMessage, getResponderStatus } from './responder';
import { log } from './logger';
import { DatabaseRow } from './types';
import { getAllManagers, getActiveManagers } from './manager-registry';

// Lock file to prevent multiple instances
const LOCK_FILE = path.join(__dirname, '..', '.bridge.lock');

function acquireLock(): boolean {
  try {
    // Check if lock file exists and process is still running
    if (fs.existsSync(LOCK_FILE)) {
      const pid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8').trim(), 10);
      try {
        // Check if process is still running (signal 0 doesn't kill, just checks)
        process.kill(pid, 0);
        log(`Another instance is already running (PID: ${pid}). Exiting.`);
        return false;
      } catch {
        // Process not running, stale lock file - remove it
        log(`Removing stale lock file (PID ${pid} not running)`);
        fs.unlinkSync(LOCK_FILE);
      }
    }
    // Create lock file with our PID
    fs.writeFileSync(LOCK_FILE, process.pid.toString());
    return true;
  } catch (err) {
    log(`Failed to acquire lock: ${err}`);
    return false;
  }
}

function releaseLock(): void {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      fs.unlinkSync(LOCK_FILE);
    }
  } catch {
    // Ignore errors on cleanup
  }
}

// Orchestrator monitoring
const ORCHESTRATOR_DIR = process.env.ORCHESTRATOR_DIR || path.join(__dirname, '..', '..', 'orchestrator');
const ORCHESTRATOR_STATE_DIR = path.join(ORCHESTRATOR_DIR, '.state');
const WORKER_PID_FILE = path.join(ORCHESTRATOR_STATE_DIR, 'worker.pid');
const MANAGER_PID_FILE = path.join(ORCHESTRATOR_STATE_DIR, 'manager.pid');
const TASKS_FILE = path.join(ORCHESTRATOR_DIR, 'prds', 'tasks.json');

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isOrchestratorRunning(): { worker: boolean; manager: boolean } {
  let workerRunning = false;
  let managerRunning = false;

  if (fs.existsSync(WORKER_PID_FILE)) {
    const pid = parseInt(fs.readFileSync(WORKER_PID_FILE, 'utf8').trim(), 10);
    workerRunning = isProcessRunning(pid);
  }

  if (fs.existsSync(MANAGER_PID_FILE)) {
    const pid = parseInt(fs.readFileSync(MANAGER_PID_FILE, 'utf8').trim(), 10);
    managerRunning = isProcessRunning(pid);
  }

  return { worker: workerRunning, manager: managerRunning };
}

function hasPendingTasks(): boolean {
  try {
    if (!fs.existsSync(TASKS_FILE)) {
      return false;
    }
    const tasks = JSON.parse(fs.readFileSync(TASKS_FILE, 'utf8'));
    return tasks.tasks?.some((t: { status: string }) =>
      t.status === 'pending' || t.status === 'in_progress' || t.status === 'worker_done'
    ) ?? false;
  } catch {
    return false;
  }
}

function checkAndRestartOrchestrator(): void {
  const status = isOrchestratorRunning();

  // Only restart if there are pending tasks
  if (!hasPendingTasks()) {
    return;
  }

  if (!status.worker || !status.manager) {
    const missing = [];
    if (!status.worker) missing.push('Worker');
    if (!status.manager) missing.push('Manager');

    log(`🔄 Orchestrator ${missing.join(' and ')} not running, restarting...`);

    try {
      const orchestratorScript = path.join(ORCHESTRATOR_DIR, 'scripts', 'orchestrator.sh');
      execSync(`"${orchestratorScript}" start`, {
        cwd: ORCHESTRATOR_DIR,
        stdio: 'ignore',
        timeout: 30000
      });
      log(`✅ Orchestrator restarted successfully`);
    } catch (err) {
      log(`❌ Failed to restart orchestrator: ${err}`);
    }
  }
}

// Try to acquire lock before starting
if (!acquireLock()) {
  process.exit(1);
}

const config = loadConfig();

function checkForNewMessages(): void {
  const db = new sqlite3.Database(IMESSAGE_DB, sqlite3.OPEN_READONLY);

  const query = `
    SELECT
      message.ROWID,
      message.text,
      message.attributedBody,
      message.date,
      handle.id as sender
    FROM message
    JOIN handle ON message.handle_id = handle.ROWID
    WHERE message.ROWID > ?
      AND message.is_from_me = 0
      AND (message.text IS NOT NULL OR message.attributedBody IS NOT NULL)
      AND (handle.id = ? OR handle.id = ?)
    ORDER BY message.ROWID ASC
  `;

  const params = [getLastRowId(), config.yourPhoneNumber, config.yourEmail];

  db.all(query, params, (err, rows: DatabaseRow[]) => {
    if (err) {
      log(`Database error: ${err.message}`);
      db.close();
      return;
    }

    if (rows?.length) {
      for (const row of rows) {
        let text = row.text;

        if (!text && row.attributedBody) {
          text = extractTextFromAttributedBody(row.attributedBody);
        }

        if (!text) {
          log(`Skipping message ${row.ROWID} - no text`);
          setLastRowId(row.ROWID);
          continue;
        }

        log(`New message from ${row.sender}: "${text.substring(0, 50)}..."`);

        if (isClaudeMessage(text)) {
          log(`Skipping Claude's own message`);
          setLastRowId(row.ROWID);
          continue;
        }

        // Also skip messages that match recently sent content (iCloud sync echoes)
        if (wasRecentlySent(text)) {
          log(`Skipping recently sent message (iCloud sync echo)`);
          setLastRowId(row.ROWID);
          continue;
        }

        // Skip messages we already processed (iCloud creates duplicate ROWIDs)
        if (wasRecentlyProcessed(text)) {
          log(`Skipping duplicate message (already processed)`);
          setLastRowId(row.ROWID);
          continue;
        }

        // Mark as processed BEFORE spawning to prevent race conditions
        markAsProcessed(text);

        // Use the new responder system instead of direct agent spawn
        handleIncomingMessage(text).catch((err) => {
          log(`[Responder] Unhandled error: ${err}`);
        });

        setLastRowId(row.ROWID);
      }

      saveState();
    }

    db.close();
  });
}

function initializeState(): void {
  const db = new sqlite3.Database(IMESSAGE_DB, sqlite3.OPEN_READONLY);

  db.get('SELECT MAX(ROWID) as maxId FROM message', [], (err, row: { maxId: number } | undefined) => {
    if (!err && row?.maxId && getLastRowId() === 0) {
      setLastRowId(row.maxId);
      saveState();
      log(`Initialized state at ROWID ${row.maxId}`);
    }
    db.close();
  });
}

function shutdown(): void {
  log('Shutting down...');
  // Note: Manager processes will continue running independently
  releaseLock();
  saveState();
  process.exit(0);
}

// Main
loadState();

log('🚀 iMessage Bridge v2.0 started');
log(`📱 Monitoring: ${config.yourPhoneNumber || config.yourEmail}`);
log(`🤖 Work directory: ${config.claudeWorkDir}`);
log(`📊 Poll interval: ${config.pollInterval}ms`);
log(`🎯 Multi-manager mode: messages routed via responder`);

// Log active managers on startup
const activeManagers = getActiveManagers();
if (activeManagers.length > 0) {
  log(`📋 Active managers: ${activeManagers.map(m => m.name).join(', ')}`);
} else {
  log(`📋 No active managers (will create on first message)`);
}

initializeState();
setInterval(checkForNewMessages, config.pollInterval);

// Check orchestrator health every 60 seconds
const ORCHESTRATOR_CHECK_INTERVAL = 60000;
log(`🔧 Orchestrator monitor: checking every ${ORCHESTRATOR_CHECK_INTERVAL / 1000}s`);
setInterval(checkAndRestartOrchestrator, ORCHESTRATOR_CHECK_INTERVAL);
// Also run once at startup after a short delay
setTimeout(checkAndRestartOrchestrator, 5000);

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
