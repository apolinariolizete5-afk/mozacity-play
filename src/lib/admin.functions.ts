import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
export interface AdminOverview {players:number;balance_cents:number;deposits_cents:number;withdrawals_cents:number;withdrawal_fees_cents:number;rake_cents:number;bet_volume_cents:number;pending_payouts:number;pending_payouts_cents:number;}
const disabled=()=>{throw new Error("admin_local_mode");};
export const claimAdmin=createServerFn({method:"POST"}).inputValidator((i:unknown)=>z.object({code:z.string()}).parse(i)).handler(async()=>{disabled();});
export const getAdminOverview=createServerFn({method:"GET"}).handler(async()=>disabled());
export const updateSettings=createServerFn({method:"POST"}).handler(async()=>disabled());
export const settlePayout=createServerFn({method:"POST"}).handler(async()=>disabled());
export const setTestMode=createServerFn({method:"POST"}).handler(async()=>disabled());
