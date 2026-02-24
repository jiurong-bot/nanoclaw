# NanoClaw Token 监控与自动切换系统
## 「智能 API 成本管理」

---

## 核心设计

```
目标：
✅ 实时监控每个 API 的 token 使用
✅ 自动计算当前成本
✅ 触发条件自动切换模型
✅ 防止超支和限流
✅ 详细的成本统计和历史记录

流程：
调用 AI 模型 → 记录 token 数 → 更新成本 → 检查阈值 → 如需要则切换模型
```

---

## Part 1：Token 监控系统设计

### 目录结构

```
src/
├─ models/
│  ├─ model-manager.ts        (已有，需增强)
│  ├─ token-monitor.ts        (新增 - 监控系统)
│  ├─ cost-calculator.ts      (新增 - 成本计算)
│  └─ auto-switcher.ts        (新增 - 自动切换)
│
└─ data/
   └─ token-usage.db          (SQLite 数据库)
```

### 数据库设计

```sql
-- Token 使用记录表
CREATE TABLE token_usage (
  id INTEGER PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  model_provider TEXT,           -- groq, openai, anthropic
  model_name TEXT,               -- gemma-2-9b-it, gpt-4o, claude-3, etc
  input_tokens INTEGER,          -- 输入 token 数
  output_tokens INTEGER,         -- 输出 token 数
  total_tokens INTEGER,          -- 总 token 数
  cost REAL,                      -- 本次调用成本
  duration_ms INTEGER,           -- 调用耗时
  success BOOLEAN,               -- 是否成功
  error_message TEXT,            -- 错误信息
  user_id TEXT DEFAULT 'default'
);

-- 模型配置和限额表
CREATE TABLE model_quotas (
  id INTEGER PRIMARY KEY,
  model_provider TEXT UNIQUE,    -- groq, openai, anthropic
  daily_limit REAL,              -- 日限额（元）
  monthly_limit REAL,            -- 月限额（元）
  rps_limit INTEGER,             -- 每秒请求数限制
  rpm_limit INTEGER,             -- 每分钟请求数限制
  auto_switch BOOLEAN,           -- 达到限额后是否自动切换
  priority INTEGER,              -- 优先级（1=最高）
  enabled BOOLEAN
);

-- 成本汇总表
CREATE TABLE cost_summary (
  id INTEGER PRIMARY KEY,
  date DATE,
  model_provider TEXT,
  total_cost REAL,
  request_count INTEGER,
  avg_latency_ms REAL,
  success_rate REAL
);

-- 切换历史记录
CREATE TABLE switch_history (
  id INTEGER PRIMARY KEY,
  timestamp DATETIME,
  from_model TEXT,
  to_model TEXT,
  reason TEXT,                   -- why_switched: daily_limit, monthly_limit, rate_limit, user_request
  details TEXT
);
```

---

## Part 2：Token 监控核心模块

### token-monitor.ts

