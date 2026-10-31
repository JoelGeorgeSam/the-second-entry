import { z } from "zod";

export const ReconciliationInput = z.object({
  paymentId: z.string().min(1),
  sourceEventId: z.string().min(1),
  amountCents: z.number().int().positive(),
  currency: z.literal("CAD"),
  customerId: z.string().nullable(),
  invoiceReference: z.string().nullable(),
  invoice: z.object({
    id: z.string(),
    customerId: z.string(),
    currency: z.literal("CAD"),
    outstandingCents: z.number().int().nonnegative(),
    status: z.enum(["draft", "issued", "partially_paid", "paid", "overdue", "voided"]),
  }).nullable(),
});

export type ReconciliationDecision = {
  outcome: "auto_matched" | "partial_match" | "exception";
  allocationCents: number;
  exceptionType?: "unmatched_payment" | "customer_mismatch" | "currency_mismatch" | "overpayment" | "already_paid" | "invalid_invoice_status";
  reason: string;
};

export function decideReconciliation(raw: z.input<typeof ReconciliationInput>): ReconciliationDecision {
  const input = ReconciliationInput.parse(raw);
  if (!input.invoice) return { outcome: "exception", allocationCents: 0, exceptionType: "unmatched_payment", reason: "No unique invoice matched the supplied reference." };
  if (input.invoice.status === "voided" || input.invoice.status === "draft") return { outcome: "exception", allocationCents: 0, exceptionType: "invalid_invoice_status", reason: `Payments cannot be allocated to ${input.invoice.status} invoices.` };
  if (input.customerId && input.customerId !== input.invoice.customerId) return { outcome: "exception", allocationCents: 0, exceptionType: "customer_mismatch", reason: "Payment customer does not match the invoice customer." };
  if (input.currency !== input.invoice.currency) return { outcome: "exception", allocationCents: 0, exceptionType: "currency_mismatch", reason: "Cross-currency reconciliation is disabled." };
  if (input.invoice.status === "paid" || input.invoice.outstandingCents === 0) return { outcome: "exception", allocationCents: 0, exceptionType: "already_paid", reason: "Invoice has no outstanding balance." };
  if (input.amountCents > input.invoice.outstandingCents) return { outcome: "exception", allocationCents: 0, exceptionType: "overpayment", reason: "Payment exceeds the outstanding invoice balance." };
  if (input.amountCents === input.invoice.outstandingCents) return { outcome: "auto_matched", allocationCents: input.amountCents, reason: "Reference, customer, currency, and exact outstanding balance matched." };
  return { outcome: "partial_match", allocationCents: input.amountCents, reason: "Valid partial payment allocated under the documented partial-payment policy." };
}
