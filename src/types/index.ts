//All shared types (ChatRequest, SSEEvent, etc.)

// ─── Chat & Session ──────────────────────────────────────────────────────────

export type Role = "user" | "assistant";

export interface Message {
  role: Role;
  content: string;
}

export interface OutputOptions {
  wantReport: boolean;    // user checked "Report" in UI
  wantDiagram: boolean;   // user checked "Diagram" in UI
  wantRawData: boolean;   // user checked "Raw Data" in UI
  scope?: string;         // e.g. "last 30 days", "Wing A only"
}

export interface ChatRequest {
  sessionId:    string;
  companyId:    string;
  userId?:      string;   // for JWT generation in mcpClientFactory (optional — falls back to sessionId)
  clientId?:    string;   // vendor/client ID for JWT payload
  query:        string;
  history:      Message[];
  outputOptions: OutputOptions;
  mcpServerIds: number[];  // which MCP servers this company can access
}

// ─── Agent Pipeline ──────────────────────────────────────────────────────────

export type IntentType =
  | "data_query"         // user wants to fetch/analyse data
  | "report_request"     // user wants a document
  | "general_qa"         // answered from RAG / knowledge base
  | "clarification_needed"; // intent is too vague to proceed

export interface PlanStep {
  step: number;
  description: string;
  source: "sap" | "bigquery" | "workflow_history" | "rag" | "dummy" | "mcp";
  toolName?: string;      // MCP tool name to call
  params?: Record<string, unknown>;
}

export interface AgentContext {
  request: ChatRequest;
  summary?: string;           // rolling summary of messages older than the window
  intent?: IntentType;
  clarificationQuestion?: string;
  plan?: PlanStep[];
  rawResults?: unknown[];
  ragContext?: RagChunk[];
  filteredData?: Record<string, unknown>;
  visualizationHint?: "bar_chart" | "line_chart" | "table" | "pie_chart";
  reportPayload?: ReportPayload;
  sourceLabels?: string[];
}

// ─── RAG ─────────────────────────────────────────────────────────────────────

export interface RagChunk {
  id: string;
  content: string;
  metadata: Record<string, string>;
  score: number;
}

// ─── Reports ─────────────────────────────────────────────────────────────────

export type ReportFormat = "docx" | "csv" | "pdf";

export interface ReportPayload {
  title: string;
  sections: ReportSection[];
  rawData?: Record<string, unknown>[];
  sourceLabels: string[];
  generatedAt: string;
}

export interface ReportSection {
  heading: string;
  content: string;
  data?: Record<string, unknown>[];
}

// ─── Agent Step Result ────────────────────────────────────────────────────────

export interface StepResult {
  step: number;
  description: string;
  data: unknown;
  isLlmStep: boolean;         // true = no tool data; LLM answers from knowledge
  visualizationHint?: string;
}

// ─── SSE Event Types ─────────────────────────────────────────────────────────
// These are the event shapes sent over the SSE stream to the frontend.

export type SSEEventType =
  | "text_chunk"           // streaming answer token
  | "clarification"        // agent needs more info from user
  | "sources"              // which data sources were used
  | "visualization_hint"   // tell frontend what chart to render
  | "report_ready"         // report file is downloadable
  | "error"
  | "done";

export interface SSEEvent {
  type: SSEEventType;
  data: unknown;
}