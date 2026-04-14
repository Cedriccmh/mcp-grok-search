import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const GROK_API_URL = normalizeApiUrl(
  process.env.GROK_API_URL || "https://chat.tabcode.cc/v1/chat/completions"
);
const GROK_RESPONSES_API_URL = buildResponsesApiUrl(GROK_API_URL);
const GROK_API_KEY = process.env.GROK_API_KEY || "";
const GROK_MODEL = process.env.GROK_MODEL || "grok-4.20-reasoning";
const REQUEST_TIMEOUT_MS = parseInt(process.env.GROK_TIMEOUT_MS || "180000", 10);

const SYSTEM_PROMPT = `You are a web search assistant. Your task:
1. Search the web thoroughly for the user's query
2. Provide a comprehensive, well-structured answer in the SAME LANGUAGE as the query
3. Be factual and cite specific data points (versions, dates, numbers) when available`;

type AgentPreset = 1 | 4 | 16;

interface ParsedResponse {
  content: string;
  thinkContent: string;
}

interface ResponsesApiResponse {
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
    summary?: Array<{ type?: string; text?: string }>;
  }>;
  error?: {
    message?: string;
  };
}

interface SearchOptions {
  agents?: AgentPreset;
}

interface SearchConfig {
  model: string;
  reasoningEffort?: "low" | "high";
}

interface ResponsesApiRequestBody {
  model: string;
  input: Array<{
    role: "user";
    content: string;
  }>;
  instructions: string;
  tools: Array<{
    type: "web_search";
  }>;
  temperature: number;
  reasoning?: {
    effort: "low" | "high";
  };
}

class HttpError extends Error {
  status: number;
  body: string;

  constructor(status: number, body: string) {
    super(`Grok API error ${status}: ${body}`);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
  }
}

export function normalizeApiUrl(rawUrl: string): string {
  const url = new URL(rawUrl);

  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = "/v1/chat/completions";
  } else if (url.pathname === "/v1" || url.pathname === "/v1/") {
    url.pathname = "/v1/chat/completions";
  }

  return url.toString();
}

export function buildResponsesApiUrl(rawUrl: string): string {
  const url = new URL(rawUrl);

  if (url.pathname === "/" || url.pathname === "") {
    url.pathname = "/v1/responses";
  } else if (url.pathname === "/v1" || url.pathname === "/v1/") {
    url.pathname = "/v1/responses";
  } else if (url.pathname === "/v1/chat/completions" || url.pathname === "/v1/chat/completions/") {
    url.pathname = "/v1/responses";
  }

  return url.toString();
}

export function resolveSearchConfig(defaultModel: string, agents?: AgentPreset): SearchConfig {
  if (agents === 1) {
    return { model: "grok-4.20-reasoning" };
  }

  if (agents === 4) {
    return { model: "grok-4.20-multi-agent", reasoningEffort: "low" };
  }

  if (agents === 16) {
    return { model: "grok-4.20-multi-agent", reasoningEffort: "high" };
  }

  return { model: defaultModel };
}

export function buildResponsesRequestBody(
  query: string,
  defaultModel: string,
  agents?: AgentPreset
): ResponsesApiRequestBody {
  const config = resolveSearchConfig(defaultModel, agents);

  return {
    model: config.model,
    input: [{ role: "user", content: query }],
    instructions: SYSTEM_PROMPT,
    tools: [{ type: "web_search" }],
    temperature: 0.2,
    ...(config.reasoningEffort
      ? { reasoning: { effort: config.reasoningEffort } }
      : {}),
  };
}

async function callGrokAPI(query: string, options: SearchOptions = {}): Promise<ParsedResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await callResponsesAPI(query, controller.signal, options);
  } finally {
    clearTimeout(timeout);
  }
}

async function callResponsesAPI(
  query: string,
  signal: AbortSignal,
  options: SearchOptions
): Promise<ParsedResponse> {
  const response = await fetch(GROK_RESPONSES_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${GROK_API_KEY}`,
    },
    body: JSON.stringify(buildResponsesRequestBody(query, GROK_MODEL, options.agents)),
    signal,
  });

  if (!response.ok) {
    throw new HttpError(response.status, await response.text());
  }

  return parseJsonResponseText(await response.text());
}

export function parseJsonResponseText(rawText: string): ParsedResponse {
  let parsed: ResponsesApiResponse;

  try {
    parsed = JSON.parse(rawText) as ResponsesApiResponse;
  } catch {
    const preview = rawText.slice(0, 300).trim();
    throw new Error(`Grok API returned non-JSON content: ${preview}`);
  }

  if ("output" in parsed) {
    return parseResponsesApiResponse(parsed);
  }

  throw new Error("Grok API response did not contain a supported response shape");
}

function parseResponsesApiResponse(parsed: ResponsesApiResponse): ParsedResponse {
  if (parsed.error?.message) {
    throw new Error(`Grok API error: ${parsed.error.message}`);
  }

  const content = (parsed.output || [])
    .filter((item) => item?.type === "message" && Array.isArray(item.content))
    .flatMap((item) => item.content || [])
    .filter(
      (item) =>
        (item?.type === "output_text" || item?.type === "text") &&
        typeof item.text === "string"
    )
    .map((item) => item.text)
    .join("\n")
    .trim();

  const thinkContent = (parsed.output || [])
    .filter((item) => item?.type === "reasoning" && Array.isArray(item.summary))
    .flatMap((item) => item.summary || [])
    .filter((item) => typeof item.text === "string")
    .map((item) => item.text!.trim())
    .filter(Boolean)
    .join("\n\n");

  if (!content) {
    throw new Error("Grok API response did not contain message content");
  }

  return extractContent(content, thinkContent);
}

export function extractContent(raw: string, presetThinkContent = ""): ParsedResponse {
  let thinkContent = presetThinkContent;
  const thinkMatch = raw.match(/<think>([\s\S]*?)<\/think>/);
  if (thinkMatch) {
    thinkContent = thinkMatch[1].trim();
  }

  let mainContent = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  mainContent = mainContent.replace(/\n+(?:\*\*)?(?:#{1,3}\s*)?(?:Sources?|References?)\s*:?\s*(?:\*\*)?[\s\S]*$/i, "").trim();

  return { content: mainContent, thinkContent };
}

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
      agents: z.union([z.literal(1), z.literal(4), z.literal(16)]).optional().describe(
        "Optional search scale preset. 1 uses grok-4.20-reasoning, 4/16 use grok-4.20-multi-agent with official reasoning effort presets."
      ),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
    },
  },
  async ({ query, agents }) => {
    if (!GROK_API_KEY) {
      return {
        content: [{ type: "text" as const, text: "Error: GROK_API_KEY environment variable is not set." }],
        isError: true,
      };
    }

    try {
      const result = await callGrokAPI(query, { agents });

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

export async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`grok-web-search MCP server started (default model: ${GROK_MODEL})`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}
