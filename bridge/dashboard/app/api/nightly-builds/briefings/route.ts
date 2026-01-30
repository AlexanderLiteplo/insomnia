import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { authenticateRequest, authenticateReadRequest } from '../../../lib/auth';

const BRIDGE_DIR = process.env.BRIDGE_DIR || path.join(process.env.HOME || '', 'claude-automation-system', 'bridge');
const BRIEFINGS_PATH = path.join(BRIDGE_DIR, '.nightly-briefings.json');

interface NightlyBriefing {
  id: string;
  createdAt: string;
  buildStartedAt: string;
  buildCompletedAt: string;
  model: string;
  tldr: string;
  summary: string;
  changes: Array<{
    type: string;
    title: string;
    description: string;
    filesChanged?: string[];
    project?: string;
  }>;
  status: 'success' | 'partial' | 'failed';
  error?: string;
}

function loadBriefings(): NightlyBriefing[] {
  if (fs.existsSync(BRIEFINGS_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(BRIEFINGS_PATH, 'utf8'));
    } catch (err) {
      console.error('Error loading briefings:', err);
    }
  }
  return [];
}

function saveBriefings(briefings: NightlyBriefing[]): void {
  fs.writeFileSync(BRIEFINGS_PATH, JSON.stringify(briefings, null, 2));
}

/**
 * GET /api/nightly-builds/briefings
 * Returns all briefings
 */
export async function GET(request: Request) {
  const auth = authenticateReadRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  const briefings = loadBriefings();

  return NextResponse.json({
    briefings,
    total: briefings.length,
  });
}

/**
 * POST /api/nightly-builds/briefings
 * Adds a new briefing
 */
export async function POST(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  try {
    const briefing = await request.json() as NightlyBriefing;

    // Validate required fields
    if (!briefing.id || !briefing.tldr || !briefing.summary) {
      return NextResponse.json(
        { error: 'Missing required fields', message: 'id, tldr, and summary are required' },
        { status: 400 }
      );
    }

    // Add timestamps if missing
    if (!briefing.createdAt) {
      briefing.createdAt = new Date().toISOString();
    }
    if (!briefing.buildCompletedAt) {
      briefing.buildCompletedAt = new Date().toISOString();
    }

    // Load existing briefings and add new one at the front
    const briefings = loadBriefings();
    briefings.unshift(briefing);

    // Keep only last 30 briefings
    const trimmed = briefings.slice(0, 30);
    saveBriefings(trimmed);

    return NextResponse.json({
      success: true,
      briefing,
    });
  } catch (err) {
    console.error('Error saving briefing:', err);
    return NextResponse.json(
      { error: 'Server error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/nightly-builds/briefings
 * Deletes a briefing by ID
 */
export async function DELETE(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'Missing id', message: 'Briefing ID is required' },
        { status: 400 }
      );
    }

    const briefings = loadBriefings();
    const filtered = briefings.filter(b => b.id !== id);

    if (filtered.length === briefings.length) {
      return NextResponse.json(
        { error: 'Not found', message: 'Briefing not found' },
        { status: 404 }
      );
    }

    saveBriefings(filtered);

    return NextResponse.json({
      success: true,
      deleted: id,
    });
  } catch (err) {
    console.error('Error deleting briefing:', err);
    return NextResponse.json(
      { error: 'Server error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
