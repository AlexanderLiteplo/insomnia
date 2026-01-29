import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { log } from './logger';
import { DATA_DIR, loadConfig } from './config';
import { sendMessage } from './imessage';
import {
  loadRegistry,
  findMatchingManager,
  createManager,
  getActiveManagers,
  queueMessageToManager,
  updateManager,
  getManagersSummary,
  Manager,
  getAllManagers,
  setManagerProcess,
} from './manager-registry';
import { spawnManager, interruptManager, isManagerRunning } from './manager-agent';

const RESPONDER_SESSIONS_DIR = path.join(DATA_DIR, 'responder-sessions');

// Ensure directory exists
fs.mkdirSync(RESPONDER_SESSIONS_DIR, { recursive: true });

export type ResponderDecision =
  | { action: 'create'; name: string; description: string; topics: string[]; message: string }
  | { action: 'queue'; managerId: string; managerName: string; message: string }
  | { action: 'interrupt'; managerId: string; managerName: string; message: string }
  | { action: 'direct'; response: string };  // For simple queries that don't need a manager

interface ResponderResult {
  decision: ResponderDecision;
  ackMessage: string;
}

// Quick classifier prompt - runs fast to ACK quickly
function getClassifierPrompt(message: string, managers: Manager[]): string {
  const managerList = managers.length > 0
    ? managers.map(m => `- "${m.name}" (${m.status}): ${m.description} | Topics: ${m.topics.join(', ')}`).join('\n')
    : 'No managers currently active.';

  return `You are a message router. Classify this message and decide how to handle it.

## Active Managers
${managerList}

## User Message
"${message}"

## Decision Rules
1. **CREATE** new manager if:
   - Message is about a NEW project/topic not covered by existing managers
   - User asks for something to be built, created, checked, investigated, or researched
   - User asks to check progress, status, or look at something (requires actual work)
   - ANY request that requires running commands, reading files, or doing actual work

2. **QUEUE** to existing manager if:
   - Message relates to a topic an existing manager handles
   - It's a follow-up or continuation of ongoing work

3. **INTERRUPT** a manager if:
   - Message contains urgent changes to ongoing work
   - User says "stop", "change", "actually", "wait", "instead"
   - New context that affects current work

4. **DIRECT** response if (USE SPARINGLY - only for these exact cases):
   - Pure greetings with no request: "hello", "hi", "hey"
   - Pure thanks with no follow-up: "thanks", "thank you"
   - Simple acknowledgment: "ok", "got it", "cool"
   - NEVER use direct for: checking status, looking at progress, investigating anything, or any request that needs work done

## Output Format
Respond with ONLY a JSON object (no markdown, no explanation):
{
  "action": "create" | "queue" | "interrupt" | "direct",
  "managerName": "name for new or existing manager",
  "managerId": "existing manager ID if queue/interrupt",
  "topics": ["topic1", "topic2"],  // for create only
  "description": "what this manager does",  // for create only
  "response": "direct response text"  // for direct only
}`;
}

// Parse the classifier response
function parseClassifierResponse(output: string, message: string, managers: Manager[]): ResponderResult {
  try {
    // Extract JSON from output (handle markdown code blocks)
    let jsonStr = output;
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    switch (parsed.action) {
      case 'create':
        return {
          decision: {
            action: 'create',
            name: parsed.managerName || 'general',
            description: parsed.description || 'General purpose manager',
            topics: parsed.topics || [],
            message,
          },
          ackMessage: `Creating new manager "${parsed.managerName}" to handle this.`,
        };

      case 'queue':
        const queueManager = managers.find(m => m.id === parsed.managerId || m.name === parsed.managerName);
        if (queueManager) {
          return {
            decision: {
              action: 'queue',
              managerId: queueManager.id,
              managerName: queueManager.name,
              message,
            },
            ackMessage: `Queued to ${queueManager.name} (${queueManager.messageQueue.length + 1} in queue)`,
          };
        }
        // Fallback to create if manager not found
        return {
          decision: {
            action: 'create',
            name: parsed.managerName || 'general',
            description: parsed.description || 'General purpose manager',
            topics: parsed.topics || [],
            message,
          },
          ackMessage: `Creating new manager "${parsed.managerName}" (previous not found).`,
        };

      case 'interrupt':
        const interruptMgr = managers.find(m => m.id === parsed.managerId || m.name === parsed.managerName);
        if (interruptMgr) {
          return {
            decision: {
              action: 'interrupt',
              managerId: interruptMgr.id,
              managerName: interruptMgr.name,
              message,
            },
            ackMessage: `Interrupting ${interruptMgr.name} with new instructions.`,
          };
        }
        // Fallback to create
        return {
          decision: {
            action: 'create',
            name: parsed.managerName || 'general',
            description: 'Handles urgent requests',
            topics: [],
            message,
          },
          ackMessage: `Creating new manager for urgent request.`,
        };

      case 'direct':
        return {
          decision: {
            action: 'direct',
            response: parsed.response || 'Got it!',
          },
          ackMessage: parsed.response || 'Got it!',
        };

      default:
        throw new Error('Unknown action');
    }
  } catch (err) {
    log(`[Responder] Failed to parse classifier response: ${err}`);
    // Default: create a general manager
    return {
      decision: {
        action: 'create',
        name: 'general',
        description: 'General purpose manager',
        topics: ['general', 'help'],
        message,
      },
      ackMessage: 'Creating general manager to handle this.',
    };
  }
}

