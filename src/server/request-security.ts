import { NextResponse } from "next/server";

export function validateJsonMutation(request: Request): NextResponse | null {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
  const origin = request.headers.get("origin");
  const requestHost = request.headers.get("x-forwarded-host") || request.headers.get("host") || new URL(request.url).host;
  if (origin) {
    try {
      if (new URL(origin).host !== requestHost) return NextResponse.json({ error: "Cross-origin mutation denied" }, { status: 403 });
    } catch {
      return NextResponse.json({ error: "Invalid Origin header" }, { status: 400 });
    }
  }
  return null;
}
