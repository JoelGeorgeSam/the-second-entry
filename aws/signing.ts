import { createHmac, timingSafeEqual } from "node:crypto";

export function signCallback(body:string,timestamp:string,nonce:string,secret:string){return createHmac("sha256",secret).update(`${timestamp}.${nonce}.${body}`).digest("hex");}
export function verifyCallback(body:string,timestamp:string,nonce:string,signature:string,secret:string,now=Date.now()){const millis=Date.parse(timestamp);if(!Number.isFinite(millis)||Math.abs(now-millis)>5*60_000)return false;const expected=Buffer.from(signCallback(body,timestamp,nonce,secret),"hex"),actual=Buffer.from(signature,"hex");return expected.length===actual.length&&timingSafeEqual(expected,actual);}
