// Responder node factory — streams the final Claude answer via SSE.
// Takes Express Response as a closure so SSE events can be written during streaming.

import type { Response } from "express";
import type { AgentContext, SSEEvent } from "../../types";
import { buildResponderPrompt } from "../../agent/prompts/responder";
import { streamChatCompletion } from "../../llm/openRouter";
import type { GraphStateType } from "../state";

function sendSSE(res: Response, event: SSEEvent): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export function createResponderNode(res: Response) {
  return async (state: GraphStateType) => {
    // Attach visualization hint if present
    if (state.visualizationHint) {
      sendSSE(res, { type: "visualization_hint", data: state.visualizationHint });
    }

    let fullResponse = "";

    if (state.documentHtml) {
      // Claude returned a full HTML document — send as document_ready event
      sendSSE(res, { type: "text_chunk", data: "Your document is ready." });
      sendSSE(res, { type: "document_ready", data: state.documentHtml });
      fullResponse = "document";
    } else if (state.fullResponse) {
      // Agent already generated the answer via createReactAgent — stream it directly.
      // Split into ~80-char chunks to give the frontend a progressive feel.
      const CHUNK = 80;
      for (let i = 0; i < state.fullResponse.length; i += CHUNK) {
        sendSSE(res, { type: "text_chunk", data: state.fullResponse.slice(i, i + CHUNK) });
      }
      fullResponse = state.fullResponse;
    } else {
      // Fallback: no pre-built response — call LLM with formatted responder prompt.
      const ctx: AgentContext = {
        request: {
          sessionId:     state.sessionId,
          companyId:     state.companyId,
          query:         state.query,
          history:       state.history,
          outputOptions: state.outputOptions,
          mcpServerIds:  state.mcpServerIds,
        },
        summary:      state.summary,
        rawResults:   state.rawResults,
        filteredData: state.filteredData,
        sourceLabels: state.sourceLabels,
      };
      if (state.visualizationHint) {
        ctx.visualizationHint = state.visualizationHint as "bar_chart" | "line_chart" | "table" | "pie_chart";
      }

      const prompt = buildResponderPrompt(ctx);
      for await (const chunk of streamChatCompletion([{ role: "user", content: prompt }], 2000)) {
        sendSSE(res, { type: "text_chunk", data: chunk });
        fullResponse += chunk;
      }
    }

    sendSSE(res, { type: "sources", data: state.sourceLabels });

    if (state.outputOptions.wantReport) {
      sendSSE(res, {
        type: "report_ready",
        data: { downloadUrl: `/api/reports/download?sessionId=${state.sessionId}` },
      });
    }

    sendSSE(res, { type: "done", data: null });
    res.end();

    return { fullResponse };
  };
}
