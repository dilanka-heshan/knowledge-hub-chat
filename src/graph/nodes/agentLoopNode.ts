// Agent loop node — uses createReactAgent (LangGraph) with dynamically loaded MCP tools.
//
// Conversational flow:
//   1. Greetings / small talk  → respond directly, no tools
//   2. Data/action request     → Step 1: clarify intent (no tool call)
//   3. User confirms           → emit acknowledgement + run agent (tool call)

import { createReactAgent }                                   from "@langchain/langgraph/prebuilt";
import { ChatOpenAI }                                         from "@langchain/openai";
import { HumanMessage, AIMessage, ToolMessage, BaseMessage }  from "@langchain/core/messages";
import type { GraphStateType }                                 from "../state";
import type { StepResult }                                     from "../../types";
import { buildMcpTools }                                       from "../../mcp/mcpClientFactory";
import { findHint }                                            from "../../temp/qaHints";

// ── System prompt builder ─────────────────────────────────────────────────────

function buildSystemPrompt(hint: string | null, summary: string): string {
  const bqProject = process.env.BIGQUERY_PROJECT_ID ?? "mapnew-427517";
  const bqDataset = process.env.BIGQUERY_DATASET   ?? "medical_data";

  const parts: string[] = [
    "You are Atlato-One, an intelligent business assistant for the Atlato platform.",
    "",

    // ── GREETING & GENERAL CONVERSATION ──────────────────────────────────────
    "## General Conversation",
    "For greetings (hi, hello, good morning, how are you, etc.) or casual small talk:",
    "- Respond warmly and naturally. Do NOT call any tools.",
    "- Example: User says 'Good morning!' → You reply 'Good morning! How can I help you today?'",
    "",

    // ── CORE 3-STEP FLOW FOR DATA / ACTION REQUESTS ──────────────────────────
    "## Handling Data or Action Requests — Follow These 3 Steps STRICTLY",
    "",
    "### STEP 1 — Intent Clarification (ALWAYS do this first for new data requests)",
    "When the user asks for data, a report, a list, or any action involving tools:",
    "- NEVER call a tool immediately.",
    "- First, reply with a short, friendly clarification message to confirm what the user wants.",
    "- Format: 'Sure! Just to clarify — [restate what you understood they want], is that correct?'",
    "- Example: User says 'Give me 10 patient names' →",
    "  You reply: 'Sure! Just to clarify — you'd like me to retrieve 10 patient names from the database, correct?'",
    "- Wait for the user's confirmation. Do NOT call any tools in this turn.",
    "",
    "### STEP 2 — User Confirmed: Execute Immediately",
    "When the conversation history shows you already asked a clarification AND the user has now confirmed:",
    "- The acknowledgement message has already been sent — do NOT repeat or re-generate it.",
    "- Immediately call the appropriate tool(s) to fulfil the request.",
    "- Return the result directly.",
    "",
    "### STEP 3 — Respond with Results",
    "- Present the tool results clearly and concisely.",
    "- Do NOT mention tool names, SQL queries, or internal steps in your response.",
    "",

    // ── DECIDING WHEN STEP 1 APPLIES ─────────────────────────────────────────
    "## When to Apply the 3-Step Flow vs. Respond Directly",
    "Apply the 3-step flow when the request:",
    "- Asks for data, records, lists, counts, reports, or summaries from a database",
    "- Requests an action that calls a tool (e.g., fetch, retrieve, show, get, find)",
    "",
    "Respond directly (NO clarification needed) when the message is:",
    "- A greeting or small talk (hi, thanks, good morning, how are you)",
    "- A follow-up question about a previous answer",
    "- A general knowledge question that needs no tool",
    "",

    // ── BIGQUERY CONTEXT ──────────────────────────────────────────────────────
    "## BigQuery Context (use when writing SQL — do NOT call list_dataset_ids or list_table_ids)",
    `- Project : ${bqProject}`,
    `- Dataset : ${bqDataset}`,
    `- Known tables: patients, encounters, diagnoses, lab_results, medications, vitals`,
    `- Full table path format: \`${bqProject}.${bqDataset}.table_name\``,
    "- Call execute_sql_readonly directly with a valid SQL query — skip all discovery tools",
  ];

  if (summary) {
    parts.push("", `## Earlier Conversation Summary\n${summary}`);
  }

  if (hint) {
    parts.push(
      "",
      "## Reference Pattern (use as guidance — you decide the actual tool calls)",
      hint,
    );
  }

  parts.push(
    "",
    "## General Rules",
    "- Do not fabricate data — always call the appropriate tool first",
    "- Stop calling tools once you have sufficient data to answer",
    "- Be concise and professional in your response",
    "- Format numbers clearly (e.g., '65 km/h', '78% fuel level')",
    "- Never mention internal system steps, tool names, or SQL in your response",
  );

  return parts.join("\n");
}

// ── Acknowledgement pool — rotates randomly on each confirmation ──────────────

const ACKNOWLEDGEMENTS = [
  "Okay, let me retrieve that for you...",
  "Sure! Fetching that now...",
  "Got it! Pulling that data for you...",
  "On it! Give me a moment...",
  "Absolutely, let me look that up...",
  "Right away! Fetching the data...",
  "Sure thing! Let me grab that...",
  "Of course! Retrieving that now...",
];

