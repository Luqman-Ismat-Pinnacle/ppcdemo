# Local LLM Setup (OpenAI-Compatible)

This app supports both OpenAI cloud and OpenAI-compatible local providers.

## Environment Variables

Set these in `.env.local` (local) and your deployment secrets (Azure):

```bash
# Provider mode
AI_PROVIDER=openai_compatible

# OpenAI-compatible base URL (examples: LM Studio, Ollama bridge, vLLM proxy)
AI_BASE_URL=http://localhost:1234/v1

# Local key/token expected by your local gateway (can be any value if not enforced)
AI_API_KEY=local-dev-key

# Model name exposed by your local endpoint
AI_MODEL=<your-model-name>
```

Optional:

```bash
AI_TIMEOUT_MS=30000
AI_CONTEXT_DEBUG=true
```

## OpenAI Cloud Mode

```bash
AI_PROVIDER=openai
OPENAI_API_KEY=<secret>
OPENAI_MODEL=gpt-4.1-mini
```

`AI_*` variables take precedence when both are present.

## Runtime Behavior

- The API first calls `POST {AI_BASE_URL}/responses`.
- If provider is `openai_compatible` and `/responses` is unavailable, it falls back to `POST {AI_BASE_URL}/chat/completions`.
- Frontend streaming contract remains SSE (`data: {"text":"..."}` + `data: [DONE]`).

## Endpoints Using This

- `POST /api/ai/briefing`
- `POST /api/ai/query`

Both preserve role-scope checks and workflow audit logging.
