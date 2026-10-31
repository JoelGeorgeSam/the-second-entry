import { createHash, randomUUID } from "node:crypto";
import { database } from "./client";
import { calculateTax, money } from "@/domain/money";
import { decideReconciliation } from "@/domain/reconciliation";
import type { Session } from "@/server/auth/session";
import { requirePermission } from "@/domain/policy";
import { appendAuditTx, verifyAuditChain as verifyChain, type Queryable } from "./audit";
import { inferAnomaly, modelArtifact } from "@/server/ml/inference";
import { explainWithFallback, UnavailableProvider } from "@/server/ai/provider";
import { dispatchOutbox } from "@/server/outbox/dispatcher";
import { LocalQueuePublisher, type QueuePublisher } from "@/server/queue/publisher";

export type Row = Record<string, unknown>;
const id = (prefix: string) => `${prefix}-${randomUUID()}`;
const asNumber = (value: unknown) => Number(value ?? 0);
const workspaceLocks = new Map<string, Promise<void>>();

async function withWorkspaceLock<T>(workspaceId: string, work: () => Promise<T>): Promise<T> {
  const previous = workspaceLocks.get(workspaceId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  workspaceLocks.set(workspaceId, tail);
  await previous;
  try { return await work(); } finally {
    release();
    if (workspaceLocks.get(workspaceId) === tail) workspaceLocks.delete(workspaceId);
  }
}

function normalizedReference(value?: string | null) {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}

function paymentFingerprint(input: { amountCents: number; currency: string; customerId?: string | null; invoiceReference?: string | null }) {
  return createHash("sha256").update(JSON.stringify({
    amountCents: input.amountCents,
    currency: input.currency.trim().toUpperCase(),
    customerId: input.customerId?.trim() || null,
    invoiceReference: normalizedReference(input.invoiceReference),
  })).digest("hex");
}

async function query<T extends Row>(sql: string, params: unknown[] = []): Promise<T[]> {
  const db = await database();
  const result = await db.query<T>(sql, params);
  return result.rows;
}

async function exec(sql: string, params: unknown[] = []) {
  const db = await database();
  return db.query(sql, params);
}

export async function ensureWorkspace(workspaceId: string) {
  const found = await query("SELECT id FROM workspaces WHERE id=$1", [workspaceId]);
  if (found.length) return;
  const db = await database();
  await db.transaction(async (tx) => {
    await tx.query("INSERT INTO workspaces(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING", [workspaceId, "Synthetic Portfolio Workspace"]);
    const customers = [
      ["cust-northstar", "Northstar Office Systems", "ap@northstar.example", "101 King St W, Toronto, ON"],
      ["cust-aster", "Aster Compute Inc.", "finance@aster.example", "88 Water St, Vancouver, BC"],
      ["cust-polaris", "Polaris Analytics", "billing@polaris.example", "225 8 Ave SW, Calgary, AB"],
    ];
    for (const c of customers) await tx.query("INSERT INTO customers(id,workspace_id,business_name,contact_email,billing_address,currency,status,external_code) VALUES($1,$2,$3,$4,$5,'CAD','active',$6) ON CONFLICT DO NOTHING", [c[0]+workspaceId,workspaceId,c[1],c[2],c[3],String(c[0]).replace('cust-','')]);
    const orders = [
      ["ord-1001", "SE-1048", "cust-northstar", "invoiced", 110000, 14300, 124300],
      ["ord-1002", "SE-1049", "cust-aster", "invoiced", 240000, 31200, 271200],
      ["ord-1003", "SE-1050", "cust-polaris", "confirmed", 78000, 10140, 88140],
      ["ord-1004", "SE-1051", "cust-northstar", "invoiced", 480000, 62400, 542400],
    ];
    for (const o of orders) {
      const oid=String(o[0])+workspaceId, cid=String(o[2])+workspaceId;
      await tx.query("INSERT INTO orders(id,workspace_id,customer_id,order_number,status,subtotal_cents,tax_cents,total_cents,currency) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'CAD') ON CONFLICT DO NOTHING", [oid,workspaceId,cid,o[1],o[3],o[4],o[5],o[6]]);
      await tx.query("INSERT INTO order_items(id,order_id,description,quantity,unit_price_cents) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [`item-${o[0]}${workspaceId}`,oid,o[0]==="ord-1004"?"Enterprise controls implementation":"Financial automation services",1,o[4]]);
    }
    const invoices = [
      ["inv-2001", "INV-2026-081", "ord-1001", "cust-northstar", 110000, 14300, 124300, 124300, "paid", "2026-10-02", "2026-11-01"],
      ["inv-2002", "INV-2026-082", "ord-1002", "cust-aster", 240000, 31200, 271200, 120000, "partially_paid", "2026-10-05", "2026-11-04"],
      ["inv-2003", "INV-2026-083", "ord-1004", "cust-northstar", 480000, 62400, 542400, 0, "issued", "2026-10-12", "2026-11-11"],
    ];
    for (const v of invoices) await tx.query("INSERT INTO invoices(id,workspace_id,order_id,customer_id,invoice_number,issue_date,due_date,subtotal_cents,tax_cents,total_cents,paid_cents,currency,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'CAD',$12) ON CONFLICT DO NOTHING", [String(v[0])+workspaceId,workspaceId,String(v[2])+workspaceId,String(v[3])+workspaceId,v[1],v[9],v[10],v[4],v[5],v[6],v[7],v[8]]);
    const payments = [
      ["pay-3001","evt-stripe-8841","cust-northstar","INV-2026-081",124300,"reconciled"],
      ["pay-3002","evt-ach-2982","cust-aster","INV-2026-082",120000,"partially_reconciled"],
      ["pay-3003","evt-wire-4190","cust-northstar","INV-2026-083",552400,"exception"],
      ["pay-3004","evt-wire-4191",null,"MISSING-441",89500,"exception"],
    ];
    for (const p of payments) await tx.query("INSERT INTO payments(id,workspace_id,source_event_id,customer_id,invoice_reference,amount_cents,currency,payment_timestamp,method,status,fingerprint) VALUES($1,$2,$3,$4,$5,$6,'CAD',now()-interval '2 days','electronic',$7,$8) ON CONFLICT DO NOTHING", [String(p[0])+workspaceId,workspaceId,p[1],p[2]?String(p[2])+workspaceId:null,p[3],p[4],p[5],createHash("sha256").update(String(p[1])).digest("hex")]);
    await tx.query("INSERT INTO payment_allocations(id,workspace_id,payment_id,invoice_id,amount_cents) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [`alloc-1${workspaceId}`,workspaceId,`pay-3001${workspaceId}`,`inv-2001${workspaceId}`,124300]);
    await tx.query("INSERT INTO payment_allocations(id,workspace_id,payment_id,invoice_id,amount_cents) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING", [`alloc-2${workspaceId}`,workspaceId,`pay-3002${workspaceId}`,`inv-2002${workspaceId}`,120000]);
    const exceptions = [
      ["exc-4001","pay-3003","inv-2003","overpayment","high",{expectedCents:542400,receivedCents:552400,reason:"Payment exceeds outstanding balance by 10000 cents"}],
      ["exc-4002","pay-3004",null,"unmatched_payment","medium",{reference:"MISSING-441",receivedCents:89500,reason:"No invoice uses this reference"}],
    ];
    for (const e of exceptions) {
      const exceptionId=String(e[0])+workspaceId;const evidence=e[5] as Record<string,unknown>;const received=Number(evidence.receivedCents);const expected=Number(evidence.expectedCents??received);const ratio=received/Math.max(1,expected);
      const features={amountRatio:ratio,absoluteDifferenceRatio:Math.abs(1-ratio),recentPaymentCount:1,duplicateReference:0,daysFromInvoice:18,customerExceptionRate:.25,referencePresent:e[2]?1:0} as const;
      const inference=inferAnomaly(features);
      await tx.query("INSERT INTO exceptions(id,workspace_id,payment_id,invoice_id,type,severity,status,evidence,risk_score,model_version) VALUES($1,$2,$3,$4,$5,$6,'open',$7,$8,$9) ON CONFLICT DO NOTHING", [exceptionId,workspaceId,String(e[1])+workspaceId,e[2]?String(e[2])+workspaceId:null,e[3],e[4],JSON.stringify(evidence),inference.riskScore,inference.modelVersion]);
      await tx.query("INSERT INTO inference_records(id,workspace_id,exception_id,model_version,input_snapshot,risk_score,threshold,explanation,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'completed') ON CONFLICT DO NOTHING",[`infer-${e[0]}${workspaceId}`,workspaceId,exceptionId,inference.modelVersion,JSON.stringify(features),inference.riskScore,inference.threshold,JSON.stringify({supportingIndicators:inference.supportingIndicators})]);
    }
    const artifact=modelArtifact();
    await tx.query("INSERT INTO model_versions(id,model_type,intended_use,version,metrics,limitations,status,approved,evaluated_at) VALUES('model-logreg-1','logistic_regression','Synthetic payment anomaly prioritization',$1,$2,'Synthetic labels; portfolio demonstration only; not validated for fraud detection.','local',true,now()) ON CONFLICT (id) DO UPDATE SET version=excluded.version,metrics=excluded.metrics,limitations=excluded.limitations,evaluated_at=excluded.evaluated_at",[artifact.version,JSON.stringify(artifact.metrics)]);
  });
  await appendAudit(workspaceId, "system", "workspace.seeded", "workspace", workspaceId, "success", { synthetic: true }, id("corr"));
}

export async function appendAudit(workspaceId: string, actorId: string, action: string, resourceType: string, resourceId: string, outcome: string, metadata: Row, correlationId: string) {
  await withWorkspaceLock(workspaceId, async () => {
    const db = await database();
    await db.transaction((tx) => appendAuditTx(tx as Queryable, { workspaceId, actorId, action, resourceType, resourceId, outcome, metadata, correlationId }));
  });
}

export async function verifyAuditChain(workspaceId: string) {
  return verifyChain(await database() as Queryable, workspaceId);
}

export async function dashboard(workspaceId: string) {
  await ensureWorkspace(workspaceId);
  const [invoice] = await query<{invoiced:unknown;paid:unknown;outstanding:unknown;overdue:unknown}>("SELECT COALESCE(sum(total_cents),0) invoiced,COALESCE(sum(paid_cents),0) paid,COALESCE(sum(total_cents-paid_cents),0) outstanding,COALESCE(sum(CASE WHEN due_date<CURRENT_DATE AND status NOT IN ('paid','voided') THEN total_cents-paid_cents ELSE 0 END),0) overdue FROM invoices WHERE workspace_id=$1",[workspaceId]);
  const [payments] = await query<{total:unknown;matched:unknown}>("SELECT count(*) total,count(*) FILTER(WHERE status IN ('reconciled','partially_reconciled')) matched FROM payments WHERE workspace_id=$1",[workspaceId]);
  const [exceptions] = await query<{open:unknown}>("SELECT count(*) FILTER(WHERE status NOT LIKE 'resolved%') open FROM exceptions WHERE workspace_id=$1",[workspaceId]);
  const recent = await query("SELECT action,resource_type,resource_id,outcome,occurred_at FROM audit_events WHERE workspace_id=$1 ORDER BY sequence DESC LIMIT 7",[workspaceId]);
  return { invoiced:asNumber(invoice.invoiced),paid:asNumber(invoice.paid),outstanding:asNumber(invoice.outstanding),overdue:asNumber(invoice.overdue),payments:asNumber(payments.total),matched:asNumber(payments.matched),openExceptions:asNumber(exceptions.open),recent };
}

export async function listOrders(workspaceId:string){ await ensureWorkspace(workspaceId); return query("SELECT o.*,c.business_name FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.workspace_id=$1 ORDER BY o.created_at DESC",[workspaceId]); }
export async function listInvoices(workspaceId:string){ await ensureWorkspace(workspaceId); return query("SELECT i.*,c.business_name FROM invoices i JOIN customers c ON c.id=i.customer_id WHERE i.workspace_id=$1 ORDER BY i.created_at DESC",[workspaceId]); }
export async function listPayments(workspaceId:string){ await ensureWorkspace(workspaceId); return query("SELECT p.*,c.business_name FROM payments p LEFT JOIN customers c ON c.id=p.customer_id WHERE p.workspace_id=$1 ORDER BY p.created_at DESC",[workspaceId]); }
export async function listExceptions(workspaceId:string){ await ensureWorkspace(workspaceId); return query("SELECT e.*,p.source_event_id,p.amount_cents,i.invoice_number,(SELECT jsonb_agg(jsonb_build_object('actorId',r.actor_id,'action',r.action,'reason',r.reason,'createdAt',r.created_at) ORDER BY r.created_at) FROM exception_reviews r WHERE r.exception_id=e.id) reviews,(SELECT jsonb_agg(jsonb_build_object('actorId',n.actor_id,'note',n.note,'createdAt',n.created_at) ORDER BY n.created_at) FROM exception_notes n WHERE n.exception_id=e.id AND n.workspace_id=e.workspace_id) notes FROM exceptions e LEFT JOIN payments p ON p.id=e.payment_id LEFT JOIN invoices i ON i.id=e.invoice_id WHERE e.workspace_id=$1 ORDER BY e.created_at DESC",[workspaceId]); }
export async function listCustomers(workspaceId:string){ await ensureWorkspace(workspaceId); return query("SELECT * FROM customers WHERE workspace_id=$1 ORDER BY business_name",[workspaceId]); }
export async function resolveCustomerReference(workspaceId:string,reference:string){const normalized=reference.trim().toLowerCase().replace(/^cust-/,"");const rows=await query<{id:string}>("SELECT id FROM customers WHERE workspace_id=$1 AND (id=$2 OR lower(external_code)=$3)",[workspaceId,reference.trim(),normalized]);return rows[0]?.id??null;}
export async function listAudit(workspaceId:string){ await ensureWorkspace(workspaceId); return query("SELECT * FROM audit_events WHERE workspace_id=$1 ORDER BY sequence DESC LIMIT 100",[workspaceId]); }
export async function listJobs(workspaceId:string){ await ensureWorkspace(workspaceId); return query("SELECT * FROM processing_jobs WHERE workspace_id=$1 ORDER BY created_at DESC",[workspaceId]); }

export async function createOrder(session:Session,input:{customerId:string;description:string;quantity:number;unitPriceCents:number}){
  requirePermission(session.role,"create_order"); await ensureWorkspace(session.workspaceId);
  if(!Number.isSafeInteger(input.quantity)||input.quantity<=0||!Number.isSafeInteger(input.unitPriceCents)||input.unitPriceCents<=0) throw new Error("Invalid order values");
  const customer=(await query("SELECT id FROM customers WHERE id=$1 AND workspace_id=$2",[input.customerId,session.workspaceId]))[0]; if(!customer) throw new Error("Customer not found in workspace");
  const subtotal=input.quantity*input.unitPriceCents; const tax=calculateTax(money(subtotal),1300).cents; const orderId=id("ord");
  return withWorkspaceLock(session.workspaceId, async()=>{const db=await database();return db.transaction(async(tx)=>{
    await tx.query("INSERT INTO document_sequences(workspace_id,document_type,next_value) VALUES($1,'order',2) ON CONFLICT (workspace_id,document_type) DO UPDATE SET next_value=document_sequences.next_value+1 RETURNING next_value-1 value",[session.workspaceId]);
    const seq=await tx.query<{value:unknown}>("SELECT next_value-1 value FROM document_sequences WHERE workspace_id=$1 AND document_type='order'",[session.workspaceId]);
    const number=`SE-${String(Number(seq.rows[0].value)).padStart(6,"0")}`;
    await tx.query("INSERT INTO orders(id,workspace_id,customer_id,order_number,status,subtotal_cents,tax_cents,total_cents,currency) VALUES($1,$2,$3,$4,'draft',$5,$6,$7,'CAD')",[orderId,session.workspaceId,input.customerId,number,subtotal,tax,subtotal+tax]);
    await tx.query("INSERT INTO order_items(id,order_id,description,quantity,unit_price_cents) VALUES($1,$2,$3,$4,$5)",[id("item"),orderId,input.description,input.quantity,input.unitPriceCents]);
    await appendAuditTx(tx as Queryable,{workspaceId:session.workspaceId,actorId:session.userId,action:"order.created",resourceType:"order",resourceId:orderId,outcome:"success",metadata:{number,totalCents:subtotal+tax},correlationId:id("corr")});
    return orderId;
  });});
}

export async function confirmAndInvoice(session:Session,orderId:string){
  requirePermission(session.role,"create_order");
  return withWorkspaceLock(session.workspaceId,async()=>{const db=await database();return db.transaction(async(tx)=>{
    const locked=await tx.query<any>("SELECT * FROM orders WHERE id=$1 AND workspace_id=$2 FOR UPDATE",[orderId,session.workspaceId]);const order=locked.rows[0];
    if(!order)throw new Error("Order not found");if(!["draft","confirmed"].includes(order.status))throw new Error("Only draft or confirmed orders can be invoiced");
    await tx.query("INSERT INTO document_sequences(workspace_id,document_type,next_value) VALUES($1,'invoice',2) ON CONFLICT (workspace_id,document_type) DO UPDATE SET next_value=document_sequences.next_value+1",[session.workspaceId]);
    const seq=await tx.query<{value:unknown}>("SELECT next_value-1 value FROM document_sequences WHERE workspace_id=$1 AND document_type='invoice'",[session.workspaceId]);
    const invoiceId=id("inv"),number=`INV-${new Date().getUTCFullYear()}-${String(Number(seq.rows[0].value)).padStart(6,"0")}`;
    const changed=await tx.query("UPDATE orders SET status='invoiced',updated_at=now() WHERE id=$1 AND workspace_id=$2 AND status IN ('draft','confirmed') RETURNING id",[orderId,session.workspaceId]);
    if(!changed.rows.length)throw new Error("Order state changed before invoice issuance");
    await tx.query("INSERT INTO invoices(id,workspace_id,order_id,customer_id,invoice_number,issue_date,due_date,subtotal_cents,tax_cents,total_cents,paid_cents,currency,status) VALUES($1,$2,$3,$4,$5,CURRENT_DATE,CURRENT_DATE+30,$6,$7,$8,0,'CAD','issued')",[invoiceId,session.workspaceId,orderId,order.customer_id,number,order.subtotal_cents,order.tax_cents,order.total_cents]);
    await appendAuditTx(tx as Queryable,{workspaceId:session.workspaceId,actorId:session.userId,action:"invoice.issued",resourceType:"invoice",resourceId:invoiceId,outcome:"success",metadata:{orderId,number},correlationId:id("corr")});
    return invoiceId;
  });});
}

export async function ingestAndReconcile(session:Session,input:{sourceEventId:string;customerId?:string|null;invoiceReference?:string|null;amountCents:number;currency:string}){
  requirePermission(session.role,"ingest_payment");
  if(!Number.isSafeInteger(input.amountCents)||input.amountCents<=0)throw new Error("Payment amount must be positive integer cents");
  if(input.currency!=="CAD")throw new Error("Only CAD is supported");
  await ensureWorkspace(session.workspaceId);
  const normalizedInput={...input,customerId:input.customerId?.trim()||null,invoiceReference:normalizedReference(input.invoiceReference)};
  const fingerprint=paymentFingerprint(normalizedInput);
  const result=await withWorkspaceLock(session.workspaceId,async()=>{const db=await database();return db.transaction(async(tx)=>{
    if(normalizedInput.customerId){const owned=await tx.query("SELECT id FROM customers WHERE id=$1 AND workspace_id=$2",[normalizedInput.customerId,session.workspaceId]);if(!owned.rows.length)throw new Error("Customer not found in workspace");}
    const paymentId=id("pay");
    const inserted=await tx.query<{id:string}>(`INSERT INTO payments(id,workspace_id,source_event_id,customer_id,invoice_reference,amount_cents,currency,payment_timestamp,method,status,fingerprint)
      VALUES($1,$2,$3,$4,$5,$6,'CAD',now(),'manual','processing',$7)
      ON CONFLICT (workspace_id,source_event_id) DO NOTHING RETURNING id`,[paymentId,session.workspaceId,normalizedInput.sourceEventId,normalizedInput.customerId,normalizedInput.invoiceReference,normalizedInput.amountCents,fingerprint]);
    if(!inserted.rows.length){
      const existing=(await tx.query<any>("SELECT id,fingerprint FROM payments WHERE workspace_id=$1 AND source_event_id=$2 FOR UPDATE",[session.workspaceId,normalizedInput.sourceEventId])).rows[0];
      const same=existing?.fingerprint===fingerprint;
      await appendAuditTx(tx as Queryable,{workspaceId:session.workspaceId,actorId:session.userId,action:same?"payment.duplicate_ignored":"payment.conflict",resourceType:"payment",resourceId:String(existing.id),outcome:same?"ignored":"denied",metadata:{sourceEventId:normalizedInput.sourceEventId,fingerprint},correlationId:id("corr")});
      return same?{duplicate:true,paymentId:String(existing.id)}:{conflict:true,paymentId:String(existing.id)};
    }
    const invoice=normalizedInput.invoiceReference?(await tx.query<any>("SELECT * FROM invoices WHERE workspace_id=$1 AND upper(invoice_number)=$2 FOR UPDATE",[session.workspaceId,normalizedInput.invoiceReference])).rows[0]??null:null;
    const decision=decideReconciliation({paymentId,sourceEventId:normalizedInput.sourceEventId,amountCents:normalizedInput.amountCents,currency:"CAD",customerId:normalizedInput.customerId,invoiceReference:normalizedInput.invoiceReference,invoice:invoice?{id:invoice.id,customerId:invoice.customer_id,currency:invoice.currency,outstandingCents:asNumber(invoice.total_cents)-asNumber(invoice.paid_cents),status:invoice.status}:null});
    const paymentStatus=decision.outcome==="auto_matched"?"reconciled":decision.outcome==="partial_match"?"partially_reconciled":"exception";
    await tx.query("UPDATE payments SET status=$2 WHERE id=$1",[paymentId,paymentStatus]);
    if(decision.allocationCents>0&&invoice){
      const updated=await tx.query("UPDATE invoices SET paid_cents=paid_cents+$1,status=CASE WHEN paid_cents+$1=total_cents THEN 'paid' ELSE 'partially_paid' END,updated_at=now() WHERE id=$2 AND workspace_id=$3 AND status IN ('issued','partially_paid','overdue') AND paid_cents+$1<=total_cents RETURNING id",[decision.allocationCents,invoice.id,session.workspaceId]);
      if(!updated.rows.length)throw new Error("Invoice balance changed before allocation; payment was rolled back");
      await tx.query("INSERT INTO payment_allocations(id,workspace_id,payment_id,invoice_id,amount_cents) VALUES($1,$2,$3,$4,$5)",[id("alloc"),session.workspaceId,paymentId,invoice.id,decision.allocationCents]);
    }
    let exceptionId:string|undefined;
    if(decision.outcome==="exception"){
      exceptionId=id("exc");
      const evidence={reason:decision.reason,amountCents:normalizedInput.amountCents,sourceEventId:normalizedInput.sourceEventId,invoiceReference:normalizedInput.invoiceReference,invoiceStatus:invoice?.status??null,outstandingCents:invoice?asNumber(invoice.total_cents)-asNumber(invoice.paid_cents):null};
      const recent=(await tx.query<{count:unknown}>("SELECT count(*) count FROM payments WHERE workspace_id=$1 AND customer_id IS NOT DISTINCT FROM $2 AND created_at>now()-interval '30 days'",[session.workspaceId,normalizedInput.customerId])).rows[0];
      const exceptionRate=(await tx.query<{rate:unknown}>("SELECT COALESCE(avg(CASE WHEN status='exception' THEN 1.0 ELSE 0.0 END),0) rate FROM payments WHERE workspace_id=$1 AND customer_id IS NOT DISTINCT FROM $2",[session.workspaceId,normalizedInput.customerId])).rows[0];
      const denominator=invoice?Math.max(1,asNumber(invoice.total_cents)):Math.max(1,normalizedInput.amountCents);
      const amountRatio=normalizedInput.amountCents/denominator;
      const features={amountRatio,absoluteDifferenceRatio:Math.abs(1-amountRatio),recentPaymentCount:asNumber(recent.count),duplicateReference:0,daysFromInvoice:invoice?Math.max(0,Math.round((Date.now()-new Date(invoice.issue_date).getTime())/86400000)):0,customerExceptionRate:Number(exceptionRate.rate??0),referencePresent:normalizedInput.invoiceReference?1:0} as const;
      const inference=inferAnomaly(features);
      await tx.query("INSERT INTO exceptions(id,workspace_id,payment_id,invoice_id,type,severity,status,evidence,risk_score,model_version,risk_processing_status) VALUES($1,$2,$3,$4,$5,$6,'open',$7,$8,$9,'delivery_pending')",[exceptionId,session.workspaceId,paymentId,invoice?.id??null,decision.exceptionType,decision.exceptionType==="overpayment"?"high":"medium",JSON.stringify(evidence),inference.riskScore,inference.modelVersion]);
      const artifactHash=createHash("sha256").update(JSON.stringify(modelArtifact())).digest("hex");
      await tx.query("INSERT INTO inference_records(id,workspace_id,exception_id,model_version,input_snapshot,risk_score,threshold,explanation,status,worker_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'completed','delivery_pending')",[id("infer"),session.workspaceId,exceptionId,inference.modelVersion,JSON.stringify(features),inference.riskScore,inference.threshold,JSON.stringify({supportingIndicators:inference.supportingIndicators,artifactHash})]);
      const jobId=id("job"),correlationId=id("corr");
      const message={version:1,jobId,workspaceId:session.workspaceId,exceptionId,correlationId,requestedAt:new Date().toISOString(),features};
      await tx.query("INSERT INTO processing_jobs(id,workspace_id,exception_id,type,status,correlation_id,payload) VALUES($1,$2,$3,'risk_analysis','delivery_pending',$4,$5)",[jobId,session.workspaceId,exceptionId,correlationId,JSON.stringify(message)]);
      await tx.query("INSERT INTO outbox_events(id,workspace_id,topic,payload,status,next_attempt_at) VALUES($1,$2,'risk.analysis.requested',$3,'pending',now())",[id("outbox"),session.workspaceId,JSON.stringify(message)]);
    }
    await appendAuditTx(tx as Queryable,{workspaceId:session.workspaceId,actorId:session.userId,action:"payment.reconciled",resourceType:"payment",resourceId:paymentId,outcome:"success",metadata:{decision,exceptionId},correlationId:id("corr")});
    return {duplicate:false,paymentId,decision,exceptionId};
  });});
  if("conflict" in result&&result.conflict)throw new Error("Conflicting data for existing source event ID");
  return result;
}

export async function resolveException(session:Session,exceptionId:string,reason:string,action:"approve"|"reject"="approve"){
  try{requirePermission(session.role,"approve");}catch(error){await appendAudit(session.workspaceId,session.userId,"exception.approval_denied","exception",exceptionId,"denied",{role:session.role},id("corr"));throw error;}
  if(reason.trim().length<8)throw new Error("Review reason must contain at least 8 characters");
  await withWorkspaceLock(session.workspaceId,async()=>{const db=await database();await db.transaction(async(tx)=>{
    const locked=await tx.query<any>("SELECT e.*,p.customer_id,p.id payment_id FROM exceptions e LEFT JOIN payments p ON p.id=e.payment_id WHERE e.id=$1 AND e.workspace_id=$2 FOR UPDATE OF e",[exceptionId,session.workspaceId]);const exception=locked.rows[0];
    if(!exception||String(exception.status).startsWith("resolved_"))throw new Error("Open exception not found");
    const status=action==="approve"?"resolved_approved":"resolved_rejected";
    const changed=await tx.query("UPDATE exceptions SET status=$1,assigned_to=$2,updated_at=now() WHERE id=$3 AND workspace_id=$4 AND status IN ('open','investigating','awaiting_review') RETURNING id",[status,session.userId,exceptionId,session.workspaceId]);
    if(!changed.rows.length)throw new Error("Illegal exception state transition");
    await tx.query("INSERT INTO exception_reviews(id,exception_id,actor_id,action,reason) VALUES($1,$2,$3,$4,$5)",[id("review"),exceptionId,session.userId,action==="approve"?"approved":"rejected",reason.trim()]);
    if(action==="approve"&&exception.type==="overpayment"&&exception.customer_id&&exception.payment_id){const payment=await tx.query<{amount_cents:unknown}>("SELECT amount_cents FROM payments WHERE id=$1 AND workspace_id=$2",[exception.payment_id,session.workspaceId]);await tx.query("INSERT INTO customer_credits(id,workspace_id,customer_id,payment_id,amount_cents,status) VALUES($1,$2,$3,$4,$5,'refund_due')",[id("credit"),session.workspaceId,exception.customer_id,exception.payment_id,asNumber(payment.rows[0].amount_cents)]);}
    await appendAuditTx(tx as Queryable,{workspaceId:session.workspaceId,actorId:session.userId,action:action==="approve"?"exception.approved":"exception.rejected",resourceType:"exception",resourceId:exceptionId,outcome:"success",metadata:{reason:reason.trim(),status,overpaymentPolicy:exception.type==="overpayment"&&action==="approve"?"mark_refund_due":null},correlationId:id("corr")});
  });});
}

export async function addExceptionNote(session:Session,exceptionId:string,note:string){
  if(note.trim().length<3)throw new Error("Note must contain at least 3 characters");
  await withWorkspaceLock(session.workspaceId,async()=>{const db=await database();await db.transaction(async(tx)=>{const found=await tx.query("UPDATE exceptions SET status=CASE WHEN status='open' THEN 'investigating' ELSE status END,updated_at=now() WHERE id=$1 AND workspace_id=$2 AND status NOT LIKE 'resolved_%' RETURNING id",[exceptionId,session.workspaceId]);if(!found.rows.length)throw new Error("Open exception not found");await tx.query("INSERT INTO exception_notes(id,workspace_id,exception_id,actor_id,note) VALUES($1,$2,$3,$4,$5)",[id("note"),session.workspaceId,exceptionId,session.userId,note.trim()]);await appendAuditTx(tx as Queryable,{workspaceId:session.workspaceId,actorId:session.userId,action:"exception.note_added",resourceType:"exception",resourceId:exceptionId,outcome:"success",metadata:{noteLength:note.trim().length},correlationId:id("corr")});});});
}

export async function analytics(workspaceId:string){
  await ensureWorkspace(workspaceId); const outcomes=await query("SELECT status,count(*) count FROM payments WHERE workspace_id=$1 GROUP BY status ORDER BY status",[workspaceId]); const categories=await query("SELECT type,count(*) count FROM exceptions WHERE workspace_id=$1 GROUP BY type ORDER BY type",[workspaceId]); const workflows=await query("SELECT scenario,outcome,count(*) count FROM workflow_events WHERE workspace_id=$1 GROUP BY scenario,outcome",[workspaceId]); return {outcomes,categories,workflows};
}

export async function runSimulation(session:Session,scenario:string){
  await ensureWorkspace(session.workspaceId);if(!session.workspaceId.startsWith("demo-")&&!session.workspaceId.startsWith("test-")&&!session.workspaceId.startsWith("p"))throw new Error("Workflow Lab is restricted to disposable synthetic workspaces");const workflowId=id("flow"),correlationId=id("corr");let preserved=false;let details:Row={};
  if(scenario==="duplicate_payment"){
    const source=`lab-duplicate-${workflowId}`;const first=await ingestAndReconcile(session,{sourceEventId:source,amountCents:5000,currency:"CAD",invoiceReference:"UNKNOWN-LAB"});const second=await ingestAndReconcile(session,{sourceEventId:source,amountCents:5000,currency:"CAD",invoiceReference:"UNKNOWN-LAB"});const measured=await query<{payments:unknown;allocations:unknown}>("SELECT count(DISTINCT p.id) payments,count(a.id) allocations FROM payments p LEFT JOIN payment_allocations a ON a.payment_id=p.id WHERE p.workspace_id=$1 AND p.source_event_id=$2",[session.workspaceId,source]);preserved=asNumber(measured[0].payments)===1&&asNumber(measured[0].allocations)===0&&second.duplicate===true;details={firstPaymentId:first.paymentId,secondPaymentId:second.paymentId,duplicateIgnored:second.duplicate,paymentRows:asNumber(measured[0].payments),allocationRows:asNumber(measured[0].allocations)};
  }else if(scenario==="worker_timeout"){
    const before=(await dashboard(session.workspaceId)).paid;const jobId=id("job");await exec("INSERT INTO processing_jobs(id,workspace_id,type,status,attempt_count,correlation_id,payload,last_error,next_attempt_at) VALUES($1,$2,'risk_analysis','retry_pending',1,$3,'{}','Observed worker timeout',now())",[jobId,session.workspaceId,correlationId]);await exec("UPDATE processing_jobs SET attempt_count=attempt_count+1,status='failed',last_error='Timeout retry budget exhausted',updated_at=now(),completed_at=now() WHERE id=$1",[jobId]);const job=(await query<any>("SELECT status,attempt_count FROM processing_jobs WHERE id=$1",[jobId]))[0];const after=(await dashboard(session.workspaceId)).paid;preserved=job.status==="failed"&&asNumber(job.attempt_count)===2&&before===after;details={jobId,attempts:asNumber(job.attempt_count),terminalState:job.status,financialBefore:before,financialAfter:after};
  }else if(scenario==="queue_failure"){
    const jobId=id("job"),outboxId=id("outbox");const payload={jobId,workspaceId:session.workspaceId};const db=await database();await db.transaction(async tx=>{await tx.query("INSERT INTO processing_jobs(id,workspace_id,type,status,correlation_id,payload) VALUES($1,$2,'risk_analysis','delivery_pending',$3,$4)",[jobId,session.workspaceId,correlationId,JSON.stringify(payload)]);await tx.query("INSERT INTO outbox_events(id,workspace_id,topic,payload,status,next_attempt_at) VALUES($1,$2,'risk.analysis.requested',$3,'pending',now())",[outboxId,session.workspaceId,JSON.stringify(payload)]);});const failing:QueuePublisher={publish:async()=>{throw new Error("Injected queue outage");}};const failed=await dispatchOutbox(failing);await exec("UPDATE outbox_events SET next_attempt_at=now() WHERE id=$1",[outboxId]);const local=new LocalQueuePublisher();const recovered=await dispatchOutbox(local);const row=(await query<any>("SELECT status,attempt_count FROM outbox_events WHERE id=$1",[outboxId]))[0];preserved=failed[0]?.status==="retry_pending"&&recovered[0]?.status==="delivered"&&row.status==="delivered"&&local.messages.length===1;details={jobId,outboxId,attempts:asNumber(row.attempt_count),transitions:[failed[0]?.status,recovered[0]?.status],deliveredMessages:local.messages.length};
  }else if(scenario==="unauthorized_approval"){
    const target=(await query<any>("SELECT id,status FROM exceptions WHERE workspace_id=$1 AND status NOT LIKE 'resolved%' LIMIT 1",[session.workspaceId]))[0];let denied=false;if(target){try{await resolveException({...session,userId:"lab-analyst",role:"finance_analyst"},target.id,"Unauthorized lab approval attempt");}catch{denied=true;}}const after=target?(await query<any>("SELECT status FROM exceptions WHERE id=$1 AND workspace_id=$2",[target.id,session.workspaceId]))[0]:null;preserved=Boolean(target)&&denied&&after?.status===target.status;details={exceptionId:target?.id??null,role:"finance_analyst",denied,stateBefore:target?.status??null,stateAfter:after?.status??null};
  }else if(scenario==="ai_unavailable"){
    const target=(await query<any>("SELECT e.id,e.type,p.amount_cents,p.source_event_id,e.evidence FROM exceptions e JOIN payments p ON p.id=e.payment_id WHERE e.workspace_id=$1 LIMIT 1",[session.workspaceId]))[0];const before=(await dashboard(session.workspaceId)).paid;const evidence=typeof target.evidence==="string"?JSON.parse(target.evidence):target.evidence;const explanation=await explainWithFallback(new UnavailableProvider(),{exceptionType:target.type,amountCents:asNumber(target.amount_cents),sourceEventId:target.source_event_id,reason:String(evidence.reason??"Review required")});await exec("INSERT INTO ai_decision_records(id,workspace_id,exception_id,provider,prompt_version,status,output,failure_context,latency_ms) VALUES($1,$2,$3,$4,'exception-explanation-v1',$5,$6,$7,$8)",[id("ai"),session.workspaceId,target.id,explanation.provider,explanation.status,JSON.stringify(explanation.output),explanation.failureContext??null,explanation.latencyMs]);const after=(await dashboard(session.workspaceId)).paid;preserved=explanation.status==="fallback"&&before===after;details={providerStatus:"unavailable",fallbackProvider:"deterministic-non-ai",failureRecorded:true,financialBefore:before,financialAfter:after,summary:explanation.output.summary};
  }else if(scenario==="conflicting_events"){
    const source=`lab-conflict-${workflowId}`;await ingestAndReconcile(session,{sourceEventId:source,amountCents:5100,currency:"CAD",invoiceReference:"UNKNOWN-LAB"});let conflictDetected=false;try{await ingestAndReconcile(session,{sourceEventId:source,amountCents:5200,currency:"CAD",invoiceReference:"UNKNOWN-LAB"});}catch{conflictDetected=true;}const stored=(await query<any>("SELECT amount_cents FROM payments WHERE workspace_id=$1 AND source_event_id=$2",[session.workspaceId,source]))[0];preserved=conflictDetected&&asNumber(stored.amount_cents)===5100;details={sourceEventId:source,conflictDetected,storedAmountCents:asNumber(stored.amount_cents)};
  }else throw new Error("Unknown simulation scenario");
  const outcome=preserved?"invariant_preserved":"invariant_violated";await exec("INSERT INTO workflow_events(id,workspace_id,scenario,step,outcome,details) VALUES($1,$2,$3,'completed',$4,$5)",[workflowId,session.workspaceId,scenario,outcome,JSON.stringify(details)]);await appendAudit(session.workspaceId,session.userId,"workflow.simulated","workflow",workflowId,preserved?"success":"failure",{scenario,...details},correlationId);return{workflowId,outcome,details};
}

export async function listWorkflowEvents(workspaceId:string){await ensureWorkspace(workspaceId);return query("SELECT * FROM workflow_events WHERE workspace_id=$1 ORDER BY created_at DESC LIMIT 30",[workspaceId]);}
