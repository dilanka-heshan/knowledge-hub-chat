// LangGraph state definition — all fields that flow through the pipeline nodes.
//
// Input fields (sessionId, query, etc.) use plain Annotation<T> — no default needed,
// they are always provided when calling graph.invoke().
//
// Pipeline fields (plan, rawResults, etc.) use last-write-wins reducer + empty default
// so they start empty and each node overwrites them.

import { Annotation } from "@langchain/langgraph";
import type { Message, OutputOptions, StepResult } from "../types";

// last-write-wins helper — keeps the incoming value, discards the previous one
const overwrite = <T>(_prev: T, next: T): T => next;

export const GraphState = Annotation.Root({
  // ── Input fields (provided at invoke time, no default needed) ─────────────
  sessionId:     Annotation<string>,
  companyId:     Annotation<string>,
  query:         Annotation<string>,
  history:       Annotation<Message[]>,
  summary:       Annotation<string>({
    value:   overwrite<string>,
    default: (): string => "",
  }),
  outputOptions: Annotation<OutputOptions>,
  mcpServerIds:  Annotation<number[]>,

  // ── Pipeline fields (populated by nodes, start empty) ────────────────────
  rawResults: Annotation<StepResult[]>({
    value:   overwrite<StepResult[]>,
    default: (): StepResult[] => [],
  }),

  filteredData: Annotation<Record<string, unknown>>({
    value:   overwrite<Record<string, unknown>>,
    default: (): Record<string, unknown> => ({}),
  }),

  sourceLabels: Annotation<string[]>({
    value:   overwrite<string[]>,
    default: (): string[] => [],
  }),

  // empty string = no visualization hint
  visualizationHint: Annotation<string>({
    value:   overwrite<string>,
    default: (): string => "",
  }),

  // collected by responderNode for history persistence
  fullResponse: Annotation<string>({
    value:   overwrite<string>,
    default: (): string => "",
  }),

  // set by agentLoopNode when Claude returns a full HTML document
  documentHtml: Annotation<string>({
    value:   overwrite<string>,
    default: (): string => "",
  }),

  // true when agentLoopNode has already streamed tokens directly to res
  // responderNode skips text_chunk loop in this case
  alreadyStreamed: Annotation<boolean>({
    value:   overwrite<boolean>,
    default: (): boolean => false,
  }),
});

export type GraphStateType = typeof GraphState.State;
