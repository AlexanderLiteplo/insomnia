import * as path from 'path';

// Dashboard runs from bridge/dashboard/, so BRIDGE_DIR is one level up
// This makes paths work regardless of where the repo is cloned
const DASHBOARD_DIR = process.cwd();
export const BRIDGE_DIR = process.env.BRIDGE_DIR || path.join(DASHBOARD_DIR, '..');
export const INSOMNIA_DIR = path.join(BRIDGE_DIR, '..');
export const ORCHESTRATOR_DIR = process.env.ORCHESTRATOR_DIR || path.join(INSOMNIA_DIR, 'orchestrator');
export const PROJECTS_DIR = path.join(ORCHESTRATOR_DIR, 'projects');

// Data files
export const MANAGER_REGISTRY = path.join(BRIDGE_DIR, '.manager-registry.json');
export const PROJECT_REGISTRY = path.join(BRIDGE_DIR, '.project-registry.json');
export const CONFIG_PATH = path.join(BRIDGE_DIR, 'config.json');
export const HUMAN_TASKS_FILE = path.join(BRIDGE_DIR, '.human-tasks.json');
export const CONVERSATION_HISTORY = path.join(BRIDGE_DIR, '.conversation-history.json');
export const BRIDGE_LOG = path.join(BRIDGE_DIR, 'bridge.log');
export const NIGHTLY_BUILDS_FILE = path.join(BRIDGE_DIR, '.nightly-builds.json');
export const EARNINGS_FILE = path.join(BRIDGE_DIR, '.earnings.json');

// PRD and project directories
export const PRDS_DIR = path.join(BRIDGE_DIR, 'prds');
export const SCOPES_DIR = path.join(BRIDGE_DIR, 'scopes');
export const BRIDGE_PROJECTS_DIR = path.join(BRIDGE_DIR, 'projects');
