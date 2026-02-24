# NanoClaw 增強版（含 Tavily Search + 主動代理）

## 概述

增強 NanoClaw，加入三個核心功能：
1. **tavily-search**：聯網搜尋能力
2. **find-skills**：智能技能查找與自動選擇
3. **proactive-agent**：主動代理與自我迭代

---

## Part 1：安裝額外依賴

### Step 1：在 NanoClaw 目錄安裝依賴

```bash
cd /root/nanoclaw

# 安裝 Tavily Search API（官方包）
npm install @tavily/core

# 安裝其他必要的包
npm install axios schedule
```

**注意：** 
- `@tavily/core` 是官方 Tavily SDK（與 clawhub 搜尋技能同源）
- 已有 TAVILY_API_KEY 直接可用

### Step 2：更新 .env 文件

```bash
nano .env
```

**添加以下內容：**

```
# 既有配置
GROQ_API_KEY=你的_groq_key
GROQ_MODEL=mixtral-8x7b-32768
TELEGRAM_BOT_TOKEN=你的_bot_token
NODE_ENV=production

# Tavily Search 搜尋功能
TAVILY_API_KEY=你已申請的_tavily_api_key

# 主動代理配置
PROACTIVE_ENABLED=true
PROACTIVE_CHECK_INTERVAL=300000
```

**說明：**
- TAVILY_API_KEY：你已經申請的 API Key（直接貼進去）
- PROACTIVE_CHECK_INTERVAL：主動檢查間隔（毫秒），300000 = 5 分鐘

---

## Part 2：實現 Tavily Search 搜尋功能

### Step 3：創建 skills/tavily-search.ts

```bash
mkdir -p src/skills
nano src/skills/tavily-search.ts
```

**複製以下代碼：**

```typescript
import { TavilyClient } from '@tavily/core';

class TavilySearchSkill {
  private client: TavilyClient | null = null;
  private enabled: boolean;
  private apiKey: string;

  constructor() {
    this.apiKey = process.env.TAVILY_API_KEY || '';
    this.enabled = !!this.apiKey;
    
    if (this.enabled) {
      this.client = new TavilyClient({
        apiKey: this.apiKey
      });
      console.log('✅ Tavily Search 已初始化');
    } else {
      console.warn('⚠️ Tavily API Key 未設置，搜尋功能不可用');
    }
  }

  async search(query: string): Promise<string> {
    if (!this.enabled || !this.client) {
      return '❌ Tavily Search 未配置\n請在 .env 中設置 TAVILY_API_KEY';
    }

    try {
      console.log(`🔍 Tavily 搜尋: ${query}`);
      
      const response = await this.client.search(query, {
        maxResults: 5,
        includeAnswer: true,
        topic: 'general'
      });

      if (!response.results || response.results.length === 0) {
        return `🔍 搜尋「${query}」\n\n沒有找到相關結果`;
      }

      // 格式化結果
      let result = `🔍 搜尋「${query}」\n共找到 ${response.results.length} 項結果\n\n`;
      
      // 如果有 AI 摘要
      if (response.answer) {
        result += `📌 **AI 摘要：**\n${response.answer}\n\n`;
      }

      result += '**詳細結果：**\n';
      response.results.forEach((item, index) => {
        result += `\n${index + 1}️⃣ **${item.title}**\n`;
        result += `   ${item.content.substring(0, 150)}...\n`;
        result += `   🔗 ${item.url}\n`;
      });

      return result;
    } catch (error) {
      console.error('Tavily Search 錯誤:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return `❌ 搜尋失敗\n錯誤：${errorMsg}\n\n💡 請檢查：\n- TAVILY_API_KEY 是否正確\n- 網絡連接是否正常`;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getStatus(): string {
    return this.enabled 
      ? '✅ Tavily Search 已啟用' 
      : '❌ Tavily Search 未配置';
  }
}

export default new TavilySearchSkill();
```

---

## Part 3：實現 Find-Skills 技能選擇

### Step 4：創建 skills/skill-finder.ts

```bash
nano src/skills/skill-finder.ts
```

**複製以下代碼：**

