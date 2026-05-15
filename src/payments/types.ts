export interface LightningInvoice {
  paymentHash: string;
  paymentRequest: string;
  amount: number;
  description: string;
  expiresAt: string;
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
}

export interface InternalWallet {
  id: string;
  ownerId: string;
  ownerType: 'verifier' | 'buyer';
  balance: number;
  lnbitsWalletId: string | null;
  lnbitsAdminKey: string | null;
  lnbitsInvoiceKey: string | null;
  createdAt: string;
}

export interface PaymentResult {
  success: boolean;
  invoice?: LightningInvoice;
  transactionId?: string;
  newBalance?: number;
  error?: string;
}

export interface WithdrawalRequest {
  walletId: string;
  invoice: string;
  amount: number;
}

export interface LNBitsCreateInvoiceResponse {
  payment_hash: string;
  payment_request: string;
  checking_id: string;
  lnurl_response: string | null;
}

export interface LNBitsCheckInvoiceResponse {
  paid: boolean;
  details: {
    payment_hash: string;
    amount: number;
    memo: string;
    expiry: number;
    settled: boolean;
  };
}

export interface LNBitsPayInvoiceResponse {
  payment_hash: string;
  checking_id: string;
}
