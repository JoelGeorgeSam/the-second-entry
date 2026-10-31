import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { Role } from "@/domain/policy";

const COOKIE = "se_session";

export type Session = { userId: string; name: string; role: Role; workspaceId: string; expiresAt: number };

const SessionSchema = z.object({
  userId: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  role: z.enum(["finance_analyst", "finance_approver", "administrator", "demo_guest"]),
  workspaceId: z.string().min(1).max(200),
  expiresAt: z.number().int().positive(),
}).strict();

export function sessionSecret() {
  const value = process.env.SESSION_SECRET;
  if (!value || value.length < 32 || /^(replace-|change-|second-entry-local-demo-secret)/i.test(value)) {
    throw new Error("SESSION_SECRET must be an unpredictable value of at least 32 characters");
  }
  return value;
}

export function signSession(session: Session): string {
  const body = Buffer.from(JSON.stringify(SessionSchema.parse(session))).toString("base64url");
  const signature = createHmac("sha256", sessionSecret()).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifySession(value?: string): Session | null {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 2) return null;
  const [body, signature] = parts;
  if (!body || !signature) return null;
  try {
    const expected = createHmac("sha256", sessionSecret()).update(body).digest();
    const actual = Buffer.from(signature, "base64url");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const parsed = SessionSchema.safeParse(JSON.parse(Buffer.from(body, "base64url").toString("utf8")));
    return parsed.success && parsed.data.expiresAt > Date.now() ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function getOptionalSession(): Promise<Session | null> {
  return verifySession((await cookies()).get(COOKIE)?.value);
}

export async function getSession(): Promise<Session> {
  const session = await getOptionalSession();
  if (!session) redirect("/login");
  return session;
}

export const requireSession = getSession;

export function demoSession(): Session {
  return { userId: `guest-${randomUUID()}`, name: "Demo Guest", role: "demo_guest", workspaceId: `demo-${randomUUID()}`, expiresAt: Date.now() + 8 * 60 * 60 * 1000 };
}

export const sessionCookie = { name: COOKIE, options: { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 8 * 60 * 60 } };

const demoAccounts = {
  "analyst@secondentry.local": { password: "Analyst-Demo-2026!", userId: "user-analyst", name: "Maya Chen", role: "finance_analyst" as const },
  "approver@secondentry.local": { password: "Approver-Demo-2026!", userId: "user-approver", name: "Jon Bell", role: "finance_approver" as const },
  "admin@secondentry.local": { password: "Admin-Demo-2026!", userId: "user-admin", name: "Priya Raman", role: "administrator" as const },
};

export function authenticateDemo(email: string, password: string): Session | null {
  if (process.env.DEMO_ACCOUNTS_ENABLED !== "true") return null;
  const account = demoAccounts[email.toLowerCase() as keyof typeof demoAccounts];
  if (!account) return null;
  const expected = Buffer.from(account.password);
  const actual = Buffer.from(password);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return { userId: `${account.userId}-${randomUUID()}`, name: account.name, role: account.role, workspaceId: `demo-role-${randomUUID()}`, expiresAt: Date.now() + 8 * 60 * 60 * 1000 };
}
