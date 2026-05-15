import type { LightningInvoice } from './types.js';
import { LNBitsClient } from './lnbits.js';
import { ZBDClient } from './zbd.js';

export type PaymentProvider = 'lnbits' | 'zbd';

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

    if (provider === 'zbd') {
      const apiKey = process.env.ZBD_API_KEY || '';
      if (!apiKey) throw new Error('ZBD_API_KEY not set');
      client = new ZBDAdapter(new ZBDClient(apiKey));
    } else if (provider === 'lnbits') {
      const baseUrl = process.env.LNBITS_URL || 'https://legend.lnbits.com';
      const adminKey = process.env.LNBITS_ADMIN_KEY || process.env.LNBITS_API_KEY || '';
      if (!adminKey) throw new Error('LNBITS_ADMIN_KEY or LNBITS_API_KEY not set');
      client = new LNBitsAdapter(new LNBitsClient(baseUrl, adminKey));
    } else {
      throw new Error('No Lightning provider configured. Set ZBD_API_KEY or LNBITS_ADMIN_KEY.');
    }
  }
  return client;
}

function detectProvider(): PaymentProvider {
  if (process.env.ZBD_API_KEY) return 'zbd';
  if (process.env.LNBITS_ADMIN_KEY || process.env.LNBITS_API_KEY) return 'lnbits';
  return 'zbd';
}

export function isLightningConfigured(): boolean {
  return !!(process.env.ZBD_API_KEY || process.env.LNBITS_ADMIN_KEY || process.env.LNBITS_API_KEY);
}

export function getPaymentProvider(): PaymentProvider | null {
  return provider;
}

class ZBDAdapter implements LightningClient {
  constructor(private zbd: ZBDClient) {}

  async createInvoice(amount: number, memo: string, expirySeconds?: number): Promise<LightningInvoice> {
    return this.zbd.createInvoice(amount, memo, expirySeconds);
  }

  async checkInvoice(paymentHash: string): Promise<boolean> {
    return this.zbd.checkInvoice(paymentHash);
  }

  async payInvoice(paymentRequest: string, amount: number, description: string): Promise<{ paymentHash: string }> {
    return this.zbd.payInvoice(paymentRequest, amount, description);
  }

  async decodeInvoice(paymentRequest: string): Promise<{ amount: number; memo: string }> {
    return this.zbd.decodeInvoice(paymentRequest);
  }

  async getBalance(): Promise<number> {
    return this.zbd.getBalance();
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
