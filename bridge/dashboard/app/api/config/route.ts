import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import { authenticateRequest, authenticateReadRequest } from '../../lib/auth';

const BRIDGE_DIR = process.env.BRIDGE_DIR || path.join(process.env.HOME || '', 'claude-automation-system', 'bridge');
const CONFIG_PATH = path.join(BRIDGE_DIR, 'config.json');

// Valid Claude models
const VALID_MODELS = ['sonnet', 'haiku', 'opus'] as const;
type ClaudeModel = typeof VALID_MODELS[number];

// Default model configuration
const DEFAULT_MODELS = {
  responder: 'haiku' as ClaudeModel,
  defaultManager: 'opus' as ClaudeModel,
  orchestratorWorker: 'opus' as ClaudeModel,
  orchestratorManager: 'opus' as ClaudeModel,
};

interface ModelConfig {
  responder: ClaudeModel;
  defaultManager: ClaudeModel;
  orchestratorWorker: ClaudeModel;
  orchestratorManager: ClaudeModel;
}

function loadConfig(): { models: ModelConfig } {
  const defaults = { models: DEFAULT_MODELS };

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      const fileConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      const mergedModels = { ...DEFAULT_MODELS, ...fileConfig.models };
      return { models: mergedModels };
    } catch (err) {
      console.error('Error loading config:', err);
    }
  }

  return defaults;
}

function saveModels(models: Partial<ModelConfig>): void {
  let existing: Record<string, unknown> = {};

  if (fs.existsSync(CONFIG_PATH)) {
    try {
      existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    } catch (err) {
      console.error('Error loading existing config:', err);
    }
  }

  // Get existing models or use empty object
  const existingModels = (existing.models && typeof existing.models === 'object')
    ? existing.models as Partial<ModelConfig>
    : {};

  // Merge models
  const mergedModels = { ...DEFAULT_MODELS, ...existingModels, ...models };

  // Validate models
  for (const [key, value] of Object.entries(mergedModels)) {
    if (!VALID_MODELS.includes(value as ClaudeModel)) {
      throw new Error(`Invalid model "${value}" for ${key}. Valid models: ${VALID_MODELS.join(', ')}`);
    }
  }

  const newConfig = { ...existing, models: mergedModels };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2));
}

/**
 * GET /api/config
 * Returns the current model configuration
 */
export async function GET(request: Request) {
  const auth = authenticateReadRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  const config = loadConfig();

  return NextResponse.json({
    models: config.models,
    availableModels: VALID_MODELS,
  });
}

/**
 * PATCH /api/config
 * Updates model configuration
 * Body: { models: { responder?: string, defaultManager?: string, ... } }
 */
export async function PATCH(request: Request) {
  const auth = authenticateRequest(request);
  if (!auth.authorized) {
    return auth.error;
  }

  try {
    const body = await request.json();

    if (!body.models || typeof body.models !== 'object') {
      return NextResponse.json(
        { error: 'Invalid request', message: 'Body must contain "models" object' },
        { status: 400 }
      );
    }

    // Validate models before saving
    for (const [key, value] of Object.entries(body.models)) {
      if (!['responder', 'defaultManager', 'orchestratorWorker', 'orchestratorManager'].includes(key)) {
        return NextResponse.json(
          { error: 'Invalid field', message: `Unknown model field: ${key}` },
          { status: 400 }
        );
      }
      if (!VALID_MODELS.includes(value as ClaudeModel)) {
        return NextResponse.json(
          { error: 'Invalid model', message: `Invalid model "${value}" for ${key}. Valid: ${VALID_MODELS.join(', ')}` },
          { status: 400 }
        );
      }
    }

    saveModels(body.models);

    const config = loadConfig();
    return NextResponse.json({
      success: true,
      models: config.models,
    });
  } catch (err) {
    console.error('Error updating config:', err);
    return NextResponse.json(
      { error: 'Server error', message: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
