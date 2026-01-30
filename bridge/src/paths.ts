/**
 * Path Configuration and Validation System
 * Ensures all required paths exist and are correctly configured across devices
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { log } from './logger';

// Core directory paths
export const HOME_DIR = process.env.HOME || os.homedir();
export const AUTOMATION_SYSTEM_DIR = process.env.AUTOMATION_SYSTEM_DIR || path.join(HOME_DIR, 'Documents', 'insomnia');
export const BRIDGE_DIR = path.join(AUTOMATION_SYSTEM_DIR, 'bridge');
export const ORCHESTRATOR_DIR = process.env.ORCHESTRATOR_DIR || path.join(AUTOMATION_SYSTEM_DIR, 'orchestrator');

// Derived paths
export const PATHS = {
  // Bridge paths
  bridge: {
    root: BRIDGE_DIR,
    dist: path.join(BRIDGE_DIR, 'dist'),
    config: path.join(BRIDGE_DIR, 'config.json'),
    managerRegistry: path.join(BRIDGE_DIR, '.manager-registry.json'),
    managerSessions: path.join(BRIDGE_DIR, 'manager-sessions'),
    responderSessions: path.join(BRIDGE_DIR, 'responder-sessions'),
    humanTasks: path.join(BRIDGE_DIR, '.human-tasks.json'),
    lockFile: path.join(BRIDGE_DIR, '.bridge.lock'),
    telegramState: path.join(BRIDGE_DIR, '.telegram-state.json'),
    conversationHistory: path.join(BRIDGE_DIR, '.conversation-history.json'),
    sendCli: path.join(BRIDGE_DIR, 'dist', 'telegram-send-cli.js'),
  },
  // Orchestrator paths
  orchestrator: {
    root: ORCHESTRATOR_DIR,
    scripts: path.join(ORCHESTRATOR_DIR, 'scripts'),
    orchestratorScript: path.join(ORCHESTRATOR_DIR, 'scripts', 'orchestrator.sh'),
    projectsScript: path.join(ORCHESTRATOR_DIR, 'scripts', 'projects.sh'),
    prds: path.join(ORCHESTRATOR_DIR, 'prds'),
    tasks: path.join(ORCHESTRATOR_DIR, 'prds', 'tasks.json'),
    state: path.join(ORCHESTRATOR_DIR, '.state'),
    workerPid: path.join(ORCHESTRATOR_DIR, '.state', 'worker.pid'),
    managerPid: path.join(ORCHESTRATOR_DIR, '.state', 'manager.pid'),
    logs: path.join(ORCHESTRATOR_DIR, 'logs'),
  },
  // Dashboard paths
  dashboard: {
    root: path.join(BRIDGE_DIR, 'dashboard'),
  },
};

export interface PathValidationResult {
  path: string;
  exists: boolean;
  type: 'file' | 'directory' | 'unknown';
  required: boolean;
  description: string;
}

export interface ValidationReport {
  valid: boolean;
  timestamp: string;
  results: PathValidationResult[];
  errors: string[];
  warnings: string[];
  autoFixed: string[];
}

/**
 * Validate all required paths exist
 */
export function validatePaths(): ValidationReport {
  const report: ValidationReport = {
    valid: true,
    timestamp: new Date().toISOString(),
    results: [],
    errors: [],
    warnings: [],
    autoFixed: [],
  };

  // Required directories to validate
  const requiredDirs: Array<{ path: string; description: string; createIfMissing: boolean }> = [
    { path: AUTOMATION_SYSTEM_DIR, description: 'Automation system root', createIfMissing: false },
    { path: BRIDGE_DIR, description: 'Bridge root', createIfMissing: false },
    { path: PATHS.bridge.dist, description: 'Bridge compiled JS', createIfMissing: false },
    { path: PATHS.bridge.managerSessions, description: 'Manager session logs', createIfMissing: true },
    { path: PATHS.bridge.responderSessions, description: 'Responder session logs', createIfMissing: true },
    { path: ORCHESTRATOR_DIR, description: 'Orchestrator root', createIfMissing: false },
    { path: PATHS.orchestrator.scripts, description: 'Orchestrator scripts', createIfMissing: false },
    { path: PATHS.orchestrator.prds, description: 'PRDs directory', createIfMissing: true },
    { path: PATHS.orchestrator.state, description: 'Orchestrator state', createIfMissing: true },
    { path: PATHS.orchestrator.logs, description: 'Orchestrator logs', createIfMissing: true },
  ];

  // Required files to validate
  const requiredFiles: Array<{ path: string; description: string }> = [
    { path: PATHS.bridge.config, description: 'Bridge config' },
    { path: PATHS.orchestrator.orchestratorScript, description: 'Orchestrator start script' },
  ];

  // Validate directories
  for (const dir of requiredDirs) {
    const exists = fs.existsSync(dir.path);
    const result: PathValidationResult = {
      path: dir.path,
      exists,
      type: 'directory',
      required: true,
      description: dir.description,
    };
    report.results.push(result);

    if (!exists) {
      if (dir.createIfMissing) {
        try {
          fs.mkdirSync(dir.path, { recursive: true });
          report.autoFixed.push(`Created directory: ${dir.path}`);
          result.exists = true;
        } catch (err) {
          report.errors.push(`Failed to create ${dir.description}: ${dir.path}`);
          report.valid = false;
        }
      } else {
        report.errors.push(`Missing required ${dir.description}: ${dir.path}`);
        report.valid = false;
      }
    }
  }

  // Validate files
  for (const file of requiredFiles) {
    const exists = fs.existsSync(file.path);
    report.results.push({
      path: file.path,
      exists,
      type: 'file',
      required: true,
      description: file.description,
    });

    if (!exists) {
      report.warnings.push(`Missing ${file.description}: ${file.path}`);
    }
  }

  return report;
}

/**
 * Get the send CLI path (for manager prompts)
 */
export function getSendCliPath(): string {
  return PATHS.bridge.sendCli;
}

/**
 * Get the orchestrator directory
 */
export function getOrchestratorDir(): string {
  return ORCHESTRATOR_DIR;
}

/**
 * Check if orchestrator is available
 */
export function isOrchestratorAvailable(): boolean {
  return fs.existsSync(PATHS.orchestrator.orchestratorScript);
}

/**
 * Print validation report
 */
export function printValidationReport(report: ValidationReport): void {
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  log('📁 Path Validation Report');
  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  if (report.autoFixed.length > 0) {
    log('✅ Auto-fixed:');
    for (const fix of report.autoFixed) {
      log(`   • ${fix}`);
    }
  }

  if (report.errors.length > 0) {
    log('❌ Errors:');
    for (const error of report.errors) {
      log(`   • ${error}`);
    }
  }

  if (report.warnings.length > 0) {
    log('⚠️  Warnings:');
    for (const warning of report.warnings) {
      log(`   • ${warning}`);
    }
  }

  if (report.valid && report.errors.length === 0) {
    log('✅ All paths validated successfully');
  }

  log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

/**
 * Ensure all required directories exist (create if missing)
 */
export function ensureDirectories(): void {
  const dirsToCreate = [
    PATHS.bridge.managerSessions,
    PATHS.bridge.responderSessions,
    PATHS.orchestrator.prds,
    PATHS.orchestrator.state,
    PATHS.orchestrator.logs,
  ];

  for (const dir of dirsToCreate) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log(`[Paths] Created directory: ${dir}`);
    }
  }
}