```typescript
import Database from 'better-sqlite3';
import { EventEmitter } from 'events';

interface TokenUsage {
  modelProvider: string;
  modelName: string;
  inputTokens: number;
  outputTokens: number;
  duration: number;
  cost: number;
  success: boolean;
  error?: string;
}

interface DailyStats {
  date: string;
  totalCost: number;
  requestCount: number;
  byModel: Map<string, { cost: number; count: number }>;
}

interface MonthlyStats {
  month: string;
  totalCost: number;
  requestCount: number;
  dailyStats: DailyStats[];
}

class TokenMonitor extends EventEmitter {
  private db: Database.Database;
  private dailyCache: Map<string, DailyStats> = new Map();
  private monthlyCache: Map<string, MonthlyStats> = new Map();

  constructor(dbPath: string = './nanoclaw.db') {
    super();
    this.db = new Database(dbPath);
    this.initializeDatabase();
  }

  /**
   * 初始化数据库表
   */
  private initializeDatabase(): void {
    // token_usage 表已存在则跳过
    const tableExists = this.db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='token_usage'"
    ).all().length > 0;

    if (!tableExists) {
      this.db.exec(`
        CREATE TABLE token_usage (
          id INTEGER PRIMARY KEY,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          model_provider TEXT NOT NULL,
          model_name TEXT NOT NULL,
          input_tokens INTEGER,
          output_tokens INTEGER,
          total_tokens INTEGER,
          cost REAL,
          duration_ms INTEGER,
          success BOOLEAN,
          error_message TEXT,
          user_id TEXT DEFAULT 'default'
        );

        CREATE INDEX idx_timestamp ON token_usage(timestamp);
        CREATE INDEX idx_provider ON token_usage(model_provider);
        CREATE INDEX idx_date ON token_usage(DATE(timestamp));
      `);
    }
  }

  /**
   * 记录一次 API 调用的 token 使用
   */
  async recordUsage(usage: TokenUsage): Promise<void> {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO token_usage (
          model_provider,
          model_name,
          input_tokens,
          output_tokens,
          total_tokens,
          cost,
          duration_ms,
          success,
          error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        usage.modelProvider,
        usage.modelName,
        usage.inputTokens,
        usage.outputTokens,
        usage.inputTokens + usage.outputTokens,
        usage.cost,
        usage.duration,
        usage.success,
        usage.error || null
      );

      // 更新缓存
      this.updateDailyCache(usage);

      // 发出事件
      this.emit('usage_recorded', usage);
    } catch (error) {
      console.error('❌ 记录 token 使用失败:', error);
    }
  }

  /**
   * 更新日缓存
   */
  private updateDailyCache(usage: TokenUsage): void {
    const today = new Date().toISOString().split('T')[0];
    
    if (!this.dailyCache.has(today)) {
      this.dailyCache.set(today, {
        date: today,
        totalCost: 0,
        requestCount: 0,
        byModel: new Map()
      });
    }

    const dailyStats = this.dailyCache.get(today)!;
    dailyStats.totalCost += usage.cost;
    dailyStats.requestCount += 1;

    const modelKey = `${usage.modelProvider}/${usage.modelName}`;
    if (!dailyStats.byModel.has(modelKey)) {
      dailyStats.byModel.set(modelKey, { cost: 0, count: 0 });
    }

    const modelStats = dailyStats.byModel.get(modelKey)!;
    modelStats.cost += usage.cost;
    modelStats.count += 1;
  }

  /**
   * 获取今日成本统计
   */
  getTodayStats(): DailyStats | null {
    const today = new Date().toISOString().split('T')[0];
    
    if (this.dailyCache.has(today)) {
      return this.dailyCache.get(today)!;
    }

    // 从数据库查询
    const result = this.db.prepare(`
      SELECT
        DATE(timestamp) as date,
        SUM(cost) as totalCost,
        COUNT(*) as requestCount,
        model_provider,
        model_name
      FROM token_usage
      WHERE DATE(timestamp) = ?
      GROUP BY DATE(timestamp), model_provider, model_name
      ORDER BY date DESC
    `).all(today);

    if (result.length === 0) return null;

    const stats: DailyStats = {
      date: today,
      totalCost: 0,
      requestCount: 0,
      byModel: new Map()
    };

    for (const row of result) {
      stats.totalCost += (row as any).totalCost || 0;
      stats.requestCount += (row as any).requestCount || 0;
      
      const modelKey = `${(row as any).model_provider}/${(row as any).model_name}`;
      stats.byModel.set(modelKey, {
        cost: (row as any).totalCost || 0,
        count: (row as any).requestCount || 0
      });
    }

    this.dailyCache.set(today, stats);
    return stats;
  }

  /**
   * 获取本月成本统计
   */
  getMonthStats(): MonthlyStats {
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    const result = this.db.prepare(`
      SELECT
        DATE(timestamp) as date,
        SUM(cost) as totalCost,
        COUNT(*) as requestCount
      FROM token_usage
      WHERE strftime('%Y-%m', timestamp) = ?
      GROUP BY DATE(timestamp)
      ORDER BY date ASC
    `).all(month);

    const monthStats: MonthlyStats = {
      month,
      totalCost: 0,
      requestCount: 0,
      dailyStats: []
    };

    for (const row of result) {
      const dailyCost = (row as any).totalCost || 0;
      const dailyCount = (row as any).requestCount || 0;

      monthStats.totalCost += dailyCost;
      monthStats.requestCount += dailyCount;
      monthStats.dailyStats.push({
        date: (row as any).date,
        totalCost: dailyCost,
        requestCount: dailyCount,
        byModel: new Map()
      });
    }

    return monthStats;
  }

  /**
   * 生成成本报告
   */
  generateReport(): string {
    const today = this.getTodayStats();
    const month = this.getMonthStats();

    let report = `📊 **【Token 成本统计报告】**\n\n`;

    // 今日统计
    report += `📅 **今日成本**\n`;
    if (today) {
      report += `💰 总成本: ¥${today.totalCost.toFixed(4)}\n`;
      report += `📞 请求数: ${today.requestCount}\n`;
      report += `\n按模型:\n`;
      
      for (const [model, stats] of today.byModel) {
        report += `  • ${model}: ¥${stats.cost.toFixed(4)} (${stats.count} 次)\n`;
      }
    } else {
      report += `暂无数据\n`;
    }

    report += `\n`;

    // 本月统计
    report += `📈 **本月成本**\n`;
    report += `💰 总成本: ¥${month.totalCost.toFixed(4)}\n`;
    report += `📞 总请求: ${month.requestCount}\n`;
    report += `📊 平均日成本: ¥${(month.totalCost / (month.dailyStats.length || 1)).toFixed(4)}\n`;

    return report;
  }

  /**
   * 导出成本数据（CSV 格式）
   */
  exportAsCSV(startDate: string, endDate: string): string {
    const rows = this.db.prepare(`
      SELECT * FROM token_usage
      WHERE DATE(timestamp) BETWEEN ? AND ?
      ORDER BY timestamp DESC
    `).all(startDate, endDate) as any[];

    let csv = 'Timestamp,Model Provider,Model Name,Input Tokens,Output Tokens,Cost,Duration(ms),Success\n';

    for (const row of rows) {
      csv += `${row.timestamp},${row.model_provider},${row.model_name},${row.input_tokens},${row.output_tokens},${row.cost},${row.duration_ms},${row.success}\n`;
    }

    return csv;
  }

  /**
   * 清空旧数据（保持数据库大小）
   */
  cleanup(daysToKeep: number = 90): number {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = this.db.prepare(`
      DELETE FROM token_usage
      WHERE timestamp < ?
    `).run(cutoffDate.toISOString());

    console.log(`🧹 清理了 ${result.changes} 条旧记录`);
    return result.changes;
  }

  /**
   * 获取使用最多的模型
   */
  getMostUsedModels(limit: number = 5): Array<{ model: string; count: number; cost: number }> {
    const result = this.db.prepare(`
      SELECT
        CONCAT(model_provider, '/', model_name) as model,
        COUNT(*) as count,
        SUM(cost) as cost
      FROM token_usage
      WHERE success = 1
      GROUP BY model_provider, model_name
      ORDER BY count DESC
      LIMIT ?
    `).all(limit) as any[];

    return result.map(row => ({
      model: row.model,
      count: row.count,
      cost: row.cost || 0
    }));
  }
}

export default TokenMonitor;
```

