import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { authenticateRequest, authenticateReadRequest } from '../../lib/auth';
import { ORCHESTRATOR_DIR, PROJECTS_DIR } from '../../lib/paths';

const PROJECTS_REGISTRY = path.join(ORCHESTRATOR_DIR, 'projects.json');

interface ProjectEntry {
  name: string;
  tasksFile: string;
  addedAt: string;
}

interface ProjectsRegistry {
  projects: ProjectEntry[];
}

function getRegistry(): ProjectsRegistry {
  if (!fs.existsSync(PROJECTS_REGISTRY)) {
    return { projects: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(PROJECTS_REGISTRY, 'utf8'));
  } catch {
    return { projects: [] };
  }
}

function saveRegistry(registry: ProjectsRegistry): void {
  fs.writeFileSync(PROJECTS_REGISTRY, JSON.stringify(registry, null, 2));
}

// GET - List all registered projects
export async function GET(request: Request) {
  const auth = authenticateReadRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  const registry = getRegistry();
  return NextResponse.json({ success: true, projects: registry.projects });
}

// POST - Add a new project
export async function POST(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  try {
    const body = await request.json();
    const { name, tasksFile, description, outputDir } = body;

    if (!name) {
      return NextResponse.json(
        { success: false, message: 'Project name is required' },
        { status: 400 }
      );
    }

    // Sanitize project name (kebab-case)
    const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const registry = getRegistry();

    // Check if project already exists
    const existing = registry.projects.find(p => p.name === safeName);
    if (existing) {
      return NextResponse.json(
        { success: false, message: `Project "${safeName}" already exists` },
        { status: 409 }
      );
    }

    let finalTasksFile = tasksFile;

    // If tasksFile provided, use it; otherwise create a new one
    if (tasksFile) {
      // Expand ~ in path
      finalTasksFile = tasksFile.replace(/^~/, process.env.HOME || '');

      if (!fs.existsSync(finalTasksFile)) {
        return NextResponse.json(
          { success: false, message: `Tasks file not found: ${tasksFile}` },
          { status: 400 }
        );
      }
    } else {
      // Create a new project directory and tasks.json
      const projectDir = path.join(PROJECTS_DIR, safeName);
      fs.mkdirSync(projectDir, { recursive: true });

      finalTasksFile = path.join(projectDir, 'tasks.json');

      const newProject = {
        project: {
          name: safeName,
          description: description || `Project: ${name}`,
          outputDir: outputDir || projectDir,
        },
        tasks: []
      };

      fs.writeFileSync(finalTasksFile, JSON.stringify(newProject, null, 2));
    }

    // Add to registry
    registry.projects.push({
      name: safeName,
      tasksFile: finalTasksFile,
      addedAt: new Date().toISOString(),
    });

    saveRegistry(registry);

    return NextResponse.json({
      success: true,
      message: `Project "${safeName}" added successfully`,
      project: {
        name: safeName,
        tasksFile: finalTasksFile,
      }
    });
  } catch (err) {
    console.error('Error adding project:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to add project' },
      { status: 500 }
    );
  }
}

// DELETE - Remove a project
export async function DELETE(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  try {
    const { searchParams } = new URL(request.url);
    const name = searchParams.get('name');

    if (!name) {
      return NextResponse.json(
        { success: false, message: 'Project name is required' },
        { status: 400 }
      );
    }

    const registry = getRegistry();
    const initialLength = registry.projects.length;
    registry.projects = registry.projects.filter(p => p.name !== name);

    if (registry.projects.length === initialLength) {
      return NextResponse.json(
        { success: false, message: `Project "${name}" not found` },
        { status: 404 }
      );
    }

    saveRegistry(registry);

    return NextResponse.json({
      success: true,
      message: `Project "${name}" removed from registry`,
    });
  } catch (err) {
    console.error('Error removing project:', err);
    return NextResponse.json(
      { success: false, message: 'Failed to remove project' },
      { status: 500 }
    );
  }
}
