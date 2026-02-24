# NanoClaw MCP (Model Context Protocol) 集成系統

## 什麼是 MCP？

```
MCP = Model Context Protocol（模型上下文協定）

核心概念：
├─ 讓 LLM 標準化地訪問外部資源
├─ 統一接口（像 USB-C）連接數據源 & 工具
├─ AI 可直接讀取文件、查詢數據庫、搜尋網頁
└─ 無需為每個模型寫客製化代碼

架構：
├─ MCP Host：執行 LLM 的應用（NanoClaw）
└─ MCP Server：提供資源的服務程序
```

---

## Part 1：安裝 MCP 依賴

### Step 1：安裝 MCP 套件

```bash
cd /root/nanoclaw

# 安裝 MCP SDK
npm install @modelcontextprotocol/sdk

# 安裝工具依賴
npm install fs-extra@11 axios nodemailer
```

---

## Part 2：實現 MCP Server

### Step 2：創建 MCP 文件系統服務

```bash
mkdir -p src/mcp/servers
nano src/mcp/servers/filesystem-server.ts
```

**複製以下代碼：**

```typescript
import {
  Server,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  TextResourceContents,
  ResourceList,
} from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as fs from 'fs-extra';
import * as path from 'path';

interface FileResource {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
}

class FilesystemMCPServer {
  private server: Server;
  private workspaceRoot: string;
  private allowedPaths: string[];

  constructor() {
    this.workspaceRoot = process.env.MCP_WORKSPACE_ROOT || '/root/.nanoclaw/workspace';
    this.allowedPaths = [
      this.workspaceRoot,
      process.env.MCP_ALLOWED_PATHS || ''
    ].filter(Boolean);

    this.server = new Server({
      name: 'nanoclaw-filesystem',
      version: '1.0.0',
      capabilities: {
        resources: {
          maxDepth: 3
        }
      }
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    // 列出資源
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return await this.listResources();
    });

    // 讀取資源
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      return await this.readResource(request);
    });
  }

  private async listResources(): Promise<ResourceList> {
    const resources: FileResource[] = [];

    for (const allowedPath of this.allowedPaths) {
      if (!allowedPath) continue;

      try {
        const files = await fs.readdir(allowedPath, { withFileTypes: true });

        for (const file of files) {
          const fullPath = path.join(allowedPath, file.name);
          const uri = `file://${fullPath}`;

          if (file.isFile()) {
            const stat = await fs.stat(fullPath);
            resources.push({
              uri,
              name: file.name,
              description: `文件 (${(stat.size / 1024).toFixed(2)} KB)`,
              mimeType: this.getMimeType(file.name)
            });
          }
        }
      } catch (error) {
        console.error(`讀取目錄失敗：${allowedPath}`, error);
      }
    }

    return { resources };
  }

  private async readResource(request: any): Promise<TextResourceContents> {
    const { uri } = request.params;
    const filePath = uri.replace('file://', '');

    // 安全檢查：確保路徑在允許範圍內
    if (!this.isPathAllowed(filePath)) {
      throw new Error(`訪問被拒絕：${filePath}`);
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return {
        uri,
        mimeType: this.getMimeType(filePath),
        text: content
      };
    } catch (error) {
      throw new Error(`讀取文件失敗：${filePath}`);
    }
  }

  private isPathAllowed(filePath: string): boolean {
    for (const allowedPath of this.allowedPaths) {
      if (filePath.startsWith(allowedPath)) {
        return true;
      }
    }
    return false;
  }

  private getMimeType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.md': 'text/markdown',
      '.json': 'application/json',
      '.ts': 'text/x-typescript',
      '.js': 'text/javascript',
      '.txt': 'text/plain',
      '.env': 'text/plain',
      '.yaml': 'text/yaml'
    };
    return mimeTypes[ext] || 'text/plain';
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('✅ 文件系統 MCP Server 已啟動');
  }
}

