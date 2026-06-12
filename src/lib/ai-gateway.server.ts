import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

// Vendor-neutral provider. Works with any OpenAI-compatible endpoint
// (OpenAI, OpenRouter, Groq, Together, Google's compat endpoint, etc.),
// so the product is not locked to any single AI vendor or to Lovable's
// hosted gateway. Configure via AI_BASE_URL / AI_API_KEY / AI_MODEL.
export function createAiProvider(opts: { apiKey: string; baseURL: string; name?: string }) {
  return createOpenAICompatible({
    name: opts.name ?? "ai",
    baseURL: opts.baseURL,
    apiKey: opts.apiKey,
  });
}
