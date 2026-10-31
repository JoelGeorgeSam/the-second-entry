import { database } from "@/server/db/client";
import type { QueuePublisher } from "@/server/queue/publisher";

export async function dispatchOutbox(publisher: QueuePublisher, limit = 20) {
  const db = await database();
  const candidates = await db.query<{ id: string; payload: Record<string, unknown> | string; attempt_count: unknown }>("SELECT id,payload,attempt_count FROM outbox_events WHERE status IN ('pending','retry_pending') AND COALESCE(next_attempt_at,now())<=now() ORDER BY created_at LIMIT $1", [limit]);
  const results: { id: string; status: string }[] = [];
  for (const event of candidates.rows) {
    let jobId = "";
    try {
      const claimed = await db.query("UPDATE outbox_events SET status='dispatching',attempt_count=attempt_count+1 WHERE id=$1 AND status IN ('pending','retry_pending') RETURNING id", [event.id]);
      if (!claimed.rows.length) continue;
      const payload = typeof event.payload === "string" ? JSON.parse(event.payload) : event.payload;
      jobId = String(payload.jobId ?? "");
      await publisher.publish(event.id, payload);
      await db.query("UPDATE outbox_events SET status='delivered',delivered_at=now(),last_error=NULL WHERE id=$1", [event.id]);
      if (jobId) {
        await db.query("UPDATE processing_jobs SET status='queued',attempt_count=attempt_count+1,updated_at=now() WHERE id=$1", [jobId]);
        await db.query("UPDATE exceptions SET risk_processing_status='queued',risk_processing_failure=NULL,updated_at=now() WHERE id=(SELECT exception_id FROM processing_jobs WHERE id=$1)", [jobId]);
        await db.query("UPDATE inference_records SET worker_status='queued',worker_failure=NULL WHERE exception_id=(SELECT exception_id FROM processing_jobs WHERE id=$1)", [jobId]);
      }
      results.push({ id: event.id, status: "delivered" });
    } catch (error) {
      const attempts = Number(event.attempt_count) + 1;
      const dead = attempts >= 3;
      await db.query("UPDATE outbox_events SET status=$2,last_error=$3,next_attempt_at=now()+($4::text||' seconds')::interval,dead_lettered_at=CASE WHEN $2='dead_letter' THEN now() ELSE NULL END WHERE id=$1", [event.id, dead ? "dead_letter" : "retry_pending", error instanceof Error ? error.message.slice(0, 300) : "Publish failed", Math.min(60, 2 ** attempts)]);
      if (jobId) await db.query("UPDATE exceptions SET risk_processing_status=$2,risk_processing_failure=$3,updated_at=now() WHERE id=(SELECT exception_id FROM processing_jobs WHERE id=$1)", [jobId, dead ? "dead_letter" : "retry_pending", error instanceof Error ? error.message.slice(0, 300) : "Publish failed"]);
      if (jobId) await db.query("UPDATE inference_records SET worker_status=$2,worker_failure=$3 WHERE exception_id=(SELECT exception_id FROM processing_jobs WHERE id=$1)", [jobId, dead ? "dead_letter" : "retry_pending", error instanceof Error ? error.message.slice(0, 300) : "Publish failed"]);
      results.push({ id: event.id, status: dead ? "dead_letter" : "retry_pending" });
    }
  }
  return results;
}
