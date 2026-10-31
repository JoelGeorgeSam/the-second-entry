import { z } from "zod";

export const Explanation = z.object({ summary: z.string().min(1).max(1000), risks: z.array(z.string().max(300)).max(5), recommendedNextSteps: z.array(z.string().max(300)).max(5), confidence: z.number().min(0).max(1) });
export type Explanation = z.infer<typeof Explanation>;
export type ExplanationContext = { exceptionType: string; amountCents: number; sourceEventId: string; reason: string };
export interface AiProvider { readonly name: string; explain(context: ExplanationContext, signal?: AbortSignal): Promise<Explanation>; }

export class DeterministicProvider implements AiProvider {
  readonly name = "deterministic-non-ai";
  async explain(context: ExplanationContext) {
    return Explanation.parse({ summary: `${context.exceptionType.replaceAll("_", " ")} for source ${context.sourceEventId}: ${context.reason}`, risks: [`CAD ${(context.amountCents / 100).toFixed(2)} remains under human review.`], recommendedNextSteps: ["Verify the remittance evidence and invoice ownership.", "Record an approve or reject reason."], confidence: 1 });
  }
}

export class UnavailableProvider implements AiProvider {
  readonly name = "forced-unavailable";
  async explain(): Promise<Explanation> { throw new Error("AI provider unavailable"); }
}

export async function explainWithFallback(provider: AiProvider, context: ExplanationContext) {
  const started = Date.now();
  try { return { output: Explanation.parse(await provider.explain(context, AbortSignal.timeout(2_000))), provider: provider.name, status: "completed" as const, latencyMs: Date.now() - started }; }
  catch (error) { const fallback = await new DeterministicProvider().explain(context); return { output: fallback, provider: provider.name, status: "fallback" as const, failureContext: error instanceof Error ? error.message : "Provider failure", latencyMs: Date.now() - started }; }
}
