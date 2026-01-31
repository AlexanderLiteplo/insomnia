/**
 * Project Registry - Source of truth for all projects, PRDs, and orchestrators
 *
 * This module manages the mapping between:
 * - Projects and their managers
 * - PRD documents and scope files
 * - Orchestrators running for each project
 * - Task files for each project
 */

import * as fs from 'fs';
import * as path from 'path';
import { PATHS } from './paths';
import { log } from './logger';

const REGISTRY_FILE = PATHS.bridge.projectRegistry;

export type ProjectStatus = 'idle' | 'active' | 'completed' | 'paused';

export interface Project {
  id: string;
  name: string;
  description: string;
  outputDir: string;                    // Where the project code lives
  managerId: string | null;             // Manager responsible for this project
  orchestratorId: string | null;        // Active orchestrator if running
  prdFile: string | null;               // Relative path to PRD document
  scopeFile: string | null;             // Optional scope document
  tasksFile: string | null;             // Path to tasks.json
  status: ProjectStatus;
  createdAt: string;
  lastUpdatedAt: string;
}

export interface ProjectRegistry {
  version: number;
  projects: Project[];
}

export interface PRDContent {
  title: string;
  overview: string;
  goals: string[];
  requirements: {
    mustHave: string[];
    niceToHave: string[];
  };
  technicalApproach: string;
  successCriteria: string[];
}

/**
 * Load the project registry from disk
 */
export function loadProjectRegistry(): ProjectRegistry {
  if (!fs.existsSync(REGISTRY_FILE)) {
    return { version: 1, projects: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
  } catch {
    log('[ProjectRegistry] Failed to parse registry, returning empty');
    return { version: 1, projects: [] };
  }
}

/**
 * Save the project registry to disk
 */
export function saveProjectRegistry(registry: ProjectRegistry): void {
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(registry, null, 2));
  log(`[ProjectRegistry] Saved registry with ${registry.projects.length} projects`);
}

/**
 * Get a project by ID
 */
export function getProject(id: string): Project | undefined {
  const registry = loadProjectRegistry();
  return registry.projects.find(p => p.id === id);
}

/**
 * Get a project by name
 */
export function getProjectByName(name: string): Project | undefined {
  const registry = loadProjectRegistry();
  return registry.projects.find(p => p.name.toLowerCase() === name.toLowerCase());
}

/**
 * Get all projects
 */
export function getAllProjects(): Project[] {
  const registry = loadProjectRegistry();
  return registry.projects;
}

/**
 * Get projects by manager ID
 */
export function getProjectsByManager(managerId: string): Project[] {
  const registry = loadProjectRegistry();
  return registry.projects.filter(p => p.managerId === managerId);
}

/**
 * Get projects by status
 */
export function getProjectsByStatus(status: ProjectStatus): Project[] {
  const registry = loadProjectRegistry();
  return registry.projects.filter(p => p.status === status);
}

/**
 * Create a new project
 */
export function createProject(
  name: string,
  description: string,
  outputDir: string,
  managerId?: string
): Project {
  const registry = loadProjectRegistry();

  // Generate kebab-case name for files
  const kebabName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const project: Project = {
    id: `proj_${Date.now()}`,
    name: kebabName,
    description,
    outputDir,
    managerId: managerId || null,
    orchestratorId: null,
    prdFile: null,
    scopeFile: null,
    tasksFile: `projects/${kebabName}/tasks.json`,
    status: 'idle',
    createdAt: new Date().toISOString(),
    lastUpdatedAt: new Date().toISOString(),
  };

  registry.projects.push(project);
  saveProjectRegistry(registry);

  // Create project directory
  const projectDir = path.join(PATHS.bridge.projects, kebabName);
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
    log(`[ProjectRegistry] Created project directory: ${projectDir}`);
  }

  log(`[ProjectRegistry] Created project: ${name} (${project.id})`);
  return project;
}

/**
 * Update a project
 */
export function updateProject(id: string, updates: Partial<Project>): Project | null {
  const registry = loadProjectRegistry();
  const index = registry.projects.findIndex(p => p.id === id);

  if (index === -1) return null;

  registry.projects[index] = {
    ...registry.projects[index],
    ...updates,
    lastUpdatedAt: new Date().toISOString(),
  };

  saveProjectRegistry(registry);
  return registry.projects[index];
}

/**
 * Delete a project
 */
export function deleteProject(id: string): boolean {
  const registry = loadProjectRegistry();
  const index = registry.projects.findIndex(p => p.id === id);

  if (index === -1) return false;

  const project = registry.projects[index];
  log(`[ProjectRegistry] Deleting project: ${project.name} (${id})`);

  registry.projects.splice(index, 1);
  saveProjectRegistry(registry);
  return true;
}

/**
 * Create a PRD document for a project
 */
