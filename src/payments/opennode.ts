import type { LightningInvoice } from './types.js';

export class OpenNodeClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    this.baseUrl = apiKey.startsWith('test_')
      ? 'https://dev-api.opennode.com/v1'
      : 'https://api.opennode.com/v1';
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...options,
      headers: {
        'Authorization': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenNode API error ${res.status}: ${body}`);
    }

    return res.json() as Promise<T>;
  }

  async createInvoice(amount: number, memo: string, expirySeconds = 3600): Promise<LightningInvoice> {
    const data = await this.request<{
      data: {
        id: string;
        lightning_invoice: { payreq: string };
        amount: number;
        description: string;
        status: string;
        expires_at: string;
      };
    }>('/charges', {
      method: 'POST',
      body: JSON.stringify({
        amount,
        currency: 'BTC',
        description: memo.slice(0, 200),
        ttl: expirySeconds,
      }),
    });

    return {
      paymentHash: data.data.id,
      paymentRequest: data.data.lightning_invoice.payreq,
      amount: data.data.amount,
      description: memo,
      expiresAt: data.data.expires_at,
      status: 'pending',
    };
  }

  async checkInvoice(chargeId: string): Promise<boolean> {
    try {
      const data = await this.request<{
        data: { status: string };
      }>(`/charge/${chargeId}`);
      return data.data.status === 'paid';
    } catch {
      return false;
    }
  }

  async payInvoice(
    paymentRequest: string,
    amount: number,
    _description: string
  ): Promise<{ paymentHash: string }> {
    const data = await this.request<{
      data: { id: string };
    }>('/withdrawals', {
      method: 'POST',
      body: JSON.stringify({
        type: 'lightning',
        address: paymentRequest,
        amount,
      }),
    });

    return { paymentHash: data.data.id };
  }

  async decodeInvoice(_paymentRequest: string): Promise<{ amount: number; memo: string }> {
    return { amount: 0, memo: '' };
  }

  async getBalance(): Promise<number> {
    const data = await this.request<{
      data: { balance: { BTC: { available: string } } };
    }>('/account/balance');

    const btcStr = data.data.balance.BTC?.available || '0';
    return parseFloat(btcStr);
  }
}
