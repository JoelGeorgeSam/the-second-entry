import { z } from "zod";

const Features=z.object({amountRatio:z.number(),absoluteDifferenceRatio:z.number(),recentPaymentCount:z.number(),duplicateReference:z.number(),daysFromInvoice:z.number(),customerExceptionRate:z.number(),referencePresent:z.number()});
export const RiskJobMessage=z.object({version:z.literal(1),jobId:z.string().min(1),workspaceId:z.string().min(1),exceptionId:z.string().min(1),correlationId:z.string().min(1),requestedAt:z.string().datetime(),features:Features});
export const RiskResult=z.object({version:z.literal(1),jobId:z.string(),workspaceId:z.string(),exceptionId:z.string(),processingId:z.string(),modelVersion:z.string(),riskScore:z.number().min(0).max(1),threshold:z.number().min(0).max(1),indicators:z.array(z.object({feature:z.string(),value:z.number(),contribution:z.number()})),status:z.enum(["completed","failed"]),correlationId:z.string(),completedAt:z.string().datetime(),failureContext:z.string().optional()});
export type RiskJobMessage=z.infer<typeof RiskJobMessage>;
export type RiskResult=z.infer<typeof RiskResult>;
