import type {
  LNBitsCreateInvoiceResponse,
  LNBitsCheckInvoiceResponse,
  LNBitsPayInvoiceResponse,
  LightningInvoice,
} from './types.js';

export class LNBitsClient {
  private baseUrl: string;
  private adminKey: string;

  constructor(baseUrl: string, adminKey: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.adminKey = adminKey;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'X-Api-Key': this.adminKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`LNBits API error ${res.status}: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  async createInvoice(amount: number, memo: string, expirySeconds = 3600): Promise<LightningInvoice> {
    const data = await this.request<LNBitsCreateInvoiceResponse>('/api/v1/payments', {
      method: 'POST',
      body: JSON.stringify({
        out: false,
        amount,
        memo: memo.slice(0, 200),
        expiry: expirySeconds,
        unit: 'sat',
      }),
    });

    return {
      paymentHash: data.payment_hash,
      paymentRequest: data.payment_request,
      amount,
      description: memo,
      expiresAt: new Date(Date.now() + expirySeconds * 1000).toISOString(),
      status: 'pending',
    };
  }

  async checkInvoice(paymentHash: string): Promise<boolean> {
    try {
      const data = await this.request<LNBitsCheckInvoiceResponse>(
        `/api/v1/payments/${paymentHash}`
      );
      return data.paid === true;
    } catch {
      return false;
    }
  }

  async payInvoice(paymentRequest: string): Promise<{ paymentHash: string }> {
    const data = await this.request<LNBitsPayInvoiceResponse>('/api/v1/payments', {
      method: 'POST',
      body: JSON.stringify({
        out: true,
        bolt11: paymentRequest,
      }),
    });

    return { paymentHash: data.payment_hash };
  }

  async decodeInvoice(paymentRequest: string): Promise<{ amount: number; memo: string }> {
    const data = await this.request<{ amount: number; memo: string }>(
      '/api/v1/payments/decode',
      {
        method: 'POST',
        body: JSON.stringify({ data: paymentRequest }),
      }
    );
    return data;
  }

  async getWalletBalance(): Promise<number> {
    const data = await this.request<{ balance: number }>('/api/v1/wallet');
    return data.balance;
  }

  async createInternalWallet(name: string): Promise<{
    id: string;
    adminKey: string;
    invoiceKey: string;
  }> {
    const data = await this.request<{
      id: string;
      adminkey: string;
      inkey: string;
    }>('/api/v1/wallet', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });

    return {
      id: data.id,
      adminKey: data.adminkey,
      invoiceKey: data.inkey,
    };
  }
}

let client: LNBitsClient | null = null;

export function getLNBitsClient(): LNBitsClient {
  if (!client) {
    const baseUrl = process.env.LNBITS_URL || 'https://legend.lnbits.com';
    const adminKey = process.env.LNBITS_ADMIN_KEY || process.env.LNBITS_API_KEY || '';
    if (!adminKey) {
      throw new Error(
        'LNBITS_ADMIN_KEY or LNBITS_API_KEY environment variable is required for Lightning payments'
      );
    }
    client = new LNBitsClient(baseUrl, adminKey);
  }
  return client;
}

export function configureLNBits(baseUrl: string, adminKey: string): void {
  client = new LNBitsClient(baseUrl, adminKey);
}

export function isLightningConfigured(): boolean {
  return !!(process.env.LNBITS_ADMIN_KEY || process.env.LNBITS_API_KEY);
}
