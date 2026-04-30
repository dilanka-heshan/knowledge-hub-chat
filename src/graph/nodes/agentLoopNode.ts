// Agent loop node — uses createReactAgent (LangGraph) with dynamically loaded MCP tools.
//
// Conversational flow:
//   1. Greetings / small talk  → respond directly, no tools
//   2. Data/action request     → Step 1: clarify intent (no tool call)
//   3. User confirms           → emit acknowledgement + run agent (tool call)

import { createReactAgent }                                   from "@langchain/langgraph/prebuilt";
import { ChatOpenAI }                                         from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage }               from "@langchain/core/messages";
import { DynamicStructuredTool }                              from "@langchain/core/tools";
import { z }                                                  from "zod";
import type { Response }                                       from "express";
import type { GraphStateType }                                 from "../state";
import type { StepResult }                                     from "../../types";
import { buildMcpTools }                                       from "../../mcp/mcpClientFactory";
import { findHint }                                            from "../../temp/qaHints";
import fs                                                      from "fs";
import path                                                    from "path";

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
    "",

    // ── WEB SEARCH ───────────────────────────────────────────────────────────
    "## Web Search",
    "- Use the web_search tool for real-time or general knowledge questions:",
    "  drug prices, medicine shortages, weather, news, current events.",
    "- Always prefer execute_sql_readonly for patient records, lab results, counts.",
    "- When calling web_search, always include specific names or identifiers in the query.",
    "- Never call web_search for data that exists in BigQuery.",
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
    "- If the user asks for a report, PDF, Word document, or any downloadable file: respond with a complete HTML document only — no explanation, no markdown, just raw HTML starting with <!DOCTYPE html>. Include <meta name=\"render-as\" content=\"pdf\"> (or docx) and <meta name=\"title\" content=\"...\"> in the <head>.",
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
  return ACKNOWLEDGEMENTS[Math.floor(Math.random() * ACKNOWLEDGEMENTS.length)] ?? "On it!";
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


// ── Web search tool — LangGraph executes it; wrapper calls OpenRouter internally ─

const webSearchTool = new DynamicStructuredTool({
  name: "web_search",
  description:
    "Search the web for real-time or general knowledge: medicine prices, drug availability, " +
    "weather, news, anything not in the patient database.",
  schema: z.object({
    query: z.string().describe("Specific search query including names, dates, or identifiers"),
  }),
  func: async ({ query }) => {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method:  "POST",
        signal:  controller.signal,
        headers: {
          "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY ?? ""}`,
          "Content-Type":  "application/json",
        },
        body: JSON.stringify({
          model:      process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4-6",
          max_tokens: 1500,
          messages: [
            { role: "system", content: "You MUST use the web_search tool. Never answer from training data." },
            { role: "user",   content: query },
          ],
          tools: [{ type: "openrouter:web_search" }],
        }),
      });
      if (!res.ok) throw new Error(`Web search failed: ${res.status} ${res.statusText}`);
      const data = await res.json() as any;
      return (data.choices?.[0]?.message?.content as string) ?? "No results found";
    } finally {
      clearTimeout(timeoutId);
    }
  },
});

// ── Main node (factory — needs res to stream tokens directly) ────────────────

