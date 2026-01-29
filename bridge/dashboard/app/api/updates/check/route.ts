import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import * as path from 'path';

const INSOMNIA_DIR = process.env.INSOMNIA_DIR || path.resolve(process.cwd(), '..', '..');

export async function GET() {
  try {
    // Fetch latest from remote without merging
    execSync('git fetch origin main', {
      cwd: INSOMNIA_DIR,
      timeout: 30000,
      stdio: 'pipe',
    });

    // Get local HEAD commit
    const localCommit = execSync('git rev-parse HEAD', {
      cwd: INSOMNIA_DIR,
      encoding: 'utf-8',
    }).trim();

    // Get remote HEAD commit
    const remoteCommit = execSync('git rev-parse origin/main', {
      cwd: INSOMNIA_DIR,
      encoding: 'utf-8',
    }).trim();

    // Check if we're behind
    const hasUpdates = localCommit !== remoteCommit;

    // If there are updates, get info about new commits
    let newCommits: { hash: string; message: string; author: string; date: string }[] = [];
    let commitsBehind = 0;

    if (hasUpdates) {
      // Count commits behind
      const behindCount = execSync('git rev-list --count HEAD..origin/main', {
        cwd: INSOMNIA_DIR,
        encoding: 'utf-8',
      }).trim();
      commitsBehind = parseInt(behindCount, 10);

      // Get commit info (last 5 new commits)
      const commitLog = execSync(
        'git log HEAD..origin/main --format="%h|%s|%an|%ar" -n 5',
        {
          cwd: INSOMNIA_DIR,
          encoding: 'utf-8',
        }
      ).trim();

      if (commitLog) {
        newCommits = commitLog.split('\n').map(line => {
          const [hash, message, author, date] = line.split('|');
          return { hash, message, author, date };
        });
      }
    }

    // Get current branch
    const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: INSOMNIA_DIR,
      encoding: 'utf-8',
    }).trim();

    return NextResponse.json({
      hasUpdates,
      localCommit: localCommit.substring(0, 7),
      remoteCommit: remoteCommit.substring(0, 7),
      commitsBehind,
      newCommits,
      currentBranch,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Failed to check for updates:', err);
    return NextResponse.json(
      {
        hasUpdates: false,
        error: err instanceof Error ? err.message : 'Failed to check for updates',
      },
      { status: 500 }
    );
  }
}