// 啟動
const server = new FilesystemMCPServer();
server.start().catch(console.error);
```

---

### Step 3：創建 MCP 搜尋服務

```bash
nano src/mcp/servers/search-server.ts
```

**複製以下代碼：**

```typescript
import {
  Server,
  ToolListSchema,
  ToolCallRequestSchema,
  TextContent,
} from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import axios from 'axios';
import tavilySearch from '../../skills/tavily-search';

interface SearchTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: any;
    required: string[];
  };
}

class SearchMCPServer {
  private server: Server;
  private tools: Map<string, SearchTool> = new Map();

  constructor() {
    this.server = new Server({
      name: 'nanoclaw-search',
      version: '1.0.0',
      capabilities: {
        tools: {}
      }
    });

    this.registerTools();
    this.setupHandlers();
  }

  private registerTools(): void {
    // 註冊 Tavily 搜尋工具
    this.tools.set('tavily_search', {
      name: 'tavily_search',
      description: '使用 Tavily 進行聯網搜尋，獲取最新信息',
      inputSchema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: '搜尋查詢'
          },
          maxResults: {
            type: 'number',
            description: '最大結果數',
            default: 5
          }
        },
        required: ['query']
      }
    });

    // 註冊網頁內容提取工具
    this.tools.set('fetch_url', {
      name: 'fetch_url',
      description: '獲取網頁內容',
      inputSchema: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL 地址'
          }
        },
        required: ['url']
      }
    });
  }

  private setupHandlers(): void {
    // 列出工具
    this.server.setRequestHandler(ToolListSchema, async () => {
      return {
        tools: Array.from(this.tools.values())
      };
    });

    // 調用工具
    this.server.setRequestHandler(ToolCallRequestSchema, async (request) => {
      return await this.executeTool(request);
    });
  }

  private async executeTool(request: any): Promise<{ content: any[] }> {
    const { name, arguments: args } = request.params;

    try {
      let result: string;

      switch (name) {
        case 'tavily_search':
          result = await tavilySearch.search(args.query);
          break;
        case 'fetch_url':
          result = await this.fetchUrl(args.url);
          break;
        default:
          result = `未知工具：${name}`;
      }

      return {
        content: [
          {
            type: 'text',
            text: result
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ 工具執行失敗：${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private async fetchUrl(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'NanoClaw/1.0'
        }
      });

      // 簡單的 HTML 到 Markdown 轉換
      return response.data.substring(0, 5000);
    } catch (error) {
      throw new Error(`無法獲取 URL：${url}`);
    }
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.log('✅ 搜尋 MCP Server 已啟動');
  }
}

const server = new SearchMCPServer();
server.start().catch(console.error);
```

---

## Part 3：MCP 客戶端實現

### Step 4：創建 MCP 管理器

```bash
nano src/mcp/mcp-manager.ts
```

**複製以下代碼：**

```typescript
import { spawn } from 'child_process';
import * as path from 'path';

interface MCPServer {
  name: string;
  enabled: boolean;
  process: any;
  capabilities: string[];
}

class MCPManager {
  private servers: Map<string, MCPServer> = new Map();
  private baseDir: string;

  constructor() {
    this.baseDir = path.join(process.cwd(), 'src/mcp/servers');
    this.initializeServers();
  }

  private initializeServers(): void {
    const serverConfigs = [
      {
        name: 'filesystem',
        script: 'filesystem-server.ts',
        capabilities: ['resources:read', 'resources:list']
      },
      {
        name: 'search',
        script: 'search-server.ts',
        capabilities: ['tools:execute', 'tools:list']
      }
    ];

    for (const config of serverConfigs) {
      this.servers.set(config.name, {
        name: config.name,
        enabled: process.env[`MCP_${config.name.toUpperCase()}_ENABLED`] !== 'false',
        process: null,
        capabilities: config.capabilities
      });
    }
  }

  /**
   * 啟動 MCP 服務器
   */
  async startServers(): Promise<void> {
    for (const [name, server] of this.servers) {
      if (!server.enabled) {
        console.log(`⏸️  ${name} MCP Server 已禁用`);
        continue;
      }

      try {
        console.log(`▶️ 啟動 ${name} MCP Server...`);
        
        // 使用 ts-node 運行 TypeScript 文件
        server.process = spawn('ts-node', [
          path.join(this.baseDir, `${name}-server.ts`)
        ], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            MCP_WORKSPACE_ROOT: process.env.MCP_WORKSPACE_ROOT || '/root/.nanoclaw/workspace'
          }
        });

        server.process.on('error', (error: Error) => {
          console.error(`❌ ${name} MCP Server 錯誤:`, error);
        });

        console.log(`✅ ${name} MCP Server 已啟動 (PID: ${server.process.pid})`);
      } catch (error) {
        console.error(`❌ 啟動 ${name} MCP Server 失敗:`, error);
      }
    }
  }

  /**
   * 停止所有 MCP 服務器
   */
  async stopServers(): Promise<void> {
    for (const [name, server] of this.servers) {
      if (server.process) {
        server.process.kill();
        console.log(`⏹️  ${name} MCP Server 已停止`);
      }
    }
  }

  /**
   * 列出可用的 MCP 服務與能力
   */
  listCapabilities(): string {
    let list = '🔌 MCP 服務與能力\n\n';

    for (const [name, server] of this.servers) {
      const status = server.enabled ? '✅' : '❌';
      list += `${status} **${name}**\n`;
      list += `   能力：${server.capabilities.join(', ')}\n\n`;
    }

    return list;
  }

  /**
   * 獲取服務器狀態
   */
  getStatus(): string {
    let status = '🔌 MCP 服務器狀態\n\n';

    for (const [name, server] of this.servers) {
      const isRunning = server.process && !server.process.killed;
      const statusEmoji = isRunning ? '✅' : '❌';
      const pidInfo = isRunning ? `(PID: ${server.process.pid})` : '(未啟動)';
      
      status += `${statusEmoji} ${name} ${pidInfo}\n`;
    }

    return status;
  }

  /**
   * 重啟所有 MCP 服務器
   */
  async restart(): Promise<void> {
    console.log('🔄 重啟 MCP 服務器...');
    await this.stopServers();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await this.startServers();
  }
}

