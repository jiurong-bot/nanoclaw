# NanoClaw AI 模型管理系統

## 概述

為 NanoClaw 添加靈活的 AI 模型切換能力：
- ✅ 支持多個 AI 提供商（Groq、OpenAI、Anthropic）
- ✅ 運行時動態切換模型
- ✅ 自動性能評測與選擇最優模型
- ✅ Telegram 命令控制
- ✅ 模型使用記錄與統計

---

## Part 1：配置多個 AI 提供商

### Step 1：更新 .env 文件

```bash
nano .env
```

**配置內容：**

```
# ========== 主動 AI 配置 ==========
ACTIVE_AI_PROVIDER=groq
ACTIVE_AI_MODEL=mixtral-8x7b-32768

# ========== Groq 配置 ==========
GROQ_API_KEY=你的_groq_api_key
GROQ_MODELS=mixtral-8x7b-32768,llama-3.3-70b-versatile,llama-2-70b-chat

# ========== OpenAI 配置（可選） ==========
OPENAI_API_KEY=你的_openai_api_key
OPENAI_MODELS=gpt-4,gpt-4-turbo,gpt-3.5-turbo

# ========== Anthropic 配置（可選） ==========
ANTHROPIC_API_KEY=你的_anthropic_api_key
ANTHROPIC_MODELS=claude-3-opus,claude-3-sonnet,claude-3-haiku

# ========== 模型評分與自適應 ==========
MODEL_AUTO_SELECT=true
MODEL_PERFORMANCE_THRESHOLD=0.7
MODEL_FALLBACK_ENABLED=true

# ========== 其他配置 ==========
TAVILY_API_KEY=你的_tavily_key
TELEGRAM_BOT_TOKEN=你的_bot_token
NODE_ENV=production
```

**說明：**
- `ACTIVE_AI_PROVIDER`：當前主要使用的提供商
- `ACTIVE_AI_MODEL`：當前主要使用的模型
- `MODEL_AUTO_SELECT`：是否自動選擇最優模型
- `MODEL_FALLBACK_ENABLED`：模型失敗時自動切換備選

---

## Part 2：安裝依賴

### Step 2：安裝 AI SDK

```bash
cd /root/nanoclaw

# 安裝所有 AI 提供商 SDK
npm install @groq-cloud/sdk openai @anthropic-ai/sdk

# 已有依賴
npm install @tavily/core schedule node-telegram-bot-api
```

---

## Part 3：實現模型管理器

### Step 3：創建 src/models/model-manager.ts

```bash
mkdir -p src/models
nano src/models/model-manager.ts
```

**複製以下代碼：**

