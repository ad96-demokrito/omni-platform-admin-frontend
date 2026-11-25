import type { PlatformPlanItem } from "../types/platform";

/** Currencies plans can be sold in (keep in step with backend/src/modules/billing/currency.ts). */
export const BILLING_CURRENCIES = ["INR", "USD"] as const;
export type BillingCurrency = (typeof BILLING_CURRENCIES)[number];

export function formatMoney(amount: number, currency: string): string {
  const code = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(code === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${code} ${amount.toFixed(2)}`;
  }
}

/** A plan's monthly/yearly price in one currency, or null when it is not sold in that currency. */
export function priceFor(
  plan: PlatformPlanItem,
  currency: string
): { monthly: number; yearly: number } | null {
  const row = (plan.prices ?? []).find((p) => p.isActive && p.currency.toUpperCase() === currency.toUpperCase());
  return row ? { monthly: row.priceMonthly, yearly: row.priceYearly } : null;
}
