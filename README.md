# Lora Finance Testnet Airdrop Bot

Automate daily tasks on **Lora Finance Testnet** (MegaETH Testnet v2) for airdrop point farming.

## Features

- 🔐 **Wallet Signature Auth** — Automatic session management via JWT
- 📋 **Daily Social Tasks** — Follow & Repost verification
- 💧 **Faucet Claim** — Auto-claim 0.1 WETHx every 24 hours
- 📈 **Rent Up** — Open streaming positions via Superfluid CFA
- 👥 **Multi-Account** — Process multiple wallets from `accounts.txt`
- 🕐 **24h Auto-Loop** — Continuous operation with anti-bot delays
- 🚪 **Lobby/Waitlist** — Separate script for new accounts to join waitlist

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Accounts

Add your private keys to `accounts.txt`, one per line:

```
# Private keys (with or without 0x prefix)
# Lines starting with # are ignored
0xYOUR_PRIVATE_KEY_1
0xYOUR_PRIVATE_KEY_2
```

## Usage

### For New Accounts (Not Yet Whitelisted)

Run the lobby script first to complete Follow + Repost tasks and join the waitlist:

```bash
node lobby.js
```

### For Whitelisted Accounts (Daily Farming)

Run the main bot for daily point farming:

```bash
node index.js
```

This will loop every ~24 hours and perform:
1. **Social Tasks** — Verify Follow & Repost daily
2. **Faucet Claim** — Mint 0.1 WETHx (24h cooldown)
3. **Rent Up** — Open a position on the Market contract

## Network Info

| Parameter | Value |
|---|---|
| Network | MegaETH Testnet v2 |
| Chain ID | 6343 |
| RPC | `https://timothy.megaeth.com/rpc` |
| Explorer | [Blockscout](https://megaeth-testnet-v2.blockscout.com) |

## Contracts

| Contract | Address |
|---|---|
| Faucet | `0x816672419221448A6f0952E4043d577caFe78f38` |
| Market | `0xeFF810eAbfE99925AC41f03C71f50b7b1da7eC23` |
| WETHx | `0x7e3A0A730Baf8DA7f6BCe4b8862D1766633AAc6d` |

## Project Structure

```
├── index.js        # Main bot (daily farming loop)
├── lobby.js        # Waitlist/lobby tasks (run once)
├── config.js       # Contract addresses, ABIs, constants
├── utils.js        # Logger, retry, delay helpers
├── accounts.txt    # Private keys (one per line)
├── package.json    # Dependencies
└── .gitignore      # Git ignores
```

## Disclaimer

This bot is for **testnet use only**. Use at your own risk. Never share your private keys.
