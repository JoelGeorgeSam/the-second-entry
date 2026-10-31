import { PageHeader } from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";

const nodes = [
  ["Next.js interface", "Server-rendered operations UI, protected role flows, and validated route handlers.", "verified local"],
  ["Financial domain", "Exact-cent arithmetic, transactional reconciliation, idempotency, and authorization.", "verified local"],
  ["Persistence adapter", "PGlite is verified locally; DATABASE_URL PostgreSQL code exists but runtime verification is blocked.", "partial"],
  ["Transactional outbox", "Exception jobs and outbox events commit atomically; local dispatch retry is verified.", "verified local"],
  ["Amazon SQS", "Publisher code, versioned messages, bounded redrive, and DLQ policy. No AWS resources deployed.", "code ready"],
  ["AWS Lambda", "TypeScript worker runs the measured model and returns partial-batch failures. No live Lambda execution.", "code ready"],
  ["Signed callback", "HMAC, timestamp, nonce replay protection, workspace ownership, and terminal-state guards.", "verified local"],
  ["Audit pipeline", "Locked per-workspace chain head, atomic business audit writes, and independent verification.", "verified local"],
] as const;

export default function Architecture() {
  return <><PageHeader title="Architecture Explorer" description="A modular monolith owns financial consistency; a separately deployable worker handles asynchronous risk analysis without direct ledger access." /><section className="card"><div className="card-head"><h2>System flow</h2><StatusBadge status="local verification" /></div><div className="card-body"><div className="architecture">{nodes.map(([title, text, status]) => <div className="arch-node" key={title}><h3>{title}</h3><p>{text}</p><div style={{ marginTop: 10 }}><StatusBadge status={status} /></div></div>)}</div></div></section><div className="grid split" style={{ marginTop: 16 }}><section className="card"><div className="card-head"><h2>Financial consistency boundary</h2></div><div className="card-body"><p>Duplicate recognition, a locked invoice read, matching, allocation, balance update, exception creation, outbox job, and audit event share the transaction. Conditional updates must return the invoice row or the transaction rolls back.</p><p className="secondary">The worker receives bounded features only and cannot write the ledger. Its advisory result returns through an authenticated, replay-protected callback.</p></div></section><section className="card"><div className="card-head"><h2>Deployment truth</h2></div><div className="card-body"><p><b>Verified locally:</b> PGlite application paths, model inference, outbox retry, worker scoring, callback state guards, simulations, and audit chain.</p><p><b>Code complete but not runtime-verified:</b> DATABASE_URL PostgreSQL and SQS publisher.</p><p><b>Not deployed:</b> AWS and Vercel. No external LLM is configured or called.</p></div></section></div></>;
}
