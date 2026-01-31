import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { authenticateRequest } from '../../../lib/auth';

const execAsync = promisify(exec);

// POST - Open native Finder dialog to select folder(s)
export async function POST(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  try {
    const body = await request.json();
    const { startPath, multiple = true } = body;

    // Default to home directory if no start path provided
    const defaultPath = startPath || process.env.HOME || '/Users';

    // Use osascript to open native folder picker
    // This opens the native macOS Finder dialog
    const appleScript = multiple ? `
      set selectedFolders to choose folder with prompt "Select project folders to import:" default location POSIX file "${defaultPath}" with multiple selections allowed
      set folderPaths to {}
      repeat with aFolder in selectedFolders
        set end of folderPaths to POSIX path of aFolder
      end repeat
      set AppleScript's text item delimiters to "|||"
      return folderPaths as text
    ` : `
      set selectedFolder to choose folder with prompt "Select a project folder to import:" default location POSIX file "${defaultPath}"
      return POSIX path of selectedFolder
    `;

    const { stdout } = await execAsync(`osascript -e '${appleScript.replace(/'/g, "'\"'\"'")}'`);

    // Parse the result
    const rawPaths = stdout.trim();
    if (!rawPaths) {
      return NextResponse.json({
        success: false,
        cancelled: true,
        message: 'No folders selected'
      });
    }

    // Split by delimiter and clean up paths (remove trailing slashes)
    const paths = multiple
      ? rawPaths.split('|||').map(p => p.trim().replace(/\/$/, ''))
      : [rawPaths.trim().replace(/\/$/, '')];

    // Validate each path and get folder info
    const folders = paths.filter(p => p).map(folderPath => {
      const stats = fs.statSync(folderPath);
      const name = path.basename(folderPath);

      // Try to detect project type
      let projectType = 'unknown';
      if (fs.existsSync(path.join(folderPath, 'package.json'))) {
        projectType = 'node';
      } else if (fs.existsSync(path.join(folderPath, 'Cargo.toml'))) {
        projectType = 'rust';
      } else if (fs.existsSync(path.join(folderPath, 'requirements.txt')) || fs.existsSync(path.join(folderPath, 'pyproject.toml'))) {
        projectType = 'python';
      } else if (fs.existsSync(path.join(folderPath, 'go.mod'))) {
        projectType = 'go';
      } else if (fs.existsSync(path.join(folderPath, '*.xcodeproj')) || fs.existsSync(path.join(folderPath, '*.xcworkspace'))) {
        projectType = 'ios';
      }

      return {
        path: folderPath,
        name,
        projectType,
        isDirectory: stats.isDirectory()
      };
    });

    return NextResponse.json({
      success: true,
      folders
    });
  } catch (err) {
    // User cancelled the dialog
    if (err instanceof Error && err.message.includes('User canceled')) {
      return NextResponse.json({
        success: false,
        cancelled: true,
        message: 'User cancelled folder selection'
      });
    }

    console.error('Browse error:', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to open folder picker' },
      { status: 500 }
    );
  }
}
