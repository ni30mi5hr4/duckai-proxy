import { Router } from "express";
import type { Request, Response } from "express";
import {
  AVAILABLE_MODELS,
  MODELS,
  duckChat,
  duckChatStream,
  normalizeMessages,
  type DuckMessage,
} from "./duck-client.js";

const router = Router();

function makeId(prefix = "chatcmpl"): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 15)}`;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function notSupported(res: Response, feature: string) {
  res.status(501).json({
    error: {
      message: `${feature} is not supported by the DuckAI proxy.`,
      type: "not_supported_error",
      param: null,
      code: "not_supported",
    },
  });
}

// ---------------------------------------------------------------------------
// Models
// ---------------------------------------------------------------------------

router.get("/models", (_req: Request, res: Response) => {
  const created = Math.floor(Date.now() / 1000);
  res.json({
    object: "list",
    data: AVAILABLE_MODELS.map((id) => ({
      id,
      object: "model",
      created,
      owned_by: "duckai",
    })),
  });
});

router.get("/models/:model", (req: Request, res: Response) => {
  const id = req.params.model;
  const found = MODELS.find((m) => m.id === id);
  if (!found) {
    res.status(404).json({
      error: {
        message: `The model '${id}' does not exist.`,
        type: "invalid_request_error",
        param: "model",
        code: "model_not_found",
      },
    });
    return;
  }
  res.json({
    id: found.id,
    object: "model",
    created: Math.floor(Date.now() / 1000),
    owned_by: "duckai",
  });
});

router.delete("/models/:model", (_req: Request, res: Response) => {
  notSupported(res, "Model deletion");
});

// ---------------------------------------------------------------------------
// Chat completions
// ---------------------------------------------------------------------------

router.post("/chat/completions", async (req: Request, res: Response) => {
  const { model, messages, stream } = req.body as {
    model?: string;
    messages?: DuckMessage[];
    stream?: boolean;
  };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({
      error: {
        message: "messages is required and must be a non-empty array",
        type: "invalid_request_error",
        param: "messages",
        code: "missing_required_parameter",
      },
    });
    return;
  }

  const resolvedModel = model || "gpt-4o-mini";
  const id = makeId("chatcmpl");
  const created = Math.floor(Date.now() / 1000);
  const normalized = normalizeMessages(messages);

  try {
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const writeChunk = (content: string) => {
        const chunk = {
          id,
          object: "chat.completion.chunk",
          created,
          model: resolvedModel,
          choices: [
            { index: 0, delta: { content }, logprobs: null, finish_reason: null },
          ],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      };

      const duckStream = await duckChatStream(resolvedModel, normalized);
      const reader = duckStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) writeChunk(value);
      }

      const stopChunk = {
        id,
        object: "chat.completion.chunk",
        created,
        model: resolvedModel,
        choices: [{ index: 0, delta: {}, logprobs: null, finish_reason: "stop" }],
      };
      res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      const content = await duckChat(resolvedModel, normalized);
      const promptTokens = estimateTokens(
        normalized.map((m) => (typeof m.content === "string" ? m.content : "")).join(" ")
      );
      const completionTokens = estimateTokens(content);

      res.json({
        id,
        object: "chat.completion",
        created,
        model: resolvedModel,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content },
            logprobs: null,
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
        system_fingerprint: null,
      });
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : JSON.stringify(err);
    const status = message.includes("Rate limited") ? 429 : 500;

    if (stream && res.headersSent) {
      res.write(
        `data: ${JSON.stringify({ error: { message, type: "api_error", param: null, code: null } })}\n\n`
      );
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      if (status === 429) res.setHeader("Retry-After", "30");
      res
        .status(status)
        .json({ error: { message, type: "api_error", param: null, code: "rate_limit_exceeded" } });
    }
  }
});

// ---------------------------------------------------------------------------
// Legacy text completions
// ---------------------------------------------------------------------------

router.post("/completions", async (req: Request, res: Response) => {
  const { model, prompt, stream, max_tokens, temperature } = req.body as {
    model?: string;
    prompt?: string | string[];
    stream?: boolean;
    max_tokens?: number;
    temperature?: number;
  };

  void max_tokens;
  void temperature;

  if (!prompt) {
    res.status(400).json({
      error: {
        message: "prompt is required",
        type: "invalid_request_error",
        param: "prompt",
        code: "missing_required_parameter",
      },
    });
    return;
  }

  const text = Array.isArray(prompt) ? prompt.join("\n") : prompt;
  const messages: DuckMessage[] = [{ role: "user", content: text }];
  const resolvedModel = model || "gpt-4o-mini";
  const id = makeId("cmpl");
  const created = Math.floor(Date.now() / 1000);

  try {
    if (stream) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders();

      const writeChunk = (t: string) => {
        const chunk = {
          id,
          object: "text_completion",
          created,
          model: resolvedModel,
          choices: [{ text: t, index: 0, logprobs: null, finish_reason: null }],
        };
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      };

      const duckStream = await duckChatStream(resolvedModel, messages);
      const reader = duckStream.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) writeChunk(value);
      }

      const stopChunk = {
        id,
        object: "text_completion",
        created,
        model: resolvedModel,
        choices: [{ text: "", index: 0, logprobs: null, finish_reason: "stop" }],
      };
      res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      const content = await duckChat(resolvedModel, messages);
      const promptTokens = estimateTokens(text);
      const completionTokens = estimateTokens(content);

      res.json({
        id,
        object: "text_completion",
        created,
        model: resolvedModel,
        choices: [{ text: content, index: 0, logprobs: null, finish_reason: "stop" }],
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
      });
    }
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : JSON.stringify(err);
    const status = message.includes("Rate limited") ? 429 : 500;
    if (stream && res.headersSent) {
      res.write(
        `data: ${JSON.stringify({ error: { message, type: "api_error" } })}\n\n`
      );
      res.write("data: [DONE]\n\n");
      res.end();
    } else {
      res
        .status(status)
        .json({ error: { message, type: "api_error", param: null, code: null } });
    }
  }
});

// ---------------------------------------------------------------------------
// Embeddings (not supported)
// ---------------------------------------------------------------------------

router.post("/embeddings", (_req: Request, res: Response) => {
  notSupported(res, "Embeddings");
});

// ---------------------------------------------------------------------------
// Images (not supported)
// ---------------------------------------------------------------------------

router.post("/images/generations", (_req: Request, res: Response) => {
  notSupported(res, "Image generation");
});

router.post("/images/edits", (_req: Request, res: Response) => {
  notSupported(res, "Image edits");
});

router.post("/images/variations", (_req: Request, res: Response) => {
  notSupported(res, "Image variations");
});

// ---------------------------------------------------------------------------
// Audio (not supported)
// ---------------------------------------------------------------------------

router.post("/audio/transcriptions", (_req: Request, res: Response) => {
  notSupported(res, "Audio transcriptions");
});

router.post("/audio/translations", (_req: Request, res: Response) => {
  notSupported(res, "Audio translations");
});

router.post("/audio/speech", (_req: Request, res: Response) => {
  notSupported(res, "Audio speech synthesis");
});

// ---------------------------------------------------------------------------
// Files (stub)
// ---------------------------------------------------------------------------

router.get("/files", (_req: Request, res: Response) => {
  res.json({ object: "list", data: [] });
});

router.post("/files", (_req: Request, res: Response) => {
  notSupported(res, "File uploads");
});

router.get("/files/:file_id", (_req: Request, res: Response) => {
  notSupported(res, "File retrieval");
});

router.delete("/files/:file_id", (_req: Request, res: Response) => {
  notSupported(res, "File deletion");
});

router.get("/files/:file_id/content", (_req: Request, res: Response) => {
  notSupported(res, "File content retrieval");
});

// ---------------------------------------------------------------------------
// Fine-tuning (stub)
// ---------------------------------------------------------------------------

router.get("/fine-tuning/jobs", (_req: Request, res: Response) => {
  res.json({ object: "list", data: [], has_more: false });
});

router.post("/fine-tuning/jobs", (_req: Request, res: Response) => {
  notSupported(res, "Fine-tuning");
});

router.get("/fine-tuning/jobs/:id", (_req: Request, res: Response) => {
  notSupported(res, "Fine-tuning job retrieval");
});

router.post("/fine-tuning/jobs/:id/cancel", (_req: Request, res: Response) => {
  notSupported(res, "Fine-tuning job cancellation");
});

router.get("/fine-tuning/jobs/:id/events", (_req: Request, res: Response) => {
  notSupported(res, "Fine-tuning events");
});

// ---------------------------------------------------------------------------
// Moderations (stub — always returns safe)
// ---------------------------------------------------------------------------

router.post("/moderations", (req: Request, res: Response) => {
  const { input } = req.body as { input?: string | string[] };
  const inputs = Array.isArray(input) ? input : [input ?? ""];
  res.json({
    id: makeId("modr"),
    model: "text-moderation-stable",
    results: inputs.map(() => ({
      flagged: false,
      categories: {
        sexual: false,
        hate: false,
        harassment: false,
        "self-harm": false,
        "sexual/minors": false,
        "hate/threatening": false,
        "violence/graphic": false,
        "self-harm/intent": false,
        "self-harm/instructions": false,
        "harassment/threatening": false,
        violence: false,
      },
      category_scores: {
        sexual: 0.0,
        hate: 0.0,
        harassment: 0.0,
        "self-harm": 0.0,
        "sexual/minors": 0.0,
        "hate/threatening": 0.0,
        "violence/graphic": 0.0,
        "self-harm/intent": 0.0,
        "self-harm/instructions": 0.0,
        "harassment/threatening": 0.0,
        violence: 0.0,
      },
    })),
  });
});

// ---------------------------------------------------------------------------
// Assistants API (not supported)
// ---------------------------------------------------------------------------

router.get("/assistants", (_req: Request, res: Response) => {
  notSupported(res, "Assistants API");
});
router.post("/assistants", (_req: Request, res: Response) => {
  notSupported(res, "Assistants API");
});
router.get("/assistants/:id", (_req: Request, res: Response) => {
  notSupported(res, "Assistants API");
});
router.post("/assistants/:id", (_req: Request, res: Response) => {
  notSupported(res, "Assistants API");
});
router.delete("/assistants/:id", (_req: Request, res: Response) => {
  notSupported(res, "Assistants API");
});

// ---------------------------------------------------------------------------
// Threads / Runs (not supported)
// ---------------------------------------------------------------------------

router.post("/threads", (_req: Request, res: Response) => {
  notSupported(res, "Threads API");
});
router.get("/threads/:id", (_req: Request, res: Response) => {
  notSupported(res, "Threads API");
});
router.post("/threads/:id/runs", (_req: Request, res: Response) => {
  notSupported(res, "Threads API");
});
router.get("/threads/:id/messages", (_req: Request, res: Response) => {
  notSupported(res, "Threads API");
});

export default router;
