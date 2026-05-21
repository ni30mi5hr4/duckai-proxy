# DuckAI Proxy

[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A fully **OpenAI-compatible** REST API proxy for [duck.ai](https://duck.ai) — DuckDuckGo's free AI chat.
**No API key required. No account needed. Completely free.**

Works as a drop-in replacement for the OpenAI API. Fully compatible with **Aider**, the OpenAI SDK, and any tool that speaks the OpenAI API format.

### Key features
- OpenAI-compatible `/v1/chat/completions` (streaming + non-streaming)
- Fully compatible with **Aider** — works out of the box
- Automatic VQD challenge solver (no browser needed)
- System message folding (duck.ai only accepts user/assistant roles)
- Auto-retry with exponential back-off (2 s → 5 s → 10 s)
- Long prompt splitting — messages over 6500 chars are split across multiple duck.ai requests
- Multi-part content support (images/text in messages)

---

## Models

| Model ID | duck.ai Model | Notes |
|---|---|---|
| `gpt-4o-mini` | `gpt-4o-mini` | Default, fastest |
| `gpt-5-mini` | `gpt-5-mini` | OpenAI GPT-5 Mini |
| `claude-haiku-4-5` | `claude-haiku-4-5` | Anthropic Claude 4 Haiku |
| `meta-llama/Llama-4-Scout-17B-16E-Instruct` | `meta-llama/Llama-4-Scout-17B-16E-Instruct` | Meta Llama 4 Scout |
| `gpt-oss-120b` | `tinfoil/gpt-oss-120b` | Alias for openai/gpt-oss-120b |
| `openai/gpt-oss-120b` | `tinfoil/gpt-oss-120b` | OpenAI 120B open model |
| `tinfoil/gpt-oss-120b` | `tinfoil/gpt-oss-120b` | Canonical name |

All models are **free** via duck.ai. DuckDuckGo may rate-limit rapid requests.

---

## Requirements

- **Node.js 18+** — https://nodejs.org
- **pnpm** — `npm install -g pnpm`

You can also use npm or yarn — just replace `pnpm` with `npm` or `yarn`.

---

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/duckai-proxy.git
cd duckai-proxy
pnpm install
pnpm dev
```

Server starts at **http://localhost:3000**

---

## Usage

### Base URL
```
http://localhost:3000/v1
```

### Quick test
```bash
# Health check
curl http://localhost:3000/v1/healthz

# List available models
curl http://localhost:3000/v1/models

# Chat (non-streaming)
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'

# Chat (streaming)
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role": "user", "content": "Hello!"}],
    "stream": true
  }'
```

---

## Use with Aider

```bash
# Set the OpenAI API base URL and any dummy API key
export OPENAI_API_BASE=http://localhost:3000/v1
export OPENAI_API_KEY=duck

# Run aider with any supported model
aider --model openai/gpt-4o-mini
```

Or use the included setup script:
```bash
bash scripts/setup-aider.sh
aider --model openai/gpt-4o-mini
```

---

## Use with OpenAI SDK

### Python
```bash
pip install openai
```
```python
from openai import OpenAI

client = OpenAI(
    base_url="http://localhost:3000/v1",
    api_key="duck",          # any non-empty string
)

response = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "Explain async/await in Python"}],
)
print(response.choices[0].message.content)
```

### Node.js / TypeScript
```bash
npm install openai
```
```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://localhost:3000/v1",
  apiKey: "duck",            // any non-empty string
});

const res = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello!" }],
});
console.log(res.choices[0].message.content);
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/v1/healthz` | Health check |
| GET | `/v1/models` | List models |
| GET | `/v1/models/:id` | Get model info |
| DELETE | `/v1/models/:id` | 501 Not Supported |
| POST | `/v1/chat/completions` | Chat completions (streaming + non-streaming) |
| POST | `/v1/completions` | Legacy text completions |
| POST | `/v1/moderations` | Stub — always returns safe |
| POST | `/v1/embeddings` | 501 Not Supported |
| POST | `/v1/images/*` | 501 Not Supported |
| POST | `/v1/audio/*` | 501 Not Supported |
| GET/POST | `/v1/files` | Stub — empty list / 501 |
| GET/POST/DELETE | `/v1/fine-tuning/jobs*` | Stub — empty list / 501 |
| GET/POST/DELETE | `/v1/assistants*` | 501 Not Supported |
| POST | `/v1/threads`, `/v1/threads/runs` | 501 Not Supported |

---

## Scripts

```bash
pnpm dev        # development with auto-reload (tsx)
pnpm build      # compile to dist/ with esbuild
pnpm start      # run compiled dist/index.mjs
pnpm typecheck  # TypeScript type check
```

### Custom port
```bash
PORT=8080 pnpm dev
```

### Production
```bash
pnpm build
PORT=3000 NODE_ENV=production pnpm start
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `LOG_LEVEL` | `info` | Log level: trace, debug, info, warn, error |
| `NODE_ENV` | `development` | Set to `production` to disable pretty-printing |

---

## Project structure

```
duckai-proxy/
├── src/
│   ├── index.ts              # Server entry point
│   ├── app.ts                # Express app, mounts at /v1
│   ├── lib/
│   │   ├── logger.ts         # Pino logger
│   │   └── headers.ts        # Randomized browser headers
│   └── routes/
│       ├── index.ts          # Root router
│       ├── health.ts         # GET /v1/healthz
│       └── v1/
│           ├── index.ts      # All OpenAI-compatible route handlers
│           └── duck-client.ts # VQD solver + duck.ai HTTP client
├── scripts/
│   └── setup-aider.sh        # Aider CLI wrapper
├── build.mjs                 # esbuild bundler config
├── .env.example              # Environment variable template
├── package.json
└── tsconfig.json
```

---

## How it works

1. **VQD challenge** — duck.ai requires a cryptographic proof-of-work token (`x-vqd-hash-1`) on every request. The proxy fetches a JavaScript challenge from the duck.ai status endpoint, executes it inside a JSDOM sandbox, and submits the solved token. After each successful request, the proxy reuses the returned VQD hash to avoid re-solving on subsequent calls.

2. **System message folding** — duck.ai only accepts `user`/`assistant` roles. System messages are automatically merged into the first user message.

3. **Long prompt splitting** — duck.ai has a ~6500 character limit per request. If your messages exceed this, the proxy splits the last user message into chunks and sends them sequentially, carrying over the conversation history.

4. **Browser simulation** — the proxy generates random browser-like headers (User-Agent, Accept-Language, Sec-CH-UA, etc.) to avoid detection, cycling through Windows, macOS, Linux, Android, and iOS variants.

---

## License

MIT — see [LICENSE](LICENSE)