export default new MCPManager();
```

---

## Part 4：整合到主應用

### Step 5：更新 src/index.ts

```bash
nano src/index.ts
```

**添加 MCP 相關代碼片段：**

```typescript
import TelegramBot from 'node-telegram-bot-api';
import mcpManager from './mcp/mcp-manager';
import modelManager from './models/model-manager';

const tgBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// ========== MCP 管理命令 ==========

// 啟動 MCP
tgBot.onText(/\/mcp_start/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await mcpManager.startServers();
    await tgBot.sendMessage(chatId, '✅ MCP 服務器已啟動');
  } catch (error) {
    await tgBot.sendMessage(chatId, `❌ 啟動失敗：${error}`);
  }
});

// 停止 MCP
tgBot.onText(/\/mcp_stop/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await mcpManager.stopServers();
    await tgBot.sendMessage(chatId, '⏹️ MCP 服務器已停止');
  } catch (error) {
    await tgBot.sendMessage(chatId, `❌ 停止失敗：${error}`);
  }
});

// 查看 MCP 能力
tgBot.onText(/\/mcp_capabilities/, async (msg) => {
  const chatId = msg.chat.id;
  const capabilities = mcpManager.listCapabilities();
  await tgBot.sendMessage(chatId, capabilities);
});

// 查看 MCP 狀態
tgBot.onText(/\/mcp_status/, async (msg) => {
  const chatId = msg.chat.id;
  const status = mcpManager.getStatus();
  await tgBot.sendMessage(chatId, status);
});

// 重啟 MCP
tgBot.onText(/\/mcp_restart/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    await mcpManager.restart();
    await tgBot.sendMessage(chatId, '🔄 MCP 服務器已重啟');
  } catch (error) {
    await tgBot.sendMessage(chatId, `❌ 重啟失敗：${error}`);
  }
});

// ========== 啟動時初始化 MCP ==========

async function initialize(): Promise<void> {
  console.log('🚀 NanoClaw 啟動中...');
  
  // 啟動 MCP 服務器
  if (process.env.MCP_ENABLED !== 'false') {
    console.log('🔌 初始化 MCP...');
    await mcpManager.startServers();
  }
  
  console.log('✅ NanoClaw with MCP 已完全啟動');
}

