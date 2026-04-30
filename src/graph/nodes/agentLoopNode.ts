// Agent loop node — uses createReactAgent (LangGraph) with dynamically loaded MCP tools.
//
// Flow (mirrors sample code pattern):
//   1. Load MCP tools dynamically via mcpClientFactory (replaces hardcoded toolRegistry)
//   2. Build system prompt with QA hint as guidance
//   3. Create ChatOpenAI model (pointed at OpenRouter)
//   4. createReactAgent manages the entire tool-call loop automatically
//   5. Extract tool results (rawResults) and final answer (fullResponse) from agent messages
//   6. Cleanup MCP client connections

import { createReactAgent }                                   from "@langchain/langgraph/prebuilt";
import { ChatOpenAI }                                         from "@langchain/openai";
import { HumanMessage, AIMessage, ToolMessage, BaseMessage }  from "@langchain/core/messages";
import type { GraphStateType }                                 from "../state";
import type { StepResult }                                     from "../../types";
import { buildMcpTools }                                       from "../../mcp/mcpClientFactory";
import { findHint }                                            from "../../temp/qaHints";

// ── System prompt builder (QA hint passed as guidance, not forced steps) ─────

function buildSystemPrompt(hint: string | null, summary: string): string {
  const bqProject = process.env.BIGQUERY_PROJECT_ID ?? "mapnew-427517";
  const bqDataset = process.env.BIGQUERY_DATASET   ?? "medical_data";

  const parts: string[] = [
    "You are Atlato-One, an intelligent business assistant for the Atlato platform.",
    "",
    "Use the available tools to fetch data before answering data-related questions.",
    "For greetings, general questions, or conversational messages — respond directly without calling any tools.",
    "",
    "BigQuery context (use this when writing SQL — do NOT call list_dataset_ids or list_table_ids first):",
    `- Project : ${bqProject}`,
    `- Dataset : ${bqDataset}`,
    `- Known tables: patients, encounters, diagnoses, lab_results, medications, vitals`,
    `- Full table path format: \`${bqProject}.${bqDataset}.table_name\``,
  ];

  if (summary) {
    parts.push("", `Summary of earlier conversation:\n${summary}`);
  }

  if (hint) {
    parts.push(
      "",
      "Reference pattern for this type of question (use as guidance — you decide the actual tool calls):",
      hint,
    );
  }

  parts.push(
    "",
    "Rules:",
    "- For BigQuery questions: call execute_sql_readonly directly with a valid SQL query — skip discovery tools",
    "- Do not fabricate data — always call the appropriate tool first",
    "- Stop calling tools once you have sufficient data to answer",
    "- Be concise and professional in your response",
    "- Format numbers clearly (e.g., '65 km/h', '78% fuel level')",
    "- Do not mention internal system steps or tool names in your response",
  );

  return parts.join("\n");
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

  // 1. Load tools dynamically from configured MCP servers
  //    Replaces: hardcoded AGENT_TOOLS from toolRegistry.ts
  const { tools, cleanup } = await buildMcpTools(
    state.mcpServerIds,
    state.companyId,
    state.sessionId,   // sessionId used as userId for JWT payload
  );
  console.log(`[AgentLoop] ${tools.length} tool(s) loaded`);

  // 2. Build system prompt (QA hint is guidance only — LLM decides tool calls)
  const systemPrompt = buildSystemPrompt(hint, state.summary ?? "");

  // 3. ChatOpenAI pointed at OpenRouter (same as sample code pattern)
  const model = new ChatOpenAI({
    modelName:     process.env.OPENROUTER_MODEL ?? "anthropic/claude-sonnet-4-6",
    apiKey:        process.env.OPENROUTER_API_KEY ?? "",
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    maxTokens:     1000,
  });

  // 4. Build conversation history messages
  const historyMessages: BaseMessage[] = state.history.slice(-6).map(m =>
    m.role === "user" ? new HumanMessage(m.content) : new AIMessage(m.content),
  );

  // 5. createReactAgent manages the tool-call loop — replaces manual chatWithTools() loop
  //    Same as sample code: createAgent({ model, tools, systemPrompt })
  const agent = createReactAgent({
    llm:           model,
    tools,
    stateModifier: systemPrompt,
  });

  try {
    const result = await agent.invoke({
      messages: [...historyMessages, new HumanMessage(state.query)],
    });

    const { rawResults, fullResponse } = extractFromAgentResult(result);
    console.log(`[AgentLoop] Complete — ${rawResults.length} tool result(s)`);
    console.log(`[AgentLoop] Response preview: "${fullResponse.substring(0, 100)}..."`);

    return { rawResults, fullResponse };
  } finally {
    await cleanup();
  }
}
