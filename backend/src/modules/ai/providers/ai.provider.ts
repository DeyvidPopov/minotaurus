// ai.provider.ts — the provider abstraction. This is the ONLY seam to an LLM;
// everything else in modules/ai is provider-agnostic. Swapping models/providers
// means adding an adapter behind `AiProvider`, nothing else changes.

import { AnthropicProvider } from "./ai.provider.anthropic.js";

export interface StructuredRequest {
  system: string;
  user: string;
  /** Tool the model is forced to call; its input is the structured output. */
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
  maxTokens?: number;
}

export interface StructuredResult {
  /** The forced tool call's input — validate against your own schema before use. */
  data: unknown;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  /**
   * Provider stop reason. `"max_tokens"` means the output was truncated before
   * completion — the `data` is structurally incomplete and must not be trusted.
   * Preserved (not discarded) so callers can distinguish a truncated response
   * from a genuine provider/transport failure.
   */
  stopReason: string | null;
  /** The output-token ceiling that was requested for this call. */
  maxTokens: number;
  /** Wall-clock duration of the provider call, in milliseconds. */
  durationMs: number;
}

export interface AiProvider {
  generateStructured(req: StructuredRequest): Promise<StructuredResult>;
}

export class AiNotConfiguredError extends Error {
  constructor(message = "AI is not configured. Set ANTHROPIC_API_KEY to enable AI features.") {
    super(message);
    this.name = "AiNotConfiguredError";
  }
}

export class AiProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiProviderError";
  }
}

export function isAiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY.trim());
}

/** Returns the configured provider or throws AiNotConfiguredError (→ 503). */
export function getAiProvider(): AiProvider {
  if (!isAiConfigured()) throw new AiNotConfiguredError();
  return new AnthropicProvider();
}
