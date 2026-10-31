import { createHmac } from "node:crypto";
import { describe,expect,it } from "vitest";
import { authenticateDemo, sessionSecret, signSession,verifySession } from "@/server/auth/session";

const signBody = (value: string) => {
  const body = Buffer.from(value).toString("base64url");
  const signature = createHmac("sha256", process.env.SESSION_SECRET!).update(body).digest("base64url");
  return `${body}.${signature}`;
};

describe("signed sessions",()=>{
  it("accepts intact sessions",()=>{const value={userId:"u",name:"N",role:"finance_analyst" as const,workspaceId:"w",expiresAt:Date.now()+10000};expect(verifySession(signSession(value))).toEqual(value)});
  it("rejects tampering",()=>{const token=signSession({userId:"u",name:"N",role:"finance_analyst",workspaceId:"w",expiresAt:Date.now()+10000});expect(verifySession(token.replace("u","x"))).toBeNull()});
  it("rejects expiry",()=>expect(verifySession(signSession({userId:"u",name:"N",role:"finance_analyst",workspaceId:"w",expiresAt:Date.now()-1}))).toBeNull());
  it("fails closed for a validly signed non-JSON payload",()=>expect(verifySession(signBody("not-json"))).toBeNull());
  it("fails closed for validly signed claims with an unknown role",()=>expect(verifySession(signBody(JSON.stringify({userId:"u",name:"N",role:"owner",workspaceId:"w",expiresAt:Date.now()+10000})))).toBeNull());
  it("rejects weak secrets",()=>{const previous=process.env.SESSION_SECRET;try{for(const value of ["short","replace-this-secret","second-entry-local-demo-secret-old"]){process.env.SESSION_SECRET=value;expect(()=>sessionSecret()).toThrow(/SESSION_SECRET/)}}finally{process.env.SESSION_SECRET=previous}});
  it("gates local accounts and rejects unknown or incorrect credentials",()=>{const previous=process.env.DEMO_ACCOUNTS_ENABLED;try{process.env.DEMO_ACCOUNTS_ENABLED="false";expect(authenticateDemo("analyst@secondentry.local","Analyst-Demo-2026!")).toBeNull();process.env.DEMO_ACCOUNTS_ENABLED="true";expect(authenticateDemo("unknown@example.test","password")).toBeNull();expect(authenticateDemo("analyst@secondentry.local","wrong")).toBeNull();expect(authenticateDemo("ANALYST@SECONDENTRY.LOCAL","Analyst-Demo-2026!")?.role).toBe("finance_analyst")}finally{process.env.DEMO_ACCOUNTS_ENABLED=previous}});
});
