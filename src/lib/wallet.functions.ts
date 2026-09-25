export type WalletSummary = { balance_cents:number; withdrawable_cents:number; rollover_required_cents:number; wagered_cents:number; min_deposit_cents:number; min_withdrawal_cents:number; withdrawal_fee_percent:number; withdrawal_fee_fixed_cents:number; house_fee_percent:number; rollover_enabled:boolean; };
export const getWalletSummary=async()=>{throw new Error("local_wallet_mode");};
export const startDeposit=async()=>{throw new Error("local_wallet_mode");};
export const requestWithdrawal=async()=>{throw new Error("local_wallet_mode");};
export const quoteWithdrawal=async()=>{throw new Error("local_wallet_mode");};
export const startMatch=async()=>{throw new Error("local_wallet_mode");};
export const finishMatch=async()=>{throw new Error("local_wallet_mode");};
