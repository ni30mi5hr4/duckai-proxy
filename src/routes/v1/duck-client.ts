import { createHash } from "crypto";
import { JSDOM } from "jsdom";
import { generateRandomHeaders, buildCookie } from "../../lib/headers.js";

const DUCK_STATUS_URL = "https://duck.ai/duckchat/v1/status";
const DUCK_CHAT_URL = "https://duck.ai/duckchat/v1/chat";
const FE_VERSION = "serp_20250401_100419_ET-19d438eb199b2bf7c300";

export interface ModelInfo {
  id: string;
  duckId: string;
  extraBody?: Record<string, unknown>;
}

export const MODELS: ModelInfo[] = [
  {
    id: "gpt-4o-mini",
    duckId: "gpt-4o-mini",
    extraBody: { canUseTools: true, reasoningEffort: "high" },
  },
  {
    id: "gpt-5-mini",
    duckId: "gpt-5-mini",
    extraBody: { canUseTools: false, reasoningEffort: "low" },
  },
  {
    id: "claude-haiku-4-5",
    duckId: "claude-haiku-4-5",
    extraBody: { canUseTools: true, reasoningEffort: "low" },
  },
  {
    id: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    duckId: "meta-llama/Llama-4-Scout-17B-16E-Instruct",
    extraBody: { canUseTools: true, reasoningEffort: "low" },
  },
  {
    id: "gpt-oss-120b",
    duckId: "tinfoil/gpt-oss-120b",
    extraBody: { canUseTools: false, reasoningEffort: "low" },
  },
  {
    id: "openai/gpt-oss-120b",
    duckId: "tinfoil/gpt-oss-120b",
    extraBody: { canUseTools: false, reasoningEffort: "low" },
  },
  {
    id: "tinfoil/gpt-oss-120b",
    duckId: "tinfoil/gpt-oss-120b",
    extraBody: { canUseTools: false, reasoningEffort: "low" },
  },
];

export const AVAILABLE_MODELS = MODELS.map((m) => m.id);

function resolveModel(model: string): ModelInfo {
  const found = MODELS.find((m) => m.id === model);
  if (!found) {
    throw new Error(`Model not found: ${model}`);
  }
  return found;
}

export interface ContentPart {
  type: "text" | "image_url" | string;
  text?: string;
  image_url?: { url: string };
}

export interface DuckMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ContentPart[] | null;
}

function flattenContent(content: string | ContentPart[] | null): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  return (content as ContentPart[])
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text!)
    .join("\n");
}

export function normalizeMessages(messages: DuckMessage[]): DuckMessage[] {
  const flat = messages.map((msg) => ({
    ...msg,
    content: flattenContent(msg.content),
  }));

  const systemParts = flat
    .filter((m) => m.role === "system" && m.content)
    .map((m) => m.content as string);

  const rest = flat.filter((m) => m.role !== "system");

  if (systemParts.length === 0) return rest;

  const firstUserIdx = rest.findIndex((m) => m.role === "user");
  if (firstUserIdx === -1) {
    return [{ role: "user", content: systemParts.join("\n\n") }, ...rest];
  }

  const merged = [...rest];
  const existing = merged[firstUserIdx].content as string;
  merged[firstUserIdx] = {
    ...merged[firstUserIdx],
    content: systemParts.join("\n\n") + (existing ? "\n\n" + existing : ""),
  };
  return merged;
}

interface VqdResult {
  server_hashes: string[];
  client_hashes: string[];
  signals: Record<string, unknown>;
  meta: Record<string, unknown>;
}

function sha256b64(value: string): string {
  return createHash("sha256").update(value).digest("base64");
}

async function solveVqdChallenge(base64Challenge: string): Promise<string> {
  const jsCode = Buffer.from(base64Challenge, "base64").toString("utf8");

  const sessionUA = generateRandomHeaders()["User-Agent"] ?? "Mozilla/5.0";

  const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    url: "https://duck.ai/",
    runScripts: "dangerously",
    pretendToBeVisual: true,
    userAgent: sessionUA,
  });

  Object.defineProperty(dom.window, "crypto", {
    value: globalThis.crypto,
    writable: true,
    configurable: true,
  });

  const w = dom.window as Record<string, unknown>;
  w.__DDG_FE_CHAT_HASH__ = "dummy";
  w.__DDG_BE_VERSION__ = "dummy";

  const mockCspMeta = {
    getAttribute: (_attr: string) =>
      "default-src 'none'; script-src 'unsafe-inline';",
  };
  const mockContentDoc = {
    querySelector: (_sel: string) => mockCspMeta,
  };
  const jsaEl = dom.window.document.createElement("div");
  jsaEl.id = "jsa";
  jsaEl.setAttribute("__DDG_BE_VERSION__", "dummy");
  Object.defineProperty(jsaEl, "contentDocument", {
    get: () => mockContentDoc,
    configurable: true,
  });
  Object.defineProperty(jsaEl, "contentWindow", {
    get: () => ({ document: mockContentDoc, get: () => undefined }),
    configurable: true,
  });
  dom.window.document.body.appendChild(jsaEl);

  const result = await new Promise<VqdResult>((resolve, reject) => {
    w.__resolve = resolve;
    w.__reject = reject;

    dom.window.eval(`
      (async function() {
        try {
          const result = await (${jsCode});
          __resolve(result);
        } catch(e) {
          __reject(new Error(String(e)));
        }
      })();
    `);
  });

  dom.window.close();

  result.client_hashes[0] = sessionUA;
  result.client_hashes = result.client_hashes.map(sha256b64);

  return Buffer.from(JSON.stringify(result)).toString("base64");
}

