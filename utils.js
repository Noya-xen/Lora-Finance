// ============================================================
// Lora Finance Bot - Utility Functions
// ============================================================

import chalk from 'chalk';

// ── Logger ───────────────────────────────────────────────────

function timestamp() {
  return new Date().toLocaleString('id-ID', { hour12: false });
}

export const log = {
  info: (tag, msg) => console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.cyan(`[${tag}]`)} ${msg}`),
  success: (tag, msg) => console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.green(`[${tag}]`)} ${chalk.green(msg)}`),
  warn: (tag, msg) => console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.yellow(`[${tag}]`)} ${chalk.yellow(msg)}`),
  error: (tag, msg) => console.log(`${chalk.gray(`[${timestamp()}]`)} ${chalk.red(`[${tag}]`)} ${chalk.red(msg)}`),
  divider: () => console.log(chalk.gray('─'.repeat(60))),
  banner: (msg) => {
    console.log('');
    console.log(chalk.cyan.bold(`╔${'═'.repeat(58)}╗`));
    console.log(chalk.cyan.bold(`║  ${msg.padEnd(56)}║`));
    console.log(chalk.cyan.bold(`╚${'═'.repeat(58)}╝`));
    console.log('');
  },
};

// ── Delay Helpers ────────────────────────────────────────────

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function randomDelay(minMs, maxMs) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return sleep(delay);
}

// ── Retry Wrapper ────────────────────────────────────────────

export async function retry(fn, label, maxRetries = 3, baseDelayMs = 5000) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const errMsg = err?.shortMessage || err?.message || String(err);
      if (attempt < maxRetries) {
        const delay = baseDelayMs * attempt;
        log.warn(label, `Attempt ${attempt}/${maxRetries} failed: ${errMsg}`);
        log.warn(label, `Retrying in ${(delay / 1000).toFixed(0)}s...`);
        await sleep(delay);
      } else {
        log.error(label, `All ${maxRetries} attempts failed: ${errMsg}`);
        throw err;
      }
    }
  }
}

// ── Address Formatting ───────────────────────────────────────

export function shortAddr(address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatEther(wei) {
  const num = Number(wei) / 1e18;
  return num.toFixed(6);
}

// ── Time Formatting ──────────────────────────────────────────

export function formatDuration(ms) {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${hours}h ${minutes}m ${seconds}s`;
}

// ── Proxy Handling ───────────────────────────────────────────
import { readFileSync } from 'fs';
import nodeFetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { DEFAULTS } from './config.js';

let proxies = [];
try {
  const content = readFileSync(DEFAULTS.PROXIES_FILE || 'proxies.txt', 'utf-8');
  proxies = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
} catch (err) {
  // proxies.txt not found or empty
}

export function getProxiesCount() {
  return proxies.length;
}

export function getProxyForIndex(index) {
  if (proxies.length === 0) return null;
  return proxies[index % proxies.length];
}

export async function fetchWithProxy(url, options = {}, proxyUrl = null) {
  if (proxyUrl) {
    options.agent = new HttpsProxyAgent(proxyUrl);
  }
  return nodeFetch(url, options);
}
