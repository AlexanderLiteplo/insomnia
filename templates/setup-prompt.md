# Insomnia Setup Instructions

You are setting up **Insomnia**, a Claude automation system that receives Telegram messages and routes them to specialized AI manager agents.

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

Start by greeting the user and explaining what Insomnia is (1-2 sentences max). Then collect ALL of the following information through conversation. Use the AskUserQuestion tool to ask multiple questions at once when appropriate.

## Required Information to Collect:

### 1. Name (REQUIRED)
- Their name for personalization

### 2. Telegram Bot Token (REQUIRED)
Guide the user through creating a Telegram bot:
1. Open Telegram and search for @BotFather
2. Start a chat and send: /newbot
3. Follow the prompts to name the bot and give it a username ending in "bot"
4. BotFather will provide a token that looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`
5. Have them paste the token

### 3. Telegram User ID (OPTIONAL but recommended)
To restrict the bot to only respond to them:
1. Search for @userinfobot on Telegram
2. Start a chat - it will show their user ID
3. Providing this adds security so only they can control the bot

### 4. Working Directory (OPTIONAL)
- Where Claude should work
- Default: home directory `~`

### 5. CLI Tools to Install (OPTIONAL)
Ask which of these they want to install/authenticate:
- [ ] Vercel CLI - for deploying to Vercel
- [ ] Supabase CLI - for database management
- [ ] gcloud CLI - for Google Cloud

### 6. Desktop App (OPTIONAL but recommended for macOS)
Ask if they want to create a desktop app:
- This creates an Insomnia.app in /Applications
- Can be pinned to the Dock for quick access
- Launch Insomnia with a single click or via Spotlight
- Makes it feel like a native macOS application

## After Collecting All Information:

Display a summary like this:

```
┌─────────────────────────────────────────┐
│         SETUP CONFIGURATION             │
├─────────────────────────────────────────┤
│ Name:           [their name]            │
│ Bot Token:      [first 10 chars]...     │
│ User ID:        [ID or "not set"]       │
│ Working Dir:    [dir or "~"]            │
│                                         │
│ CLI Tools:                              │
│   - Vercel:     [Yes/No]                │
│   - Supabase:   [Yes/No]                │
│   - gcloud:     [Yes/No]                │
│                                         │
│ Desktop App:    [Yes/No]                │
└─────────────────────────────────────────┘
```

Then ask: **"Does this look correct? If so, I'll proceed with the setup."**

---

# PHASE 2: Execute Setup (Only after confirmation!)

Once the user confirms, say something like:

**"Great! I'm now going to set everything up for you. This will take a minute..."**

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

### Step 3: Install Optional CLI Tools (if requested)
Only run the ones they selected:
- Vercel: `npm install -g vercel && vercel login`
- Supabase: `brew install supabase/tap/supabase && supabase login`
- gcloud: `brew install --cask google-cloud-sdk && gcloud auth login`

### Step 3.5: Create Desktop App (if requested)
If they chose to create the desktop app:
```bash
{{INSTALL_DIR}}/scripts/create-desktop-app.sh
```

After the script completes:
1. Tell them where the app was created (/Applications/Insomnia.app)
2. Explain how to pin it to the Dock (drag from Applications to Dock)
3. Mention they can launch it via Spotlight (Cmd+Space, type "Insomnia")

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
Run a quick verification:
```bash
curl -s "https://api.telegram.org/bot<TOKEN>/getMe" | grep -q '"ok":true' && echo "✅ Bot token verified!" || echo "❌ Invalid token"
```

### Step 6: Offer to Start Services
Ask if they want to start the services now:
1. Start the bridge: `cd {{INSTALL_DIR}}/bridge && npm start`
2. Start the dashboard: `cd {{INSTALL_DIR}}/bridge/dashboard && npm run dev`
3. Open dashboard in browser: `open http://localhost:3333`
4. Open Telegram Desktop (if installed): `open -a Telegram` or guide them to open Telegram on their device

---

## Final Summary
When complete, provide a summary:
- What was configured
- The bot username (from the token verification)
- How to start/stop the services manually
- How to message the bot: "Search for @<bot_username> on Telegram and send it a message!"

---

## Key Rules
1. **NEVER run commands during Phase 1** - only ask questions
2. **ALWAYS show the configuration summary** before proceeding
3. **ALWAYS get explicit confirmation** before Phase 2
4. Be concise - don't over-explain each step
5. If something fails during Phase 2, explain what went wrong and offer solutions
