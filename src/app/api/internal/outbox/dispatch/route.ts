import { NextResponse } from "next/server";
import { authorizeBearer } from "@/server/internal-auth";
import { dispatchOutbox } from "@/server/outbox/dispatcher";
import { configuredPublisher } from "@/server/queue/publisher";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const authorization = authorizeBearer(request.headers.get("authorization"));
  if (authorization === "misconfigured") return NextResponse.json({ error: "Dispatcher authentication is not configured" }, { status: 503 });
  if (authorization !== "authorized") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const results = await dispatchOutbox(configuredPublisher());
    return NextResponse.json({ processed: results.length, results });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Dispatcher failed" }, { status: 503 });
  }
}
