#!/usr/bin/env bun
/**
 * Export Insomnia message history to markdown files for qmd indexing
 */

import { readdir, readFile, writeFile, mkdir } from 'fs/promises';
import { join, basename } from 'path';

const BRIDGE_DIR = '/Users/alexander/Documents/insomnia/bridge';
const OUTPUT_DIR = join(BRIDGE_DIR, 'searchable-history');

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ConversationHistory {
  messages: Message[];
}

async function exportConversationHistory() {
  const historyFile = join(BRIDGE_DIR, '.conversation-history.json');
  try {
    const content = await readFile(historyFile, 'utf-8');
    const history: ConversationHistory = JSON.parse(content);

    // Group messages by date
    const messagesByDate = new Map<string, Message[]>();

    for (const msg of history.messages) {
      const date = new Date(msg.timestamp).toISOString().split('T')[0];
      if (!messagesByDate.has(date)) {
        messagesByDate.set(date, []);
      }
      messagesByDate.get(date)!.push(msg);
    }

    // Write each date as a markdown file
    for (const [date, messages] of messagesByDate) {
      let md = `# Telegram Conversation - ${date}\n\n`;
      for (const msg of messages) {
        const time = new Date(msg.timestamp).toLocaleTimeString();
        const role = msg.role === 'user' ? '👤 Alexander' : '🤖 Claude';
        md += `## ${role} (${time})\n\n${msg.content}\n\n---\n\n`;
      }

      await writeFile(join(OUTPUT_DIR, `telegram-${date}.md`), md);
    }

    console.log(`Exported ${messagesByDate.size} conversation files`);
  } catch (e) {
    console.error('Error exporting conversation history:', e);
  }
}

async function exportManagerSessions() {
  const sessionsDir = join(BRIDGE_DIR, 'manager-sessions');
  const outputDir = join(OUTPUT_DIR, 'sessions');
  await mkdir(outputDir, { recursive: true });

  try {
    const files = await readdir(sessionsDir);
    const logFiles = files.filter(f => f.endsWith('.log'));

    for (const file of logFiles) {
      const content = await readFile(join(sessionsDir, file), 'utf-8');
      if (!content.trim()) continue;

      // Extract manager ID and timestamp from filename
      const match = file.match(/mgr_(\d+)_(\d+)\.log/);
      if (!match) continue;

      const [, managerId, sessionId] = match;
      const date = new Date(parseInt(sessionId)).toISOString().split('T')[0];
      const time = new Date(parseInt(sessionId)).toLocaleTimeString();

      let md = `# Manager Session - ${date} ${time}\n\n`;
      md += `**Manager ID:** ${managerId}\n`;
      md += `**Session ID:** ${sessionId}\n\n`;
      md += `## Session Log\n\n`;
      md += '```\n' + content + '\n```\n';

      const outputFile = `session-${managerId}-${sessionId}.md`;
      await writeFile(join(outputDir, outputFile), md);
    }

    console.log(`Exported ${logFiles.length} session files`);
  } catch (e) {
    console.error('Error exporting manager sessions:', e);
  }
}

async function exportManagerRegistry() {
  const registryFile = join(BRIDGE_DIR, '.manager-registry.json');
  try {
    const content = await readFile(registryFile, 'utf-8');
    const registry = JSON.parse(content);

    let md = `# Manager Registry\n\n`;
    md += `*Last updated: ${new Date().toISOString()}*\n\n`;

    if (registry.managers) {
      md += `## Active Managers\n\n`;
      for (const [name, manager] of Object.entries(registry.managers) as any) {
        md += `### ${name}\n\n`;
        md += `- **ID:** ${manager.id}\n`;
        md += `- **Topics:** ${manager.topics?.join(', ') || 'none'}\n`;
        md += `- **Status:** ${manager.status}\n`;
        md += `- **Created:** ${manager.createdAt}\n\n`;
      }
    }

    await writeFile(join(OUTPUT_DIR, 'manager-registry.md'), md);
    console.log('Exported manager registry');
  } catch (e) {
    console.error('Error exporting manager registry:', e);
  }
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  console.log('Exporting Insomnia message history for qmd indexing...\n');

  await exportConversationHistory();
  await exportManagerSessions();
  await exportManagerRegistry();

  console.log('\nDone! Files exported to:', OUTPUT_DIR);
  console.log('\nTo index with qmd, run:');
  console.log(`  qmd collection add "${OUTPUT_DIR}" --name insomnia-history --mask "**/*.md"`);
}

main();
