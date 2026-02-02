#!/usr/bin/env node
/**
 * Nightly Builds Scheduler
 *
 * This script runs periodically to check if a nightly build should be triggered.
 * It reads the config and triggers a build if:
 * 1. Nightly builds are enabled
 * 2. Current time has passed the scheduled build time
 * 3. A build hasn't already run today
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const BRIDGE_DIR = path.join(process.env.HOME, 'Documents', 'insomnia', 'bridge');
const CONFIG_PATH = path.join(BRIDGE_DIR, '.nightly-builds.json');
const LOG_PATH = path.join(BRIDGE_DIR, 'nightly-scheduler.log');

function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}\n`;
  console.log(logMessage.trim());
  fs.appendFileSync(LOG_PATH, logMessage);
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    log('Config file not found, skipping check');
    return null;
  }

  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    log(`Error loading config: ${err.message}`);
    return null;
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

function calculateNextRun(buildTime, enabled) {
  if (!enabled) return null;

  const [hours, minutes] = buildTime.split(':').map(Number);
  const now = new Date();
  const next = new Date();

  next.setHours(hours, minutes, 0, 0);

  // If the time has passed today, schedule for tomorrow
  if (next <= now) {
    next.setDate(next.getDate() + 1);
  }

  return next.toISOString();
}

function shouldRunBuild(config) {
  if (!config || !config.enabled) {
    return false;
  }

  const now = new Date();
  const [hours, minutes] = config.buildTime.split(':').map(Number);
  const scheduledTime = new Date();
  scheduledTime.setHours(hours, minutes, 0, 0);

  // Check if we've passed the scheduled time today
  if (now < scheduledTime) {
    log(`Not yet time for build. Scheduled: ${scheduledTime.toLocaleString()}, Current: ${now.toLocaleString()}`);
    return false;
  }

  // Check if we already ran today
  if (config.lastRun) {
    const lastRun = new Date(config.lastRun);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    if (lastRun >= todayStart) {
      log(`Build already ran today at ${lastRun.toLocaleString()}`);
      return false;
    }
  }

  // Check that we're not too far past the build time (grace period of 6 hours)
  const gracePeriodEnd = new Date(scheduledTime);
  gracePeriodEnd.setHours(gracePeriodEnd.getHours() + 6);

  if (now > gracePeriodEnd) {
    log(`Past grace period. Scheduled: ${scheduledTime.toLocaleString()}, Grace ends: ${gracePeriodEnd.toLocaleString()}`);
    return false;
  }

  return true;
}

async function triggerBuild(config) {
  log('Triggering nightly build via API...');

  try {
    // Use curl to trigger the build via the dashboard API
    const apiUrl = 'http://localhost:3333/api/nightly-builds';

    // First, get CSRF token
    const tokenResponse = await new Promise((resolve, reject) => {
      const tokenProc = spawn('curl', [
        '-s',
        'http://localhost:3333/api/csrf'
      ]);

      let output = '';
      tokenProc.stdout.on('data', (data) => {
        output += data.toString();
      });

      tokenProc.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Failed to get CSRF token, exit code: ${code}`));
        }
      });
    });

    const { token } = JSON.parse(tokenResponse);

    // Trigger the build
    const buildProc = spawn('curl', [
      '-s',
      '-X', 'POST',
      '-H', 'Content-Type: application/json',
      '-H', `x-csrf-token: ${token}`,
      apiUrl
    ]);

    let buildOutput = '';
    buildProc.stdout.on('data', (data) => {
      buildOutput += data.toString();
    });

    buildProc.on('close', (code) => {
      if (code === 0) {
        log('Build triggered successfully via API');
        log(`Response: ${buildOutput}`);

        // Update config
        config.lastRun = new Date().toISOString();
        config.nextRun = calculateNextRun(config.buildTime, config.enabled);
        saveConfig(config);
      } else {
        log(`Failed to trigger build, exit code: ${code}`);
      }
    });

  } catch (err) {
    log(`Error triggering build: ${err.message}`);
  }
}

// Main execution
log('=== Nightly Build Scheduler Check ===');

const config = loadConfig();

if (shouldRunBuild(config)) {
  log('Conditions met, triggering build...');
  triggerBuild(config);
} else {
  log('No build needed at this time');
}

log('=== Check Complete ===\n');
