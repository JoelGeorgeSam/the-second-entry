CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_heads (
  workspace_id text PRIMARY KEY REFERENCES workspaces(id),
  last_sequence bigint NOT NULL DEFAULT 0,
  last_hash text NOT NULL DEFAULT 'GENESIS',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS document_sequences (
  workspace_id text NOT NULL REFERENCES workspaces(id),
  document_type text NOT NULL CHECK (document_type IN ('order', 'invoice')),
  next_value bigint NOT NULL DEFAULT 1 CHECK (next_value > 0),
  PRIMARY KEY (workspace_id, document_type)
);

CREATE TABLE IF NOT EXISTS exception_notes (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  exception_id text NOT NULL REFERENCES exceptions(id),
  actor_id text NOT NULL,
  note text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS customer_credits (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  customer_id text NOT NULL REFERENCES customers(id),
  payment_id text NOT NULL REFERENCES payments(id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL CHECK (status IN ('held', 'refund_due', 'applied')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_decision_records (
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES workspaces(id),
  exception_id text NOT NULL REFERENCES exceptions(id),
  provider text NOT NULL,
  prompt_version text NOT NULL,
  status text NOT NULL,
  output jsonb,
  failure_context text,
  latency_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS exception_id text REFERENCES exceptions(id);
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS processing_id text;
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE processing_jobs ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS dead_lettered_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS audit_workspace_sequence_unique ON audit_events(workspace_id, sequence);
CREATE INDEX IF NOT EXISTS outbox_dispatch_idx ON outbox_events(status, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS inference_exception_idx ON inference_records(workspace_id, exception_id);
CREATE INDEX IF NOT EXISTS exception_notes_timeline_idx ON exception_notes(workspace_id, exception_id, created_at);

INSERT INTO audit_heads(workspace_id, last_sequence, last_hash)
SELECT w.id,
       COALESCE((SELECT max(a.sequence) FROM audit_events a WHERE a.workspace_id=w.id), 0),
       COALESCE((SELECT a.integrity_hash FROM audit_events a WHERE a.workspace_id=w.id ORDER BY a.sequence DESC LIMIT 1), 'GENESIS')
FROM workspaces w
ON CONFLICT (workspace_id) DO NOTHING;
