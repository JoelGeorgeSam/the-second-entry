import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseCsv } from "@/server/csv";
import { ensureWorkspace, ingestAndReconcile, resolveCustomerReference } from "@/server/db/repository";
import { database } from "@/server/db/client";
import { dispatchOutbox } from "@/server/outbox/dispatcher";
import { LocalQueuePublisher, type QueuePublisher } from "@/server/queue/publisher";
import { inferAnomaly } from "@/server/ml/inference";
import { signCallback } from "../aws/signing";
import type { Session } from "@/server/auth/session";

const session = (workspaceId: string): Session => ({ userId: "pipeline-user", name: "Pipeline", role: "finance_analyst", workspaceId, expiresAt: Date.now() + 60_000 });

describe.sequential("CSV and asynchronous pipeline", () => {
  it("parses quoted CSV fields and the bundled sample yields 3 accepted / 1 rejected", async () => {
    expect(parseCsv('a,b\n"quoted, value","escaped ""quote"""')).toEqual([["a", "b"], ["quoted, value", 'escaped "quote"']]);
    const workspaceId = `csv-${Date.now()}`; await ensureWorkspace(workspaceId); const rows = parseCsv(await readFile("samples/payments.csv", "utf8")); rows.shift(); let accepted = 0; let rejected = 0;
    for (const values of rows) {
      try { const amount = Number(values[3]); if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("invalid"); const customerId = values[1] ? await resolveCustomerReference(workspaceId, values[1]) : null; await ingestAndReconcile(session(workspaceId), { sourceEventId: values[0], customerId, invoiceReference: values[2] || null, amountCents: amount, currency: values[4] }); accepted += 1; } catch { rejected += 1; }
    }
    expect({ accepted, rejected }).toEqual({ accepted: 3, rejected: 1 });
  });

  it("retries a failed outbox publish and then durably marks delivery", async () => {
    const workspaceId = `pipeline-${Date.now()}`; await ensureWorkspace(workspaceId); await ingestAndReconcile(session(workspaceId), { sourceEventId: "pipeline-exception", amountCents: 9_999_999, currency: "CAD", invoiceReference: "INV-2026-083" });
    const failing: QueuePublisher = { publish: async () => { throw new Error("queue offline"); } }; const failed = await dispatchOutbox(failing); expect(failed.some((item) => item.status === "retry_pending")).toBe(true);
    await (await database()).query("UPDATE outbox_events SET next_attempt_at=now() WHERE workspace_id=$1 AND status='retry_pending'", [workspaceId]); const local = new LocalQueuePublisher(); const recovered = await dispatchOutbox(local); expect(recovered.some((item) => item.status === "delivered")).toBe(true); expect(local.messages).toHaveLength(1);
  });

  it("delivers payloads without jobs and dead-letters non-Error publisher failures", async () => {
    const db = await database(); const workspaceId = `outbox-edge-${Date.now()}`; await ensureWorkspace(workspaceId); const deliveredId = `outbox-no-job-${Date.now()}`, deadId = `outbox-dead-${Date.now()}`;
    await db.query("INSERT INTO outbox_events(id,workspace_id,topic,payload,status,attempt_count,next_attempt_at) VALUES($1,$2,'test.no-job',$3,'pending',0,now()),($4,$2,'test.dead',$5,'pending',2,now())", [deliveredId, workspaceId, JSON.stringify({}), deadId, JSON.stringify({ marker: "dead" })]);
    const publisher: QueuePublisher = { publish: async (_id, payload) => { if (payload.marker === "dead") throw "offline"; } }; const results = await dispatchOutbox(publisher);
    expect(results).toEqual(expect.arrayContaining([{ id: deliveredId, status: "delivered" }, { id: deadId, status: "dead_letter" }]));
    expect(await dispatchOutbox(publisher)).toEqual([]);
  });

  it("accepts an identical terminal callback idempotently and rejects a conflicting regression", async () => {
    process.env.CALLBACK_SIGNING_SECRET = "callback-test-secret-at-least-32-characters"; const workspaceId = `callback-${Date.now()}`; await ensureWorkspace(workspaceId); const ingested = await ingestAndReconcile(session(workspaceId), { sourceEventId: "callback-exception", amountCents: 9_999_999, currency: "CAD", invoiceReference: "INV-2026-083" });
    const db = await database(); const job = (await db.query<{ id: string; exception_id: string; payload: Record<string, unknown> }>("SELECT id,exception_id,payload FROM processing_jobs WHERE workspace_id=$1 AND exception_id=$2", [workspaceId, ingested.exceptionId])).rows[0]; const payload = typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload; const inference = inferAnomaly(payload.features as Parameters<typeof inferAnomaly>[0]); const base = { version: 1, jobId: job.id, workspaceId, exceptionId: job.exception_id, processingId: "processing-1", modelVersion: inference.modelVersion, riskScore: inference.riskScore, threshold: inference.threshold, indicators: inference.supportingIndicators, status: "completed", correlationId: String(payload.correlationId), completedAt: new Date().toISOString() };
    const { POST } = await import("@/app/api/internal/jobs/result/route"); const send = async (value: object, nonce: string) => { const body = JSON.stringify(value), timestamp = new Date().toISOString(); return POST(new Request("http://localhost/api/internal/jobs/result", { method: "POST", body, headers: { "content-type": "application/json", "x-se-timestamp": timestamp, "x-se-nonce": nonce, "x-se-signature": signCallback(body, timestamp, nonce, process.env.CALLBACK_SIGNING_SECRET!) } })); };
    expect((await send(base, "nonce-first")).status).toBe(200); expect((await send(base, "nonce-first")).status).toBe(409); const duplicate = await send({ ...base, processingId: "processing-redelivery" }, "nonce-redelivery"); expect(duplicate.status).toBe(200); expect(await duplicate.json()).toMatchObject({ duplicate: true }); const conflict = await send({ ...base, status: "failed", failureContext: "late failure" }, "nonce-conflict"); expect(conflict.status).toBe(409); const terminal = await db.query<{ status: string }>("SELECT status FROM processing_jobs WHERE id=$1", [job.id]); expect(terminal.rows[0].status).toBe("completed");
  });

  it("rejects invalid signatures, malformed signed bodies, and ownership mismatches", async () => {
    process.env.CALLBACK_SIGNING_SECRET = "callback-test-secret-at-least-32-characters"; const { POST } = await import("@/app/api/internal/jobs/result/route"); const invalid = await POST(new Request("http://localhost/api/internal/jobs/result", { method: "POST", body: "{}", headers: { "x-se-timestamp": new Date().toISOString(), "x-se-nonce": "bad-signature", "x-se-signature": "bad" } })); expect(invalid.status).toBe(401);
    const malformedBody = "{"; const malformedTimestamp = new Date().toISOString(); const malformed = await POST(new Request("http://localhost/api/internal/jobs/result", { method: "POST", body: malformedBody, headers: { "x-se-timestamp": malformedTimestamp, "x-se-nonce": "malformed-signed", "x-se-signature": signCallback(malformedBody, malformedTimestamp, "malformed-signed", process.env.CALLBACK_SIGNING_SECRET) } })); expect(malformed.status).toBe(400);
    const missing = { version: 1, jobId: "missing-job", workspaceId: "missing-workspace", exceptionId: "missing-exception", processingId: "missing-processing", modelVersion: "test", riskScore: .5, threshold: .5, indicators: [], status: "failed", correlationId: "missing-correlation", completedAt: new Date().toISOString(), failureContext: "failed" }; const missingBody = JSON.stringify(missing), missingTimestamp = new Date().toISOString(), missingNonce = `missing-${Date.now()}`; const notFound = await POST(new Request("http://localhost/api/internal/jobs/result", { method: "POST", body: missingBody, headers: { "x-se-timestamp": missingTimestamp, "x-se-nonce": missingNonce, "x-se-signature": signCallback(missingBody, missingTimestamp, missingNonce, process.env.CALLBACK_SIGNING_SECRET) } })); expect(notFound.status).toBe(404);
  });

  it("propagates a signed terminal failure to the linked exception", async () => {
    process.env.CALLBACK_SIGNING_SECRET = "callback-test-secret-at-least-32-characters"; const workspaceId = `callback-failed-${Date.now()}`; await ensureWorkspace(workspaceId); const ingested = await ingestAndReconcile(session(workspaceId), { sourceEventId: "callback-failed-exception", amountCents: 9_999_999, currency: "CAD", invoiceReference: "INV-2026-083" });
    const db = await database(); const job = (await db.query<{ id: string; exception_id: string; payload: Record<string, unknown> }>("SELECT id,exception_id,payload FROM processing_jobs WHERE workspace_id=$1 AND exception_id=$2", [workspaceId, ingested.exceptionId])).rows[0]; const payload = typeof job.payload === "string" ? JSON.parse(job.payload) : job.payload; const inference = inferAnomaly(payload.features as Parameters<typeof inferAnomaly>[0]);
    const failed = { version: 1, jobId: job.id, workspaceId, exceptionId: job.exception_id, processingId: "processing-failed", modelVersion: inference.modelVersion, riskScore: inference.riskScore, threshold: inference.threshold, indicators: inference.supportingIndicators, status: "failed", correlationId: String(payload.correlationId), completedAt: new Date().toISOString(), failureContext: "worker exhausted retry budget" };
    const body = JSON.stringify(failed), timestamp = new Date().toISOString(), nonce = `nonce-failed-${Date.now()}`; const { POST } = await import("@/app/api/internal/jobs/result/route"); const response = await POST(new Request("http://localhost/api/internal/jobs/result", { method: "POST", body, headers: { "content-type": "application/json", "x-se-timestamp": timestamp, "x-se-nonce": nonce, "x-se-signature": signCallback(body, timestamp, nonce, process.env.CALLBACK_SIGNING_SECRET) } }));
    expect(response.status).toBe(200); const terminal = await db.query<{ job_status: string; risk_processing_status: string; risk_processing_failure: string; worker_status: string; worker_failure: string }>("SELECT j.status job_status,e.risk_processing_status,e.risk_processing_failure,i.worker_status,i.worker_failure FROM processing_jobs j JOIN exceptions e ON e.id=j.exception_id JOIN inference_records i ON i.exception_id=e.id WHERE j.id=$1", [job.id]); expect(terminal.rows[0]).toMatchObject({ job_status: "failed", risk_processing_status: "failed", risk_processing_failure: "worker exhausted retry budget", worker_status: "failed", worker_failure: "worker exhausted retry budget" });
  });
});
