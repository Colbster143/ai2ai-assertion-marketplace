import type { LightningInvoice } from './types.js';
import { LNBitsClient } from './lnbits.js';
import { OpenNodeClient } from './opennode.js';

export type PaymentProvider = 'lnbits' | 'opennode';

interface LightningClient {
  createInvoice(amount: number, memo: string, expirySeconds?: number): Promise<LightningInvoice>;
  checkInvoice(paymentHash: string): Promise<boolean>;
  payInvoice(paymentRequest: string, amount: number, description: string): Promise<{ paymentHash: string }>;
  decodeInvoice(paymentRequest: string): Promise<{ amount: number; memo: string }>;
  getBalance(): Promise<number>;
}

let client: LightningClient | null = null;
let provider: PaymentProvider | null = null;

export function getLightningClient(): LightningClient {
  if (!client) {
    provider = detectProvider();

    if (provider === 'opennode') {
      const apiKey = process.env.OPENNODE_API_KEY || '';
      if (!apiKey) throw new Error('OPENNODE_API_KEY not set');
      client = new OpenNodeAdapter(new OpenNodeClient(apiKey));
    } else {
      const baseUrl = process.env.LNBITS_URL || 'https://legend.lnbits.com';
      const adminKey = process.env.LNBITS_ADMIN_KEY || process.env.LNBITS_API_KEY || '';
      if (!adminKey) throw new Error('LNBITS_ADMIN_KEY or LNBITS_API_KEY not set');
      client = new LNBitsAdapter(new LNBitsClient(baseUrl, adminKey));
    }
  }
  return client;
}

function detectProvider(): PaymentProvider {
  if (process.env.OPENNODE_API_KEY) return 'opennode';
  return 'lnbits';
}

export function isLightningConfigured(): boolean {
  return !!(process.env.OPENNODE_API_KEY || process.env.LNBITS_ADMIN_KEY || process.env.LNBITS_API_KEY);
}

export function getPaymentProvider(): PaymentProvider | null {
  return provider;
}

class OpenNodeAdapter implements LightningClient {
  constructor(private on: OpenNodeClient) {}

  async createInvoice(amount: number, memo: string, expirySeconds?: number): Promise<LightningInvoice> {
    return this.on.createInvoice(amount, memo, expirySeconds);
  }

  async checkInvoice(paymentHash: string): Promise<boolean> {
    return this.on.checkInvoice(paymentHash);
  }

  async payInvoice(paymentRequest: string, amount: number, description: string): Promise<{ paymentHash: string }> {
    return this.on.payInvoice(paymentRequest, amount, description);
  }

  async decodeInvoice(paymentRequest: string): Promise<{ amount: number; memo: string }> {
    return this.on.decodeInvoice(paymentRequest);
  }

  async getBalance(): Promise<number> {
    return this.on.getBalance();
  }
}

class LNBitsAdapter implements LightningClient {
  constructor(private lnbits: LNBitsClient) {}

  async createInvoice(amount: number, memo: string, expirySeconds?: number): Promise<LightningInvoice> {
    return this.lnbits.createInvoice(amount, memo, expirySeconds);
  }

  async checkInvoice(paymentHash: string): Promise<boolean> {
    return this.lnbits.checkInvoice(paymentHash);
  }

  async payInvoice(paymentRequest: string, _amount: number, _description: string): Promise<{ paymentHash: string }> {
    return this.lnbits.payInvoice(paymentRequest);
  }

  async decodeInvoice(paymentRequest: string): Promise<{ amount: number; memo: string }> {
    return this.lnbits.decodeInvoice(paymentRequest);
  }

  async getBalance(): Promise<number> {
    return this.lnbits.getWalletBalance();
  }
}
