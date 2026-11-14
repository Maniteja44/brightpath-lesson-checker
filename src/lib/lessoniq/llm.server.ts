import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, NoObjectGeneratedError, Output, streamText } from "ai";
import type { z } from "zod";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";

export class LlmError extends Error {
  constructor(
    public code:
      | "missing_api_key"
      | "invalid_api_key"
      | "credits_exhausted"
      | "forbidden"
      | "rate_limited"
      | "timeout"
      | "invalid_json"
      | "refusal"
      | "bad_request"
      | "provider_error"
      | "network",
    message: string,
    public terminal: boolean,
  ) {
    super(message);
  }
}

function createRunIdFetch() {
  let runId: string | undefined;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    if (runId && !headers.has("X-Lovable-AIG-Run-ID")) headers.set("X-Lovable-AIG-Run-ID", runId);
    const res = await fetch(input, { ...init, headers });
    runId ??= res.headers.get("X-Lovable-AIG-Run-ID")?.trim() || undefined;
    return res;
  };
}

function mapError(error: unknown): LlmError {
  if (error instanceof LlmError) return error;
  if (NoObjectGeneratedError.isInstance(error)) {
    return new LlmError("invalid_json", "The AI returned a response that was not valid lesson JSON.", false);
  }
  if (APICallError.isInstance(error)) {
    const s = error.statusCode ?? 0;
    let msg = "";
    try {
      const body = JSON.parse(error.responseBody ?? "{}");
      msg = body?.error?.message ?? body?.message ?? "";
    } catch {
      msg = "";
    }
    if (s === 401) return new LlmError("invalid_api_key", "The AI service rejected the API key. Check API Settings.", true);
    if (s === 402) return new LlmError("credits_exhausted", msg || "AI credits are exhausted for this workspace. Add credits to continue.", true);
    if (s === 403) return new LlmError("forbidden", msg || "AI access was denied for this request.", true);
    if (s === 429) return new LlmError("rate_limited", "The AI service is rate limiting requests. Wait a minute, then retry this step.", false);
    if (s === 408 || s === 504) return new LlmError("timeout", "The AI request timed out. Retry this step.", false);
    if (s === 400) return new LlmError("bad_request", msg || "The AI service rejected the request.", true);
    if (s >= 500) return new LlmError("provider_error", "The AI service had a temporary problem. Retry this step.", false);
  }
  const m = error instanceof Error ? error.message : String(error);
  if (/timeout|timed out|aborted/i.test(m)) return new LlmError("timeout", "The AI request timed out. Retry this step.", false);
  if (/fetch failed|network|ECONN|socket/i.test(m)) return new LlmError("network", "Network error while contacting the AI service. Retry this step.", false);
  return new LlmError("provider_error", "Unexpected AI error. Retry this step.", false);
}

/** One structured, streamed Responses call. Returns the parsed object and latency. */
export async function callStructured<T>(opts: {
  model: string;
  instructions: string;
  input: string;
  schema: z.ZodType<T>;
  reasoningEffort: "low" | "medium";
}): Promise<{ object: T; latencyMs: number }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) {
    throw new LlmError("missing_api_key", "LOVABLE_API_KEY is not configured on the server. AI generation is unavailable.", true);
  }
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: createRunIdFetch(),
  });
  const started = Date.now();
  try {
    let streamError: unknown;
    const result = streamText({
      model: provider.responses(opts.model),
      instructions: opts.instructions,
      messages: [{ role: "user", content: opts.input }],
      output: Output.object({ schema: opts.schema }),
      maxRetries: 1,
      onError: ({ error }) => {
        streamError = error;
      },
      providerOptions: {
        openai: {
          forceReasoning: true,
          reasoningEffort: opts.reasoningEffort,
          reasoningSummary: "auto",
          store: false,
          include: ["reasoning.encrypted_content"],
        },
      },
    });
    // Drain the stream so long calls stay alive and errors surface.
    for await (const _ of result.textStream) {
      void _;
    }
    if (streamError) throw streamError;
    const finish = await result.finishReason;
    if (finish === "content-filter") {
      throw new LlmError("refusal", "The AI declined to produce this content.", true);
    }
    const object = (await result.output) as T;
    return { object, latencyMs: Date.now() - started };
  } catch (error) {
    throw mapError(error);
  }
}

/** Cheap connectivity probe for the settings page. */
export async function probeGateway(): Promise<{ ok: boolean; status: number | null; message: string }> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return { ok: false, status: null, message: "LOVABLE_API_KEY is not configured." };
  try {
    const res = await fetch(`${GATEWAY_URL}/models`, { headers: { Authorization: `Bearer ${apiKey}` } });
    if (res.ok) return { ok: true, status: res.status, message: "Connected" };
    return { ok: false, status: res.status, message: `Gateway responded with HTTP ${res.status}` };
  } catch {
    return { ok: false, status: null, message: "Could not reach the AI gateway." };
  }
}
