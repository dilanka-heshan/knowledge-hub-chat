// MCP server config registry — replaces Redis cache (CommonCache) from production pattern.
//
// In production (Dev 1), server configs are stored in Redis keyed by toolId + companyId.
// Here we use an in-memory TypeScript map with the same shape — swap for Redis/MongoDB later
// by replacing getMcpServerInfo() and getCompanyHeaders() with cache lookups.
//
// To add a new MCP server: add one entry to MCP_SERVERS. Nothing else needs to change.

export interface McpServerInfo {
  id:             number;
  name:           string;   // used as the key in MultiServerMCPClient config
  url:            string;
  atTokenSupport: boolean;  // true → generate Atlato JWT (AT-token)
  googleAuth?:    boolean;  // true → use Google OAuth2 (BigQuery)
  extraHeaders?:  Record<string, string>; // static headers always merged in
}

// Replaces Redis key: MCP_SERVER_INFO{toolId}
export const MCP_SERVERS: Record<number, McpServerInfo> = {
  1: {
    id:             1,
    name:           "atlato-go",
    url:            process.env.ATLATO_GO_MCP_URL ?? "http://localhost:3100/mcp",
    atTokenSupport: true,
  },
  2: {
    id:             2,
    name:           "bigquery",
    url:            "https://bigquery.googleapis.com/mcp",
    atTokenSupport: false,
    googleAuth:     true,
    extraHeaders: {
      "x-goog-user-project": process.env.BIGQUERY_PROJECT_ID ?? "mapnew-427517",
    },
  },
};

// Replaces Redis key: MCP_SERVER_HEADERS{toolId}-{companyId}
// Shape: companyId → serverId → extra headers to merge
export const COMPANY_HEADERS: Record<string, Record<number, Record<string, string>>> = {
  // Example — add company-specific header overrides here:
  // "company-abc": {
  //   2: { "x-goog-user-project": "my-billing-project" },
  // },
};

// ── Accessors (same interface whether backed by memory or Redis) ──────────────

export function getMcpServerInfo(toolId: number): McpServerInfo | undefined {
  return MCP_SERVERS[toolId];
}

export function getCompanyHeaders(
  toolId: number,
  companyId: string,
): Record<string, string> {
  return COMPANY_HEADERS[companyId]?.[toolId] ?? {};
}