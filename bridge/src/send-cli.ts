#!/usr/bin/env node
import { loadConfig } from './config';
import { sendMessage } from './imessage';

const config = loadConfig();
const message = process.argv.slice(2).join(' ');

if (!message) {
  console.error('Usage: node send-cli.js "Your message"');
  process.exit(1);
}

const recipient = config.yourPhoneNumber || config.yourEmail;

if (!recipient) {
  console.error('ERROR: No recipient configured');
  process.exit(1);
}

sendMessage(recipient, message)
  .then(() => {
    console.log(`✅ iMessage sent to ${recipient}`);
    process.exit(0);
  })
  .catch((err) => {
    console.error(`❌ Failed: ${err.message}`);
    process.exit(1);
  });
