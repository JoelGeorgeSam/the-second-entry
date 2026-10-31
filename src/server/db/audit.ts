import { createHash, randomUUID } from "node:crypto";

export type Queryable = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: T[] }>;
};

export type AuditInput = {
  workspaceId: string;
  actorId: string;
  action: string;
  resourceType: string;
  resourceId: string;
  outcome: string;
  metadata: Record<string, unknown>;
  correlationId: string;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, item]) => [key, canonicalize(item)]));
  return value;
}

function auditPayload(input: AuditInput, eventId: string, sequence: number, occurredAt: string, previousHash: string) {
  return JSON.stringify(canonicalize({
    eventId,
    workspaceId: input.workspaceId,
    sequence,
    occurredAt,
    actorId: input.actorId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    outcome: input.outcome,
    metadata: input.metadata,
    correlationId: input.correlationId,
    previousHash,
  }));
}

export async function appendAuditTx(tx: Queryable, input: AuditInput) {
  await tx.query(
    "INSERT INTO audit_heads(workspace_id,last_sequence,last_hash) VALUES($1,0,'GENESIS') ON CONFLICT DO NOTHING",
    [input.workspaceId],
  );
  const head = await tx.query<{ last_sequence: unknown; last_hash: string }>(
    "SELECT last_sequence,last_hash FROM audit_heads WHERE workspace_id=$1 FOR UPDATE",
    [input.workspaceId],
  );
  const previousHash = head.rows[0]?.last_hash ?? "GENESIS";
  const chainSequence = Number(head.rows[0]?.last_sequence ?? 0) + 1;
  const eventId = `audit-${randomUUID()}`;
  const occurredAt = new Date().toISOString();
  const integrityHash = createHash("sha256")
    .update(auditPayload(input, eventId, chainSequence, occurredAt, previousHash))
    .digest("hex");
  await tx.query(
    `INSERT INTO audit_events(id,workspace_id,occurred_at,actor_id,action,resource_type,resource_id,outcome,metadata,correlation_id,previous_hash,integrity_hash)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [eventId, input.workspaceId, occurredAt, input.actorId, input.action, input.resourceType, input.resourceId, input.outcome, JSON.stringify({ ...input.metadata, chainSequence }), input.correlationId, previousHash, integrityHash],
  );
  await tx.query(
    "UPDATE audit_heads SET last_sequence=$2,last_hash=$3,updated_at=now() WHERE workspace_id=$1",
    [input.workspaceId, chainSequence, integrityHash],
  );
  return { eventId, chainSequence, integrityHash };
}

export async function verifyAuditChain(db: Queryable, workspaceId: string) {
  const events = await db.query<{
    id: string;
    occurred_at: string | Date;
    actor_id: string;
    action: string;
    resource_type: string;
    resource_id: string;
    outcome: string;
    metadata: Record<string, unknown> | string;
    correlation_id: string;
    previous_hash: string | null;
    integrity_hash: string;
  }>("SELECT * FROM audit_events WHERE workspace_id=$1 ORDER BY sequence", [workspaceId]);
  let previousHash = "GENESIS";
  let expectedSequence = 1;
  for (const event of events.rows) {
    const metadata = typeof event.metadata === "string" ? JSON.parse(event.metadata) : event.metadata;
    const sequence = Number(metadata.chainSequence);
    const occurredAt = new Date(event.occurred_at).toISOString();
    const input: AuditInput = {
      workspaceId,
      actorId: event.actor_id,
      action: event.action,
      resourceType: event.resource_type,
      resourceId: event.resource_id,
      outcome: event.outcome,
      metadata: Object.fromEntries(Object.entries(metadata).filter(([key]) => key !== "chainSequence")),
      correlationId: event.correlation_id,
    };
    const actual = createHash("sha256")
      .update(auditPayload(input, event.id, sequence, occurredAt, previousHash))
      .digest("hex");
    if (sequence !== expectedSequence || event.previous_hash !== previousHash || event.integrity_hash !== actual) {
      return { valid: false, checked: expectedSequence - 1, failureEventId: event.id };
    }
    previousHash = event.integrity_hash;
    expectedSequence += 1;
  }
  return { valid: true, checked: events.rows.length, headHash: previousHash };
}
