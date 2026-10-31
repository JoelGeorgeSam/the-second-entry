CREATE TABLE IF NOT EXISTS workspaces (
  id text PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customers (
  id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id), business_name text NOT NULL,
  contact_email text NOT NULL, billing_address text NOT NULL, currency text NOT NULL CHECK(currency='CAD'),
  status text NOT NULL DEFAULT 'active', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customers_workspace_idx ON customers(workspace_id);
CREATE TABLE IF NOT EXISTS orders (
  id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id), customer_id text NOT NULL REFERENCES customers(id),
  order_number text NOT NULL, status text NOT NULL CHECK(status IN ('draft','confirmed','invoiced','cancelled')),
  subtotal_cents bigint NOT NULL CHECK(subtotal_cents>=0), tax_cents bigint NOT NULL CHECK(tax_cents>=0), total_cents bigint NOT NULL CHECK(total_cents>=0),
  currency text NOT NULL CHECK(currency='CAD'), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, order_number)
);
CREATE TABLE IF NOT EXISTS order_items (
  id text PRIMARY KEY, order_id text NOT NULL REFERENCES orders(id), description text NOT NULL,
  quantity integer NOT NULL CHECK(quantity>0), unit_price_cents bigint NOT NULL CHECK(unit_price_cents>=0)
);
CREATE TABLE IF NOT EXISTS invoices (
  id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id), order_id text NOT NULL UNIQUE REFERENCES orders(id), customer_id text NOT NULL REFERENCES customers(id),
  invoice_number text NOT NULL, issue_date date NOT NULL, due_date date NOT NULL, subtotal_cents bigint NOT NULL CHECK(subtotal_cents>=0),
  tax_cents bigint NOT NULL CHECK(tax_cents>=0), total_cents bigint NOT NULL CHECK(total_cents>=0), paid_cents bigint NOT NULL DEFAULT 0 CHECK(paid_cents>=0),
  currency text NOT NULL CHECK(currency='CAD'), status text NOT NULL CHECK(status IN ('draft','issued','partially_paid','paid','overdue','voided')),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id, invoice_number), CHECK(paid_cents<=total_cents)
);
CREATE TABLE IF NOT EXISTS payments (
  id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id), source_event_id text NOT NULL,
  customer_id text REFERENCES customers(id), invoice_reference text, amount_cents bigint NOT NULL CHECK(amount_cents>0), currency text NOT NULL,
  payment_timestamp timestamptz NOT NULL, method text NOT NULL, status text NOT NULL,
  fingerprint text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(workspace_id, source_event_id)
);
CREATE TABLE IF NOT EXISTS payment_allocations (
  id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id), payment_id text NOT NULL UNIQUE REFERENCES payments(id),
  invoice_id text NOT NULL REFERENCES invoices(id), amount_cents bigint NOT NULL CHECK(amount_cents>0), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS exceptions (
  id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id), payment_id text REFERENCES payments(id), invoice_id text REFERENCES invoices(id),
  type text NOT NULL, severity text NOT NULL, status text NOT NULL, evidence jsonb NOT NULL DEFAULT '{}', risk_score double precision,
  model_version text, assigned_to text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS exception_reviews (
  id text PRIMARY KEY, exception_id text NOT NULL REFERENCES exceptions(id), actor_id text NOT NULL, action text NOT NULL,
  reason text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS audit_events (
  sequence bigserial PRIMARY KEY, id text NOT NULL UNIQUE, workspace_id text NOT NULL REFERENCES workspaces(id), occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id text NOT NULL, action text NOT NULL, resource_type text NOT NULL, resource_id text NOT NULL, outcome text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}', correlation_id text NOT NULL, previous_hash text, integrity_hash text NOT NULL
);
CREATE INDEX IF NOT EXISTS audit_workspace_time_idx ON audit_events(workspace_id, occurred_at DESC);
CREATE TABLE IF NOT EXISTS model_versions (
  id text PRIMARY KEY, model_type text NOT NULL, intended_use text NOT NULL, version text NOT NULL, metrics jsonb NOT NULL,
  limitations text NOT NULL, status text NOT NULL, approved boolean NOT NULL DEFAULT false, evaluated_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS inference_records (
  id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id), exception_id text REFERENCES exceptions(id), model_version text NOT NULL,
  input_snapshot jsonb NOT NULL, risk_score double precision NOT NULL, threshold double precision NOT NULL, explanation jsonb NOT NULL,
  status text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS processing_jobs (
  id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id), type text NOT NULL, status text NOT NULL, attempt_count integer NOT NULL DEFAULT 0,
  correlation_id text NOT NULL, payload jsonb NOT NULL, result jsonb, last_error text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outbox_events (
  id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id), topic text NOT NULL, payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending', attempt_count integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), delivered_at timestamptz
);
CREATE TABLE IF NOT EXISTS workflow_events (
  id text PRIMARY KEY, workspace_id text NOT NULL REFERENCES workspaces(id), scenario text NOT NULL, step text NOT NULL, outcome text NOT NULL,
  details jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS callback_nonces (
  nonce text PRIMARY KEY, received_at timestamptz NOT NULL DEFAULT now()
);
