import { NextResponse } from "next/server";
import { database } from "@/server/db/client";
import { RiskResult } from "../../../../../../aws/contracts";
import { verifyCallback } from "../../../../../../aws/signing";

function terminalFingerprint(result: ReturnType<typeof RiskResult.parse>) {
  return JSON.stringify({ jobId: result.jobId, workspaceId: result.workspaceId, exceptionId: result.exceptionId, modelVersion: result.modelVersion, riskScore: result.riskScore, threshold: result.threshold, status: result.status, correlationId: result.correlationId, failureContext: result.failureContext ?? null });
}

export async function POST(request: Request) {
  const body = await request.text();
  const timestamp = request.headers.get("x-se-timestamp") || "";
  const nonce = request.headers.get("x-se-nonce") || "";
  const signature = request.headers.get("x-se-signature") || "";
  const secret = process.env.CALLBACK_SIGNING_SECRET;
  if (!secret || !verifyCallback(body, timestamp, nonce, signature, secret)) return NextResponse.json({ error: "Invalid callback signature or timestamp" }, { status: 401 });
  try {
    const result = RiskResult.parse(JSON.parse(body));
    const db = await database();
    const outcome = await db.transaction(async (tx) => {
      await tx.query("DELETE FROM callback_nonces WHERE received_at < now()-interval '10 minutes'");
      const insertedNonce = await tx.query("INSERT INTO callback_nonces(nonce) VALUES($1) ON CONFLICT DO NOTHING RETURNING nonce", [nonce]);
      if (!insertedNonce.rows.length) return "replay" as const;
      const jobs = await tx.query<{ status: string; result: unknown; exception_id: string }>("SELECT status,result,exception_id FROM processing_jobs WHERE id=$1 AND workspace_id=$2 FOR UPDATE", [result.jobId, result.workspaceId]);
      const job = jobs.rows[0];
      if (!job || job.exception_id !== result.exceptionId) throw new Error("Job not found in workspace");
      if (["completed", "failed"].includes(job.status)) {
        const stored = typeof job.result === "string" ? JSON.parse(job.result) : job.result;
        return terminalFingerprint(RiskResult.parse(stored)) === terminalFingerprint(result) ? "duplicate" as const : "conflict" as const;
      }
      await tx.query("UPDATE processing_jobs SET status=$1,processing_id=$2,result=$3,last_error=$4,completed_at=now(),updated_at=now() WHERE id=$5 AND workspace_id=$6", [result.status, result.processingId, JSON.stringify(result), result.failureContext ?? null, result.jobId, result.workspaceId]);
      if (result.status === "completed") {
        await tx.query("UPDATE exceptions SET risk_score=$1,model_version=$2,risk_processing_status='completed',risk_processing_failure=NULL,updated_at=now() WHERE id=$3 AND workspace_id=$4", [result.riskScore, result.modelVersion, result.exceptionId, result.workspaceId]);
        await tx.query("UPDATE inference_records SET risk_score=$1,threshold=$2,explanation=$3,status='completed',worker_status='completed',worker_failure=NULL,worker_processing_id=$4 WHERE exception_id=$5 AND workspace_id=$6", [result.riskScore, result.threshold, JSON.stringify({ supportingIndicators: result.indicators, processingId: result.processingId }), result.processingId, result.exceptionId, result.workspaceId]);
      } else {
        await tx.query("UPDATE exceptions SET risk_processing_status='failed',risk_processing_failure=$1,updated_at=now() WHERE id=$2 AND workspace_id=$3", [result.failureContext ?? "Worker processing failed", result.exceptionId, result.workspaceId]);
        await tx.query("UPDATE inference_records SET worker_status='failed',worker_failure=$1,worker_processing_id=$2 WHERE exception_id=$3 AND workspace_id=$4", [result.failureContext ?? "Worker processing failed", result.processingId, result.exceptionId, result.workspaceId]);
      }
      return "accepted" as const;
    });
    if (outcome === "replay") return NextResponse.json({ error: "Callback nonce already used" }, { status: 409 });
    if (outcome === "conflict") return NextResponse.json({ error: "Conflicting terminal result rejected" }, { status: 409 });
    return NextResponse.json({ accepted: true, duplicate: outcome === "duplicate" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid callback";
    return NextResponse.json({ error: message.includes("Job not found") ? "Job not found in workspace" : "Invalid callback payload" }, { status: message.includes("Job not found") ? 404 : 400 });
  }
}
