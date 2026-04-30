// POST /api/chat/stream — SSE streaming chat endpoint

import { Router } from "express";
import type { ChatRequest } from "../types";
import { runAgent } from "../agent";

export const chatRouter = Router();

chatRouter.post("/stream", async (req, res) => {
  const query = (req.body as ChatRequest).query ?? "(empty)";
  console.log(`\n========================================`);
  console.log(`[Route] POST /api/chat/stream  query="${query}"`);
  console.log(`========================================`);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  await runAgent(req.body as ChatRequest, res);
});
