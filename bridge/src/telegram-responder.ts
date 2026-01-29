/**
 * Telegram Message Responder
 * Routes messages to appropriate managers via multi-manager architecture
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { log } from './logger';
import { DATA_DIR, loadConfig, getModel } from './config';
import { sendTelegramMessage } from './telegram-send';
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
import { loadHistory, formatForPrompt, addMessage } from './history';
import { spawnTelegramManager, interruptManager, isManagerRunning } from './telegram-manager-agent';

const RESPONDER_SESSIONS_DIR = path.join(DATA_DIR, 'responder-sessions');

// Ensure directory exists
fs.mkdirSync(RESPONDER_SESSIONS_DIR, { recursive: true });

export type ResponderDecision =
  | { action: 'create'; name: string; description: string; topics: string[]; message: string }
  | { action: 'queue'; managerId: string; managerName: string; message: string }
  | { action: 'interrupt'; managerId: string; managerName: string; message: string }
  | { action: 'direct'; response: string }
  | { action: 'command'; command: string };

interface ResponderResult {
  decision: ResponderDecision;
  ackMessage: string;
}

// Quick classifier prompt
function getClassifierPrompt(message: string, managers: Manager[], conversationHistory: string): string {
  const managerList = managers.length > 0
    ? managers.map(m => `- "${m.name}" (${m.status}): ${m.description} | Topics: ${m.topics.join(', ')}`).join('\n')
    : 'No managers currently active.';

  return `You are a message router. Classify this message and decide how to handle it.

## Active Managers
${managerList}
${conversationHistory}
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

/**
 * Validate that a manager name is valid (not undefined, null, or empty)
 */
function isValidManagerName(name: string | undefined | null): boolean {
  if (!name) return false;
  if (typeof name !== 'string') return false;
  const trimmed = name.trim().toLowerCase();
  if (trimmed === '') return false;
  if (trimmed === 'undefined') return false;
  if (trimmed === 'null') return false;
  return true;
}

/**
 * Generate a valid manager name from the message content
 */
function generateManagerName(message: string): string {
  // Extract key words from the message to create a meaningful name
  const words = message.toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !['this', 'that', 'with', 'from', 'have', 'been', 'would', 'could', 'should', 'about', 'there', 'where', 'what', 'when', 'will', 'your', 'they', 'them', 'their', 'some', 'more', 'also', 'just', 'like', 'make', 'want', 'need', 'please', 'help', 'thanks'].includes(w))
    .slice(0, 3);

  if (words.length >= 2) {
    return words.join('-');
  }

  // Fallback to timestamp-based name
  return `task-${Date.now().toString(36)}`;
}

