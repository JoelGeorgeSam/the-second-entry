import { describe, expect, it } from "vitest";
import { DeterministicProvider, UnavailableProvider, explainWithFallback, type AiProvider } from "@/server/ai/provider";

const context = { exceptionType: "missing_reference", amountCents: 12345, sourceEventId: "provider-test", reason: "Invoice reference absent" };

describe("AI provider boundary", () => {
  it("returns a bounded evidence-specific deterministic explanation", async () => {
    const result = await explainWithFallback(new DeterministicProvider(), context);
    expect(result.status).toBe("completed");
    expect(result.output.summary).toContain("provider-test");
    expect(result.output.risks[0]).toContain("123.45");
  });

  it("records provider errors and uses the labeled deterministic fallback", async () => {
    const result = await explainWithFallback(new UnavailableProvider(), context);
    expect(result).toMatchObject({ status: "fallback", provider: "forced-unavailable", failureContext: "AI provider unavailable" });
    expect(result.output.summary).toContain("Invoice reference absent");
  });

  it("normalizes non-Error provider failures", async () => {
    const provider: AiProvider = { name: "non-error-failure", explain: async () => { throw "offline"; } };
    const result = await explainWithFallback(provider, context);
    expect(result).toMatchObject({ status: "fallback", failureContext: "Provider failure" });
  });
});
