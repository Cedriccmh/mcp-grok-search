import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// --- Config ---

const GROK_API_URL = process.env.GROK_API_URL || "https://chat.tabcode.cc/v1/chat/completions";
const GROK_API_KEY = process.env.GROK_API_KEY || "";
const GROK_MODEL = process.env.GROK_MODEL || "grok-4.20-beta";
const REQUEST_TIMEOUT_MS = parseInt(process.env.GROK_TIMEOUT_MS || "180000", 10);

const SYSTEM_PROMPT = `You are a web search assistant. Your task:
1. Search the web thoroughly for the user's query
2. Provide a comprehensive, well-structured answer in the SAME LANGUAGE as the query
3. Be factual and cite specific data points (versions, dates, numbers) when available`;

// --- SSE Stream Parser ---

interface ParsedResponse {
  content: string;
  thinkContent: string;
}

async function callGrokAPI(query: string): Promise<ParsedResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(GROK_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROK_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROK_MODEL,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: query },
        ],
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Grok API error ${response.status}: ${errorText}`);
    }

    if (!response.body) {
      throw new Error("No response body from Grok API");
    }

    // Parse SSE stream
    const fullContent = await parseSSEStream(response.body);
    return extractContent(fullContent);
  } finally {
    clearTimeout(timeout);
  }
}

async function parseSSEStream(body: ReadableStream<Uint8Array>): Promise<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let content = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") continue;

      try {
        const obj = JSON.parse(data);
        const delta = obj?.choices?.[0]?.delta;
        if (delta?.content) {
          content += delta.content;
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
  }

  return content;
}

function extractContent(raw: string): ParsedResponse {
  // Extract think block
  let thinkContent = "";
  const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    thinkContent = thinkMatch[1].trim();
  }

  // Main content = everything outside <think> tags
  let mainContent = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();

  // Strip any trailing Sources/References section that Grok may still include
  mainContent = mainContent.replace(/\n+(?:\*\*)?(?:#{1,3}\s*)?(?:Sources?|References?)\s*:?\s*(?:\*\*)?[\s\S]*$/i, "").trim();

  return { content: mainContent, thinkContent };
}

// --- MCP Server ---

const server = new McpServer({
  name: "grok-web-search",
  version: "1.0.0",
});

server.registerTool(
  "grok_web_search",
  {
    title: "Grok Web Search",
    description:
      "Search the web using Grok AI with real-time internet access. " +
      "Grok autonomously searches, browses pages, and synthesizes results. " +
      "Returns comprehensive answers. " +
      "Use for: any scenario requiring real-time web information.",
    inputSchema: {
      query: z.string().describe("The search query in natural language"),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async ({ query }) => {
    if (!GROK_API_KEY) {
      return {
        content: [{ type: "text" as const, text: "Error: GROK_API_KEY environment variable is not set." }],
        isError: true,
      };
    }

    try {
      const result = await callGrokAPI(query);

      return {
        content: [{ type: "text" as const, text: result.content }],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Grok search failed: ${msg}` }],
        isError: true,
      };
    }
  }
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`grok-web-search MCP server started (model: ${GROK_MODEL})`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
