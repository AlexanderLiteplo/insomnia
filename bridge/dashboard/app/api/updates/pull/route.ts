import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import * as path from 'path';
import { authenticateRequest, checkRateLimit, getRateLimitIdentifier } from '../../../lib/auth';

const INSOMNIA_DIR = process.env.INSOMNIA_DIR || path.resolve(process.cwd(), '..', '..');

export async function POST(request: Request) {
  // Rate limiting check first
  const rateLimitId = getRateLimitIdentifier(request);
  if (!checkRateLimit(rateLimitId)) {
    return NextResponse.json(
      { success: false, message: 'Rate limit exceeded. Try again later.' },
      { status: 429 }
    );
  }

  // Authenticate the request
  const auth = authenticateRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  try {
    // Get current commit before pull
    const beforeCommit = execSync('git rev-parse HEAD', {
      cwd: INSOMNIA_DIR,
      encoding: 'utf-8',
    }).trim();

    // Check for local changes
    const status = execSync('git status --porcelain', {
      cwd: INSOMNIA_DIR,
      encoding: 'utf-8',
    }).trim();

    if (status) {
      // Stash local changes if any
      execSync('git stash', {
        cwd: INSOMNIA_DIR,
        timeout: 10000,
      });
    }

    // Pull latest changes with rebase to handle divergent branches
    execSync('git pull --rebase origin main', {
      cwd: INSOMNIA_DIR,
      encoding: 'utf-8',
      timeout: 60000,
    });

    // Pop stash if we stashed
    if (status) {
      try {
        execSync('git stash pop', {
          cwd: INSOMNIA_DIR,
          timeout: 10000,
        });
      } catch {
        // Stash pop might fail on conflicts, that's ok for now
        console.warn('Failed to pop stash, may have conflicts');
      }
    }

    // Get new commit after pull
    const afterCommit = execSync('git rev-parse HEAD', {
      cwd: INSOMNIA_DIR,
      encoding: 'utf-8',
    }).trim();

    const updated = beforeCommit !== afterCommit;

    // Get log of what was pulled
    let pulledCommits: string[] = [];
    if (updated) {
      const log = execSync(`git log ${beforeCommit.substring(0, 7)}..${afterCommit.substring(0, 7)} --oneline`, {
        cwd: INSOMNIA_DIR,
        encoding: 'utf-8',
      }).trim();
      pulledCommits = log ? log.split('\n') : [];
    }

    return NextResponse.json({
      success: true,
      updated,
      beforeCommit: beforeCommit.substring(0, 7),
      afterCommit: afterCommit.substring(0, 7),
      pulledCommits,
      message: updated
        ? `Updated from ${beforeCommit.substring(0, 7)} to ${afterCommit.substring(0, 7)}`
        : 'Already up to date',
    });
  } catch (err) {
    console.error('Failed to pull updates:', err);
    return NextResponse.json(
      {
        success: false,
        message: err instanceof Error ? err.message : 'Failed to pull updates',
      },
      { status: 500 }
    );
  }
}