async function getVqdHash(): Promise<string> {
  const randomHeaders = generateRandomHeaders();
  const res = await fetch(DUCK_STATUS_URL, {
    method: "GET",
    headers: {
      ...randomHeaders,
      accept: "*/*",
      "cache-control": "no-store",
      pragma: "no-cache",
      "x-vqd-accept": "1",
      cookie: buildCookie(),
    },
  });

  if (!res.ok) {
    throw new Error(`VQD status failed: ${res.status} ${res.statusText}`);
  }

  const raw = res.headers.get("x-vqd-hash-1");
  if (!raw) {
    throw new Error("Missing x-vqd-hash-1 header from status endpoint");
  }

  return solveVqdChallenge(raw);
}

function buildRequestBody(
  info: ModelInfo,
  messages: DuckMessage[]
): Record<string, unknown> {
  return {
    model: info.duckId,
    messages,
    canUseTools: false,
    ...(info.extraBody ?? {}),
  };
}

const RETRY_DELAYS_MS = [2000, 5000, 10000];

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Strategy 4: Session reuse — cache VQD hash from previous response
// Duck.ai returns a fresh x-vqd-hash-1 after each successful chat request.
// Reusing it avoids the status endpoint + challenge-solve on every request.
// ---------------------------------------------------------------------------

let sessionVqdHash: string | null = null;

async function getOrFetchVqdHash(): Promise<string> {
  if (sessionVqdHash) {
    const hash = sessionVqdHash;
    sessionVqdHash = null;
    return hash;
  }
  return getVqdHash();
}

async function duckChatRequest(
  info: ModelInfo,
  messages: DuckMessage[]
): Promise<Response> {
  const vqdHash = await getOrFetchVqdHash();
  const randomHeaders = generateRandomHeaders();
  return fetch(DUCK_CHAT_URL, {
    method: "POST",
    headers: {
      ...randomHeaders,
      accept: "text/event-stream",
      "content-type": "application/json",
      "x-fe-version": FE_VERSION,
      "x-vqd-hash-1": vqdHash,
      cookie: buildCookie(),
    },
    body: JSON.stringify(buildRequestBody(info, messages)),
  });
}

async function duckChatWithRetry(
  info: ModelInfo,
  messages: DuckMessage[]
): Promise<Response> {
  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) {
      await sleep(RETRY_DELAYS_MS[attempt - 1]);
    }
    const res = await duckChatRequest(info, messages);
    if (res.status === 418 || res.status === 429) {
      const body = await res.text().catch(() => "");
      lastError = new Error(
        `Rate limited by DuckAI. Please try again later. (${res.status} — ${body.slice(0, 120)})`
      );
      sessionVqdHash = null;
      continue;
    }
    const newHash = res.headers.get("x-vqd-hash-1");
    if (newHash) sessionVqdHash = newHash;
    return res;
  }
  throw lastError ?? new Error("DuckAI request failed after retries");
}

// ---------------------------------------------------------------------------
// Character-based chunking to stay under duck.ai's rate-limit threshold
// ---------------------------------------------------------------------------

const MAX_REQUEST_CHARS = 6500;

function countChars(msgs: DuckMessage[]): number {
  return msgs.reduce((sum, m) => {
    if (typeof m.content === "string") return sum + m.content.length;
    return sum;
  }, 0);
}

/**
 * Splits the last user message into slices so each batch stays under
 * MAX_REQUEST_CHARS. Returns an array of message arrays to send sequentially.
 * If the total is already within limit, returns the original array as-is.
 */
