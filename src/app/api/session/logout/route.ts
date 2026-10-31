import { NextResponse } from "next/server";
import { sessionCookie } from "@/server/auth/session";
import { validateJsonMutation } from "@/server/request-security";

export async function POST(request: Request) {
  const denied = validateJsonMutation(request);
  if (denied) return denied;
  const response = NextResponse.json({ message: "Signed out", redirect: "/login" });
  response.cookies.set(sessionCookie.name, "", { ...sessionCookie.options, maxAge: 0 });
  return response;
}