---

## Part 3：自动切换系统

### auto-switcher.ts

```typescript
import ModelManager from './model-manager';
import TokenMonitor from './token-monitor';

interface ModelQuota {
  provider: string;
  dailyLimit: number;     // ¥/day
  monthlyLimit: number;   // ¥/month
  rpsLimit: number;       // requests per second
  priority: number;       // 优先级（1=最高）
  enabled: boolean;
}

interface SwitchTrigger {
  reason: string;
  fromModel: string;
  toModel: string;
  timestamp: Date;
}

class AutoSwitcher {
  private modelManager: ModelManager;
  private tokenMonitor: TokenMonitor;
  private quotas: Map<string, ModelQuota> = new Map();
  private switchHistory: SwitchTrigger[] = [];
  private lastSwitchTime: number = 0;
  private minSwitchInterval: number = 60000; // 至少间隔 60 秒

  constructor(modelManager: ModelManager, tokenMonitor: TokenMonitor) {
    this.modelManager = modelManager;
    this.tokenMonitor = tokenMonitor;
    this.initializeQuotas();
    this.startMonitoring();
  }

  /**
   * 初始化模型配额
   */
  private initializeQuotas(): void {
    // Groq：免费但有限流
    this.quotas.set('groq', {
      provider: 'groq',
      dailyLimit: 0,        // 免费，无限额
      monthlyLimit: 0,
      rpsLimit: 3,          // 每秒 3 个请求
      priority: 1,          // 最高优先级
      enabled: true
    });

    // OpenAI：按 token 计费
    this.quotas.set('openai', {
      provider: 'openai',
      dailyLimit: 10,       // 日限额 10 元
      monthlyLimit: 200,    // 月限额 200 元
      rpsLimit: 10,
      priority: 2,
      enabled: true
    });

    // Anthropic：按 token 计费（较贵）
    this.quotas.set('anthropic', {
      provider: 'anthropic',
      dailyLimit: 5,        // 日限额 5 元
      monthlyLimit: 100,    // 月限额 100 元
      rpsLimit: 5,
      priority: 3,
      enabled: true
    });
  }

  /**
   * 启动监控循环
   */
  private startMonitoring(): void {
    // 每 10 秒检查一次是否需要切换
    setInterval(() => {
      this.checkAndSwitch();
    }, 10000);
  }

  /**
   * 检查并自动切换
   */
  private async checkAndSwitch(): Promise<void> {
    // 防止频繁切换
    if (Date.now() - this.lastSwitchTime < this.minSwitchInterval) {
      return;
    }

    const todayStats = this.tokenMonitor.getTodayStats();
    const currentModel = this.modelManager.getCurrentModel();

    if (!todayStats || !currentModel) return;

    // 检查当前模型是否超过日限额
    const currentModelKey = `${currentModel.provider}/${currentModel.name}`;
    const currentModelStats = todayStats.byModel.get(currentModelKey);

    if (!currentModelStats) return;

    const currentQuota = this.quotas.get(currentModel.provider);
    if (!currentQuota) return;

    // 日限额检查
    if (currentQuota.dailyLimit > 0 && currentModelStats.cost >= currentQuota.dailyLimit) {
      console.log(`⚠️ 模型 ${currentModel.provider} 已达到日限额 ¥${currentQuota.dailyLimit}`);
      await this.switchToNextModel('daily_limit_exceeded', currentModel.provider);
      return;
    }

    // 月限额检查
    const monthStats = this.tokenMonitor.getMonthStats();
    const monthQuota = this.quotas.get(currentModel.provider);
    if (monthQuota && monthQuota.monthlyLimit > 0 && monthStats.totalCost >= monthQuota.monthlyLimit) {
      console.log(`⚠️ 模型 ${currentModel.provider} 已达到月限额 ¥${monthQuota.monthlyLimit}`);
      await this.switchToNextModel('monthly_limit_exceeded', currentModel.provider);
      return;
    }
  }

  /**
   * 切换到下一个模型
   */
  private async switchToNextModel(reason: string, fromProvider: string): Promise<boolean> {
    // 按优先级排列可用的模型
    const availableModels = Array.from(this.quotas.values())
      .filter(q => q.enabled && q.provider !== fromProvider)
      .sort((a, b) => a.priority - b.priority);

    if (availableModels.length === 0) {
      console.error('❌ 没有可用的备选模型');
      return false;
    }

    const nextQuota = availableModels[0];
    const success = await this.modelManager.switchModel(nextQuota.provider);

    if (success) {
      const newModel = this.modelManager.getCurrentModel();
      const trigger: SwitchTrigger = {
        reason,
        fromModel: fromProvider,
        toModel: newModel?.provider || 'unknown',
        timestamp: new Date()
      };

      this.switchHistory.push(trigger);
      this.lastSwitchTime = Date.now();

      console.log(`✅ 已自动切换: ${fromProvider} → ${newModel?.provider}`);
      console.log(`   原因: ${reason}`);

      return true;
    }

    return false;
  }

  /**
   * 手动切换模型
   */
  async manualSwitch(provider: string): Promise<boolean> {
    const success = await this.modelManager.switchModel(provider);

    if (success) {
      this.switchHistory.push({
        reason: 'manual_request',
        fromModel: this.modelManager.getCurrentModel()?.provider || 'unknown',
        toModel: provider,
        timestamp: new Date()
      });
      this.lastSwitchTime = Date.now();
    }

    return success;
  }

  /**
   * 更新配额
   */
  updateQuota(provider: string, quota: Partial<ModelQuota>): void {
    const existing = this.quotas.get(provider);
    if (existing) {
      this.quotas.set(provider, { ...existing, ...quota });
      console.log(`✅ 已更新 ${provider} 配额`);
    }
  }

  /**
   * 获取切换历史
   */
  getSwitchHistory(limit: number = 10): SwitchTrigger[] {
    return this.switchHistory.slice(-limit);
  }

  /**
   * 生成切换报告
   */
  generateSwitchReport(): string {
    let report = `📋 **【模型切换历史】**\n\n`;

    if (this.switchHistory.length === 0) {
      report += `暂无切换记录\n`;
    } else {
      const recentSwitches = this.switchHistory.slice(-5);
      for (const sw of recentSwitches) {
        report += `⏰ ${sw.timestamp.toLocaleString()}\n`;
        report += `   ${sw.fromModel} → ${sw.toModel}\n`;
        report += `   原因: ${this.translateReason(sw.reason)}\n\n`;
      }
    }

    return report;
  }

  private translateReason(reason: string): string {
    const reasons: { [key: string]: string } = {
      'daily_limit_exceeded': '日成本限额已满',
      'monthly_limit_exceeded': '月成本限额已满',
      'rate_limit_exceeded': '请求频率受限',
      'error_rate_high': '错误率过高',
      'manual_request': '用户手动切换',
      'startup': '系统启动'
    };
    return reasons[reason] || reason;
  }
}

export default AutoSwitcher;
```

