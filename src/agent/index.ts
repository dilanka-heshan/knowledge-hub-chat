// Agent entry point — builds and runs the LangGraph pipeline.
//
// Flow: plannerNode → executorNode → filterNode → responderNode
// Each node updates shared GraphState; responderNode streams SSE to the client.

import type { Response } from "express";
import type { ChatRequest, Message, SSEEvent } from "../types";
import type { GraphStateType } from "../graph/state";
import { buildAgentGraph } from "../graph/builder";
import { saveHistory, loadHistory } from "../history/fileStore";
import { chatCompletion } from "../llm/openRouter";

// Keep last 8 messages verbatim; summarize anything older.
const WINDOW    = 8;
const THRESHOLD = 10;

function sendSSE(res: Response, event: SSEEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

async function buildUpdatedHistory(
  prevSummary: string,
  allMessages: Message[]
): Promise<{ summary: string; messages: Message[] }> {
  if (allMessages.length <= THRESHOLD) {
    return { summary: prevSummary, messages: allMessages };
  }

  const overflow = allMessages.slice(0, allMessages.length - WINDOW);
  const messages = allMessages.slice(allMessages.length - WINDOW);

  // Truncate each message to 500 chars to keep the summarization prompt small
  const overflowText = overflow
    .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content.substring(0, 500)}`)
    .join("\n\n");

  const summaryPrompt = prevSummary
    ? `Previous summary:\n${prevSummary}\n\nAdditional conversation to incorporate:\n${overflowText}\n\nUpdate the summary to include the new content. Keep it under 200 words. Focus on key topics, data requested, and decisions made.`
    : `Summarize this conversation in under 150 words. Focus on key topics, data requested, and decisions made:\n\n${overflowText}`;

  const summary = await chatCompletion([{ role: "user", content: summaryPrompt }], 300);
  console.log(`\n[History] Summarized ${overflow.length} old message(s) → keeping ${messages.length} recent. Summary: "${summary.substring(0, 80)}..."`);

  return { summary, messages };
}

export async function runAgent(req: ChatRequest, res: Response): Promise<void> {
  try {
    // Server owns history — always load from store, ignore client-provided history
    const record = loadHistory(req.sessionId);
    console.log(`\n[History] Session ${req.sessionId} — loaded ${record.messages.length} message(s), summary: ${record.summary ? "yes" : "none"}`);

    const graph = buildAgentGraph(res);

    const result = await (graph as any).invoke({
      sessionId:     req.sessionId,
      companyId:     req.companyId,
      query:         req.query,
      history:       record.messages,
      summary:       record.summary,
      outputOptions: req.outputOptions,
      mcpServerIds:  req.mcpServerIds,
    }) as GraphStateType;

    if (result.fullResponse) {
      const allMessages: Message[] = [
        ...record.messages,
        { role: "user",      content: req.query },
        { role: "assistant", content: result.fullResponse },
      ];

      const updated = await buildUpdatedHistory(record.summary, allMessages);
      saveHistory(req.sessionId, updated);
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    sendSSE(res, { type: "error", data: message });
    res.end();
  }
}