initialize().catch(console.error);

// 優雅關閉
process.on('SIGINT', async () => {
  console.log('\n⏹️ 正在關閉 NanoClaw...');
  await mcpManager.stopServers();
  process.exit(0);
});
```

---

## Part 5：環境配置

### Step 6：更新 .env

```bash
nano .env
```

**添加 MCP 相關配置：**

```
# ========== MCP 配置 ==========
MCP_ENABLED=true
MCP_FILESYSTEM_ENABLED=true
MCP_SEARCH_ENABLED=true
MCP_WORKSPACE_ROOT=/root/.nanoclaw/workspace
MCP_ALLOWED_PATHS=/root/.nanoclaw/workspace

# 其他既有配置...
GROQ_API_KEY=...
TAVILY_API_KEY=...
TELEGRAM_BOT_TOKEN=...
```

---

## Part 6：使用指南

### Telegram 命令

```
/mcp_capabilities   - 查看所有 MCP 服務與能力
/mcp_status        - 查看 MCP 服務器狀態
/mcp_start         - 啟動所有 MCP 服務器
/mcp_stop          - 停止所有 MCP 服務器
/mcp_restart       - 重啟 MCP 服務器
```

### 使用示例

#### 搜尋工作流

```
用戶：「搜尋最新的 AI 趨勢」
     ↓
NanoClaw 調用 MCP Search Server
     ↓
MCP 執行 tavily_search 工具
     ↓
返回搜尋結果給用戶
```

#### 文件訪問工作流

```
用戶：「讀取我的工作區配置」
     ↓
NanoClaw 調用 MCP Filesystem Server
     ↓
MCP 列出工作區文件
     ↓
AI 讀取並分析文件內容
     ↓
返回分析結果給用戶
```

---

## Part 7：擴展 MCP Server

### 添加數據庫 Server

```bash
nano src/mcp/servers/database-server.ts
```

**框架代碼：**

```typescript
// 類似 filesystem-server.ts
// 可連接 SQLite、PostgreSQL 等數據庫
// 提供查詢、插入、更新等能力
```

### 添加郵件 Server

```bash
nano src/mcp/servers/email-server.ts
```

**框架代碼：**

```typescript
// 使用 nodemailer
// 提供發送、讀取郵件能力
```

---

## 完整檢查清單

- [ ] npm 依賴已安裝（@modelcontextprotocol/sdk）
- [ ] .env 配置完整（MCP_ENABLED=true）
- [ ] src/mcp/servers/filesystem-server.ts 已創建
- [ ] src/mcp/servers/search-server.ts 已創建
- [ ] src/mcp/mcp-manager.ts 已創建
- [ ] src/index.ts 已更新 MCP 命令
- [ ] npm start 成功運行
- [ ] Telegram 測試 /mcp_capabilities
- [ ] Telegram 測試 /mcp_status
- [ ] 驗證 MCP 服務器運行（檢查進程）

---

## MCP 架構圖

```
┌─────────────────────────────────────┐
│      NanoClaw Application           │
│   (MCP Host / Main Application)     │
└──────┬──────────────────────────────┘
       │
       ├─ /mcp_start, /mcp_stop ...
       └─ 管理 MCP 服務器進程
       
┌──────┴──────────────────────────────┐
│      MCP Server Layer               │
├────────────────────────────────────┤
│ Filesystem Server │ Search Server  │
│ - 文件讀取        │ - Tavily 搜尋  │
│ - 資源列表        │ - 網頁抓取     │
└────────────────────────────────────┘
       │
       └─ 可擴展：Database、Email 等

┌──────┴──────────────────────────────┐
│      外部資源                        │
├────────────────────────────────────┤
│ 本地文件  │ 網路  │ 數據庫  │ 郵件   │
└────────────────────────────────────┘
```

---

**MCP 現在已集成到 NanoClaw！** 🔌

NanoClaw 可以標準化地訪問多種外部資源和工具。
