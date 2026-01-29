import { NextResponse } from 'next/server';
import { spawn } from 'child_process';
import { authenticateRequest, checkRateLimit, getRateLimitIdentifier } from '../../../lib/auth';

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
    const body = await request.json();
    const { prompt, model = 'sonnet', directory } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { success: false, message: 'Prompt is required' },
        { status: 400 }
      );
    }

    // Validate model
    const validModels = ['haiku', 'sonnet', 'opus'];
    if (!validModels.includes(model)) {
      return NextResponse.json(
        { success: false, message: `Invalid model. Must be one of: ${validModels.join(', ')}` },
        { status: 400 }
      );
    }

    // Build the claude command arguments
    const args = [
      '--model', model,
      '--dangerously-skip-permissions',
      '-p', prompt,
    ];

    // Add directory if specified
    if (directory && typeof directory === 'string') {
      args.push('--add-dir', directory);
    }

    // Spawn the claude process in background
    const child = spawn('claude', args, {
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });

    // Unref to allow parent process to exit independently
    child.unref();

    return NextResponse.json({
      success: true,
      message: 'Claude agent spawned successfully',
      pid: child.pid,
      model,
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : ''),
    });
  } catch (err) {
    return NextResponse.json(
      { success: false, message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
