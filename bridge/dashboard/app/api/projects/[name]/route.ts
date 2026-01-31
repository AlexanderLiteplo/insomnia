import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { authenticateReadRequest } from '../../../lib/auth';

const BRIDGE_DIR = process.env.BRIDGE_DIR || path.join(process.env.HOME || '', 'Documents', 'insomnia', 'bridge');
const ORCHESTRATOR_DIR = process.env.ORCHESTRATOR_DIR || path.join(BRIDGE_DIR, '..', 'orchestrator');
const PROJECTS_DIR = path.join(ORCHESTRATOR_DIR, 'projects');

interface Task {
  id: string;
  name: string;
  description: string;
  requirements: string[];
  testCommand?: string;
  status: string;
  testsPassing: boolean;
  workerNotes?: string;
  managerReview?: string;
}

interface ProjectDetails {
  name: string;
  description: string;
  outputDir: string | null;
  tasks: Task[];
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const auth = authenticateReadRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  const { name: projectName } = await params;

  // Try to find the tasks.json file for this project
  // First check the legacy location
  const legacyTasksFile = path.join(ORCHESTRATOR_DIR, 'prds', 'tasks.json');

  // Then check project-specific location
  const projectTasksFile = path.join(PROJECTS_DIR, projectName, 'tasks.json');

  let tasksFile: string | null = null;

  // Try project-specific first
  if (fs.existsSync(projectTasksFile)) {
    tasksFile = projectTasksFile;
  } else if (fs.existsSync(legacyTasksFile)) {
    // Check if the legacy file matches this project name
    try {
      const data = JSON.parse(fs.readFileSync(legacyTasksFile, 'utf8'));
      if (data.project?.name === projectName) {
        tasksFile = legacyTasksFile;
      }
    } catch {
      // Ignore errors
    }
  }

  if (!tasksFile) {
    return NextResponse.json(
      { error: 'Project not found' },
      { status: 404 }
    );
  }

  try {
    const data = JSON.parse(fs.readFileSync(tasksFile, 'utf8'));

    const projectDetails: ProjectDetails = {
      name: data.project?.name || projectName,
      description: data.project?.description || '',
      outputDir: data.project?.outputDir || null,
      tasks: data.tasks || [],
    };

    return NextResponse.json(projectDetails);
  } catch (err) {
    console.error(`Error reading project ${projectName}:`, err);
    return NextResponse.json(
      { error: 'Failed to read project details' },
      { status: 500 }
    );
  }
}