// Main responder function - called when new message detected
export async function handleIncomingMessage(message: string): Promise<void> {
  const sessionId = `resp_${Date.now()}`;
  const logPath = path.join(RESPONDER_SESSIONS_DIR, `${sessionId}.log`);
  const config = loadConfig();
  const recipient = config.yourPhoneNumber || config.yourEmail;

  log(`[Responder] Processing: "${message.substring(0, 50)}..."`);
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] Message: ${message}\n`);

  // Get current managers
  const managers = getAllManagers();

  // Quick classification using Claude
  const prompt = getClassifierPrompt(message, managers);

  try {
    // Spawn a quick haiku classifier
    const classifierOutput = await runQuickClassifier(prompt, logPath);
    fs.appendFileSync(logPath, `[Classifier Output] ${classifierOutput}\n`);

    const result = parseClassifierResponse(classifierOutput, message, managers);
    fs.appendFileSync(logPath, `[Decision] ${JSON.stringify(result.decision)}\n`);

    // Send ACK immediately
    log(`[Responder] ACK: ${result.ackMessage}`);
    await sendMessage(recipient, result.ackMessage);

    // Execute the decision
    await executeDecision(result.decision, logPath);

  } catch (err) {
    log(`[Responder] Error: ${err}`);
    fs.appendFileSync(logPath, `[Error] ${err}\n`);

    // Send error ACK
    await sendMessage(recipient, `Error processing message. Creating fallback manager.`);

    // Fallback: create general manager
    const manager = createManager('general', 'Handles general requests', ['general']);
    const proc = spawnManager({ manager, initialMessage: message });
    setManagerProcess(manager.id, proc);
  }
}

// Run quick classifier using Haiku for speed
async function runQuickClassifier(prompt: string, logPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';

    const claude = spawn(
      'claude',
      ['--model', 'haiku', '--dangerously-skip-permissions'],
      {
        cwd: process.env.HOME || require('os').homedir(),
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    claude.stdin.write(prompt + '\n');
    claude.stdin.end();

    claude.stdout.on('data', (data) => {
      output += data.toString();
    });

    claude.stderr.on('data', (data) => {
      fs.appendFileSync(logPath, `[Classifier STDERR] ${data}\n`);
    });

    claude.on('close', (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(new Error(`Classifier exited with code ${code}`));
      }
    });

    claude.on('error', (err) => {
      reject(err);
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      claude.kill();
      reject(new Error('Classifier timeout'));
    }, 30000);
  });
}

// Execute the routing decision
async function executeDecision(decision: ResponderDecision, logPath: string): Promise<void> {
  switch (decision.action) {
    case 'create': {
      log(`[Responder] Creating manager: ${decision.name}`);
      const manager = createManager(decision.name, decision.description, decision.topics);
      const proc = spawnManager({ manager, initialMessage: decision.message });
      setManagerProcess(manager.id, proc);
      fs.appendFileSync(logPath, `[Execute] Created manager ${manager.id}\n`);
      break;
    }

    case 'queue': {
      log(`[Responder] Queuing to manager: ${decision.managerName}`);
      queueMessageToManager(decision.managerId, decision.message, 'normal');

      // If manager is idle, start processing
      const manager = updateManager(decision.managerId, {});
      if (manager && manager.status === 'idle' && !isManagerRunning(decision.managerId)) {
        log(`[Responder] Manager idle, starting processing`);
        updateManager(decision.managerId, { status: 'active' });
        const proc = spawnManager({ manager, initialMessage: decision.message });
        setManagerProcess(manager.id, proc);
      }
      fs.appendFileSync(logPath, `[Execute] Queued to ${decision.managerId}\n`);
      break;
    }

    case 'interrupt': {
      log(`[Responder] Interrupting manager: ${decision.managerName}`);
      interruptManager(decision.managerId, decision.message);
      fs.appendFileSync(logPath, `[Execute] Interrupted ${decision.managerId}\n`);
      break;
    }

    case 'direct': {
      // Already sent the response as ACK
      fs.appendFileSync(logPath, `[Execute] Direct response sent\n`);
      break;
    }
  }
}

// Get status summary for commands
export function getResponderStatus(): string {
  const managers = getAllManagers();
  const active = managers.filter(m => m.status === 'processing').length;
  const idle = managers.filter(m => m.status === 'idle').length;
  const totalQueued = managers.reduce((sum, m) => sum + m.messageQueue.length, 0);

  return `Managers: ${managers.length} total (${active} processing, ${idle} idle)
Queued messages: ${totalQueued}

${getManagersSummary()}`;
}