---

## Part 4：集成到 Telegram Bot

### 在 index.ts 中添加命令

```typescript
import TokenMonitor from './models/token-monitor';
import AutoSwitcher from './models/auto-switcher';

const tokenMonitor = new TokenMonitor();
const autoSwitcher = new AutoSwitcher(modelManager, tokenMonitor);

// ========== Token 监控命令 ==========

tgBot.onText(/\/token_today/, async (msg) => {
  const chatId = msg.chat.id;
  const stats = tokenMonitor.getTodayStats();
  
  if (!stats) {
    await tgBot.sendMessage(chatId, '📊 今日暂无使用记录');
    return;
  }

  let report = `📊 **【今日 Token 统计】**\n\n`;
  report += `💰 总成本: ¥${stats.totalCost.toFixed(4)}\n`;
  report += `📞 请求数: ${stats.requestCount}\n`;
  report += `📊 按模型:\n`;

  for (const [model, modelStats] of stats.byModel) {
    report += `  • ${model}\n`;
    report += `    💰 成本: ¥${modelStats.cost.toFixed(4)}\n`;
    report += `    📞 次数: ${modelStats.count}\n`;
  }

  await tgBot.sendMessage(chatId, report);
});

tgBot.onText(/\/token_month/, async (msg) => {
  const chatId = msg.chat.id;
  const stats = tokenMonitor.getMonthStats();
  
  let report = `📈 **【本月 Token 统计】**\n\n`;
  report += `💰 总成本: ¥${stats.totalCost.toFixed(4)}\n`;
  report += `📞 总请求: ${stats.requestCount}\n`;
  report += `📊 平均日成本: ¥${(stats.totalCost / (stats.dailyStats.length || 1)).toFixed(4)}\n`;
  report += `📅 涵盖天数: ${stats.dailyStats.length} 天\n`;

  await tgBot.sendMessage(chatId, report);
});

tgBot.onText(/\/token_report/, async (msg) => {
  const chatId = msg.chat.id;
  const report = tokenMonitor.generateReport();
  await tgBot.sendMessage(chatId, report);
});

tgBot.onText(/\/model_switch (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const provider = match[1].toLowerCase();
  
  const success = await autoSwitcher.manualSwitch(provider);
  const message = success 
    ? `✅ 已切换到 ${provider}`
    : `❌ 切换到 ${provider} 失败`;
  
  await tgBot.sendMessage(chatId, message);
});

tgBot.onText(/\/switch_history/, async (msg) => {
  const chatId = msg.chat.id;
  const report = autoSwitcher.generateSwitchReport();
  await tgBot.sendMessage(chatId, report);
});

tgBot.onText(/\/token_quota$/, async (msg) => {
  const chatId = msg.chat.id;
  
  let report = `⚙️ **【模型配额设置】**\n\n`;
  report += `/token_quota_set groq daily 0\n`;
  report += `/token_quota_set openai daily 10\n`;
  report += `/token_quota_set openai monthly 200\n`;
  report += `/token_quota_set anthropic daily 5\n`;
  
  await tgBot.sendMessage(chatId, report);
});

tgBot.onText(/\/token_quota_set (\w+) (\w+) ([\d.]+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [_, provider, limitType, amount] = match;
  
  if (limitType === 'daily') {
    autoSwitcher.updateQuota(provider, { dailyLimit: parseFloat(amount) });
  } else if (limitType === 'monthly') {
    autoSwitcher.updateQuota(provider, { monthlyLimit: parseFloat(amount) });
  }
  
  await tgBot.sendMessage(chatId, `✅ 已更新 ${provider} ${limitType} 限额为 ¥${amount}`);
});
```

