import { NextResponse } from "next/server";
import { AuthorizationError } from "@/domain/policy";
import { ZodError } from "zod";
export function apiError(error:unknown){const raw=error instanceof Error?error.message:"Unexpected error";const conflict=/conflict|already|state changed|unique constraint/i.test(raw);const notFound=/not found/i.test(raw);const unsafe=/constraint|postgres|syntax error|database/i.test(raw);const message=error instanceof ZodError?"Request validation failed":unsafe?"The request conflicts with persisted data":raw;const status=error instanceof AuthorizationError?403:conflict?409:notFound?404:400;return NextResponse.json({error:message},{status});}
