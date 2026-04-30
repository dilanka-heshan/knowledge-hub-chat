// Builds the final LLM prompt with retrieved data and conversation history.

import type { AgentContext, StepResult } from "../../types";

export function buildResponderPrompt(ctx: AgentContext): string {
  const history = buildHistoryContext(ctx);
  const data = buildDataContext(ctx);

  const hasData = data.trim().length > 0;

  return `
You are Atlato-One, an intelligent business assistant for the Atlato platform.

${history}
User question: "${ctx.request.query}"

${data}
Instructions:
- Be concise and professional
- Summarize key insights from any retrieved data
- Format numbers clearly (e.g., "65 km/h", "78% fuel level")
- Do not mention internal system steps or agent names in your response
${hasData
  ? "- Only answer based on the retrieved data above. Do not add information not present in the data."
  : "- No data was retrieved. If this is a conversational message (greeting, general question, introduction), answer it directly and helpfully as Atlato-One. If real data was expected but unavailable, say so clearly."}
`.trim();
}

function buildHistoryContext(ctx: AgentContext): string {
  const parts: string[] = [];

  if (ctx.summary) {
    parts.push(`Summary of earlier conversation:\n${ctx.summary}`);
  }

  // state.history is already trimmed to the last 8 messages by agent/index.ts
  const recent = ctx.request.history;
  if (recent.length > 0) {
    const lines = recent
      .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");
    parts.push(`Recent conversation:\n${lines}`);
  }

  return parts.length > 0 ? parts.join("\n\n") + "\n" : "";
}

function buildDataContext(ctx: AgentContext): string {
  if (!ctx.rawResults || ctx.rawResults.length === 0) return "";

  const parts: string[] = [];
  for (const r of ctx.rawResults as StepResult[]) {
    if (r.data !== null && !r.isLlmStep) {
      parts.push(`[${r.description}]\n${JSON.stringify(r.data, null, 2)}`);
    }
  }

  return parts.length > 0 ? `Retrieved data:\n${parts.join("\n\n")}` : "";
}
