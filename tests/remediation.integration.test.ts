import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { database } from "@/server/db/client";
import { ensureWorkspace, ingestAndReconcile, verifyAuditChain } from "@/server/db/repository";
import { authenticateDemo, signSession, verifySession, type Session } from "@/server/auth/session";

const sessionFor = (workspaceId: string): Session => ({ userId: "remediation-analyst", name: "Analyst", role: "finance_analyst", workspaceId, expiresAt: Date.now() + 60_000 });

describe.sequential("critical remediation invariants", () => {
  it("keeps allocations equal to paid balance under 10 simultaneous payments across 20 iterations", async () => {
    const db = await database();
    for (let iteration = 0; iteration < 20; iteration += 1) {
      const workspaceId = `concurrency-${Date.now()}-${iteration}`; const session = sessionFor(workspaceId); await ensureWorkspace(workspaceId);
      const results = await Promise.all(Array.from({ length: 10 }, (_, index) => ingestAndReconcile(session, { sourceEventId: `payment-${index}`, amountCents: 60_000, currency: "CAD", invoiceReference: "INV-2026-083" })));
      expect(results).toHaveLength(10);
      const state = await db.query<{ paid: unknown; total: unknown; allocated: unknown }>(`SELECT i.paid_cents paid,i.total_cents total,COALESCE(sum(a.amount_cents),0) allocated FROM invoices i LEFT JOIN payment_allocations a ON a.invoice_id=i.id WHERE i.workspace_id=$1 AND i.invoice_number='INV-2026-083' GROUP BY i.id`, [workspaceId]);
      expect(Number(state.rows[0].allocated)).toBe(Number(state.rows[0].paid));
      expect(Number(state.rows[0].paid)).toBeLessThanOrEqual(Number(state.rows[0].total));
    }
  }, 30_000);

  it("makes concurrent identical replays idempotent and detects full-field conflicts", async () => {
    const workspaceId = `replay-${Date.now()}`; const session = sessionFor(workspaceId); await ensureWorkspace(workspaceId);
    const input = { sourceEventId: "same-source", amountCents: 10_000, currency: "CAD", invoiceReference: "UNKNOWN" };
    const [first, second] = await Promise.all([ingestAndReconcile(session, input), ingestAndReconcile(session, input)]);
    expect(first.paymentId).toBe(second.paymentId);
    expect([first.duplicate, second.duplicate]).toContain(true);
    await expect(ingestAndReconcile(session, { ...input, invoiceReference: "DIFFERENT" })).rejects.toThrow(/Conflicting/);
    const rows = await (await database()).query<{ invoice_reference: string }>("SELECT invoice_reference FROM payments WHERE workspace_id=$1 AND source_event_id=$2", [workspaceId, input.sourceEventId]);
    expect(rows.rows[0].invoice_reference).toBe("UNKNOWN");
  });

  it("rejects cross-workspace customers and voided invoices", async () => {
    const left = `tenant-left-${Date.now()}`; const right = `tenant-right-${Date.now()}`; await ensureWorkspace(left); await ensureWorkspace(right);
    await expect(ingestAndReconcile(sessionFor(right), { sourceEventId: "cross-tenant", customerId: `cust-aster${left}`, amountCents: 100, currency: "CAD", invoiceReference: null })).rejects.toThrow(/workspace/);
    const db = await database(); await db.query("UPDATE invoices SET status='voided' WHERE workspace_id=$1 AND invoice_number='INV-2026-083'", [right]);
    const result = await ingestAndReconcile(sessionFor(right), { sourceEventId: "voided", amountCents: 100, currency: "CAD", invoiceReference: "INV-2026-083" });
    expect(result.decision?.exceptionType).toBe("invalid_invoice_status");
  });

  it("maintains a verifiable linear audit chain during concurrent mutations", async () => {
    const workspaceId = `audit-chain-${Date.now()}`; const session = sessionFor(workspaceId); await ensureWorkspace(workspaceId);
    await Promise.all(Array.from({ length: 20 }, (_, index) => ingestAndReconcile(session, { sourceEventId: `audit-${index}`, amountCents: 100 + index, currency: "CAD", invoiceReference: null })));
    expect(await verifyAuditChain(workspaceId)).toMatchObject({ valid: true });
    const forks = await (await database()).query("SELECT previous_hash,count(*) n FROM audit_events WHERE workspace_id=$1 GROUP BY previous_hash HAVING count(*)>1", [workspaceId]);
    expect(forks.rows).toHaveLength(0);
  });
});

describe("session hardening", () => {
  it("fails closed without a strong secret", () => {
    const saved = process.env.SESSION_SECRET; delete process.env.SESSION_SECRET;
    expect(() => signSession(sessionFor("w"))).toThrow(/SESSION_SECRET/);
    process.env.SESSION_SECRET = saved;
  });

  it("rejects tokens signed with the retired public secret", () => {
    const session = sessionFor("w"); const body = Buffer.from(JSON.stringify(session)).toString("base64url"); const signature = createHmac("sha256", "second-entry-local-demo-secret-change-before-deployment").update(body).digest("base64url");
    expect(verifySession(`${body}.${signature}`)).toBeNull();
  });

  it("places every enabled role login in a fresh isolated workspace", () => {
    const first = authenticateDemo("analyst@secondentry.local", "Analyst-Demo-2026!"); const second = authenticateDemo("analyst@secondentry.local", "Analyst-Demo-2026!");
    expect(first?.workspaceId).toMatch(/^demo-role-/); expect(first?.workspaceId).not.toBe(second?.workspaceId);
  });
});
