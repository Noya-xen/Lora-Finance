// ============================================================
// Lora Finance Testnet Airdrop Bot v3
// Daily Faucet + Social Tasks + Rent Up Automation
// ============================================================

import 'dotenv/config';
import { readFileSync } from 'fs';
import { ethers } from 'ethers';
import {
  NETWORK, CONTRACTS, DEFAULTS, API_BASE, SOCIAL_TASKS,
  FAUCET_ABI, MARKET_ABI, WETHX_ABI,
  SUPERFLUID_HOST_ABI, CFA_ABI,
  SIGN_MESSAGE,
} from './config.js';
import {
  log, sleep, randomDelay, retry,
  shortAddr, formatEther, formatDuration,
  fetchWithProxy, getProxyForIndex, getProxiesCount
} from './utils.js';

// ============================================================
// Provider & Wallet Setup
// ============================================================

function getProvider() {
  return new ethers.JsonRpcProvider(NETWORK.rpc, {
    name: NETWORK.name,
    chainId: NETWORK.chainId,
  });
}

function getWallets(provider) {
  // Try accounts.txt first (one PK per line), fall back to .env PRIVATE_KEYS
  let keys = [];

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
    // accounts.txt not found, try .env
  }

  if (keys.length === 0) {
    const raw = process.env.PRIVATE_KEYS || '';
    keys = raw.split(/[,\n]/).map(k => k.trim()).filter(Boolean);
  }

  if (keys.length === 0) {
    log.error('SETUP', 'No private keys found! Add keys to accounts.txt (one per line) or PRIVATE_KEYS in .env');
    process.exit(1);
  }

  return keys.map(key => {
    const pk = key.startsWith('0x') ? key : `0x${key}`;
    return new ethers.Wallet(pk, provider);
  });
}

// ============================================================
// Authentication Module (Wallet Signature → JWT Cookie)
// ============================================================

const sessionCache = new Map(); // address → { cookie, expires }

async function authenticate(wallet, tag, proxyUrl) {
  const address = wallet.address.toLowerCase();

  // Check cache
  const cached = sessionCache.get(address);
  if (cached && cached.expires > Date.now()) {
    log.info(tag, 'Using cached session ✓');
    return cached.cookie;
  }

  log.info(tag, 'Authenticating with Lora Finance...');

  // Sign the checkpoint message
  const signature = await wallet.signMessage(SIGN_MESSAGE);

  // POST to checkpoint verify endpoint
  const resp = await fetchWithProxy(`${API_BASE}/api/checkpoint/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Origin': API_BASE,
      'Referer': `${API_BASE}/checkpoint`,
    },
    body: JSON.stringify({
      address,
      signature,
      message: SIGN_MESSAGE,
    }),
  }, proxyUrl);

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Auth failed: ${resp.status} - ${errText.slice(0, 200)}`);
  }

  // Extract the cookie from Set-Cookie header
  const setCookies = resp.headers.getSetCookie?.() || [];
  let authCookie = '';

  for (const cookie of setCookies) {
    if (cookie.startsWith('lora_testnet_wallet_auth=')) {
      authCookie = cookie.split(';')[0]; // Just the name=value part
      break;
    }
  }

  if (!authCookie) {
    // Try to extract from response body if cookie is returned there
    const body = await resp.json().catch(() => ({}));
    const token = body.token || body.jwt;
    if (token) {
      authCookie = `lora_testnet_wallet_auth=${token}`;
    }
  }

  if (!authCookie) {
    throw new Error('Auth succeeded but no cookie received');
  }

  // Cache for 23 hours (cookie expires in ~1 year, but re-auth daily to be safe)
  sessionCache.set(address, {
    cookie: authCookie,
    expires: Date.now() + 23 * 3600 * 1000,
  });

  log.success(tag, '✅ Authenticated successfully!');
  return authCookie;
}

// ============================================================
// Social Tasks Module
// ============================================================