export function createAgentLoopNode(res: Response) {
  return async (state: GraphStateType) => {
    const hint = findHint(state.query);
    console.log(`\n[AgentLoop] query="${state.query}"`);
    console.log(`[AgentLoop] hint=${hint ? `"${hint.substring(0, 70)}..."` : "none"}`);
    console.log(`[AgentLoop] mcpServerIds=${JSON.stringify(state.mcpServerIds)}`);

    // ── Detect if this turn is a confirmation of a previous clarification ─────
    const history = state.history ?? [];
    const userIsConfirming = isConfirmation(state.query) && lastMessageWasClarification(history);
    const acknowledgement  = userIsConfirming ? getAcknowledgement() : null;

    if (userIsConfirming) {
      console.log(`[AgentLoop] Confirmation detected — acknowledgement: "${acknowledgement}"`);
    }

    // 1. Load tools dynamically from configured MCP servers + web search wrapper
    const { tools, cleanup } = await buildMcpTools(
      state.mcpServerIds,
      state.companyId,
      state.sessionId,
    );
    const allTools = [...tools, webSearchTool];
    console.log(`[AgentLoop] ${tools.length} MCP tool(s) + web_search loaded`);

    // 2. Build system prompt
    const systemPrompt = buildSystemPrompt(hint, state.summary ?? "");

    // 3. ChatOpenAI pointed at OpenRouter
    const model = new ChatOpenAI({
      modelName:     process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4-6",
      apiKey:        process.env.OPENROUTER_API_KEY ?? "",
      configuration: { baseURL: "https://openrouter.ai/api/v1" },
      maxTokens:     8000,
    });

    // 4. Build conversation history
    const historyMessages: BaseMessage[] = history.slice(-6).map(m =>
      m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content),
    );
    const agentMessages: BaseMessage[] = [
      ...historyMessages,
      new HumanMessage(state.query),
    ];

    // 5. createReactAgent manages the tool-call loop
    const agent = createReactAgent({
      llm:           model,
      tools:         allTools,
      stateModifier: systemPrompt,
    });

    // Helper — write one SSE event to the response
    const sendToken = (token: string) =>
      res.write(`data: ${JSON.stringify({ type: "text_chunk", data: token })}\n\n`);

    const rawResults: StepResult[] = [];
    let step          = 1;
    let modelResponse = "";       // tokens from the model only
    let alreadyStreamed = false;

    // Look-ahead buffer: hold the first PREAMBLE_LEN chars before deciding
    // whether this response is a plain answer or an HTML document.
    // If HTML → buffer silently; if plain → flush + stream remaining tokens live.
    const PREAMBLE_LEN = 40;
    let preambleBuffer  = "";
    let preambleChecked = false;
    let htmlMode        = false;

    try {
      // Send acknowledgement immediately before token stream starts
      if (acknowledgement) {
        sendToken(acknowledgement + "\n\n");
        alreadyStreamed = true;
      }

      // 6. streamEvents gives us token-by-token events as the model generates
      for await (const event of agent.streamEvents({ messages: agentMessages }, { version: "v2" })) {

        // ── Stream LLM tokens ──────────────────────────────────────────────
        if (event.event === "on_chat_model_stream") {
          const content = event.data?.chunk?.content;
          const token   = typeof content === "string" ? content : "";
          if (!token) continue;

          modelResponse += token;

          if (!preambleChecked) {
            // Still filling the look-ahead buffer
            preambleBuffer += token;
            if (preambleBuffer.length >= PREAMBLE_LEN) {
              preambleChecked = true;
              const lower = preambleBuffer.toLowerCase();
              htmlMode = lower.includes("<!doctype") || lower.startsWith("<html");
              if (!htmlMode) {
                // Plain response — flush buffer and start live streaming
                sendToken(preambleBuffer);
                preambleBuffer  = "";
                alreadyStreamed = true;
              }
              // If HTML mode, just keep accumulating silently in modelResponse
            }
          } else if (!htmlMode) {
            // Past the preamble check, plain mode — stream every token live
            sendToken(token);
            alreadyStreamed = true;
          }
        }

        // ── Collect tool results ───────────────────────────────────────────
        if (event.event === "on_tool_end") {
          let data: unknown = event.data?.output;
          try { if (typeof data === "string") data = JSON.parse(data as string); } catch { /* keep raw */ }
          rawResults.push({
            step:        step++,
            description: String(event.name ?? "tool result"),
            data,
            isLlmStep:   false,
          });
        }
      }

      // Flush preamble buffer if stream ended before PREAMBLE_LEN chars
      if (!preambleChecked && preambleBuffer) {
        preambleChecked = true;
        const lower = preambleBuffer.toLowerCase();
        htmlMode = lower.includes("<!doctype") || lower.startsWith("<html");
        if (!htmlMode) {
          sendToken(preambleBuffer);
          alreadyStreamed = true;
        }
      }

      // Build final response string (used for history + HTML detection)
      const fullResponse = acknowledgement
        ? `${acknowledgement}\n\n${modelResponse}`
        : modelResponse;

      console.log(`[AgentLoop] Complete — ${rawResults.length} tool result(s)`);
      console.log(`[AgentLoop] Response preview: "${fullResponse.substring(0, 100)}..."`);

      // ── HTML document detection ──────────────────────────────────────────
      const lower    = fullResponse.toLowerCase();
      const startIdx = lower.indexOf("<!doctype") >= 0
        ? lower.indexOf("<!doctype")
        : lower.indexOf("<html");
      let documentHtml = "";
      if (startIdx >= 0) {
        documentHtml = fullResponse.slice(startIdx).replace(/\s*```\s*$/, "").trim();
      }
      console.log(`[AgentLoop] HTML check: startIdx=${startIdx}, found=${documentHtml.length > 0}`);

      if (documentHtml) {
        console.log("[AgentLoop] HTML document detected — routing to document_ready");
        const outDir = path.resolve("data");
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, "last-doc.html"), documentHtml, "utf-8");
        console.log("[AgentLoop] Saved → http://localhost:3001/dev/last-doc.html");
        return { rawResults, documentHtml, fullResponse: "", alreadyStreamed: false };
      }

      return { rawResults, fullResponse, alreadyStreamed };

    } finally {
      await cleanup();
    }
  };
}