function buildChunks(messages: DuckMessage[]): DuckMessage[][] {
  if (countChars(messages) <= MAX_REQUEST_CHARS) return [messages];

  const lastIdx = messages.length - 1;
  const last = messages[lastIdx];

  if (last.role !== "user" || typeof last.content !== "string") {
    return [messages];
  }

  const context = messages.slice(0, lastIdx);
  const contextChars = countChars(context);
  const sliceSize = Math.max(MAX_REQUEST_CHARS - contextChars, 1000);
  const text = last.content;

  const batches: DuckMessage[][] = [];
  for (let offset = 0; offset < text.length; offset += sliceSize) {
    const slice = text.slice(offset, offset + sliceSize);
    batches.push([...context, { role: "user", content: slice }]);
  }
  return batches;
}

// ---------------------------------------------------------------------------
// Internal: single-batch helpers
// ---------------------------------------------------------------------------

async function duckChatSingle(
  info: ModelInfo,
  messages: DuckMessage[]
): Promise<string> {
  const res = await duckChatWithRetry(info, messages);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DuckAI error: ${res.status} ${res.statusText} — ${body}`);
  }

  const text = await res.text();
  let content = "";
  for (const line of text.split("\n")) {
    if (line.startsWith("data: ")) {
      try {
        const parsed = JSON.parse(line.slice(6));
        if (parsed.message) content += parsed.message;
      } catch {
        // skip
      }
    }
  }
  return content.trim();
}

async function duckStreamSingle(
  info: ModelInfo,
  messages: DuckMessage[]
): Promise<ReadableStream<string>> {
  const res = await duckChatWithRetry(info, messages);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DuckAI error: ${res.status} ${res.statusText} — ${body}`);
  }

  if (!res.body) throw new Error("No response body from DuckAI");

  return new ReadableStream<string>({
    start(controller) {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      function pump(): Promise<void> {
        return reader.read().then(({ done, value }) => {
          if (done) {
            controller.close();
            return;
          }
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const payload = line.slice(6).trim();
              if (payload === "[DONE]") {
                controller.close();
                return;
              }
              try {
                const parsed = JSON.parse(payload);
                if (parsed.message) controller.enqueue(parsed.message);
              } catch {
                // skip malformed lines
              }
            }
          }
          return pump();
        });
      }

      pump().catch((err) => controller.error(err));
    },
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function duckChat(
  model: string,
  messages: DuckMessage[]
): Promise<string> {
  const info = resolveModel(model);
  const batches = buildChunks(messages);

  if (batches.length === 1) {
    return duckChatSingle(info, batches[0]);
  }

  // Multi-chunk: send sequentially, carry each response as context
  const context = messages.slice(0, -1);
  const lastContent =
    typeof messages[messages.length - 1].content === "string"
      ? (messages[messages.length - 1].content as string)
      : "";
  const contextChars = countChars(context);
  const sliceSize = Math.max(MAX_REQUEST_CHARS - contextChars, 1000);

  let runningContext: DuckMessage[] = [...context];
  let combined = "";

  for (let offset = 0; offset < lastContent.length; offset += sliceSize) {
    const slice = lastContent.slice(offset, offset + sliceSize);
    const batchMessages: DuckMessage[] = [
      ...runningContext,
      { role: "user", content: slice },
    ];
    const response = await duckChatSingle(info, batchMessages);
    if (combined) combined += "\n\n";
    combined += response;
    runningContext = [
      ...runningContext,
      { role: "user", content: slice },
      { role: "assistant", content: response },
    ];
  }

  return combined;
}

export async function duckChatStream(
  model: string,
  messages: DuckMessage[]
): Promise<ReadableStream<string>> {
  const info = resolveModel(model);
  const batches = buildChunks(messages);

  if (batches.length === 1) {
    return duckStreamSingle(info, batches[0]);
  }

  // Multi-chunk streaming: pipe each batch sequentially into one stream
  const context = messages.slice(0, -1);
  const lastContent =
    typeof messages[messages.length - 1].content === "string"
      ? (messages[messages.length - 1].content as string)
      : "";
  const contextChars = countChars(context);
  const sliceSize = Math.max(MAX_REQUEST_CHARS - contextChars, 1000);

  return new ReadableStream<string>({
    async start(controller) {
      let runningContext: DuckMessage[] = [...context];

      for (let offset = 0; offset < lastContent.length; offset += sliceSize) {
        const slice = lastContent.slice(offset, offset + sliceSize);
        const batchMessages: DuckMessage[] = [
          ...runningContext,
          { role: "user", content: slice },
        ];

        let chunkResponse = "";
        try {
          const stream = await duckStreamSingle(info, batchMessages);
          const reader = stream.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              controller.enqueue(value);
              chunkResponse += value;
            }
          }
        } catch (err) {
          controller.error(err);
          return;
        }

        runningContext = [
          ...runningContext,
          { role: "user", content: slice },
          { role: "assistant", content: chunkResponse },
        ];
      }

      controller.close();
    },
  });
}
