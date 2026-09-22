/** Todos os valores monetários são guardados em centavos (MZN). */

export const toCents = (mzn: number) => Math.round(mzn * 100);
export const toMzn = (cents: number) => cents / 100;

export function formatMzn(cents: number): string {
  return new Intl.NumberFormat("pt-MZ", {
    style: "currency",
    currency: "MZN",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

export const METHOD_LABELS: Record<string, string> = {
  mpesa: "M-Pesa",
  mola: "Mola",
  mcash: "mCash",
  bank: "Conta bancária",
};

export const TX_LABELS: Record<string, string> = {
  deposit: "Depósito",
  withdrawal: "Retirada",
  bet: "Aposta",
  prize: "Prémio",
  refund: "Reembolso",
  fee: "Comissão",
  adjustment: "Ajuste",
  bonus: "Bónus",
};
