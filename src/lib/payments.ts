/**
 * Decoupled payment layer. Nothing here talks to a real provider yet — the demo
 * wallet implements the same interfaces, so swapping in M-Pesa / Stripe / Paddle
 * later is a matter of registering another PaymentProvider.
 */

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
  /** used for idempotent processing once a real provider is connected */
  idempotencyKey: string;
  payload: T;
  receivedAt: string;
}

export interface PaymentProvider {
  readonly name: string;
  readonly enabled: boolean;
  createDeposit(input: { ownerId: string; amount: number; currency: Currency }): Promise<Deposit>;
  createWithdrawal(input: {
    ownerId: string;
    amount: number;
    currency: Currency;
    destination: string;
  }): Promise<Withdrawal>;
  verifyWebhook(event: WebhookEvent): Promise<boolean>;
}

const uid = () => Math.random().toString(36).slice(2, 10);

/** Demo provider: instant, virtual coins only, never touches real money. */
export const demoProvider: PaymentProvider = {
  name: "demo",
  enabled: true,
  async createDeposit({ ownerId, amount, currency }) {
    return {
      id: uid(),
      ownerId,
      amount,
      currency,
      provider: "demo",
      status: "completed",
      createdAt: new Date().toISOString(),
    };
  },
  async createWithdrawal({ ownerId, amount, currency, destination }) {
    return {
      id: uid(),
      ownerId,
      amount,
      currency,
      destination,
      provider: "demo",
      status: "completed",
      createdAt: new Date().toISOString(),
    };
  },
  async verifyWebhook() {
    return true;
  },
};

export class PaymentService {
  private providers = new Map<string, PaymentProvider>();
  private processedWebhooks = new Set<string>();

  constructor(providers: PaymentProvider[] = [demoProvider]) {
    providers.forEach((p) => this.providers.set(p.name, p));
  }

  register(provider: PaymentProvider) {
    this.providers.set(provider.name, provider);
  }

  get(name = "demo"): PaymentProvider {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Provedor de pagamento desconhecido: ${name}`);
    return provider;
  }

  list(): PaymentProvider[] {
    return [...this.providers.values()];
  }

  /** Idempotent by design: the same key is never processed twice. */
  async handleWebhook(event: WebhookEvent): Promise<"processed" | "duplicate" | "invalid"> {
    if (this.processedWebhooks.has(event.idempotencyKey)) return "duplicate";
    const ok = await this.get(event.provider).verifyWebhook(event);
    if (!ok) return "invalid";
    this.processedWebhooks.add(event.idempotencyKey);
    return "processed";
  }
}

export const paymentService = new PaymentService();