async function doSocialTasks(wallet, authCookie, tag, proxyUrl) {
  const address = wallet.address.toLowerCase();

  log.info(tag, 'Starting social tasks...');

  const headers = {
    'Content-Type': 'application/json',
    'Cookie': authCookie,
    'Referer': `${API_BASE}/rewards/points`,
    'Origin': API_BASE,
  };

  for (const task of SOCIAL_TASKS) {
    try {
      log.info(tag, `  Processing: ${task.name} (+${task.points} pts)...`);

      // Step 1: Check if already completed via GET
      const checkUrl = `${API_BASE}/api/points/social/twitter/check/${task.id}`;
      const checkResp = await fetchWithProxy(checkUrl, { headers }, proxyUrl);

      if (checkResp.ok) {
        const checkData = await checkResp.json().catch(() => null);
        // Various possible response shapes
        if (checkData?.completed || checkData?.verified || checkData?.following === true) {
          log.success(tag, `    ${task.name}: Already completed ✓`);
          await randomDelay(1000, 2000);
          continue;
        }
      }

      // Step 2: Trigger verification via POST
      const verifyUrl = `${API_BASE}/api/points/social/twitter/${task.id}`;
      const verifyResp = await fetchWithProxy(verifyUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({ address }),
      }, proxyUrl);

      if (verifyResp.ok) {
        const result = await verifyResp.json().catch(() => ({}));
        log.success(tag, `    ✅ ${task.name}: Done! ${JSON.stringify(result)}`);
      } else {
        const errText = await verifyResp.text().catch(() => '');
        log.warn(tag, `    ${task.name}: ${verifyResp.status} - ${errText.slice(0, 200)}`);

        // If POST fails, try the check endpoint as a verify trigger
        const retryResp = await fetchWithProxy(`${API_BASE}/api/points/social/twitter/check/${task.id}`, {
          method: 'GET',
          headers,
        }, proxyUrl);
        if (retryResp.ok) {
          const retryData = await retryResp.json().catch(() => ({}));
          log.info(tag, `    Retry check: ${JSON.stringify(retryData)}`);
        }
      }

      // Anti-bot delay
      await randomDelay(2000, 5000);

    } catch (err) {
      log.error(tag, `    ${task.name} error: ${err?.message || err}`);
    }
  }

  log.success(tag, 'Social tasks cycle completed');
}

// ============================================================
// Faucet Module
// ============================================================

async function claimFaucet(wallet, tag) {
  const faucet = new ethers.Contract(CONTRACTS.FAUCET, FAUCET_ABI, wallet);

  const nextMint = await faucet.nextMintAllowedAt(wallet.address);
  const now = BigInt(Math.floor(Date.now() / 1000));

  if (nextMint > now) {
    const waitMs = Number(nextMint - now) * 1000;
    log.warn(tag, `Faucet cooldown active. Next mint in ${formatDuration(waitMs)}`);
    return false;
  }

  log.info(tag, 'Claiming faucet (mint 0.1 WETHx)...');
  const tx = await retry(async () => {
    const gasEstimate = await faucet.mint.estimateGas();
    const gasLimit = gasEstimate * 130n / 100n;
    return faucet.mint({ gasLimit });
  }, tag, DEFAULTS.RETRY_COUNT, DEFAULTS.RETRY_DELAY_MS);

  log.info(tag, `Tx sent: ${tx.hash}`);
  const receipt = await tx.wait();

  if (receipt.status === 1) {
    log.success(tag, `✅ Faucet claimed! Gas: ${receipt.gasUsed.toString()}`);
    log.info(tag, `Explorer: ${NETWORK.explorer}/tx/${tx.hash}`);
    return true;
  } else {
    log.error(tag, '❌ Faucet tx reverted');
    return false;
  }
}

// ============================================================
// Superfluid CFA Authorization (via Host.callAgreement)
// ============================================================

const CFA_TYPE_HASH = ethers.keccak256(
  ethers.toUtf8Bytes('org.superfluid-finance.agreements.ConstantFlowAgreement.v1')
);

let cachedCfaAddress = null;

async function getCFAAddress(provider) {
  if (cachedCfaAddress) return cachedCfaAddress;
  const host = new ethers.Contract(CONTRACTS.SUPERFLUID_HOST, SUPERFLUID_HOST_ABI, provider);
  cachedCfaAddress = await host.getAgreementClass(CFA_TYPE_HASH);
  log.info('CFA', `CFA contract: ${cachedCfaAddress}`);
  return cachedCfaAddress;
}

