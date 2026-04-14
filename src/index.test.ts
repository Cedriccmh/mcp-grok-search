import test from "node:test";
import assert from "node:assert/strict";

import {
  buildResponsesApiUrl,
  buildResponsesRequestBody,
  extractContent,
  normalizeApiUrl,
  parseJsonResponseText,
  resolveSearchConfig,
} from "./index.js";

test("normalizeApiUrl appends chat completions path for bare host", () => {
  assert.equal(normalizeApiUrl("https://newapi.zhx47.xyz"), "https://newapi.zhx47.xyz/v1/chat/completions");
});

test("normalizeApiUrl appends chat completions path for /v1", () => {
  assert.equal(normalizeApiUrl("https://newapi.zhx47.xyz/v1"), "https://newapi.zhx47.xyz/v1/chat/completions");
});

test("buildResponsesApiUrl converts chat completions path to responses", () => {
  assert.equal(buildResponsesApiUrl("https://newapi.zhx47.xyz/v1/chat/completions"), "https://newapi.zhx47.xyz/v1/responses");
});

test("resolveSearchConfig keeps default model when agents is not set", () => {
  assert.deepEqual(resolveSearchConfig("grok-4.20-fast"), {
    model: "grok-4.20-fast",
  });
});

test("resolveSearchConfig maps agents=1 to grok-4.20-reasoning", () => {
  assert.deepEqual(resolveSearchConfig("grok-4.20-fast", 1), {
    model: "grok-4.20-reasoning",
  });
});

test("resolveSearchConfig maps agents=4 to multi-agent low effort", () => {
  assert.deepEqual(resolveSearchConfig("grok-4.20-fast", 4), {
    model: "grok-4.20-multi-agent",
    reasoningEffort: "low",
  });
});

test("resolveSearchConfig maps agents=16 to multi-agent high effort", () => {
  assert.deepEqual(resolveSearchConfig("grok-4.20-fast", 16), {
    model: "grok-4.20-multi-agent",
    reasoningEffort: "high",
  });
});

test("buildResponsesRequestBody uses user content array and web_search tool", () => {
  const body = buildResponsesRequestBody("OpenAI 官网", "grok-4.20-fast");

  assert.deepEqual(body, {
    model: "grok-4.20-fast",
    input: [{ role: "user", content: "OpenAI 官网" }],
    instructions: `You are a web search assistant. Your task:
1. Search the web thoroughly for the user's query
2. Provide a comprehensive, well-structured answer in the SAME LANGUAGE as the query
3. Be factual and cite specific data points (versions, dates, numbers) when available`,
    tools: [{ type: "web_search" }],
    temperature: 0.2,
  });
});

test("buildResponsesRequestBody injects reasoning preset for agents=4", () => {
  const body = buildResponsesRequestBody("OpenAI 官网", "grok-4.20-fast", 4);

  assert.equal(body.model, "grok-4.20-multi-agent");
  assert.deepEqual(body.reasoning, { effort: "low" });
});

test("parseJsonResponseText supports responses api output_text", () => {
  const result = parseJsonResponseText(
    JSON.stringify({
      output: [
        { type: "reasoning", summary: [{ type: "summary_text", text: "先检索" }] },
        {
          type: "message",
          content: [
            { type: "output_text", text: "OpenAI 官网是 https://openai.com/" },
            { type: "output_text", text: "开发者平台是 https://platform.openai.com/" },
          ],
        },
      ],
    })
  );

  assert.deepEqual(result, {
    content: "OpenAI 官网是 https://openai.com/\n开发者平台是 https://platform.openai.com/",
    thinkContent: "先检索",
  });
});

test("extractContent strips think and sources blocks", () => {
  const result = extractContent("<think>内部推理</think>\n结论内容\n\nSources:\n- a");

  assert.deepEqual(result, {
    content: "结论内容",
    thinkContent: "内部推理",
  });
});

test("parseJsonResponseText throws on non-json content", () => {
  assert.throws(() => parseJsonResponseText("<html>bad gateway</html>"), /non-JSON content/);
});
