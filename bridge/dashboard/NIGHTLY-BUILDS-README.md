# Nightly Builds Feature

The nightly builds feature allows Claude to run automated improvements on your projects while you sleep.

## How It Works

1. **Configuration UI** - Configure via the dashboard at http://localhost:3333 (click the 🌙 button)
2. **Scheduler** - A background service checks every 15 minutes if it's time to run a build
3. **Build Execution** - When conditions are met, the scheduler triggers the API which spawns a Claude agent
4. **Briefing Generation** - After completion, Claude writes a briefing with a summary of changes

## Files

- `nightly-scheduler.js` - Main scheduler script (runs every 15 min)
- `nightly-scheduler-ctl.sh` - Control script to start/stop/check the scheduler
- `~/Library/LaunchAgents/com.insomnia.nightly-builds.plist` - macOS launchd configuration
- `~/.nightly-builds.json` - User configuration
- `~/.nightly-briefings.json` - Stored briefings

## Managing the Scheduler

```bash
# Check if scheduler is running
./nightly-scheduler-ctl.sh status

# Start scheduler
./nightly-scheduler-ctl.sh start

# Stop scheduler
./nightly-scheduler-ctl.sh stop

# Restart scheduler
./nightly-scheduler-ctl.sh restart

# View logs in real-time
./nightly-scheduler-ctl.sh logs

# Run a manual check (for testing)
./nightly-scheduler-ctl.sh test
```

## Configuration

Edit via the dashboard UI at http://localhost:3333:

- **Enable/Disable** - Turn nightly builds on/off
- **Build Time** - When to start the build (default: 02:00)
- **Wake-up Time** - When you expect the briefing ready (default: 08:00)
- **Model** - Which Claude model to use (haiku/sonnet/opus)
- **Custom Prompt** - Instructions for what to focus on
- **Features**:
  - Earnings Extraction - Pull daily earnings from Stripe, Gumroad, etc.
  - Priority Tasks - Fetch top tasks from orchestrator, human-tasks, GitHub
  - Manager Distribution - Automatically spawn managers and distribute tasks

## How the Scheduler Works

Every 15 minutes, the scheduler:

1. Reads `~/.nightly-builds.json`
2. Checks if nightly builds are enabled
3. Checks if current time has passed the scheduled build time
4. Checks if a build hasn't already run today
5. Ensures we're within the grace period (6 hours after scheduled time)
6. If all conditions met, triggers the API to start a build

## Troubleshooting

### Scheduler not running
```bash
./nightly-scheduler-ctl.sh start
```

### Build didn't trigger at scheduled time
1. Check scheduler logs: `./nightly-scheduler-ctl.sh logs`
2. Verify scheduler is running: `./nightly-scheduler-ctl.sh status`
3. Check config: `cat ~/.nightly-builds.json`
4. Ensure dashboard is running: `npm run dev` (port 3333)

### Manual trigger
You can always trigger a build manually from the dashboard UI by clicking "Run Now"

## Logs

- **Scheduler logs**: `~/Documents/insomnia/bridge/nightly-scheduler.log`
- **Scheduler stdout**: `~/Documents/insomnia/bridge/nightly-scheduler-stdout.log`
- **Scheduler stderr**: `~/Documents/insomnia/bridge/nightly-scheduler-stderr.log`

## Uninstalling

```bash
# Stop and unload the scheduler
launchctl unload ~/Library/LaunchAgents/com.insomnia.nightly-builds.plist

# Remove files
rm ~/Library/LaunchAgents/com.insomnia.nightly-builds.plist
rm ~/Documents/insomnia/bridge/dashboard/nightly-scheduler.js
rm ~/Documents/insomnia/bridge/dashboard/nightly-scheduler-ctl.sh
```
