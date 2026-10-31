import { z } from "zod";

export const Currency = z.literal("CAD");
export type Currency = z.infer<typeof Currency>;

export type Money = Readonly<{ cents: number; currency: Currency }>;

export function money(cents: number, currency: Currency = "CAD"): Money {
  if (!Number.isSafeInteger(cents)) throw new Error("Money must be represented as safe integer minor units");
  return Object.freeze({ cents, currency });
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.cents + b.cents, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.cents - b.cents, a.currency);
}

export function multiply(unit: Money, quantity: number): Money {
  if (!Number.isSafeInteger(quantity) || quantity < 0) throw new Error("Quantity must be a non-negative integer");
  return money(unit.cents * quantity, unit.currency);
}

export function calculateTax(subtotal: Money, basisPoints: number): Money {
  if (!Number.isSafeInteger(basisPoints) || basisPoints < 0) throw new Error("Tax rate must be non-negative basis points");
  // Half away from zero. The application currently rejects negative ordinary transactions.
  return money(Math.floor((subtotal.cents * basisPoints + 5_000) / 10_000), subtotal.currency);
}

export function formatMoney(value: Money | number, currency: Currency = "CAD"): string {
  const cents = typeof value === "number" ? value : value.cents;
  const code = typeof value === "number" ? currency : value.currency;
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: code }).format(cents / 100);
}

function assertSameCurrency(a: Money, b: Money) {
  if (a.currency !== b.currency) throw new Error("Cross-currency arithmetic requires an explicit conversion mechanism");
}