```typescript
import Groq from '@groq-cloud/sdk';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

interface AIProvider {
  name: string;
  client: any;
  models: string[];
  apiKey: string;
  enabled: boolean;
}

interface ModelStats {
  name: string;
  provider: string;
  successCount: number;
  failureCount: number;
  avgResponseTime: number;
  score: number;
}

class ModelManager {
  private currentProvider: string;
  private currentModel: string;
  private providers: Map<string, AIProvider> = new Map();
  private modelStats: Map<string, ModelStats> = new Map();
  private autoSelect: boolean;
  private fallbackEnabled: boolean;

  constructor() {
    this.currentProvider = process.env.ACTIVE_AI_PROVIDER || 'groq';
    this.currentModel = process.env.ACTIVE_AI_MODEL || 'mixtral-8x7b-32768';
    this.autoSelect = process.env.MODEL_AUTO_SELECT === 'true';
    this.fallbackEnabled = process.env.MODEL_FALLBACK_ENABLED === 'true';

    this.initializeProviders();
    console.log(`🤖 模型管理器已初始化\n當前模型：${this.currentProvider}/${this.currentModel}`);
  }

  /**
   * 初始化所有 AI 提供商
   */
  private initializeProviders(): void {
    // Groq
    if (process.env.GROQ_API_KEY) {
      this.providers.set('groq', {
        name: 'Groq',
        client: new Groq({ apiKey: process.env.GROQ_API_KEY }),
        models: (process.env.GROQ_MODELS || 'mixtral-8x7b-32768').split(','),
        apiKey: process.env.GROQ_API_KEY,
        enabled: true
      });
      console.log('✅ Groq 已初始化');
    }

    // OpenAI
    if (process.env.OPENAI_API_KEY) {
      this.providers.set('openai', {
        name: 'OpenAI',
        client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
        models: (process.env.OPENAI_MODELS || 'gpt-4').split(','),
        apiKey: process.env.OPENAI_API_KEY,
        enabled: true
      });
      console.log('✅ OpenAI 已初始化');
    }

    // Anthropic
    if (process.env.ANTHROPIC_API_KEY) {
      this.providers.set('anthropic', {
        name: 'Anthropic',
        client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
        models: (process.env.ANTHROPIC_MODELS || 'claude-3-sonnet').split(','),
        apiKey: process.env.ANTHROPIC_API_KEY,
        enabled: true
      });
      console.log('✅ Anthropic 已初始化');
    }
  }

  /**
   * 獲取 AI 回覆（支持自動降級）
   */
  async generateResponse(prompt: string, retryCount = 0): Promise<string> {
    try {
      const startTime = Date.now();
      const response = await this.callModel(prompt);
      const responseTime = Date.now() - startTime;

      // 記錄統計
      this.recordSuccess(this.currentProvider, this.currentModel, responseTime);

      return response;
    } catch (error) {
      console.error(`❌ ${this.currentProvider}/${this.currentModel} 失敗:`, error);
      this.recordFailure(this.currentProvider, this.currentModel);

      // 嘗試降級到備選模型
      if (this.fallbackEnabled && retryCount < 2) {
        const fallback = this.findFallbackModel();
        if (fallback) {
          console.log(`🔄 自動降級到：${fallback.provider}/${fallback.model}`);
          this.setActiveModel(fallback.provider, fallback.model);
          return this.generateResponse(prompt, retryCount + 1);
        }
      }

      throw error;
    }
  }

  /**
   * 調用當前模型
   */
  private async callModel(prompt: string): Promise<string> {
    const provider = this.providers.get(this.currentProvider);
    if (!provider) {
      throw new Error(`提供商不存在：${this.currentProvider}`);
    }

    switch (this.currentProvider) {
      case 'groq':
        return this.callGroq(provider, prompt);
      case 'openai':
        return this.callOpenAI(provider, prompt);
      case 'anthropic':
        return this.callAnthropic(provider, prompt);
      default:
        throw new Error(`未知提供商：${this.currentProvider}`);
    }
  }

  /**
   * Groq 調用
   */
  private async callGroq(provider: AIProvider, prompt: string): Promise<string> {
    const message = await provider.client.messages.create({
      model: this.currentModel,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });
    return message.content[0].type === 'text' ? message.content[0].text : '';
  }

  /**
   * OpenAI 調用
   */
  private async callOpenAI(provider: AIProvider, prompt: string): Promise<string> {
    const message = await provider.client.chat.completions.create({
      model: this.currentModel,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });
    return message.choices[0].message.content || '';
  }

  /**
   * Anthropic 調用
   */
  private async callAnthropic(provider: AIProvider, prompt: string): Promise<string> {
    const message = await provider.client.messages.create({
      model: this.currentModel,
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }]
    });
    return message.content[0].type === 'text' ? message.content[0].text : '';
  }

  /**
   * 設置活躍模型
   */
  setActiveModel(provider: string, model: string): boolean {
    const p = this.providers.get(provider);
    if (!p || !p.models.includes(model)) {
      return false;
    }

    this.currentProvider = provider;
    this.currentModel = model;
    console.log(`✅ 已切換至：${provider}/${model}`);
    return true;
  }

  /**
   * 自動選擇最優模型
   */
  async selectBestModel(): Promise<{ provider: string; model: string }> {
    if (!this.autoSelect) {
      return { provider: this.currentProvider, model: this.currentModel };
    }

    let bestScore = 0;
    let bestChoice = { provider: this.currentProvider, model: this.currentModel };

    for (const [providerName, provider] of this.providers) {
      if (!provider.enabled) continue;

      for (const model of provider.models) {
        const stats = this.modelStats.get(`${providerName}/${model}`);
        const score = stats ? stats.score : 0.5; // 新模型默認 0.5 score

        if (score > bestScore) {
          bestScore = score;
          bestChoice = { provider: providerName, model };
        }
      }
    }

    if (bestChoice.provider !== this.currentProvider || bestChoice.model !== this.currentModel) {
      this.setActiveModel(bestChoice.provider, bestChoice.model);
    }

    return bestChoice;
  }

  /**
   * 記錄成功
   */
  private recordSuccess(provider: string, model: string, responseTime: number): void {
    const key = `${provider}/${model}`;
    const stats = this.modelStats.get(key) || {
      name: model,
      provider,
      successCount: 0,
      failureCount: 0,
      avgResponseTime: 0,
      score: 0.5
    };

    stats.successCount++;
    stats.avgResponseTime = (stats.avgResponseTime + responseTime) / 2;
    stats.score = Math.min(
      (stats.successCount / (stats.successCount + stats.failureCount + 1)) * 
      (1 - Math.min(stats.avgResponseTime / 10000, 0.3)),
      1
    );

    this.modelStats.set(key, stats);
  }

  /**
   * 記錄失敗
   */
  private recordFailure(provider: string, model: string): void {
    const key = `${provider}/${model}`;
    const stats = this.modelStats.get(key) || {
      name: model,
      provider,
      successCount: 0,
      failureCount: 0,
      avgResponseTime: 0,
      score: 0.5
    };

    stats.failureCount++;
    stats.score = Math.max(
      (stats.successCount / (stats.successCount + stats.failureCount + 1)) * 0.8,
      0.1
    );

    this.modelStats.set(key, stats);
  }

  /**
   * 尋找備選模型
   */
  private findFallbackModel(): { provider: string; model: string } | null {
    let bestStats: { provider: string; model: string; score: number } | null = null;

    for (const [key, stats] of this.modelStats) {
      if (stats.score > (bestStats?.score || 0) && 
          `${stats.provider}/${stats.name}` !== `${this.currentProvider}/${this.currentModel}`) {
        bestStats = {
          provider: stats.provider,
          model: stats.name,
          score: stats.score
        };
      }
    }

    if (bestStats && bestStats.score >= 0.5) {
      return { provider: bestStats.provider, model: bestStats.model };
    }

    // 如果沒有達標的備選，就選第一個可用提供商
    for (const [providerName, provider] of this.providers) {
      if (provider.enabled && provider.models.length > 0 && 
          providerName !== this.currentProvider) {
        return { provider: providerName, model: provider.models[0] };
      }
    }

    return null;
  }

  /**
   * 列出所有可用模型
   */
  listAvailableModels(): string {
    let list = '🤖 可用 AI 模型列表：\n\n';

    for (const [providerName, provider] of this.providers) {
      if (!provider.enabled) continue;

      list += `**${provider.name}**\n`;
      for (const model of provider.models) {
        const key = `${providerName}/${model}`;
        const stats = this.modelStats.get(key);
        const marker = this.currentProvider === providerName && this.currentModel === model ? '✨' : '  ';
        list += `${marker} ${model}`;

        if (stats) {
          list += ` (成功率: ${((stats.successCount / (stats.successCount + stats.failureCount + 1)) * 100).toFixed(0)}%)`;
        }
        list += '\n';
      }
      list += '\n';
    }

    return list;
  }

  /**
   * 獲取模型統計
   */
  getStats(): string {
    let stats = `📊 AI 模型統計\n\n`;
    stats += `當前模型：**${this.currentProvider}/${this.currentModel}**\n\n`;
    stats += `**詳細統計：**\n`;

    for (const [key, stat] of this.modelStats) {
      const successRate = ((stat.successCount / (stat.successCount + stat.failureCount + 1)) * 100).toFixed(0);
      stats += `${key}\n  成功：${stat.successCount} | 失敗：${stat.failureCount} | 成功率：${successRate}% | 評分：${stat.score.toFixed(2)}\n`;
    }

    return stats;
  }

  /**
   * 獲取當前活躍模型info
   */
  getCurrentModel(): { provider: string; model: string } {
    return { provider: this.currentProvider, model: this.currentModel };
  }
}

export default new ModelManager();
```

