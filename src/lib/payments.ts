export type Currency = "MZN" | "COIN";
export type TransactionKind = "deposit" | "withdrawal" | "bet" | "prize" | "bonus";
export type TransactionStatus = "pending" | "completed" | "failed" | "reversed";

export interface Wallet {
  ownerId: string;
  currency: Currency;
  balance: number;
  updatedAt: string;
}

export interface Transaction {
  id: string;
  walletOwnerId: string;
  kind: TransactionKind;
  amount: number;
  currency: Currency;
  status: TransactionStatus;
  reference: string;
  description: string;
  createdAt: string;
}

export interface Deposit {
  id: string;
  ownerId: string;
  amount: number;
  currency: Currency;
  provider: string;
  status: TransactionStatus;
  createdAt: string;
}

export interface Withdrawal extends Deposit {
  destination: string;
}

export interface WebhookEvent<T = unknown> {
  id: string;
  provider: string;
  type: string;
  idempotencyKey: string;
  payload: T;
  receivedAt: string;
}

/**
 * Shared payment types only.
 * Real money operations are handled server-side by Supabase and NetShop.
 * There is no demo payment provider and no virtual-money crediting here.
 */