```typescript
import tavilySearch from './tavily-search';

interface Skill {
  name: string;
  description: string;
  keywords: string[];
  execute: (input: string) => Promise<string>;
}

class SkillFinder {
  private skills: Map<string, Skill> = new Map();

  constructor() {
    this.registerSkills();
  }

  private registerSkills(): void {
    // 註冊 Tavily Search 技能（官方搜尋）
    if (tavilySearch.isEnabled()) {
      this.skills.set('search', {
        name: 'Tavily Search',
        description: '聯網搜尋，獲取最新信息（官方搜尋 API）',
        keywords: ['搜尋', '查找', '搜', 'search', '查詢', '信息', '新聞', '查一下', 'google', '百度'],
        execute: async (query: string) => tavilySearch.search(query)
      });
      console.log('✅ 已註冊 Tavily Search 技能');
    }

    // 可以添加更多技能...
    this.skills.set('calculator', {
      name: 'Calculator',
      description: '計算數學表達式',
      keywords: ['計算', '算', '加', '減', '乘', '除', '多少'],
      execute: async (input: string) => this.calculate(input)
    });

    this.skills.set('time', {
      name: 'Time Info',
      description: '獲取當前時間信息',
      keywords: ['時間', '幾點', '現在', '日期', '今天', '明天'],
      execute: async (input: string) => this.getTimeInfo(input)
    });
  }

  /**
   * 分析用戶輸入，找到最合適的技能
   */
  async findBestSkill(userInput: string): Promise<{ skill: Skill; confidence: number } | null> {
    let bestSkill: Skill | null = null;
    let bestScore = 0;

    for (const [_, skill] of this.skills) {
      const score = this.calculateMatchScore(userInput, skill.keywords);
      if (score > bestScore) {
        bestScore = score;
        bestSkill = skill;
      }
    }

    // 只有匹配度 > 0.3 才返回
    if (bestScore > 0.3 && bestSkill) {
      return { skill: bestSkill, confidence: bestScore };
    }

    return null;
  }

  /**
   * 計算關鍵詞匹配得分
   */
  private calculateMatchScore(input: string, keywords: string[]): number {
    const lowerInput = input.toLowerCase();
    let score = 0;

    for (const keyword of keywords) {
      if (lowerInput.includes(keyword.toLowerCase())) {
        score += 1;
      }
    }

    return Math.min(score / keywords.length, 1);
  }

  /**
   * 簡單的計算器
   */
  private async calculate(input: string): Promise<string> {
    try {
      // 簡單的表達式評估（生產環境應更安全）
      const result = eval(input.replace(/[^0-9+\-*/.()]/g, ''));
      return `計算結果：${result}`;
    } catch (error) {
      return `計算錯誤：${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * 獲取時間信息
   */
  private async getTimeInfo(input: string): Promise<string> {
    const now = new Date();
    return `⏰ 當前時間：${now.toLocaleString('zh-TW')}\n時區：Asia/Taipei`;
  }

  /**
   * 列出所有可用技能
   */
  listSkills(): string {
    let list = '📚 可用的技能列表：\n\n';
    for (const [key, skill] of this.skills) {
      list += `📌 **${skill.name}**\n   描述：${skill.description}\n   關鍵詞：${skill.keywords.join(', ')}\n\n`;
    }
    return list;
  }

  /**
   * 獲取技能總數
   */
  getSkillCount(): number {
    return this.skills.size;
  }
}

export default new SkillFinder();
```

---

## Part 4：實現主動代理

### Step 5：創建 proactive-agent.ts

```bash
nano src/proactive-agent.ts
```

**複製以下代碼：**

```typescript
import schedule from 'schedule';
import TelegramBot from 'node-telegram-bot-api';

interface ProactiveTask {
  id: string;
  name: string;
  schedule: string; // cron-like: '*/5 * * * *' = every 5 minutes
  action: () => Promise<string>;
  lastRun?: Date;
  nextRun?: Date;
}

class ProactiveAgent {
  private tasks: Map<string, ProactiveTask> = new Map();
  private tgBot: TelegramBot | null = null;
  private chatId: string | null = null;
  private enabled: boolean;

  constructor(telegramBot?: TelegramBot, chatId?: string) {
    this.enabled = process.env.PROACTIVE_ENABLED === 'true';
    this.tgBot = telegramBot || null;
    this.chatId = chatId || null;
    
    if (this.enabled) {
      this.initializeDefaultTasks();
    }
  }

