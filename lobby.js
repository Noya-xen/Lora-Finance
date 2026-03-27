// ============================================================
// Lora Finance — Lobby/Waitlist Social Tasks
// For accounts NOT yet on the waitlist
// Completes Follow + Repost to get in the queue
// ============================================================

import 'dotenv/config';
import { readFileSync } from 'fs';
import { ethers } from 'ethers';
import {
  API_BASE, SIGN_MESSAGE,
} from './config.js';
import {
  log, sleep, randomDelay, shortAddr,
} from './utils.js';

// ============================================================
// Lobby Tasks
// ============================================================

const LOBBY_TASKS = [
  { id: 'follow', name: 'Follow Lora Finance', description: 'Follow our X' },
  { id: 'repost', name: 'Repost Lora Finance', description: 'Repost our latest post' },
];

// ============================================================
// Wallet Loader (one PK per line from accounts.txt)
// ============================================================

function loadWallets() {
  let keys = [];

  // Try accounts.txt first
  try {
    const content = readFileSync('accounts.txt', 'utf-8');
    keys = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
    if (keys.length > 0) {
      log.info('SETUP', `Loaded ${keys.length} key(s) from accounts.txt`);
    }
  } catch {
    // Fall back to .env
  }

  // Fall back to .env PRIVATE_KEYS
  if (keys.length === 0) {
    const raw = process.env.PRIVATE_KEYS || '';
    keys = raw.split(/[,\n]/).map(k => k.trim()).filter(Boolean);
  }

  if (keys.length === 0) {
    log.error('SETUP', 'No private keys found! Add keys to accounts.txt or PRIVATE_KEYS in .env');
    process.exit(1);
  }

  return keys.map(key => {
    const pk = key.startsWith('0x') ? key : `0x${key}`;
    return new ethers.Wallet(pk);
  });
}

// ============================================================
// Authentication (works for both whitelisted & non-whitelisted)
// ============================================================

async function authenticate(wallet, tag) {
  const address = wallet.address.toLowerCase();

  log.info(tag, 'Authenticating...');
  const signature = await wallet.signMessage(SIGN_MESSAGE);

  const resp = await fetch(`${API_BASE}/api/checkpoint/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': API_BASE,
      'Referer': `${API_BASE}/checkpoint`,
    },
    body: JSON.stringify({ address, signature, message: SIGN_MESSAGE }),
  });

  const body = await resp.json().catch(() => ({}));
  const setCookies = resp.headers.getSetCookie?.() || [];
  let authCookie = '';

  for (const cookie of setCookies) {
    if (cookie.startsWith('lora_testnet_wallet_auth=')) {
      authCookie = cookie.split(';')[0];
      break;
    }
  }

  // For non-whitelisted: status=403, body has jwt + "Address not whitelisted"
  // For whitelisted: status=200, cookie is set
  // Both cases set the cookie, which is what we need

  if (!authCookie && body.jwt) {
    authCookie = `lora_testnet_wallet_auth=${body.jwt}`;
  }

  if (!authCookie) {
    throw new Error('No auth cookie received');
  }

  const isWhitelisted = resp.status === 200 || body.whitelisted === true;

  if (isWhitelisted) {
    log.success(tag, '✅ Already whitelisted! Use index.js for daily tasks.');
  } else {
    log.warn(tag, '⏳ Not yet whitelisted — completing lobby tasks...');
  }

  return { authCookie, isWhitelisted };
}

// ============================================================
// Complete Lobby Tasks
// ============================================================

async function completeLobbyTasks(wallet, authCookie, tag) {
  const address = wallet.address.toLowerCase();

  const headers = {
    'Content-Type': 'application/json',
    'Cookie': authCookie,
    'Referer': `${API_BASE}/checkpoint/lobby`,
    'Origin': API_BASE,
  };

  let allCompleted = true;

  for (const task of LOBBY_TASKS) {
    try {
      log.info(tag, `  📋 ${task.name}: ${task.description}`);

      // Submit the task via POST
      const resp = await fetch(`${API_BASE}/api/points/social/twitter/${task.id}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ address }),
      });

      const result = await resp.json().catch(() => ({}));

      if (resp.ok && (result.completed || result.following)) {
        log.success(tag, `     ✅ ${task.name}: ${result.message || 'Done!'}`);
      } else if (resp.ok) {
        log.info(tag, `     📌 ${task.name}: ${JSON.stringify(result)}`);
      } else {
        log.warn(tag, `     ⚠️ ${task.name}: ${resp.status} - ${result.message || JSON.stringify(result)}`);
        allCompleted = false;
      }

      // Anti-bot delay
      await randomDelay(2000, 5000);

    } catch (err) {
      log.error(tag, `     ❌ ${task.name}: ${err?.message || err}`);
      allCompleted = false;
    }
  }

  return allCompleted;
}

// ============================================================
// Main
// ============================================================

async function main() {
  log.banner('LORA FINANCE — LOBBY WAITLIST BOT');
  log.info('SETUP', 'This script completes Follow + Repost tasks for accounts NOT yet on the waitlist.');
  log.info('SETUP', 'Once on the waitlist, use index.js for daily tasks.');
  log.divider();

  const wallets = loadWallets();

  let whitelistedCount = 0;
  let completedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < wallets.length; i++) {
    const wallet = wallets[i];
    const tag = `Account ${i + 1}/${wallets.length}`;
    const addr = shortAddr(wallet.address);

    log.divider();
    log.info(tag, `Processing ${addr} (${wallet.address})`);

    try {
      // Step 1: Authenticate
      const { authCookie, isWhitelisted } = await authenticate(wallet, tag);

      if (isWhitelisted) {
        whitelistedCount++;
        log.info(tag, `Skipping ${addr} — already whitelisted ✓`);
        continue;
      }

      // Step 2: Complete lobby tasks
      const success = await completeLobbyTasks(wallet, authCookie, tag);

      if (success) {
        completedCount++;
        log.success(tag, `🎉 All lobby tasks completed for ${addr}!`);
        log.info(tag, 'You are now in the queue. Wait for Lora to whitelist your wallet.');
      } else {
        failedCount++;
        log.warn(tag, `Some tasks may have failed for ${addr}`);
      }

    } catch (err) {
      failedCount++;
      log.error(tag, `Error: ${err?.message || err}`);
    }

    // Delay between wallets
    if (i < wallets.length - 1) {
      const delay = Math.floor(Math.random() * 10000) + 5000;
      log.info('DELAY', `Waiting ${(delay / 1000).toFixed(0)}s before next account...`);
      await sleep(delay);
    }
  }

  // Summary
  log.divider();
  log.banner('SUMMARY');
  log.info('RESULT', `Total accounts: ${wallets.length}`);
  log.success('RESULT', `Already whitelisted: ${whitelistedCount}`);
  log.success('RESULT', `Lobby tasks completed: ${completedCount}`);
  if (failedCount > 0) {
    log.error('RESULT', `Failed: ${failedCount}`);
  }
  log.divider();
  log.info('NEXT', 'Once whitelisted, run: node index.js');
}

main().catch(err => {
  log.error('FATAL', err?.message || err);
  process.exit(1);
});
