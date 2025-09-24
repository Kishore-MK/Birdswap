import { UsdcIcon, MonIcon, WethIcon } from './icons';
import type { ComponentType } from 'react';

export type Token = 'USDC' | 'MON' | 'WETH';

export const TOKENS: { [key in Token]: { name: string; icon: ComponentType<{ className?: string }> } } = {
  USDC: { name: 'USD Coin', icon: UsdcIcon },
  MON: { name: 'MON Protocol', icon: MonIcon },
  WETH: { name: 'Wrapped Ether', icon: WethIcon },
};

export const SWAP_PAIRS: { [key in Token]: Token[] } = {
  USDC: ['MON', 'WETH'],
  MON: ['USDC', 'WETH'],
  WETH: ['USDC', 'MON'],
};

export const GAME_CONFIG = {
  gravity: 0.2,
  launchPower: 0.2,
  groundHeight: 96,
  slingshotPosition: { x: 120, y: 420 },
  maxDragDistance: 80,
  birdSize: { width: 48, height: 48 },
  towerWidth: 120,
  towerHeight: 300,
};

// Dummy addresses for Monad Testnet - replace with actuals if they become available
export const TOKEN_ADDRESSES: Record<Token, `0x${string}`> = {
  USDC: '0xf817257fed379853cDe0fa4F97AB987181B1E5Ea', // Example, not real on Monad
  MON: '0xc1271175B5749A5a1b321529243A23933014A463',   // Example, not real on Monad
  WETH: '0xB5a30b0FDc5EA94A52fDc42e3E9760Cb8449Fb37'    // Example, not real on Monad
};