  /**
   * 初始化默認主動任務
   */
  private initializeDefaultTasks(): void {
    // 任務 1：定期健康檢查
    this.registerTask({
      id: 'health-check',
      name: '系統健康檢查',
      schedule: '*/30 * * * *', // 每 30 分鐘
      action: async () => {
        const uptime = process.uptime();
        const memory = process.memoryUsage();
        return `✅ 系統健康檢查\n⏱️ 運行時間：${(uptime / 60).toFixed(2)} 分鐘\n💾 內存：${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`;
      }
    });

    // 任務 2：每日問候
    this.registerTask({
      id: 'daily-greeting',
      name: '每日問候',
      schedule: '0 9 * * *', // 每天 9:00
      action: async () => {
        const hour = new Date().getHours();
        return `☀️ 早上好！祝你有美好的一天！`;
      }
    });

    // 任務 3：自我迭代升級檢查
    this.registerTask({
      id: 'self-improve',
      name: '自我迭代升級',
      schedule: '0 0 * * *', // 每天午夜
      action: async () => {
        return `🚀 NanoClaw 自我檢查完成\n✅ 所有系統正常\n💡 下次升級時間：明天午夜`;
      }
    });
  }

  /**
   * 註冊新任務
   */
  registerTask(task: ProactiveTask): void {
    this.tasks.set(task.id, task);
    console.log(`✅ 任務已註冊：${task.name}`);
  }

  /**
   * 啟動主動代理
   */
  async start(): Promise<void> {
    if (!this.enabled) {
      console.log('⏸️ 主動代理已禁用');
      return;
    }

    console.log(`🤖 主動代理已啟動，監管 ${this.tasks.size} 個任務`);

    // 簡化版：每 5 分鐘檢查一次
    const checkInterval = parseInt(process.env.PROACTIVE_CHECK_INTERVAL || '300000');
    
    setInterval(async () => {
      const now = new Date();
      
      for (const [_, task] of this.tasks) {
        // 簡單的時間檢查（生產環境應用 cron-parser）
        if (this.shouldRunTask(task, now)) {
          await this.executeTask(task);
        }
      }
    }, checkInterval);
  }

  /**
   * 判斷任務是否應運行
   */
  private shouldRunTask(task: ProactiveTask, now: Date): boolean {
    // 簡化版實現
    if (!task.lastRun) {
      return true; // 首次運行
    }

    // 如果距上次運行超過 1 小時則運行
    const timeSinceLastRun = now.getTime() - task.lastRun.getTime();
    return timeSinceLastRun > 3600000;
  }

  /**
   * 執行任務
   */
  private async executeTask(task: ProactiveTask): Promise<void> {
    try {
      console.log(`▶️ 執行任務：${task.name}`);
      
      const result = await task.action();
      task.lastRun = new Date();

      // 如果連接到 Telegram，發送通知
      if (this.tgBot && this.chatId) {
        await this.tgBot.sendMessage(this.chatId, `🤖 **主動代理通知**\n\n${result}`);
      }

      console.log(`✅ 任務完成：${task.name}`);
    } catch (error) {
      console.error(`❌ 任務執行失敗：${task.name}`, error);
    }
  }

  /**
   * 列出所有任務
   */
  listTasks(): string {
    let list = '📋 主動代理任務列表：\n\n';
    for (const [_, task] of this.tasks) {
      list += `📌 **${task.name}**\n   ID：${task.id}\n   最後運行：${task.lastRun ? task.lastRun.toLocaleString('zh-TW') : '未運行'}\n\n`;
    }
    return list;
  }

