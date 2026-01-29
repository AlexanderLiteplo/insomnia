#!/usr/bin/env node
/**
 * Interactive Setup Wizard for Claude Automation Bridge
 * Guides users through setting up the Telegram bot
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, execSync } from 'child_process';
import { TelegramBot } from './telegram';
import { saveConfig, loadConfig, DATA_DIR } from './config';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
}

function print(text: string): void {
  console.log(text);
}

async function main(): Promise<void> {
  print('');
  print('╔══════════════════════════════════════════════════════════════╗');
  print('║       🤖 Claude Automation Bridge Setup Wizard               ║');
  print('╚══════════════════════════════════════════════════════════════╝');
  print('');

  // Check existing config
  const existingConfig = loadConfig();
  if (existingConfig.telegramBotToken) {
    print('📋 Existing configuration detected:');
    print(`   Bot Token: ${existingConfig.telegramBotToken.substring(0, 10)}...`);
    print('');

    const overwrite = await question('Do you want to reconfigure? (y/n): ');
    if (overwrite.toLowerCase() !== 'y') {
      print('✅ Keeping existing configuration.');
      rl.close();
      return;
    }
    print('');
  }

  // Step 1: Create bot with BotFather
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  print('📱 STEP 1: Create a Telegram Bot');
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  print('');
  print('1. Open Telegram and search for @BotFather');
  print('2. Start a chat and send: /newbot');
  print('3. Follow the prompts:');
  print('   - Give your bot a name (e.g., "My Claude Assistant")');
  print('   - Give it a username ending in "bot" (e.g., "my_claude_bot")');
  print('4. BotFather will give you a token that looks like:');
  print('   123456789:ABCdefGHIjklMNOpqrsTUVwxyz');
  print('');

  // Get bot token
  const token = await question('Paste your bot token here: ');

  if (!token || !token.includes(':')) {
    print('');
    print('❌ Invalid token format. Token should contain a colon (:)');
    print('   Example: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz');
    rl.close();
    process.exit(1);
  }

  print('');
  print('🔍 Verifying token...');

  // Verify token
  const bot = new TelegramBot(token);
  let botInfo;

  try {
    botInfo = await bot.getMe();
    print(`✅ Connected successfully!`);
    print(`   Bot: @${botInfo.username} (${botInfo.first_name})`);
  } catch (err: any) {
    print('');
    print(`❌ Failed to connect: ${err.message}`);
    print('   Please check your token and try again.');
    rl.close();
    process.exit(1);
  }

  print('');

  // Step 2: Get user's Telegram ID (optional)
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  print('📱 STEP 2: Restrict Access (Optional)');
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  print('');
  print('You can restrict the bot to only respond to your Telegram account.');
  print('');
  print('To get your Telegram user ID:');
  print('1. Open Telegram and search for @userinfobot');
  print('2. Start a chat - it will show your ID');
  print('');

  const userIdInput = await question('Enter your Telegram user ID (or press Enter to skip): ');

  let allowedUserIds: number[] | undefined = undefined;
  if (userIdInput) {
    const userId = parseInt(userIdInput, 10);
    if (isNaN(userId)) {
      print('⚠️  Invalid user ID format, skipping restriction.');
    } else {
      allowedUserIds = [userId];
      print(`✅ Bot will only respond to user ID: ${userId}`);
    }
  } else {
    print('⚠️  No restriction set. Bot will respond to anyone who messages it.');
  }

  print('');

  // Save configuration
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  print('💾 Saving Configuration');
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  print('');

  saveConfig({
    telegramBotToken: token,
    telegramAllowedUserIds: allowedUserIds,
  });

  print('✅ Configuration saved to config.json');
  print('');

  // Step 3: Test the bot by sending a message
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  print('🧪 STEP 3: Test Your Bot');
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  print('');

  // Save the allowed user ID for test message
  let testChatId: number | null = null;
  if (allowedUserIds && allowedUserIds.length > 0) {
    testChatId = allowedUserIds[0];
    print('✅ Found your user ID for sending a test message');
  } else {
    print('⚠️  No user ID configured. To test the bot automatically:');
    print(`   1. Open Telegram and start a chat with @${botInfo.username}`);
    print('   2. Send any message to the bot');
    print('   3. This will establish the chat so we can send test messages');
    print('');
    const waitForChat = await question('Press Enter after you\'ve sent a message to the bot (or type "skip" to skip): ');

    if (waitForChat.toLowerCase() !== 'skip') {
      // Try to get the chat ID from recent updates
      print('🔍 Looking for your chat...');
      try {
        const updates = await bot.getUpdates({ timeout: 5, limit: 10 });
        if (updates.length > 0) {
          const recentMessage = updates[updates.length - 1].message;
          if (recentMessage?.chat?.id) {
            testChatId = recentMessage.chat.id;
            print(`✅ Found your chat! Chat ID: ${testChatId}`);
          }
        }
      } catch (err) {
        print('⚠️  Could not retrieve chat - skipping automatic test');
      }
    }
  }

  // Send test message if we have a chat ID
  if (testChatId) {
    print('');
    print('📤 Sending test message to Telegram...');
    try {
      await bot.sendMessage(testChatId,
        `🤖 *Insomnia Bot Setup Complete!*\n\n` +
        `Your Claude Automation Bridge is now configured and ready to use.\n\n` +
        `• Bot: @${botInfo.username}\n` +
        `• Status: ✅ Connected\n\n` +
        `Send me a message to get started!`,
        { parse_mode: 'Markdown' }
      );
      print('✅ Test message sent successfully! Check your Telegram.');
    } catch (err: any) {
      print(`⚠️  Could not send test message: ${err.message}`);
      print('   You may need to start a chat with the bot first.');
    }
  }

  print('');

  // Step 4: Start the bridge
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  print('🚀 STEP 4: Start the Telegram Bridge');
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  print('');

  const startNow = await question('Would you like to start the bridge now? (Y/n): ');

  if (startNow.toLowerCase() !== 'n') {
    print('');
    print('🔄 Starting the Telegram bridge in the background...');
    print('');

    try {
      // Kill any existing bridge process first
      try {
        execSync('pkill -f "node dist/telegram-server.js"', { stdio: 'ignore' });
        // Remove stale lock file
        const lockFile = path.join(DATA_DIR, '.bridge.lock');
        if (fs.existsSync(lockFile)) {
          fs.unlinkSync(lockFile);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch {
        // No existing process, that's fine
      }

      // Start the bridge in background
      const bridgeProcess = spawn('node', ['dist/telegram-server.js'], {
        cwd: DATA_DIR,
        detached: true,
        stdio: ['ignore', 'ignore', 'ignore'],
      });
      bridgeProcess.unref();

      // Wait a moment and verify it started
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if bridge is running
      try {
        const result = execSync('ps aux | grep "node dist/telegram-server.js" | grep -v grep', { encoding: 'utf8' });
        if (result) {
          print('✅ Telegram bridge started successfully!');
          print('');
          print('The bridge is now running in the background.');
        }
      } catch {
        print('⚠️  Bridge may not have started. Check logs with:');
        print('   tail -f ~/claude-automation-system/bridge/bridge.log');
      }
    } catch (err: any) {
      print(`❌ Failed to start bridge: ${err.message}`);
      print('');
      print('You can start it manually with:');
      print('   cd ~/claude-automation-system/bridge && npm start');
    }
  }

  print('');
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  print('✅ Setup Complete!');
  print('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  print('');
  print('📱 Your bot: https://t.me/' + botInfo.username);
  print('');
  print('╔═══════════════════════════════════════════════════════════════╗');
  print('║  QUICK REFERENCE                                              ║');
  print('╠═══════════════════════════════════════════════════════════════╣');
  print('║  Start bridge:     npm start                                  ║');
  print('║  Check status:     npm run status                             ║');
  print('║  View logs:        tail -f bridge.log                         ║');
  print('║  Restart bridge:   pkill -f telegram-server && npm start      ║');
  print('║  Dashboard:        http://localhost:3333                      ║');
  print('╚═══════════════════════════════════════════════════════════════╝');
  print('');
  print('📊 Monitor your system at the Claude Dashboard:');
  print('   cd ~/claude-automation-system/bridge/dashboard && npm run dev');
  print('');

  rl.close();
}

// Handle errors
process.on('unhandledRejection', (err) => {
  console.error('Error:', err);
  process.exit(1);
});

main().catch((err) => {
  console.error('Setup failed:', err);
  process.exit(1);
});
