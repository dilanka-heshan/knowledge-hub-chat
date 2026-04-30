// OpenRouter client — uses Claude via OpenRouter's OpenAI-compatible API.
// Set OPENROUTER_API_KEY in .env
//
// chatCompletion()       — single non-streaming call (used by history summarizer)
// streamChatCompletion() — SSE streaming call (used by responder fallback)
//
// Tool-use loop is now handled by createReactAgent in agentLoopNode.ts.

const BASE_URL = "https://openrouter.ai/api/v1";
const MODEL = process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4-6";

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

// ─────────────────────────────────────────────────────────────────────────────

function headers(): Record<string, string> {
  return {
    "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://atlato.com",
    "X-Title": "Atlato-One",
  };
}

// Single non-streaming call — returns full response text
export async function chatCompletion(messages: Message[], maxTokens = 1000 /* old: 1000 */): Promise<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter error ${res.status}: ${await res.text()}`);
  }

  const json = await res.json() as {
    choices: { message: { content: string } }[];
  };

  return json.choices[0]?.message.content ?? "";
}

// Streaming call — yields text chunks as they arrive
export async function* streamChatCompletion(
  messages: Message[],
  maxTokens = 2000
): AsyncGenerator<string> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens, stream: true }),
  });

  if (!res.ok) {
    throw new Error(`OpenRouter stream error ${res.status}: ${await res.text()}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body from OpenRouter");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");

    // Keep the last (possibly incomplete) line in the buffer
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") return;

      try {
        const parsed = JSON.parse(payload) as {
          choices: { delta: { content?: string } }[];
        };
        const text = parsed.choices[0]?.delta.content;
        if (text) yield text;
      } catch {
        // skip malformed SSE lines
      }
    }
  }
}
