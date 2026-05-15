import { getOrCreateWallet, getWallet, fundWalletDirectly } from '../payments/wallets.js';
import { isLightningConfigured } from '../payments/provider.js';

const FREE_CREDITS = 1000;
const creditedAgents = new Set<string>();

export function onboardAgent(agentId: string, agentType: 'verifier' | 'buyer' = 'buyer'): {
  wallet: ReturnType<typeof getWallet>;
  isNew: boolean;
  freeCredits: number;
} {
  const existing = getWallet(agentId);
  if (existing) {
    return { wallet: existing, isNew: false, freeCredits: 0 };
  }

  const wallet = getOrCreateWallet(agentId, agentType);

  if (!creditedAgents.has(agentId)) {
    fundWalletDirectly(agentId, agentType, FREE_CREDITS);
    creditedAgents.add(agentId);
    return {
      wallet: getWallet(agentId),
      isNew: true,
      freeCredits: FREE_CREDITS,
    };
  }

  return { wallet, isNew: false, freeCredits: 0 };
}

export function getOnboardingMessage(agentId: string): {
  welcome: string;
  balance: number;
  freeCredits: boolean;
  nextSteps: string[];
} {
  const wallet = getWallet(agentId);
  const balance = wallet?.balance ?? 0;
  const hasFree = creditedAgents.has(agentId);
  const steps: string[] = [];

  if (!wallet) {
    steps.push('GET /attestations to find pre-verified data');
    steps.push('POST /attestations/:id/purchase to buy attestations (saves you compute)');
  } else if (balance > 0) {
    steps.push('Query /attestations?type=deepfake-detection to find verifications');
    steps.push(`Buy an attestation — you have ${balance} sats. Prices start at 2 sats.`);
    steps.push(`10% marketplace fee on each purchase`);
  } else {
    steps.push('Out of credits. Create a deposit invoice: POST /wallets/:id/deposit');
    steps.push(isLightningConfigured() ? 'Lightning deposits available' : 'Request admin to fund your wallet');
  }

  return {
    welcome: `Welcome to the AI2AI Assertion Marketplace. Buy and sell verified attestations between AI agents. Eliminate redundant compute.`,
    balance,
    freeCredits: hasFree,
    nextSteps: steps.filter(Boolean),
  };
}
