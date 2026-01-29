import { spawn } from 'child_process';
import { addMessage } from './history';
import { log } from './logger';
import { markMessageSent } from './state';

const CLAUDE_PREFIX = '[Claude]';

export function sendMessage(recipient: string, message: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const prefixedMessage = `${CLAUDE_PREFIX} ${message}`;
    const escaped = prefixedMessage.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    const script = `
tell application "Messages"
    set targetService to 1st account whose service type = iMessage
    set targetBuddy to participant "${recipient}" of targetService
    send "${escaped}" to targetBuddy
end tell
`;

    const osascript = spawn('osascript', ['-']);
    osascript.stdin.write(script);
    osascript.stdin.end();

    osascript.on('close', (code) => {
      if (code === 0) {
        addMessage('assistant', message);
        markMessageSent(message);  // Track sent message to filter iCloud sync echoes
        log(`iMessage sent to ${recipient}`);
        resolve();
      } else {
        reject(new Error(`AppleScript exited with code ${code}`));
      }
    });

    osascript.stderr.on('data', (data) => {
      log(`AppleScript error: ${data}`);
    });
  });
}

export function extractTextFromAttributedBody(blob: Buffer | null): string | null {
  if (!blob) return null;

  try {
    const str = blob.toString('utf8');

    // Method 1: Extract after "streamtyped" marker
    const streamMatch = str.match(/streamtyped[^\x00-\x1F]*?([\x20-\x7E]{10,})/);
    if (streamMatch?.[1]) {
      let text = streamMatch[1];
      text = text.replace(/NS(Attributed|Mutable|Object|String|Dictionary|Number|Value|Array|Data).*$/i, '').trim();
      text = text.replace(/^\+[0-9A-Za-z]/, '').trim();
      if (text.length > 5 && !text.includes('__kIM')) {
        return text;
      }
    }

    // Method 2: Find longest readable string
    const matches = str.match(/[\x20-\x7E]{10,}/g);
    if (matches?.length) {
      const filtered = matches.filter(
        (m) =>
          !m.includes('NSAttributedString') &&
          !m.includes('NSMutableString') &&
          !m.includes('NSObject') &&
          !m.includes('NSString') &&
          !m.includes('NSDictionary') &&
          !m.includes('NSNumber') &&
          !m.includes('NSValue') &&
          !m.includes('NSArray') &&
          !m.includes('NSData') &&
          !m.includes('__kIM') &&
          !m.includes('DDScanner') &&
          !m.includes('bplist') &&
          !m.includes('streamtyped') &&
          m.length > 5
      );

      if (filtered.length) {
        return filtered.sort((a, b) => b.length - a.length)[0].trim();
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function isClaudeMessage(text: string): boolean {
  // Check if message contains the Claude prefix anywhere (handles corrupted/prefixed messages)
  if (text.includes(CLAUDE_PREFIX)) {
    return true;
  }

  // Also check for messages that are clearly Claude's responses (fragments of previous responses)
  // These can appear when iCloud syncs back outgoing messages with is_from_me = 0
  // and the [Claude] prefix gets stripped or corrupted
  const claudeResponsePatterns = [
    /^[+\x00-\x1F]*\[Claude\]/,  // Prefix possibly corrupted with control chars
    /Worker.*Sonnet.*building/i,
    /Manager.*Opus.*review/i,
    /tasks? (queued|done|completed|in progress)/i,
    /requirements? queued/i,  // "All your requirements queued" is Claude's response
    /iMessage sent to/i,
    /^\d+\/\d+ tasks? (done|completed)/i,
    /orchestrator.*start/i,
    /Building!/i,
    // Detect fragments that look like Claude's bulleted responses
    /^[✅⏳🔄🔨📊📋🚀💡]+\s*(Task|Done|Worker|Manager|Building|Updated|Added|Created|Fixed)/i,
    /^(Landing page|Countdown timer|Time-saving|Testimonials|Sale pricing|money-back guarantee)/i,
    /Currently:?\s*(working on|building|setting up)/i,
    /^(Yep|Yes|Got it|Done|Updated|Added|Perfect)!?\s/i,
    /Worker iteration:?\s*\d+/i,
    /Manager reviews?:?\s*\d+/i,
    /Still building/i,
    /will (ping|update|keep) you/i,
    /requirements? for task/i,
    // Detect fragments that start mid-sentence (iCloud sync echoes)
    /^,\s/,  // Starts with comma
    /^(awaiting|should|tests passing)/i,  // Fragment starts
    /^\.\s*(Manager|Worker|Task|Next)/i,  // Sentence fragment
    /managerReview.*empty/i,
    /should (finish|be approved|pick it up)/i,
    /any minute/i,
  ];

  for (const pattern of claudeResponsePatterns) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}