function getAcknowledgement(): string {
  return ACKNOWLEDGEMENTS[Math.floor(Math.random() * ACKNOWLEDGEMENTS.length)];
}

// ── Confirmation detection ────────────────────────────────────────────────────

const CONFIRMATION_REGEX =
  /^(yes|yess|yes+|yeah|yaeh|yeha|yep|yapp|yup|yupp|sure|shure|sur|okay|okayy|okey|ok|oki|correct|corect|go ahead|go ahed|proceed|do it|affirmative|right|exactly|please|please do|sounds good|that'?s right|that is right|of course|ofc|definitely|definately|defintely|definitly|absolutely|absolutly|absulutely|yap|go on|make it so|do that|alright|alr|aight|alrighty|yessir|roger|aye|noted|let'?s go|lets go|yass|yasss|sure thing|for sure|forsure|100|👍)\b/i;

function isConfirmation(query: string): boolean {
  return CONFIRMATION_REGEX.test(query.trim());
}

// ── Check if the last assistant message was an intent clarification ──────────

function lastMessageWasClarification(history: { role: string; content: string }[]): boolean {
  const lastAssistant = [...history].reverse().find(m => m.role === "assistant");
  if (!lastAssistant) return false;
  const lower = lastAssistant.content.toLowerCase();
  return (
    lower.includes("just to clarify") ||
    lower.includes("is that correct")  ||
    lower.includes("did you mean")     ||
    lower.includes(", correct?")       ||
    lower.includes(", right?")
  );
}

// ── Extract StepResult[] and final text from agent messages ──────────────────

function extractFromAgentResult(result: { messages: BaseMessage[] }): {
  rawResults:   StepResult[];
  fullResponse: string;
} {
  const rawResults: StepResult[] = [];
  let fullResponse = "";
  let step = 1;

  for (const msg of result.messages) {
    if (msg instanceof ToolMessage) {
      let data: unknown = msg.content;
      try { data = JSON.parse(msg.content as string); } catch { /* keep raw string */ }
      rawResults.push({
        step:        step++,
        description: (msg as any).name ?? "tool result",
        data,
        isLlmStep:   false,
      });
    }
    // Keep the last AIMessage text as the final response
    if (msg instanceof AIMessage && typeof msg.content === "string" && msg.content.trim()) {
      fullResponse = msg.content;
    }
  }

  return { rawResults, fullResponse };
}

// ── Main node ─────────────────────────────────────────────────────────────────

export async function agentLoopNode(state: GraphStateType) {
  const hint = findHint(state.query);
  console.log(`\n[AgentLoop] query="${state.query}"`);
  console.log(`[AgentLoop] hint=${hint ? `"${hint.substring(0, 70)}..."` : "none"}`);
  console.log(`[AgentLoop] mcpServerIds=${JSON.stringify(state.mcpServerIds)}`);

  // ── Detect if this turn is a confirmation of a previous clarification ───────
  const history = state.history ?? [];
  const userIsConfirming = isConfirmation(state.query) && lastMessageWasClarification(history);

  // Pick a random acknowledgement if this is a confirmation turn, null otherwise
  const acknowledgement = userIsConfirming ? getAcknowledgement() : null;

  if (userIsConfirming) {
    console.log(`[AgentLoop] Confirmation detected — acknowledgement: "${acknowledgement}"`);
  }

  // 1. Load tools dynamically from configured MCP servers
  const { tools, cleanup } = await buildMcpTools(
    state.mcpServerIds,
    state.companyId,
    state.sessionId,
  );
  console.log(`[AgentLoop] ${tools.length} tool(s) loaded`);

  // 2. Build system prompt
  const systemPrompt = buildSystemPrompt(hint, state.summary ?? "");

  // 3. ChatOpenAI pointed at OpenRouter
  const model = new ChatOpenAI({
    modelName:     process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4-6",
    apiKey:        process.env.OPENROUTER_API_KEY ?? "",
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    maxTokens:     1000,
  });

  // 4. Build clean conversation history for the agent
  const historyMessages: BaseMessage[] = history.slice(-6).map(m =>
    m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content),
  );

  const agentMessages: BaseMessage[] = [
    ...historyMessages,
    new HumanMessage(state.query),
  ];

  // 5. createReactAgent manages the tool-call loop automatically
  const agent = createReactAgent({
    llm:           model,
    tools,
    stateModifier: systemPrompt,
  });

  try {
    const result = await agent.invoke({ messages: agentMessages });

    const { rawResults, fullResponse } = extractFromAgentResult(result);

    // Prepend the randomly picked acknowledgement string so the UI always
    // displays it before the data — no LLM generation needed for this.
    const finalResponse = acknowledgement
      ? `${acknowledgement}\n\n${fullResponse}`
      : fullResponse;

    console.log(`[AgentLoop] Complete — ${rawResults.length} tool result(s)`);
    console.log(`[AgentLoop] Response preview: "${finalResponse.substring(0, 100)}..."`);

    return { rawResults, fullResponse: finalResponse };
  } finally {
    await cleanup();
  }
}