---

## 命令列表

```
📊 成本监控命令
/token_today          - 今日成本统计
/token_month          - 本月成本统计
/token_report         - 完整成本报告

🔄 自动切换命令
/model_switch [model] - 手动切换模型（groq/openai/anthropic）
/switch_history       - 切换历史记录

⚙️ 配额管理命令
/token_quota          - 显示当前配额
/token_quota_set [provider] [type] [amount]
  例如: /token_quota_set openai daily 10    # 设置 OpenAI 日限额为 ¥10
        /token_quota_set openai monthly 200 # 设置 OpenAI 月限额为 ¥200
```

---

## 工作流程示例

```
场景：Groq 限流，需要自动切换

1️⃣ 用户发送请求
   → 调用 Groq 模型

2️⃣ 监控系统记录 token 使用
   → tokenMonitor.recordUsage()
   → 记录成本、耗时等

3️⃣ 自动切换检查
   → checkAndSwitch() 每 10s 运行一次
   → 检查是否超过日/月限额

4️⃣ 如果超过限额
   → 自动切换到 OpenAI（优先级 2）
   → 记录切换事件到历史

5️⃣ 下次请求
   → 使用 OpenAI 模型
   → 继续监控成本

6️⃣ 用户可查看
   → /token_today 查看今日成本
   → /switch_history 查看切换历史
   → /model_switch openai 手动切换
```

