// Local-file chat history store.
// Saves one JSON file per sessionId under data/history/.
// TEMPORARY: swap saveHistory / loadHistory for MongoDB calls when ready.

import fs from "fs";
import path from "path";
import type { Message } from "../types";

const HISTORY_DIR = path.join(__dirname, "../../data/history");

export interface HistoryRecord {
  summary: string;      // rolling LLM summary of messages older than the window
  messages: Message[];  // last N messages (trimmed to window by agent/index.ts)
}

export function saveHistory(sessionId: string, record: HistoryRecord): void {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(HISTORY_DIR, `${sessionId}.json`),
    JSON.stringify(record, null, 2),
    "utf-8"
  );
}

export function loadHistory(sessionId: string): HistoryRecord {
  const file = path.join(HISTORY_DIR, `${sessionId}.json`);
  if (!fs.existsSync(file)) return { summary: "", messages: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf-8"));
    // Migrate old format (plain Message[]) to new shape
    if (Array.isArray(parsed)) return { summary: "", messages: parsed };
    return parsed as HistoryRecord;
  } catch {
    return { summary: "", messages: [] };
  }
}
