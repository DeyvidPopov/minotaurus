// ai.provider.anthropic.ts — concrete Claude adapter over @anthropic-ai/sdk.
// Forces structured output via tool use (tool_choice) and caches the static
// system block. Presentation/transport only — no business logic, no Prisma.

import Anthropic from "@anthropic-ai/sdk";
import { AiProviderError, type AiProvider, type StructuredRequest, type StructuredResult } from "./ai.provider.js";

const DEFAULT_MODEL = "claude-sonnet-4-6";
// Bootstrap V2 added an optional, trailing database block to the proposal; the
// extra headroom keeps a typical artifacts+relations+diagrams+models response from
// truncating. Caps + last-position emit are the primary guard; this is secondary.
// Override with AI_MAX_TOKENS.
const DEFAULT_MAX_TOKENS = 12000;

export class AnthropicProvider implements AiProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.model = process.env.AI_MODEL?.trim() || DEFAULT_MODEL;
    const configured = Number(process.env.AI_MAX_TOKENS);
    this.maxTokens = Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_MAX_TOKENS;
  }

  async generateStructured(req: StructuredRequest): Promise<StructuredResult> {
    const maxTokens = req.maxTokens ?? this.maxTokens;
    const startedAt = Date.now();
    let response: Anthropic.Message;
    try {
      response = await this.client.messages.create({
        model: this.model,
        max_tokens: maxTokens,
        // Static system block is cache-eligible; tools render before system and
        // are cached with it once the prefix is large enough.
        system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
        tools: [
          {
            name: req.toolName,
            description: req.toolDescription,
            input_schema: req.inputSchema as unknown as Anthropic.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: req.toolName },
        messages: [{ role: "user", content: req.user }],
      });
    } catch (err) {
      throw new AiProviderError(err instanceof Error ? err.message : "AI request failed");
    }
    const durationMs = Date.now() - startedAt;

    const block = response.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === req.toolName,
    );
    if (!block) {
      throw new AiProviderError("The model did not return the expected structured output.");
    }

    return {
      data: block.input,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens ?? 0,
        outputTokens: response.usage.output_tokens ?? 0,
      },
      stopReason: response.stop_reason,
      maxTokens,
      durationMs,
    };
  }
}