// Parse classifier response
function parseClassifierResponse(output: string, message: string, managers: Manager[]): ResponderResult {
  try {
    let jsonStr = output;
    const jsonMatch = output.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    switch (parsed.action) {
      case 'create': {
        // Validate and sanitize manager name
        let managerName = parsed.managerName;
        if (!isValidManagerName(managerName)) {
          log(`[Responder] Invalid manager name "${managerName}", generating from message`);
          managerName = generateManagerName(message);
        }

        return {
          decision: {
            action: 'create',
            name: managerName,
            description: parsed.description || 'General purpose manager',
            topics: parsed.topics || [],
            message,
          },
          ackMessage: `Creating new manager "${managerName}" to handle this.`,
        };
      }

      case 'queue': {
        const queueManager = managers.find(m =>
          m.id === parsed.managerId ||
          m.name === parsed.managerName ||
          m.name === parsed.managerId
        );
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
        // Validate fallback name before using
        let fallbackName = parsed.managerName || parsed.managerId;
        if (!isValidManagerName(fallbackName)) {
          log(`[Responder] Invalid fallback name "${fallbackName}", generating from message`);
          fallbackName = generateManagerName(message);
        }
        return {
          decision: {
            action: 'create',
            name: fallbackName,
            description: parsed.description || 'General purpose manager',
            topics: parsed.topics || [],
            message,
          },
          ackMessage: `Creating new manager "${fallbackName}" (previous not found).`,
        };
      }

      case 'interrupt': {
        const interruptMgr = managers.find(m =>
          m.id === parsed.managerId ||
          m.name === parsed.managerName ||
          m.name === parsed.managerId
        );
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
        // Validate interrupt fallback name before using
        let interruptFallbackName = parsed.managerName || parsed.managerId;
        if (!isValidManagerName(interruptFallbackName)) {
          log(`[Responder] Invalid interrupt fallback name "${interruptFallbackName}", generating from message`);
          interruptFallbackName = `urgent-${generateManagerName(message)}`;
        }
        return {
          decision: {
            action: 'create',
            name: interruptFallbackName,
            description: 'Handles urgent requests',
            topics: [],
            message,
          },
          ackMessage: `Creating new manager "${interruptFallbackName}" for urgent request.`,
        };
      }

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

// Handle bot commands
async function handleCommand(chatId: number, command: string): Promise<boolean> {
  switch (command) {
    case '/status':
    case '/start': {
      const managers = getAllManagers();
      const active = managers.filter(m => m.status === 'processing').length;
      const idle = managers.filter(m => m.status === 'idle').length;
      const totalQueued = managers.reduce((sum, m) => sum + m.messageQueue.length, 0);

      let status = `🤖 *Claude Automation Bridge*\n\n`;
      status += `*Managers:* ${managers.length} total (${active} processing, ${idle} idle)\n`;
      status += `*Queued messages:* ${totalQueued}\n\n`;

      if (managers.length > 0) {
        status += `*Active Managers:*\n`;
        for (const m of managers) {
          const emoji = m.status === 'processing' ? '🔄' : '💤';
          status += `${emoji} ${m.name} - ${m.status}\n`;
        }
      }

      await sendTelegramMessage(chatId, status);
      return true;
    }

    case '/managers': {
      const managers = getAllManagers();
      if (managers.length === 0) {
        await sendTelegramMessage(chatId, '📋 No managers active. Send a message to create one!');
        return true;
      }

      let list = '📋 *Active Managers:*\n\n';
      for (const m of managers) {
        const emoji = m.status === 'processing' ? '🔄' : (m.status === 'idle' ? '💤' : '⏳');
        list += `${emoji} *${m.name}*\n`;
        list += `   ${m.description}\n`;
        list += `   Status: ${m.status} | Queue: ${m.messageQueue.length}\n\n`;
      }

      await sendTelegramMessage(chatId, list);
      return true;
    }

    case '/help': {
      const help = `🤖 *Claude Automation Bot*

I route your messages to specialized Claude agents (managers) that can:
• Build projects and features
• Run commands and scripts
• Check status of orchestrators
• Create and manage tasks

*Commands:*
/status - Show bridge status
/managers - List active managers
/help - Show this help

Just send any message and I'll route it to the right manager!`;

      await sendTelegramMessage(chatId, help);
      return true;
    }

    default:
      return false;
  }
}

// Main responder function
export async function handleIncomingMessage(chatId: number, message: string, userId?: number): Promise<void> {
  const sessionId = `resp_${Date.now()}`;
  const logPath = path.join(RESPONDER_SESSIONS_DIR, `${sessionId}.log`);

  log(`[Responder] Processing: "${message.substring(0, 50)}..."`);
  fs.appendFileSync(logPath, `[${new Date().toISOString()}] Message: ${message}\n`);
  fs.appendFileSync(logPath, `[ChatId] ${chatId}\n`);

  // Handle bot commands
  if (message.startsWith('/')) {
    const command = message.split(' ')[0].toLowerCase();
    if (await handleCommand(chatId, command)) {
      fs.appendFileSync(logPath, `[Command] Handled: ${command}\n`);
      return;
    }
  }

  // Get current managers
  const managers = getAllManagers();

  // Load conversation history
  const history = loadHistory();
  const conversationHistory = formatForPrompt(history);

  // Add the new user message to history
  addMessage('user', message);

  // Quick classification using Claude
  const prompt = getClassifierPrompt(message, managers, conversationHistory);

  try {
    const classifierOutput = await runQuickClassifier(prompt, logPath);
    fs.appendFileSync(logPath, `[Classifier Output] ${classifierOutput}\n`);

    const result = parseClassifierResponse(classifierOutput, message, managers);
    fs.appendFileSync(logPath, `[Decision] ${JSON.stringify(result.decision)}\n`);

    // Send ACK immediately
    log(`[Responder] ACK: ${result.ackMessage}`);
    await sendTelegramMessage(chatId, result.ackMessage);

    // Execute the decision
    await executeDecision(result.decision, chatId, logPath);

  } catch (err) {
    log(`[Responder] Error: ${err}`);
    fs.appendFileSync(logPath, `[Error] ${err}\n`);

    await sendTelegramMessage(chatId, `Error processing message. Creating fallback manager.`);

    const manager = createManager('general', 'Handles general requests', ['general']);
    const proc = spawnTelegramManager({ manager, initialMessage: message, chatId });
    setManagerProcess(manager.id, proc);
  }
}

// Run quick classifier
async function runQuickClassifier(prompt: string, logPath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let output = '';

    // Get configured model for responder
    const responderModel = getModel('responder');
    log(`[Responder] Using model: ${responderModel}`);

    const claude = spawn(
      'claude',
      ['--model', responderModel, '--dangerously-skip-permissions'],
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

    setTimeout(() => {
      claude.kill();
      reject(new Error('Classifier timeout'));
    }, 30000);
  });
}

// Execute the routing decision
async function executeDecision(decision: ResponderDecision, chatId: number, logPath: string): Promise<void> {
  switch (decision.action) {
    case 'create': {
      log(`[Responder] Creating manager: ${decision.name}`);
      const manager = createManager(decision.name, decision.description, decision.topics);
      const proc = spawnTelegramManager({ manager, initialMessage: decision.message, chatId });
      setManagerProcess(manager.id, proc);
      fs.appendFileSync(logPath, `[Execute] Created manager ${manager.id}\n`);
      break;
    }

    case 'queue': {
      log(`[Responder] Queuing to manager: ${decision.managerName}`);
      queueMessageToManager(decision.managerId, decision.message, 'normal');

      const manager = updateManager(decision.managerId, {});
      if (manager && manager.status === 'idle' && !isManagerRunning(decision.managerId)) {
        log(`[Responder] Manager idle, starting processing`);
        updateManager(decision.managerId, { status: 'active' });
        const proc = spawnTelegramManager({ manager, initialMessage: decision.message, chatId });
        setManagerProcess(manager.id, proc);
      }
      fs.appendFileSync(logPath, `[Execute] Queued to ${decision.managerId}\n`);
      break;
    }

    case 'interrupt': {
      log(`[Responder] Interrupting manager: ${decision.managerName}`);
      interruptManager(decision.managerId, decision.message, chatId);
      fs.appendFileSync(logPath, `[Execute] Interrupted ${decision.managerId}\n`);
      break;
    }

    case 'direct': {
      fs.appendFileSync(logPath, `[Execute] Direct response sent\n`);
      break;
    }
  }
}

// Get status summary
export function getResponderStatus(): string {
  const managers = getAllManagers();
  const active = managers.filter(m => m.status === 'processing').length;
  const idle = managers.filter(m => m.status === 'idle').length;
  const totalQueued = managers.reduce((sum, m) => sum + m.messageQueue.length, 0);

  return `Managers: ${managers.length} total (${active} processing, ${idle} idle)
Queued messages: ${totalQueued}

${getManagersSummary()}`;
}
