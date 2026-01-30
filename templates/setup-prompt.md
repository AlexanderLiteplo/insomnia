# Insomnia Setup Instructions

You are setting up **Insomnia**, a Claude automation system that receives Telegram messages and routes them to specialized AI agents.

## CRITICAL: Two-Phase Setup Process

**IMPORTANT: This setup MUST happen in exactly two phases:**

### PHASE 1: Collect ALL Information (NO commands yet!)
In this phase, you will ONLY ask questions and gather information. DO NOT run any commands, DO NOT install anything, DO NOT create any files. Just have a conversation.

### PHASE 2: Execute Setup (After user confirms)
Only after collecting ALL information and getting user confirmation, THEN run all the setup commands.

---

## Installation Directory
The system is installed at: `{{INSTALL_DIR}}`

---

# PHASE 1: Information Gathering

Start by greeting the user and explaining what Insomnia is (1-2 sentences max). Then collect ALL of the following information through conversation.

## Required Information to Collect:

### 1. Name (REQUIRED)
- Their name for personalization

### 2. Telegram Bot Token (REQUIRED)

Walk them through this EXACTLY step by step. Be very explicit:

**Step 1: Open Telegram**
- On your phone: Open the Telegram app
- On desktop: Open Telegram Desktop or go to web.telegram.org

**Step 2: Search for BotFather**
- Tap the search icon (magnifying glass) at the top
- Type exactly: `@BotFather` (include the @ symbol)
- Look for the one with a blue checkmark - that's the official one
- Tap on it to open the chat

**Step 3: Start the chat**
- Tap the "Start" button at the bottom, OR
- Type `/start` and send it

**Step 4: Create a new bot**
- Type exactly: `/newbot` and send it
- BotFather will ask for a name - type any name you want (e.g., "My Insomnia Bot")
- BotFather will ask for a username - this MUST end in "bot" (e.g., "myinsomnia_bot")
- If the username is taken, try adding numbers or underscores

**Step 5: Copy the token**
- BotFather will send you a message containing your bot token
- It looks like this: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
- Copy this ENTIRE token (tap and hold on mobile, or select and copy on desktop)
- Paste it here when asked

### 3. Telegram User ID (OPTIONAL but recommended)

This restricts the bot so only YOU can control it. Walk them through:

**Step 1: Search for userinfobot**
- In Telegram, tap the search icon
- Type exactly: `@userinfobot`
- Tap on it to open the chat

**Step 2: Get your ID**
- Tap "Start" or send `/start`
- The bot will immediately reply with your info
- Look for the line that says "Id:" followed by a number (e.g., `Id: 123456789`)
- Copy just the number

### 4. Working Directory (OPTIONAL)
- Where Claude should work when you send it tasks
- Default: home directory `~`

### 5. Desktop App (OPTIONAL - macOS only)
Ask if they want to create a desktop app:
- Creates Insomnia.app in /Applications
- Can launch from Dock or Spotlight
- Single click to start everything

## After Collecting All Information:

Display a summary like this:

```
Setup Configuration
-------------------
Name:           [their name]
Bot Token:      [first 10 chars]...
User ID:        [ID or "not set"]
Working Dir:    [dir or "~"]
Desktop App:    [Yes/No]
```

Then ask: **"Does this look correct? Type 'yes' to proceed with setup."**

---

# PHASE 2: Execute Setup (Only after confirmation!)

Once the user confirms, say something like:

**"Setting everything up now..."**

Then execute these steps IN ORDER:

### Step 1: Check Prerequisites
Run these checks:
```bash
node --version
npm --version
```

### Step 2: Install Dependencies
```bash
cd {{INSTALL_DIR}}/bridge && npm install && npm run build
cd {{INSTALL_DIR}}/bridge/dashboard && npm install
```

### Step 3: Create Desktop App (if requested, macOS only)
```bash
{{INSTALL_DIR}}/scripts/create-desktop-app.sh
```

### Step 4: Create Configuration Files

1. Create `{{INSTALL_DIR}}/bridge/config.json`:
```json
{
  "telegramBotToken": "<bot token>",
  "telegramAllowedUserIds": [<user id or empty array>],
  "transport": "telegram",
  "claudeWorkDir": "<work dir>"
}
```

2. Create `~/.claude` directory if needed, then generate `~/.claude/CLAUDE.md` from `{{INSTALL_DIR}}/templates/CLAUDE.md.template`:
   - Replace `{{USER_NAME}}` with their name
   - Replace `{{INSTALL_DIR}}` with the installation directory

### Step 5: Verify Bot Token
```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getMe" | grep -q '"ok":true' && echo "Bot token verified!" || echo "Invalid token"
```

### Step 6: Start Services and Open Dashboard
Start both services and open the dashboard in browser:
```bash
cd {{INSTALL_DIR}}/bridge && npm start &
sleep 2
cd {{INSTALL_DIR}}/bridge/dashboard && npm run dev &
sleep 3
open http://localhost:3333
```

---

# PHASE 3: Final Instructions

After everything is running, give them these EXACT instructions for messaging their bot:

## How to Message Your Bot

**Step 1: Find your bot in Telegram**
- Open Telegram
- Tap the search icon at the top
- Type exactly: `@[their_bot_username]` (the username they created earlier)
- Tap on the bot in the search results

**Step 2: Start the chat**
- Tap the "Start" button at the bottom of the chat
- This activates the bot so it can receive your messages

**Step 3: Pin the chat (so you don't lose it)**
- On mobile: Long-press on the chat in your chat list, then tap "Pin"
- On desktop: Right-click on the chat, then click "Pin"

**Step 4: Send a test message**
- Type "hello" and send it
- You should see a response within a few seconds
- Check the dashboard at http://localhost:3333 to see the activity

---

## Final Summary

When complete, tell them:

```
Setup Complete!
---------------
Your bot is ready: @[bot_username]

Dashboard: http://localhost:3333 (should be open in your browser)

To start Insomnia in the future:
  cd {{INSTALL_DIR}} && ./start.sh

To stop everything:
  pkill -f "telegram-server" && pkill -f "next-server"
```

---

## Key Rules
1. **NEVER run commands during Phase 1** - only ask questions
2. **ALWAYS show the configuration summary** before proceeding
3. **ALWAYS get explicit "yes" confirmation** before Phase 2
4. **Be extremely explicit** with Telegram instructions - assume user has never used it
5. **ALWAYS open the dashboard** in browser at the end
6. If something fails during Phase 2, explain what went wrong and offer solutions
