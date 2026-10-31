import { timingSafeEqual } from "node:crypto";

export type InternalAuthorization = "authorized" | "unauthorized" | "misconfigured";

export function authorizeBearer(authorization: string | null, secret = process.env.CRON_SECRET): InternalAuthorization {
  if (!secret || secret.length < 32) return "misconfigured";
  const prefix = "Bearer ";
  if (!authorization?.startsWith(prefix)) return "unauthorized";
  const expected = Buffer.from(secret);
  const actual = Buffer.from(authorization.slice(prefix.length));
  return expected.length === actual.length && timingSafeEqual(expected, actual) ? "authorized" : "unauthorized";
}