---

## 配置示例（.env）

```bash
# Token 监控配置
TOKEN_MONITOR_ENABLED=true
TOKEN_MONITOR_DB_PATH=./nanoclaw.db
TOKEN_CLEANUP_DAYS=90          # 保留 90 天数据

# 模型配额设置
GROQ_DAILY_LIMIT=0             # 免费，无限额
GROQ_MONTHLY_LIMIT=0
GROQ_RPS_LIMIT=3               # 每秒 3 个请求

OPENAI_DAILY_LIMIT=10          # 日限额 ¥10
OPENAI_MONTHLY_LIMIT=200       # 月限额 ¥200
OPENAI_RPS_LIMIT=10

ANTHROPIC_DAILY_LIMIT=5        # 日限额 ¥5
ANTHROPIC_MONTHLY_LIMIT=100    # 月限额 ¥100
ANTHROPIC_RPS_LIMIT=5

# 自动切换配置
AUTO_SWITCH_ENABLED=true
AUTO_SWITCH_MIN_INTERVAL=60000  # 至少间隔 60 秒
```

---

## 集成步骤

```
1️⃣ 创建 token-monitor.ts 模块
2️⃣ 创建 cost-calculator.ts 模块（基础计算）
3️⃣ 创建 auto-switcher.ts 模块
4️⃣ 在 model-manager.ts 中添加 switchModel() 方法
5️⃣ 在 index.ts 中集成所有命令
6️⃣ 配置 .env 文件
7️⃣ 测试整个流程
```

---

## 优势

```
✅ 自动降低成本
   • 优先使用免费 Groq
   • 智能分配到付费模型
   • 防止成本超支

✅ 完整的成本可视化
   • 日成本统计
   • 月成本趋势
   • 按模型分解

✅ 智能自动切换
   • 无需人工干预
   • 支持多级配额
   • 可手动override

✅ 历史记录和数据导出
   • 详细的使用日志
   • CSV 导出功能
   • 成本分析能力
```

---

这个系统就像一个「AI 成本CFO」，为你智能管理 token 和模型切换！
