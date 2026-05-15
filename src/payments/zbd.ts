import type { LightningInvoice } from './types.js';

export class ZBDClient {
  private apiKey: string;
  private baseUrl = 'https://api.zebedee.io/v0';

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'apikey': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`ZBD API error ${res.status}: ${body}`);
    }

    const json = await res.json() as { success: boolean; data: T; message: string };
    if (!json.success) {
      throw new Error(`ZBD error: ${json.message}`);
    }
    return json.data;
  }

  async createInvoice(amount: number, memo: string, expirySeconds = 3600): Promise<LightningInvoice> {
    const amountMsats = Math.round(amount * 1000);
    const data = await this.request<{
      id: string;
      invoice: { request: string };
      amount: string;
      description: string;
      status: string;
      expiresAt: string;
    }>('/charges', {
      method: 'POST',
      body: JSON.stringify({
        amount: amountMsats.toString(),
        description: memo.slice(0, 200),
        expiresIn: expirySeconds,
        internalId: `ai2ai-${Date.now()}`,
      }),
    });

    return {
      paymentHash: data.id,
      paymentRequest: data.invoice.request,
      amount,
      description: memo,
      expiresAt: data.expiresAt,
      status: 'pending',
    };
  }

  async checkInvoice(chargeId: string): Promise<boolean> {
    try {
      const data = await this.request<{ status: string }>(`/charges/${chargeId}`);
      return data.status === 'completed';
    } catch {
      return false;
    }
  }

  async payInvoice(paymentRequest: string, amount: number, description: string): Promise<{ paymentHash: string }> {
    const amountMsats = Math.round(amount * 1000);
    const data = await this.request<{ id: string }>('/payments', {
      method: 'POST',
      body: JSON.stringify({
        invoice: paymentRequest,
        amount: amountMsats.toString(),
        description: description.slice(0, 200),
        internalId: `ai2ai-payout-${Date.now()}`,
      }),
    });

    return { paymentHash: data.id };
  }

  async getBalance(): Promise<number> {
    const data = await this.request<{ balance: string }>('/wallet');
    return parseInt(data.balance) / 1000;
  }

  async decodeInvoice(paymentRequest: string): Promise<{ amount: number; memo: string }> {
    const data = await this.request<{ amount: string; memo: string }>(
      '/decode-invoice',
      {
        method: 'POST',
        body: JSON.stringify({ invoice: paymentRequest }),
      }
    );
    return {
      amount: parseInt(data.amount) / 1000,
      memo: data.memo,
    };
  }
}
