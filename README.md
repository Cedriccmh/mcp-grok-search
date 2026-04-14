# mcp-grok-search

[English](#english) | [中文](#中文)

---

## English

An MCP (Model Context Protocol) server that provides real-time web search capabilities via the Grok API. Enables AI assistants like Claude to search the internet through Grok's built-in web browsing.

### Features

- Real-time web search powered by Grok AI
- Uses the Responses API, which is the recommended path for Grok web search
- `grok_web_search` supports an optional `agents` preset: `1`, `4`, or `16`
- `agents=1` uses `grok-4.20-reasoning`
- `agents=4/16` use `grok-4.20-multi-agent` with official reasoning presets
- Configurable API endpoint, model, and timeout
- Stdio transport for seamless MCP integration

### Quick Start

#### Prerequisites

- Node.js >= 18
- A Grok API key (get one at [x.ai](https://x.ai))

#### Install & Build

```bash
git clone https://github.com/Cedriccmh/mcp-grok-search.git
cd mcp-grok-search
npm install
npm run build
```

#### Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `GROK_API_KEY` | **(Required)** Your Grok API key | — |
| `GROK_API_URL` | API endpoint URL | `https://api.x.ai/v1/chat/completions` |
| `GROK_MODEL` | Default model used when `agents` is not passed | `grok-4.20-reasoning` |
| `GROK_TIMEOUT_MS` | Request timeout in ms | `180000` |

#### Run

```bash
GROK_API_KEY=your-key-here npm start
```

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "grok-web-search": {
      "command": "node",
      "args": ["path/to/mcp-grok-search/dist/index.js"],
      "env": {
        "GROK_API_KEY": "your-key-here"
      }
    }
  }
}
```

### Tech Stack

- TypeScript
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) — MCP server framework
- Zod — Input schema validation

### License

MIT

---

## 中文

一个基于 Grok API 的 MCP（Model Context Protocol）服务器，提供实时网络搜索能力。让 Claude 等 AI 助手能够通过 Grok 内置的网页浏览功能搜索互联网。

### 特性

- 基于 Grok AI 的实时网络搜索
- 使用 Responses API，符合 Grok 当前推荐的搜索接入方式
- `grok_web_search` 工具支持可选的 `agents` 预设：`1`、`4`、`16`
- `agents=1` 使用 `grok-4.20-reasoning`
- `agents=4/16` 使用 `grok-4.20-multi-agent` 和官方推荐的 `reasoning.effort`
- 可配置 API 端点、模型和超时时间
- Stdio 传输，无缝对接 MCP 协议

### 快速开始

#### 前置要求

- Node.js >= 18
- Grok API 密钥（在 [x.ai](https://x.ai) 获取）

#### 安装与构建

```bash
git clone https://github.com/Cedriccmh/mcp-grok-search.git
cd mcp-grok-search
npm install
npm run build
```

#### 环境变量

| 变量 | 说明 | 默认值 |
| --- | --- | --- |
| `GROK_API_KEY` | **（必填）** Grok API 密钥 | — |
| `GROK_API_URL` | API 端点 URL | `https://api.x.ai/v1/chat/completions` |
| `GROK_MODEL` | 不传 `agents` 时使用的默认模型 | `grok-4.20-reasoning` |
| `GROK_TIMEOUT_MS` | 请求超时时间（毫秒） | `180000` |

#### 运行

```bash
GROK_API_KEY=your-key-here npm start
```

### Claude Desktop 配置

将以下内容添加到 `claude_desktop_config.json`：

```json
{
  "mcpServers": {
    "grok-web-search": {
      "command": "node",
      "args": ["path/to/mcp-grok-search/dist/index.js"],
      "env": {
        "GROK_API_KEY": "your-key-here"
      }
    }
  }
}
```

### 技术栈

- TypeScript
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) — MCP 服务端框架
- Zod — 输入参数校验

### 许可证

MIT
