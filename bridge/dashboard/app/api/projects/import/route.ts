import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { authenticateReadRequest } from '../../../lib/auth';

const execAsync = promisify(exec);

const BRIDGE_DIR = process.env.BRIDGE_DIR || path.join(process.env.HOME || '', 'Documents', 'insomnia', 'bridge');
const ORCHESTRATOR_DIR = process.env.ORCHESTRATOR_DIR || path.join(BRIDGE_DIR, '..', 'orchestrator');
const PROJECTS_DIR = path.join(ORCHESTRATOR_DIR, 'projects');
const PROJECTS_REGISTRY = path.join(ORCHESTRATOR_DIR, 'projects.json');

interface ProjectRegistryEntry {
  name: string;
  tasksFile: string;
  addedAt: string;
}

interface ProjectRegistry {
  projects: ProjectRegistryEntry[];
}

export async function POST(request: Request) {
  const auth = authenticateReadRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  try {
    const { folderPath, projectName } = await request.json();

    if (!folderPath || !projectName) {
      return NextResponse.json(
        { error: 'Missing required fields: folderPath and projectName' },
        { status: 400 }
      );
    }

    // Validate that the folder exists
    if (!fs.existsSync(folderPath)) {
      return NextResponse.json(
        { error: `Folder does not exist: ${folderPath}` },
        { status: 400 }
      );
    }

    // Validate that it's a directory
    const stats = fs.statSync(folderPath);
    if (!stats.isDirectory()) {
      return NextResponse.json(
        { error: `Path is not a directory: ${folderPath}` },
        { status: 400 }
      );
    }

    // Create project directory if it doesn't exist
    const projectDir = path.join(PROJECTS_DIR, projectName);
    if (!fs.existsSync(projectDir)) {
      fs.mkdirSync(projectDir, { recursive: true });
    }

    // Check if project already exists
    const tasksFile = path.join(projectDir, 'tasks.json');
    if (fs.existsSync(tasksFile)) {
      return NextResponse.json(
        { error: `Project '${projectName}' already exists` },
        { status: 409 }
      );
    }

    // Create a script to spawn Claude agent for analysis
    const analyzeScriptPath = path.join(projectDir, '.analyze-project.sh');
    const analyzeScript = `#!/bin/bash
# Auto-generated script to analyze project with Claude

cd "${folderPath}" || exit 1

# Use Claude to analyze the project
echo "Analyzing project: ${projectName}"
echo "Location: ${folderPath}"
echo ""
echo "Creating tasks.json with project structure..."

# The Claude agent will be spawned via a background task
# For now, create initial structure
echo "Analysis initialized. Tasks file will be enhanced by orchestrator."
`;

    fs.writeFileSync(analyzeScriptPath, analyzeScript);
    fs.chmodSync(analyzeScriptPath, 0o755);

    // Create initial tasks.json that the agent will enhance
    const initialTasksJson = {
      project: {
        name: projectName,
        description: `Project imported from ${folderPath}. Analysis pending.`,
        outputDir: folderPath
      },
      tasks: [
        {
          id: 'task-001',
          name: 'Analyze and set up project structure',
          description: 'Analyze the codebase, understand its purpose, and create a comprehensive project plan',
          requirements: [
            'Explore the project directory and understand file structure',
            'Identify the tech stack (languages, frameworks, dependencies)',
            'Determine the project\'s main purpose and functionality',
            'Check for existing tests, build scripts, and documentation',
            'Create a detailed project description',
            'Define additional tasks needed to complete or enhance the project'
          ],
          testCommand: 'echo "Manual analysis required"',
          status: 'pending',
          testsPassing: false,
          workerNotes: 'This is an imported project. Worker should explore the codebase thoroughly before proceeding.',
          managerReview: ''
        }
      ]
    };

    // Write the initial tasks.json
    fs.writeFileSync(tasksFile, JSON.stringify(initialTasksJson, null, 2));

    // Add to projects registry
    let registry: ProjectRegistry = { projects: [] };
    if (fs.existsSync(PROJECTS_REGISTRY)) {
      try {
        registry = JSON.parse(fs.readFileSync(PROJECTS_REGISTRY, 'utf8')) as ProjectRegistry;
      } catch (err) {
        console.error('Error reading projects registry:', err);
      }
    }

    // Check if project already in registry
    const existingProject = registry.projects.find((p) => p.name === projectName);
    if (!existingProject) {
      registry.projects.push({
        name: projectName,
        tasksFile,
        addedAt: new Date().toISOString()
      });
      fs.writeFileSync(PROJECTS_REGISTRY, JSON.stringify(registry, null, 2));
    }

    return NextResponse.json({
      success: true,
      message: `Project '${projectName}' imported successfully`,
      projectDir,
      tasksFile
    });
  } catch (err) {
    console.error('Import error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to import project' },
      { status: 500 }
    );
  }
}
