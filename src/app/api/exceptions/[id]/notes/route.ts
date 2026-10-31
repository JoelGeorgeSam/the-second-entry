import { NextResponse } from "next/server";
import { z } from "zod";
import { getOptionalSession } from "@/server/auth/session";
import { addExceptionNote } from "@/server/db/repository";
import { apiError } from "@/server/api-response";
import { validateJsonMutation } from "@/server/request-security";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = validateJsonMutation(request); if (denied) return denied;
  try {
    const session = await getOptionalSession();
    if (!session) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    const { note } = z.object({ note: z.string().min(3).max(1000) }).parse(await request.json());
    await addExceptionNote(session, (await params).id, note);
    return NextResponse.json({ message: "Investigation note added" });
  } catch (error) { return apiError(error); }
}