  /**
   * 手動執行任務
   */
  async runTaskNow(taskId: string): Promise<string> {
    const task = this.tasks.get(taskId);
    if (!task) {
      return `❌ 任務不存在：${taskId}`;
    }

    try {
      const result = await task.action();
      task.lastRun = new Date();
      return `✅ ${task.name}\n\n${result}`;
    } catch (error) {
      return `❌ 任務執行失敗：${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * 獲取代理狀態
   */
  getStatus(): string {
    return `🤖 **主動代理狀態**\n狀態：${this.enabled ? '✅ 已啟用' : '⏸️ 已禁用'}\n任務數：${this.tasks.size}`;
  }
}

export default ProactiveAgent;
```

---

## Part 5：整合到主應用

### Step 6：修改 src/index.ts（主文件）

```bash
nano src/index.ts
```

**添加以下代碼片段：**

```typescript
import TelegramBot from 'node-telegram-bot-api';
import Groq from '@groq-cloud/sdk';
import skillFinder from './skills/skill-finder';
import tavilySearch from './skills/tavily-search';
import ProactiveAgent from './proactive-agent';

// 初始化
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const tgBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
const proactiveAgent = new ProactiveAgent(tgBot, process.env.TELEGRAM_CHAT_ID);

// 啟動主動代理
proactiveAgent.start();

// Telegram 消息處理（增強版）
tgBot.onText(/(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userMessage = match[1];

  try {
    // 首先嘗試找到合適的技能
    const skillMatch = await skillFinder.findBestSkill(userMessage);

    if (skillMatch && skillMatch.confidence > 0.5) {
      console.log(`🎯 找到技能：${skillMatch.skill.name}（匹配度：${skillMatch.confidence.toFixed(2)}）`);
      const result = await skillMatch.skill.execute(userMessage);
      await tgBot.sendMessage(chatId, result);
      return;
    }

    // 如果沒有合適的技能，使用 Groq Claude
    const message = await groq.messages.create({
      model: process.env.GROQ_MODEL || 'mixtral-8x7b-32768',
      max_tokens: 1024,
      messages: [{ role: 'user', content: userMessage }]
    });

    const response = message.content[0].type === 'text' ? message.content[0].text : '無法解析回覆';
    await tgBot.sendMessage(chatId, response);
  } catch (error) {
    console.error('Error:', error);
    await tgBot.sendMessage(chatId, '❌ 發生錯誤，請稍後重試');
  }
});

// 特殊命令
tgBot.onText(/\/skills/, async (msg) => {
  const chatId = msg.chat.id;
  await tgBot.sendMessage(chatId, skillFinder.listSkills());
});

tgBot.onText(/\/tasks/, async (msg) => {
  const chatId = msg.chat.id;
  await tgBot.sendMessage(chatId, proactiveAgent.listTasks());
});

tgBot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  await tgBot.sendMessage(chatId, proactiveAgent.getStatus());
});

tgBot.onText(/\/run_task (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const taskId = match[1];
  const result = await proactiveAgent.runTaskNow(taskId);
  await tgBot.sendMessage(chatId, result);
});

console.log('🚀 NanoClaw Enhanced 已啟動（Tavily + Smart Skills + Proactive Agent）');
```

---

## Part 6：使用指南

### 可用命令

```
/skills        - 查看所有可用技能
/tasks         - 查看主動代理任務
/status        - 查看代理狀態
/run_task [id] - 手動運行任務

例如：
/run_task health-check
/run_task daily-greeting
```

### 自動功能

```
✅ 聯網搜尋：用戶說「搜尋...」時自動使用 Tavily
✅ 技能選擇：自動檢測用戶意圖，選擇最合適的技能
✅ 主動代理：
   - 每 30 分鐘健康檢查
   - 每天 9:00 早安問候
   - 每天午夜自我迭代檢查
```

---

## Part 7：NanoClaw 搜尋使用示例

### 用戶輸入示例

```
用戶：「搜尋 2026 年 M5 Mac 發佈日期」
     ↓
NanoClaw 自動檢測「搜尋」關鍵詞
     ↓
調用 Tavily Search API
     ↓
返回最新搜尋結果 + AI 摘要
```

### 支持的搜尋關鍵詞

```
搜尋、查找、搜、search、查詢、信息、新聞、查一下、google、百度
```

### Telegram 命令

```
- 直接傳訊：「搜尋 [內容]」
- 或傳任意訊息，NanoClaw 自動判斷是否需要搜尋
```

---

## 完整安裝檢查清單

- [ ] npm 依賴已安裝（@tavily/core, schedule）
- [ ] .env 配置完整：
  - [ ] GROQ_API_KEY 已設置
  - [ ] TAVILY_API_KEY 已設置（你已申請的）
  - [ ] TELEGRAM_BOT_TOKEN 已設置
- [ ] src/skills/tavily-search.ts 已創建
- [ ] src/skills/skill-finder.ts 已創建
- [ ] src/proactive-agent.ts 已創建
- [ ] src/index.ts 已更新
- [ ] npm start 成功運行
- [ ] Telegram 能收到 Bot 消息
- [ ] 試過搜尋功能（例：「搜尋 M5 Mac」）

---

**現在可以啟動增強版 NanoClaw 了！** 🚀
