import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import * as path from 'path';

const ORCHESTRATOR_DIR = path.join(process.env.HOME || '', 'Documents', 'claude-manager');

export async function POST() {
  try {
    execSync('./scripts/orchestrator.sh restart', {
      cwd: ORCHESTRATOR_DIR,
      timeout: 30000,
      stdio: 'ignore',
    });

    return NextResponse.json({ success: true, message: 'Orchestrator restarted' });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
