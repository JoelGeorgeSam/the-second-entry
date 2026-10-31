import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalSession } from "@/server/auth/session";
import { ingestAndReconcile, resolveCustomerReference } from "@/server/db/repository";
import { apiError } from "@/server/api-response";
import { isSpreadsheetFormula, parseCsv } from "@/server/csv";
import { validateJsonMutation } from "@/server/request-security";

const Body = z.object({ csv: z.string().min(1).max(128_000) });
const expectedHeaders = ["source_event_id", "customer_code", "invoice_reference", "amount_cents", "currency"];

export async function POST(request: Request) {
  const denied = validateJsonMutation(request); if (denied) return denied;
  try {
    const session = await getOptionalSession();
    if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const { csv } = Body.parse(await request.json());
    if (csv.includes("\0")) throw new Error("Binary content is not accepted");
    const rows = parseCsv(csv.replace(/^\uFEFF/, ""));
    if (rows.length < 2) throw new Error("CSV must include a header and at least one record");
    if (rows.length > 501) throw new Error("Import is limited to 500 records");
    const headers = rows.shift()?.map((value) => value.toLowerCase());
    if (JSON.stringify(headers) !== JSON.stringify(expectedHeaders)) throw new Error(`Expected headers: ${expectedHeaders.join(",")}`);
    let accepted = 0; const rejected: { row: number; error: string }[] = [];
    for (let index = 0; index < rows.length; index += 1) {
      const values = rows[index];
      try {
        if (values.length !== 5) throw new Error("Expected 5 columns");
        if (values.some(isSpreadsheetFormula)) throw new Error("Spreadsheet formulas are not accepted");
        if (!/^[a-zA-Z0-9_-]{3,80}$/.test(values[0])) throw new Error("source_event_id must use 3-80 letters, numbers, underscores, or hyphens");
        const amount = Number(values[3]);
        if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error("amount_cents must be a positive integer");
        const customerId = values[1] ? await resolveCustomerReference(session.workspaceId, values[1]) : null;
        if (values[1] && !customerId) throw new Error(`Unknown customer code: ${values[1]}`);
        await ingestAndReconcile(session, { sourceEventId: values[0], customerId, invoiceReference: values[2] || null, amountCents: amount, currency: values[4] });
        accepted += 1;
      } catch (error) { rejected.push({ row: index + 2, error: error instanceof Error ? error.message : "Invalid row" }); }
    }
    return NextResponse.json({ accepted, rejected, total: rows.length });
  } catch (error) { return apiError(error); }
}
