// Dynamic MCP client factory — mirrors the production pattern from sample code.
//
// Sample code (Dev 1) pattern:
//   1. Load server config from Redis (toolCache)
//   2. Load company-specific headers from Redis (headerCache)
//   3. If atTokenSupport → generate Atlato JWT and set as Authorization header
//   4. Build mcpServers config map
//   5. new MultiServerMCPClient(mcpServers)
//   6. mcpClient.getTools()  →  tools array
//   7. Map tools to add timeout on invoke
//
// Here we replace Redis with our in-memory mcpRegistry.
// The rest of the pattern is identical to the sample code.

import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import jwt from "jsonwebtoken";
import { GoogleAuth, type GoogleAuthOptions } from "google-auth-library";
import type { StructuredTool } from "@langchain/core/tools";
import { getMcpServerInfo, getCompanyHeaders } from "./mcpRegistry";

export async function buildMcpTools(
  serverIds:  number[],
  companyId:  string,
  userId    = "system",
  clientId  = "atlato",
): Promise<{ tools: StructuredTool[]; cleanup: () => Promise<void> }> {

  // Build the mcpServers config map (same shape as sample code)
  const mcpServers: Record<string, any> = {};

  for (const toolId of serverIds) {
    // Replaces: CommonCache.getCacheData(`${CacheKey.MCP_SERVER_INFO}${toolId}`)
    const serverInfo = getMcpServerInfo(toolId);
    if (!serverInfo) {
      console.warn(`[McpFactory] Unknown server ID: ${toolId} — skipped`);
      continue;
    }

    // Replaces: CommonCache.getCacheData(`${CacheKey.MCP_SERVER_HEADERS}${toolId}-${companyId}`)
    const companyHeaders = getCompanyHeaders(toolId, companyId);

    if (serverInfo.atTokenSupport) {
      // ── Same logic as sample code: generate Atlato JWT ───────────────────
      const expiresAt = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
      const payload = {
        userId,
        vendorId:  clientId,
        companyId,
        isAdmin:   1,
        iat:       Math.floor(Date.now() / 1000),
        exp:       expiresAt,
        type:      "access",
        eventType: true,
      };
      const token = jwt.sign(payload, process.env.JWT_SECRET ?? "dev-secret");

      mcpServers[serverInfo.name] = {
        transport:          "http",
        url:                serverInfo.url,
        headers: {
          userip:        "127.0.0.1",
          Authorization: `Bearer ${token}`,
          core:          "1",
          ...companyHeaders,           // merge company-specific headers (same as sample)
        },
        defaultToolTimeout: 30 * 60 * 1000,
      };

    } else if (serverInfo.googleAuth) {
      // ── Google OAuth2 for BigQuery MCP ───────────────────────────────────
      const authOptions: GoogleAuthOptions = {
        scopes: ["https://www.googleapis.com/auth/bigquery"],
        ...(process.env.GOOGLE_SA_KEY_FILE ? { keyFile: process.env.GOOGLE_SA_KEY_FILE } : {}),
      };
      const auth = new GoogleAuth(authOptions);
      const client = await auth.getClient();
      const tokenResponse = await (client as any).getAccessToken();
      const token: string = tokenResponse.token ?? "";

      mcpServers[serverInfo.name] = {
        transport:          "http",
        url:                serverInfo.url,
        headers: {
          Authorization: `Bearer ${token}`,
          ...serverInfo.extraHeaders,
          ...companyHeaders,
        },
        defaultToolTimeout: 30 * 60 * 1000,
      };

    } else {
      // ── No special auth — use company headers only ───────────────────────
      mcpServers[String(toolId)] = {
        transport:          "http",
        url:                serverInfo.url,
        headers:            Object.keys(companyHeaders).length > 0 ? companyHeaders : undefined,
        defaultToolTimeout: 30 * 60 * 1000,
      };
    }
  }

  if (Object.keys(mcpServers).length === 0) {
    console.log("[McpFactory] No MCP servers configured — returning empty tool list");
    return { tools: [], cleanup: async () => {} };
  }

  // ── Same as sample code: build client, get tools, add timeout ────────────
  const mcpClient = new MultiServerMCPClient(mcpServers);
  const rawTools  = await mcpClient.getTools();

  console.log(`[McpFactory] ${rawTools.length} tool(s) loaded from ${Object.keys(mcpServers).length} server(s)`);

  // Mirror sample code: map tools to extend invoke with a hard timeout
  const tools = rawTools.map((t: any) => ({
    ...t,
    invoke: (params: any, config: any = {}) => {
      config.timeout = 1800000; // 30 minutes
      return t.call(params, config);
    },
  })) as StructuredTool[];

  return {
    tools,
    cleanup: async () => {
      try { await mcpClient.close(); } catch { /* ignore cleanup errors */ }
    },
  };
}
