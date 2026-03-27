// ============================================================
// Lora Finance Bot - Configuration & ABIs
// ============================================================

export const NETWORK = {
  name: 'MegaETH Testnet v2',
  rpc: 'https://timothy.megaeth.com/rpc',
  chainId: 6343,
  explorer: 'https://megaeth-testnet-v2.blockscout.com',
};

export const CONTRACTS = {
  FAUCET: '0x816672419221448A6f0952E4043d577caFe78f38',
  MARKET: '0xeFF810eAbfE99925AC41f03C71f50b7b1da7eC23',
  WETHX: '0x7e3A0A730Baf8DA7f6BCe4b8862D1766633AAc6d',         // Super Wrapped Ether (WETHx)
  WETH: '0x1eF862475e5E7801b4De3FCb557b2e1139d14379',          // Underlying WETH
  SUPERFLUID_HOST: '0xF92B4e57f89A3aeBc63f7e0Fd9c676ec67b4aE7E',
};

// Faucet ABI
export const FAUCET_ABI = [
  'function mint() external',
  'function nextMintAllowedAt(address user_) external view returns (uint256)',
  'function cooldown() external view returns (uint256)',
  'function mintAmount() external view returns (uint256)',
];

// Market ABI
export const MARKET_ABI = [
  'function openPosition(uint256 notional_, uint256 delta_) external returns (uint256)',
  'function closePosition(uint256 positionIndex_) external returns (uint256)',
  'function totalPositions(address user_) external view returns (uint256)',
];

// WETHx (Super Token) ABI - ERC20 basics
export const WETHX_ABI = [
  'function balanceOf(address account) external view returns (uint256)',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
];

// Superfluid Host ABI - for callAgreement and getting CFA address
export const SUPERFLUID_HOST_ABI = [
  'function getAgreementClass(bytes32 agreementType) external view returns (address)',
  'function callAgreement(address agreementClass, bytes calldata callData, bytes calldata userData) external returns (bytes memory returnedData)',
];

// CFA (Constant Flow Agreement) ABI - for updateFlowOperatorPermissions
export const CFA_ABI = [
  'function updateFlowOperatorPermissions(address token, address flowOperator, uint8 permissions, int96 flowRateAllowance, bytes calldata ctx) external returns (bytes memory newCtx)',
  'function getFlowOperatorData(address token, address sender, address flowOperator) external view returns (bytes32 flowOperatorId, uint8 permissions, int96 flowRateAllowance)',
];

// ── Auth Config ──────────────────────────────────────────────
export const SIGN_MESSAGE = 'By signing this message, you verify ownership of this wallet for Lora Testnet access.';

// ── Social Task Config ──────────────────────────────────────
export const SOCIAL_TASKS = [
  { id: 'follow',                name: 'Follow Lora Finance',  points: 400 },
  { id: 'founder-follows-void',  name: 'Follow Void',          points: 200 },
  { id: 'founder-follows-aadee', name: 'Follow Aadee',         points: 200 },
  { id: 'repost',                name: 'Repost Lora Finance',  points: 100 },
];

export const API_BASE = 'https://testnet.lora.finance';

// Defaults
export const DEFAULTS = {
  RENT_AMOUNT: '0.001',
  RENT_DELTA: '0',
  CYCLE_HOURS: 24,
  JITTER_MINUTES: 30,
  RETRY_COUNT: 3,
  RETRY_DELAY_MS: 5000,
  DELAY_BETWEEN_WALLETS_MS: [5000, 15000],
  DELAY_BETWEEN_TASKS_MS: [3000, 8000],
  PROXIES_FILE: 'proxies.txt',
};