async function ensureCFAAuthorization(wallet, tag) {
  const provider = wallet.provider;
  const cfaAddress = await getCFAAddress(provider);
  const cfa = new ethers.Contract(cfaAddress, CFA_ABI, provider);

  try {
    const data = await cfa.getFlowOperatorData(
      CONTRACTS.WETHX, wallet.address, CONTRACTS.MARKET
    );
    const permissions = Number(data[1]);
    if (permissions === 7) {
      log.info(tag, 'CFA flow operator already authorized (permissions=7) ✓');
      return true;
    }
    log.info(tag, `Current CFA permissions: ${permissions}, need 7 (all)`);
  } catch (err) {
    log.warn(tag, `Could not check CFA: ${err?.shortMessage || err?.message}`);
  }

  log.info(tag, 'Authorizing Market as CFA flow operator...');

  const host = new ethers.Contract(CONTRACTS.SUPERFLUID_HOST, SUPERFLUID_HOST_ABI, wallet);
  const cfaInterface = new ethers.Interface(CFA_ABI);
  const maxFlowRate = BigInt('170141183460469231731687303715884105727'); // 2^127 - 1

  const callData = cfaInterface.encodeFunctionData('updateFlowOperatorPermissions', [
    CONTRACTS.WETHX, CONTRACTS.MARKET, 7, maxFlowRate, '0x',
  ]);

  const tx = await retry(async () => {
    const gasEstimate = await host.callAgreement.estimateGas(cfaAddress, callData, '0x');
    const gasLimit = gasEstimate * 150n / 100n;
    return host.callAgreement(cfaAddress, callData, '0x', { gasLimit });
  }, tag, DEFAULTS.RETRY_COUNT, DEFAULTS.RETRY_DELAY_MS);

  log.info(tag, `CFA auth tx: ${tx.hash}`);
  const receipt = await tx.wait();

  if (receipt.status === 1) {
    log.success(tag, '✅ Market authorized as CFA flow operator!');
    return true;
  } else {
    log.error(tag, '❌ CFA authorization tx reverted');
    return false;
  }
}

// ============================================================
// Rent Up (openPosition) Module
// ============================================================

async function doRentUp(wallet, tag) {
  const market = new ethers.Contract(CONTRACTS.MARKET, MARKET_ABI, wallet);
  const wethx = new ethers.Contract(CONTRACTS.WETHX, WETHX_ABI, wallet);

  const balance = await wethx.balanceOf(wallet.address);
  log.info(tag, `WETHx balance: ${formatEther(balance)} WETHx`);

  if (balance === 0n) {
    log.warn(tag, 'No WETHx balance, skipping Rent Up');
    return false;
  }

  const authorized = await ensureCFAAuthorization(wallet, tag);
  if (!authorized) {
    log.error(tag, 'Cannot proceed without CFA authorization');
    return false;
  }

  await randomDelay(2000, 4000);

  const rentAmountStr = process.env.RENT_AMOUNT || DEFAULTS.RENT_AMOUNT;
  const notional = ethers.parseEther(rentAmountStr);
  const delta = ethers.toBigInt(process.env.RENT_DELTA || DEFAULTS.RENT_DELTA);

  let finalNotional = notional;
  if (balance < notional) {
    finalNotional = balance / 10n;
    if (finalNotional === 0n) {
      log.warn(tag, 'Balance too small for any position');
      return false;
    }
    log.info(tag, `Using smaller notional: ${formatEther(finalNotional)} WETHx`);
  }

  log.info(tag, `Opening position: notional=${formatEther(finalNotional)} WETHx, delta=${delta}`);

  const tx = await retry(async () => {
    const gasEstimate = await market.openPosition.estimateGas(finalNotional, delta);
    const gasLimit = gasEstimate * 150n / 100n;
    return market.openPosition(finalNotional, delta, { gasLimit });
  }, tag, DEFAULTS.RETRY_COUNT, DEFAULTS.RETRY_DELAY_MS);

  log.info(tag, `Rent tx: ${tx.hash}`);
  const receipt = await tx.wait();

  if (receipt.status === 1) {
    log.success(tag, `✅ Position opened! Gas: ${receipt.gasUsed.toString()}`);
    log.info(tag, `Explorer: ${NETWORK.explorer}/tx/${tx.hash}`);
    return true;
  } else {
    log.error(tag, '❌ openPosition tx reverted');
    return false;
  }
}

// ============================================================
// Per-Wallet Cycle
// ============================================================