---

## Part 4：整合到主應用

### Step 4：更新 src/index.ts

```bash
nano src/index.ts
```

**添加模型管理代碼片段：**

```typescript
import TelegramBot from 'node-telegram-bot-api';
import modelManager from './models/model-manager';
import skillFinder from './skills/skill-finder';

const tgBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// ========== 模型選擇命令 ==========

// 列出所有模型
tgBot.onText(/\/models/, async (msg) => {
  const chatId = msg.chat.id;
  const list = modelManager.listAvailableModels();
  await tgBot.sendMessage(chatId, list);
});

// 切換到指定模型
tgBot.onText(/\/switch_model (.+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const provider = match[1];
  const model = match[2];

  const success = modelManager.setActiveModel(provider, model);
  const message = success
    ? `✅ 已切換至 ${provider}/${model}`
    : `❌ 模型不存在或提供商未啟用\n請用 /models 查看可用模型`;
  
  await tgBot.sendMessage(chatId, message);
});

// 自動選擇最優模型
tgBot.onText(/\/auto_select/, async (msg) => {
  const chatId = msg.chat.id;
  const best = await modelManager.selectBestModel();
  const message = `✅ 已自動選擇最優模型\n${best.provider}/${best.model}`;
  await tgBot.sendMessage(chatId, message);
});

// 查看模型統計
tgBot.onText(/\/model_stats/, async (msg) => {
  const chatId = msg.chat.id;
  const stats = modelManager.getStats();
  await tgBot.sendMessage(chatId, stats);
});

// ========== 主聊天邏輯（使用模型管理器） ==========

tgBot.onText(/(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userMessage = match[1];

  try {
    // 首先嘗試找技能
    const skillMatch = await skillFinder.findBestSkill(userMessage);
    if (skillMatch && skillMatch.confidence > 0.5) {
      const result = await skillMatch.skill.execute(userMessage);
      await tgBot.sendMessage(chatId, result);
      return;
    }

    // 使用 AI 模型回覆
    const response = await modelManager.generateResponse(userMessage);
    await tgBot.sendMessage(chatId, response);
  } catch (error) {
    console.error('Error:', error);
    await tgBot.sendMessage(chatId, '❌ 發生錯誤，請稍後重試');
  }
});

console.log('🚀 NanoClaw with Model Manager 已啟動');
```

