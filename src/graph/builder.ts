// Assembles the LangGraph StateGraph for the agent pipeline.

import { StateGraph, START, END } from "@langchain/langgraph";
import type { Response } from "express";
import { GraphState }           from "./state";
import { createAgentLoopNode }  from "./nodes/agentLoopNode";
import { filterNode }           from "./nodes/filterNode";
import { createResponderNode }  from "./nodes/responderNode";

// Pipeline: agentLoopNode → filterNode → responderNode
//
// agentLoopNode  — LLM decides tool calls using qaHints as guidance,
//                  executes them, returns rawResults
// filterNode     — extracts source labels and visualization hints
// responderNode  — streams the final formatted answer via SSE

export function buildAgentGraph(res: Response) {
  return new StateGraph(GraphState)
    .addNode("agentLoop", createAgentLoopNode(res))
    .addNode("filter",    filterNode)
    .addNode("responder", createResponderNode(res))
    .addEdge(START,        "agentLoop")
    .addEdge("agentLoop",  "filter")
    .addEdge("filter",     "responder")
    .addEdge("responder",  END)
    .compile();
}