async function processWallet(wallet, index, total) {
  const proxyUrl = getProxyForIndex(index);
  const proxyDisplay = proxyUrl ? `[Proxy: ${proxyUrl.split('@').pop()}]` : '';
  const tag = `Wallet ${index + 1}/${total} ${proxyDisplay}`.trim();
  const addr = shortAddr(wallet.address);

  log.divider();
  log.info(tag, `Processing ${addr} (${wallet.address})`);

  const provider = wallet.provider;
  const ethBalance = await provider.getBalance(wallet.address);
  log.info(tag, `Native balance: ${formatEther(ethBalance)} ETH`);

  if (ethBalance === 0n) {
    log.error(tag, 'No native ETH for gas! Skipping wallet.');
    return;
  }

  // ── Authenticate ──────────────────────────────────────────
  let authCookie;
  try {
    authCookie = await authenticate(wallet, tag, proxyUrl);
  } catch (err) {
    log.error(tag, `Auth failed: ${err?.message || err}`);
    log.warn(tag, 'Skipping social tasks, continuing with on-chain tasks...');
  }

  // ── Step 1: Social Tasks ──────────────────────────────────
  if (authCookie) {
    try {
      log.info(tag, '── Step 1: Social Tasks ──');
      await doSocialTasks(wallet, authCookie, tag, proxyUrl);
    } catch (err) {
      log.error(tag, `Social task error: ${err?.message || err}`);
    }
    await randomDelay(...DEFAULTS.DELAY_BETWEEN_TASKS_MS);
  }

  // ── Step 2: Faucet Claim ──────────────────────────────────
  try {
    log.info(tag, '── Step 2: Faucet Claim ──');
    await claimFaucet(wallet, tag);
  } catch (err) {
    log.error(tag, `Faucet error: ${err?.shortMessage || err?.message || err}`);
  }

  await randomDelay(...DEFAULTS.DELAY_BETWEEN_TASKS_MS);

  // ── Step 3: Rent Up ───────────────────────────────────────
  try {
    log.info(tag, '── Step 3: Rent Up (openPosition) ──');
    await doRentUp(wallet, tag);
  } catch (err) {
    log.error(tag, `Rent error: ${err?.shortMessage || err?.message || err}`);
  }

  log.success(tag, `Done processing ${addr}`);
}

// ============================================================
// Main Loop
// ============================================================

async function runCycle(wallets) {
  log.banner(`CYCLE START - ${wallets.length} wallet(s)`);

  for (let i = 0; i < wallets.length; i++) {
    await processWallet(wallets[i], i, wallets.length);

    if (i < wallets.length - 1) {
      const [min, max] = DEFAULTS.DELAY_BETWEEN_WALLETS_MS;
      const delay = Math.floor(Math.random() * (max - min + 1)) + min;
      log.info('DELAY', `Waiting ${(delay / 1000).toFixed(0)}s before next wallet...`);
      await sleep(delay);
    }
  }

  log.divider();
  log.success('CYCLE', '✅ All wallets processed!');
}

async function main() {
  log.banner('LORA FINANCE AIRDROP BOT v3');
  log.info('SETUP', `Network: ${NETWORK.name} (chainId: ${NETWORK.chainId})`);
  log.info('SETUP', `RPC: ${NETWORK.rpc}`);
  log.info('SETUP', `Faucet: ${CONTRACTS.FAUCET}`);
  log.info('SETUP', `Market: ${CONTRACTS.MARKET}`);
  log.info('SETUP', `WETHx: ${CONTRACTS.WETHX}`);
  
  const proxiesCount = getProxiesCount();
  log.info('SETUP', `Loaded ${proxiesCount} proxy(s) from proxies.txt`);

  const provider = getProvider();
  const wallets = getWallets(provider);

  for (let i = 0; i < wallets.length; i++) {
    log.info('SETUP', `  Wallet ${i + 1}: ${wallets[i].address}`);
  }

  try {
    await getCFAAddress(provider);
  } catch (err) {
    log.warn('SETUP', `Could not resolve CFA address: ${err?.message}`);
  }

  // Run infinite loop
  while (true) {
    try {
      await runCycle(wallets);
    } catch (err) {
      log.error('CYCLE', `Unexpected error: ${err?.message || err}`);
    }

    const baseMs = DEFAULTS.CYCLE_HOURS * 3600 * 1000;
    const jitterMs = (Math.random() * 2 - 1) * DEFAULTS.JITTER_MINUTES * 60 * 1000;
    const nextMs = Math.max(baseMs + jitterMs, 60000);

    log.divider();
    log.info('SLEEP', `Next cycle in ${formatDuration(nextMs)}`);
    log.info('SLEEP', `Estimated: ${new Date(Date.now() + nextMs).toLocaleString('id-ID', { hour12: false })}`);
    await sleep(nextMs);
  }
}

main().catch(err => {
  log.error('FATAL', err?.message || err);
  process.exit(1);
});
