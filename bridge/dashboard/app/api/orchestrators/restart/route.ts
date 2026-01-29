import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import * as path from 'path';
import { authenticateRequest, checkRateLimit, getRateLimitIdentifier } from '../../../lib/auth';

const ORCHESTRATOR_DIR = path.join(process.env.HOME || '', 'claude-automation-system', 'orchestrator');

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