export function createPRD(projectId: string, content: PRDContent): string | null {
  const project = getProject(projectId);
  if (!project) return null;

  const prdFileName = `${project.name}.md`;
  const prdPath = path.join(PATHS.bridge.prds, prdFileName);

  const markdown = `# ${content.title}

## Overview
${content.overview}

## Goals
${content.goals.map(g => `- ${g}`).join('\n')}

## Requirements

### Must Have
${content.requirements.mustHave.map(r => `- ${r}`).join('\n')}

### Nice to Have
${content.requirements.niceToHave.map(r => `- ${r}`).join('\n')}

## Technical Approach
${content.technicalApproach}

## Success Criteria
${content.successCriteria.map(c => `- ${c}`).join('\n')}
`;

  fs.writeFileSync(prdPath, markdown);
  log(`[ProjectRegistry] Created PRD: ${prdPath}`);

  // Update project with PRD path
  updateProject(projectId, { prdFile: `prds/${prdFileName}` });

  return prdFileName;
}

/**
 * Read a PRD document
 */
export function readPRD(projectId: string): string | null {
  const project = getProject(projectId);
  if (!project || !project.prdFile) return null;

  const prdPath = path.join(PATHS.bridge.root, project.prdFile);
  if (!fs.existsSync(prdPath)) return null;

  return fs.readFileSync(prdPath, 'utf8');
}

/**
 * Create tasks.json from PRD
 */
export function createTasksFromPRD(projectId: string, tasks: Array<{
  name: string;
  description: string;
  requirements: string[];
  testCommand?: string;
}>): boolean {
  const project = getProject(projectId);
  if (!project) return false;

  const tasksDir = path.join(PATHS.bridge.projects, project.name);
  if (!fs.existsSync(tasksDir)) {
    fs.mkdirSync(tasksDir, { recursive: true });
  }

  const tasksPath = path.join(tasksDir, 'tasks.json');
  const tasksData = {
    project: {
      name: project.name,
      description: project.description,
      outputDir: project.outputDir,
      prdFile: project.prdFile,
    },
    tasks: tasks.map((task, index) => ({
      id: `task-${String(index + 1).padStart(3, '0')}`,
      name: task.name,
      description: task.description,
      requirements: task.requirements,
      testCommand: task.testCommand || `cd ${project.outputDir} && npm test`,
      status: 'pending',
      testsPassing: false,
      workerNotes: '',
      managerReview: '',
    })),
  };

  fs.writeFileSync(tasksPath, JSON.stringify(tasksData, null, 2));
  log(`[ProjectRegistry] Created tasks.json: ${tasksPath}`);

  updateProject(projectId, { tasksFile: `projects/${project.name}/tasks.json` });
  return true;
}

/**
 * Assign a manager to a project
 */
export function assignManagerToProject(projectId: string, managerId: string): boolean {
  const result = updateProject(projectId, { managerId });
  if (result) {
    log(`[ProjectRegistry] Assigned manager ${managerId} to project ${projectId}`);
  }
  return result !== null;
}

/**
 * Start an orchestrator for a project
 */
export function setProjectOrchestrator(projectId: string, orchestratorId: string | null): boolean {
  const result = updateProject(projectId, {
    orchestratorId,
    status: orchestratorId ? 'active' : 'idle'
  });
  return result !== null;
}

/**
 * Get a summary of all projects for display
 */
export function getProjectsSummary(): string {
  const projects = getAllProjects();

  if (projects.length === 0) {
    return 'No projects registered';
  }

  const lines = projects.map(p => {
    const statusEmoji = p.status === 'active' ? '🔄' : p.status === 'completed' ? '✅' : '💤';
    const hasOrchestrator = p.orchestratorId ? ' [Orch Running]' : '';
    const hasPRD = p.prdFile ? ' [PRD]' : '';
    return `${statusEmoji} ${p.name}${hasPRD}${hasOrchestrator} - ${p.description.substring(0, 40)}...`;
  });

  return lines.join('\n');
}

/**
 * Find projects matching keywords
 */
export function findMatchingProjects(keywords: string[]): Project[] {
  const registry = loadProjectRegistry();
  const keywordsLower = keywords.map(k => k.toLowerCase());

  return registry.projects.filter(project => {
    const searchText = `${project.name} ${project.description}`.toLowerCase();
    return keywordsLower.some(keyword => searchText.includes(keyword));
  });
}

/**
 * Get project registry info for responder context
 */
export function getProjectRegistryContext(): string {
  const projects = getAllProjects();

  if (projects.length === 0) {
    return 'No projects registered.';
  }

  const activeProjects = projects.filter(p => p.status === 'active');
  const idleProjects = projects.filter(p => p.status === 'idle');

  let context = `## Registered Projects (${projects.length} total)\n\n`;

  if (activeProjects.length > 0) {
    context += '### Active Projects (with orchestrators running)\n';
    for (const p of activeProjects) {
      context += `- **${p.name}**: ${p.description}\n`;
      context += `  - Manager: ${p.managerId || 'none'}\n`;
      context += `  - PRD: ${p.prdFile || 'none'}\n`;
    }
    context += '\n';
  }

  if (idleProjects.length > 0) {
    context += '### Idle Projects\n';
    for (const p of idleProjects) {
      context += `- **${p.name}**: ${p.description}\n`;
    }
  }

  return context;
}