---

## Part 5：Telegram 命令指南

### 可用命令

```
/models                          - 列出所有可用 AI 模型
/switch_model [provider] [model] - 切換到指定模型
  例：/switch_model groq mixtral-8x7b-32768
      /switch_model openai gpt-4
      /switch_model anthropic claude-3-opus

/auto_select                     - 自動選擇性能最優模型
/model_stats                     - 查看各模型性能統計
```

### 使用示例

```
用戶：/models
Bot回覆：
🤖 可用 AI 模型列表：

**Groq**
✨ mixtral-8x7b-32768 (成功率: 100%)
  llama-3.3-70b-versatile

**OpenAI**
  gpt-4

---

用戶：/switch_model openai gpt-4
Bot回覆：✅ 已切換至 openai/gpt-4

---

用戶：/auto_select
Bot回覆：✅ 已自動選擇最優模型
gpt-4/openai

---

用戶：/model_stats
Bot回覆：
📊 AI 模型統計
當前模型：**groq/mixtral-8x7b-32768**

詳細統計：
groq/mixtral-8x7b-32768
  成功：95 | 失敗：2 | 成功率：98% | 評分：0.96
openai/gpt-4
  成功：5 | 失敗：0 | 成功率：100% | 評分：0.92
```

---

## 自動模型切換邏輯

### 工作流程

```
用戶消息
   ↓
嘗試當前模型
   ├─ 成功 → 返回回覆，記錄成功
   └─ 失敗 → 自動降級
       ↓
   查找備選模型（性能評分最高）
       ↓
   自動切換並重試
       ↓
   如果還失敗 → 返回錯誤信息
```

### 模型評分計算

```
Score = (Success Rate) × (1 - Response Time Factor) × (Reliability Penalty)

例如：
- 成功率 98% + 平均響應時間 200ms + 可靠 = 0.96 分
- 成功率 100% + 平均響應時間 5000ms = 0.70 分
```

---

## 完整檢查清單

- [ ] npm 依賴已安裝（@groq-cloud/sdk, openai, @anthropic-ai/sdk）
- [ ] .env 配置完整（所有 API Key）
- [ ] src/models/model-manager.ts 已創建
- [ ] src/index.ts 已更新模型管理代碼
- [ ] npm start 成功運行
- [ ] Telegram 測試 /models 命令
- [ ] Telegram 測試 /switch_model 命令
- [ ] Telegram 測試 /auto_select 命令
- [ ] Telegram 測試 /model_stats 命令

---

## 成本管理建議

```
由於支持多個付費 API，建議設置優先級：

1️⃣ Groq（推薦，免費）
2️⃣ 備選付費服務（OpenAI/Anthropic）

配置優先級：
ACTIVE_AI_PROVIDER=groq      // 優先用免費的
MODEL_FALLBACK_ENABLED=true  // 失敗時才用付費的
```

---

**現在可以靈活切換 AI 模型了！** 🤖
