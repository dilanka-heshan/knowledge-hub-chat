/// <reference types="node" />
/**
 * Interactive terminal chat — run alongside the dev server.
 * Usage:  npx ts-node chat.ts
 *
 * Type your message and press Enter.
 * Type "exit" or press Ctrl+C to quit.
 * Type "history" to print the conversation so far.
 * Type "clear"   to reset the conversation history.
 */

import * as readline from "readline";
import * as http from "http";

// ── Types (mirror src/types/index.ts) ────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface SSEEvent {
  type: string;
  data: unknown;
}

// ── Session state ─────────────────────────────────────────────────────────────

const SESSION_ID = `cli-${Date.now()}`;
const COMPANY_ID = "demo";
const history: Message[] = [];

// ── Core: POST to /api/chat/stream and parse SSE ──────────────────────────────

function sendMessage(query: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      sessionId:     SESSION_ID,
      companyId:     COMPANY_ID,
      query,
      history,
      outputOptions: { wantReport: false, wantDiagram: false, wantRawData: false },
      mcpServerIds:  [2],   // 2 = BigQuery MCP
    });

    const req = http.request(
      {
        hostname: "localhost",
        port:     3001,
        path:     "/api/chat/stream",
        method:   "POST",
        headers: {
          "Content-Type":   "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res: http.IncomingMessage) => {
        let buffer = "";
        let fullText = "";

        res.on("data", (chunk: Buffer) => {
          buffer += chunk.toString();

          // SSE lines end with \n\n; process complete lines only
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const event = JSON.parse(line.slice(6)) as SSEEvent;

              if (event.type === "text_chunk") {
                const text = event.data as string;
                process.stdout.write(text);
                fullText += text;

              } else if (event.type === "sources") {
                const sources = event.data as string[];
                if (sources.length > 0) {
                  process.stdout.write(`\n\n[Sources: ${sources.join(", ")}]`);
                }

              } else if (event.type === "visualization_hint") {
                process.stdout.write(`\n[Chart: ${event.data as string}]`);

              } else if (event.type === "document_ready") {
                process.stdout.write("\n[Document ready — open http://localhost:3001/dev/last-doc.html to view]");

              } else if (event.type === "done") {
                process.stdout.write("\n");
                resolve(fullText);

              } else if (event.type === "error") {
                reject(new Error(event.data as string));
              }
            } catch {
              // skip malformed SSE lines
            }
          }
        });

        res.on("error", reject);
        res.on("end", () => resolve(fullText));   // safety fallback
      }
    );

    req.on("error", (err: Error & { code?: string }) => {
      if (err.code === "ECONNREFUSED") {
        reject(new Error("Cannot connect — is the server running? (npm run dev)"));
      } else {
        reject(err);
      }
    });

    req.write(body);
    req.end();
  });
}

// ── CLI loop ──────────────────────────────────────────────────────────────────

const rl = readline.createInterface({
  input:  process.stdin,
  output: process.stdout,
});

function ask(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      rl.question(prompt, resolve);
    } catch {
      reject(new Error("stdin closed"));
    }
  });
}

async function main() {
  console.log("╔══════════════════════════════════╗");
  console.log("║     Knowledge Hub — Chat CLI     ║");
  console.log("╚══════════════════════════════════╝");
  console.log(`Session : ${SESSION_ID}`);
  console.log(`Server  : http://localhost:3001`);
  console.log(`Commands: exit | history | clear\n`);

  // eslint-disable-next-line no-constant-condition
  while (true) {
    let input: string;
    try {
      input = (await ask("You: ")).trim();
    } catch {
      break;  // stdin was closed (e.g. Ctrl+D)
    }

    if (input === "") continue;

    if (input === "exit") {
      console.log("Goodbye!");
      rl.close();
      break;
    }

    if (input === "history") {
      if (history.length === 0) {
        console.log("(no history yet)\n");
      } else {
        console.log("\n── Conversation history ──");
        for (const m of history) {
          const label = m.role === "user" ? "You      " : "Assistant";
          console.log(`${label}: ${m.content}\n`);
        }
        console.log("─────────────────────────\n");
      }
      continue;
    }

    if (input === "clear") {
      history.length = 0;
      console.log("(history cleared)\n");
      continue;
    }

    process.stdout.write("\nAssistant: ");

    try {
      const response = await sendMessage(input);
      history.push({ role: "user",      content: input });
      history.push({ role: "assistant", content: response });
      process.stdout.write("\n");
    } catch (err) {
      process.stdout.write("\n");
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}\n`);
    }
  }
}


main();
