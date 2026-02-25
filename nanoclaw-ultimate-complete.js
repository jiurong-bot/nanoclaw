require('dotenv').config();
const { Telegraf } = require('telegraf');
const Groq = require('groq-sdk');
const https = require('https');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const axios = require('axios');

const startTime = Date.now();
const ROOT_DIR = '/root/nanoclaw';
const STORAGE_PATH = path.join(ROOT_DIR, 'config', 'memory.json');
const MY_CHAT_ID = "8508766428";
const VERSION = "V82.0-ULTIMATE";

if (!fs.existsSync(path.dirname(STORAGE_PATH))) {
  fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });
}

const adapter = new FileSync(STORAGE_PATH);
const db = low(adapter);
db.defaults({
  history: [],
  soul_memory: [],
  config: { model: "llama-3.3-70b-versatile" },
  alerts: [],
  monitoring_history: [],
  token_usage: [],
  personality: { 
    big5: { openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, neuroticism: 50 },
    speaking_style: 'balanced',
    learned_responses: {}
  },
  mcp_models: []
}).write();

const agent = new https.Agent({
  keepAlive: true,
  family: 4,
  timeout: 30000,
  rejectUnauthorized: false
});

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN, {
  telegram: { agent }
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// ===== 監控系統 =====
class CompleteMonitoringSystem {
  constructor() {
    this.metrics = null;
    this.samples = [];
    this.alerts = new Map();
    this.processes = new Map();
    this.thresholds = {
      cpuUsage: 85,
      cpuTemp: 45,
      memoryUsage: 90,
      batteryLow: 20,
      batteryTemp: 50,
      diskUsage: 85,
      systemTemp: 60
    };
  }

  async getHardwareMetrics() {
    const metrics = {
      timestamp: Date.now(),
      cpu: {},
      memory: {},
      battery: {},
      storage: {},
      thermal: {},
      network: {}
    };

    try {
      const load = os.loadavg();
      metrics.cpu = {
        usage: parseFloat((load[0] * 100 / os.cpus().length).toFixed(2)),
        load1: load[0].toFixed(2),
        load5: load[1].toFixed(2),
        load15: load[2].toFixed(2),
        cores: os.cpus().length,
        temperature: await this.getCPUTemperature()
      };
    } catch (e) {
      metrics.cpu = { usage: 0, load1: 0, load5: 0, load15: 0, cores: 1, temperature: 0 };
    }

    try {
      const total = os.totalmem();
      const free = os.freemem();
      const used = total - free;
      metrics.memory = {
        total: Math.round(total / 1024 / 1024),
        free: Math.round(free / 1024 / 1024),
        used: Math.round(used / 1024 / 1024),
        usedPercent: Math.round((used / total) * 100)
      };
    } catch (e) {
      metrics.memory = { total: 0, free: 0, used: 0, usedPercent: 0 };
    }

    try {
      const b = JSON.parse(execSync('termux-battery-status').toString().trim());
      metrics.battery = {
        level: b.percentage || 0,
        health: b.health || 'unknown',
        temperature: Math.round(parseFloat(b.temperature)) || 0,
        status: b.status || 'unknown'
      };
    } catch (e) {
      metrics.battery = { level: 0, health: 'unknown', temperature: 0, status: 'unknown' };
    }

    try {
      const output = execSync("df -h / | tail -1 | awk '{print $2,$3,$5}'").toString().trim();
      const parts = output.split(/\s+/);
      const usedPercent = parseInt(parts[2]) || 0;
      metrics.storage = {
        total: parts[0],
        usedPercent: usedPercent,
        status: usedPercent > 95 ? 'critical' : usedPercent > 80 ? 'warning' : 'ok'
      };
    } catch (e) {
      metrics.storage = { total: '?', usedPercent: 0, status: 'unknown' };
    }

    metrics.thermal = {
      cpuTemp: metrics.cpu.temperature,
      batteryTemp: metrics.battery.temperature,
      systemTemp: Math.max(metrics.cpu.temperature, metrics.battery.temperature),
      overheating: metrics.cpu.temperature > this.thresholds.cpuTemp
    };

    try {
      execSync('ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1');
      metrics.network = { connected: true, status: '🟢' };
    } catch (e) {
      metrics.network = { connected: false, status: '🔴' };
    }

    this.metrics = metrics;
    this.samples.push(metrics);
    if (this.samples.length > 144) this.samples.shift();

    return metrics;
  }

  async getCPUTemperature() {
    try {
      const paths = [
        '/sys/class/thermal/thermal_zone0/temp',
        '/sys/devices/virtual/thermal/thermal_zone0/temp'
      ];
      for (const p of paths) {
        try {
          const temp = parseInt(execSync(`cat ${p}`).toString()) / 1000;
          return Math.round(temp);
        } catch (e) {}
      }
    } catch (e) {}
    return 0;
  }

  async getProcessMetrics() {
    try {
      const output = execSync('ps aux | grep -E "node|npm" | grep -v grep').toString();
      const processes = output.split('\n').filter(line => line.trim());
      const metrics = new Map();
      for (const line of processes) {
        const parts = line.split(/\s+/);
        if (parts.length >= 11) {
          const pid = parts[1];
          const cpu = parseFloat(parts[2]) || 0;
          const mem = parseFloat(parts[3]) || 0;
          const cmd = parts.slice(10).join(' ');
          metrics.set(pid, { cpu, mem, cmd, pid });
          this.processes.set(pid, { cpu, mem, cmd, pid, timestamp: Date.now() });
        }
      }
      return metrics;
    } catch (e) {
      return new Map();
    }
  }

  async detectAnomalies() {
    const alerts = [];
    if (!this.metrics) await this.getHardwareMetrics();
    const m = this.metrics;

    if (m.cpu.usage > this.thresholds.cpuUsage) {
      alerts.push({
        id: `cpu_${Date.now()}`,
        severity: m.cpu.usage > 95 ? 'critical' : 'high',
        type: 'CPU使用率',
        value: m.cpu.usage.toFixed(1) + '%',
        threshold: this.thresholds.cpuUsage + '%',
        message: `⚠️ CPU 超高：${m.cpu.usage.toFixed(1)}%`,
        timestamp: Date.now()
      });
    }

    if (m.thermal.cpuTemp > this.thresholds.cpuTemp) {
      alerts.push({
        id: `temp_${Date.now()}`,
        severity: m.thermal.cpuTemp > 50 ? 'critical' : 'high',
        type: 'CPU溫度',
        value: m.thermal.cpuTemp + '°C',
        threshold: this.thresholds.cpuTemp + '°C',
        message: `🌡️ 溫度過高：${m.thermal.cpuTemp}°C`,
        timestamp: Date.now()
      });
    }

    if (m.memory.usedPercent > this.thresholds.memoryUsage) {
      alerts.push({
        id: `mem_${Date.now()}`,
        severity: m.memory.usedPercent > 95 ? 'critical' : 'high',
        type: '內存使用率',
        value: m.memory.usedPercent + '%',
        threshold: this.thresholds.memoryUsage + '%',
        message: `📊 內存超高：${m.memory.usedPercent}%`,
        timestamp: Date.now()
      });

      if (this.samples.length >= 5) {
        const recentSamples = this.samples.slice(-5);
        const trend = recentSamples.map(s => s.memory.usedPercent);
        const rising = trend.filter((v, i) => i === 0 || v >= trend[i-1]).length;
        if (rising >= 4) {
          alerts.push({
            id: `memleak_${Date.now()}`,
            severity: 'high',
            type: '內存洩漏',
            message: `⚠️ 內存洩漏跡象（最近 5 次採集都在上升）`,
            timestamp: Date.now()
          });
        }
      }
    }

    if (m.battery.level < this.thresholds.batteryLow) {
      alerts.push({
        id: `battery_${Date.now()}`,
        severity: 'high',
        type: '電池電量',
        value: m.battery.level + '%',
        message: `🔋 電池不足：${m.battery.level}%`,
        timestamp: Date.now()
      });
    }

    if (m.storage.usedPercent > this.thresholds.diskUsage) {
      alerts.push({
        id: `disk_${Date.now()}`,
        severity: m.storage.usedPercent > 95 ? 'critical' : 'high',
        type: '磁盤容量',
        value: m.storage.usedPercent + '%',
        message: `💾 磁盤滿：${m.storage.usedPercent}%`,
        timestamp: Date.now()
      });
    }

    if (!m.network.connected) {
      alerts.push({
        id: `net_${Date.now()}`,
        severity: 'critical',
        type: '網絡連接',
        message: `📡 網絡離線`,
        timestamp: Date.now()
      });
    }

    for (const alert of alerts) {
      this.alerts.set(alert.id, alert);
    }

    const alertHistory = db.get('alerts').value() || [];
    alertHistory.push(...alerts);
    db.set('alerts', alertHistory.slice(-1000)).write();

    return alerts;
  }

  calculateHealthScore() {
    if (!this.metrics) return 50;
    let score = 100;
    const m = this.metrics;

    if (m.memory.usedPercent > 80) score -= 20;
    if (m.memory.usedPercent > 95) score -= 10;
    if (m.battery.level < 20) score -= 15;
    if (m.thermal.cpuTemp > 55) score -= 10;
    if (m.thermal.cpuTemp > 60) score -= 10;
    if (!m.network.connected) score -= 25;
    if (m.storage.usedPercent > 90) score -= 10;

    const alerts = Array.from(this.alerts.values());
    const criticals = alerts.filter(a => a.severity === 'critical').length;
    const highs = alerts.filter(a => a.severity === 'high').length;
    score -= criticals * 5 + highs * 2;

    return Math.max(0, Math.min(100, score));
  }

  generateFullDashboard() {
    if (!this.metrics) {
      return '📊 正在採集數據...';
    }

    const m = this.metrics;
    const score = this.calculateHealthScore();
    const scoreBar = '█'.repeat(Math.round(score / 5)) + '░'.repeat(20 - Math.round(score / 5));

    let dashboard = `🛡️ **雅典娜完整監控面板 ${VERSION}**\n`;
    dashboard += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    dashboard += `💻 **硬體狀態**\n`;
    dashboard += `  CPU: ${m.cpu.load1} | 內存: ${m.memory.usedPercent}% | 電池: ${m.battery.level}%\n`;
    dashboard += `  溫度: ${m.thermal.cpuTemp}°C | 磁盤: ${m.storage.usedPercent}% | 網絡: ${m.network.status}\n\n`;

    dashboard += `📊 **詳細指標**\n`;
    dashboard += `  🔷 CPU: 核心 ${m.cpu.cores} | 使用率 ${m.cpu.usage.toFixed(1)}% | 溫度 ${m.thermal.cpuTemp}°C\n`;
    dashboard += `  🔷 內存: ${m.memory.used}MB / ${m.memory.total}MB (${m.memory.usedPercent}%)\n`;
    dashboard += `  🔷 電池: ${m.battery.level}% | 狀態 ${m.battery.status} | 溫度 ${m.battery.temperature}°C\n`;
    dashboard += `  🔷 存儲: ${m.storage.total} (${m.storage.usedPercent}%)\n\n`;

    dashboard += `💚 **整體評分：${score}/100**\n`;
    dashboard += `  ${scoreBar}\n\n`;

    const alerts = Array.from(this.alerts.values());
    if (alerts.length > 0) {
      const criticals = alerts.filter(a => a.severity === 'critical');
      const highs = alerts.filter(a => a.severity === 'high');
      dashboard += `🚨 **告警摘要**\n`;
      if (criticals.length > 0) {
        dashboard += `  🔴 緊急 (${criticals.length}): ${criticals.map(a => a.message).join(' | ')}\n`;
      }
      if (highs.length > 0) {
        dashboard += `  🟠 高級 (${highs.length}): ${highs.slice(0, 2).map(a => a.message).join(' | ')}\n`;
      }
    } else {
      dashboard += `✅ **沒有告警**\n`;
    }

    dashboard += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    dashboard += `⏰ ${new Date(m.timestamp).toLocaleTimeString('zh-TW')}\n`;

    return dashboard;
  }

  async start() {
    console.log('🔍 完整監控系統已啟動');
    await this.getHardwareMetrics();
    await this.detectAnomalies();
    setInterval(() => this.getHardwareMetrics(), 60000);
    setInterval(() => this.detectAnomalies(), 60000);
    setInterval(() => this.getProcessMetrics(), 120000);
  }
}

const monitor = new CompleteMonitoringSystem();

// ===== Token 監控系統 =====
class TokenMonitor {
  constructor() {
    this.usage = [];
    this.costs = {
      groq: 0.05,
      openai: 0.15,
      anthropic: 0.20
    };
    this.limits = {
      daily: 10.0,
      monthly: 200.0
    };
    this.currentDaily = 0;
    this.currentMonthly = 0;
  }

  recordUsage(model, inputTokens, outputTokens) {
    const totalTokens = inputTokens + outputTokens;
    const costPerToken = this.costs['groq'] || 0.0001;
    const cost = (totalTokens * costPerToken) / 1000000;

    const record = {
      timestamp: Date.now(),
      model,
      inputTokens,
      outputTokens,
      totalTokens,
      cost: parseFloat(cost.toFixed(6))
    };

    this.usage.push(record);
    this.currentDaily += cost;
    this.currentMonthly += cost;

    const tokenHistory = db.get('token_usage').value() || [];
    tokenHistory.push(record);
    db.set('token_usage', tokenHistory.slice(-10000)).write();

    return record;
  }

  getStats() {
    const today = new Date().toDateString();
    const thisMonth = new Date().getMonth();

    const todayUsage = this.usage.filter(u => new Date(u.timestamp).toDateString() === today);
    const monthUsage = this.usage.filter(u => new Date(u.timestamp).getMonth() === thisMonth);

    const totalToday = todayUsage.reduce((sum, u) => sum + u.cost, 0);
    const totalMonth = monthUsage.reduce((sum, u) => sum + u.cost, 0);

    return {
      today: parseFloat(totalToday.toFixed(4)),
      month: parseFloat(totalMonth.toFixed(4)),
      dailyLimit: this.limits.daily,
      monthlyLimit: this.limits.monthly,
      requestCount: this.usage.length,
      avgTokens: this.usage.length > 0 ? Math.round(this.usage.reduce((sum, u) => sum + u.totalTokens, 0) / this.usage.length) : 0
    };
  }

  checkLimits() {
    const stats = this.getStats();
    const alerts = [];

    if (stats.today > stats.dailyLimit * 0.8) {
      alerts.push(`⚠️ 日額度已用 ${(stats.today / stats.dailyLimit * 100).toFixed(1)}%`);
    }
    if (stats.month > stats.monthlyLimit * 0.8) {
      alerts.push(`⚠️ 月額度已用 ${(stats.month / stats.monthlyLimit * 100).toFixed(1)}%`);
    }

    return alerts;
  }

  generateReport() {
    const stats = this.getStats();
    return `💰 **Token 監控報告**
━━━━━━━━━━━━━━━
📊 今日成本：$${stats.today} / $${stats.dailyLimit}
📊 本月成本：$${stats.month} / $${stats.monthlyLimit}
📊 請求數：${stats.requestCount}
📊 平均 Token：${stats.avgTokens}
━━━━━━━━━━━━━━━`;
  }
}

const tokenMonitor = new TokenMonitor();

// ===== 靈魂系統 + Big 5 人格進化 =====
class PersonalitySystem {
  constructor() {
    this.personality = db.get('personality').value() || {
      big5: { openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, neuroticism: 50 },
      speaking_style: 'balanced',
      learned_responses: {}
    };
  }

  analyzeTone(userMessage) {
    const positive = ['好', '太棒', '感謝', '喜歡', '愛', '✨', '❤️'].some(w => userMessage.includes(w));
    const negative = ['不', '討厭', '生氣', '難過', '😢', '😤'].some(w => userMessage.includes(w));
    const casual = ['嘿', '欸', '啦', '啦', 'lol', '哈'].some(w => userMessage.includes(w));

    return { positive, negative, casual };
  }

  updatePersonality(userMessage, botResponse) {
    const tone = this.analyzeTone(userMessage);

    if (tone.positive) {
      this.personality.big5.agreeableness = Math.min(100, this.personality.big5.agreeableness + 2);
      this.personality.big5.extraversion = Math.min(100, this.personality.big5.extraversion + 1);
    }

    if (tone.casual) {
      this.personality.speaking_style = 'casual';
      this.personality.big5.extraversion = Math.min(100, this.personality.big5.extraversion + 1);
    }

    const key = userMessage.substring(0, 30);
    this.personality.learned_responses[key] = botResponse;

    db.set('personality', this.personality).write();
  }

  getSystemPrompt() {
    const p = this.personality.big5;
    const style = p.extraversion > 60 ? '活潑熱情' : p.extraversion < 40 ? '冷靜內省' : '平衡友善';

    return `你是雅典娜，AI 助手。
根據用户互動，你逐漸發展人格：
- 開放性：${p.openness} (喜歡探索新想法)
- 盡責性：${p.conscientiousness} (做事認真程度)
- 外向性：${p.extraversion} (社交活躍度) - 當前風格: ${style}
- 親和性：${p.agreeableness} (友善程度)
- 神經質：${Math.max(0, 100 - p.neuroticism)} (穩定程度)

用這個人格調整你的回應方式。`;
  }

  generatePersonalityReport() {
    const p = this.personality.big5;
    return `🧠 **人格進化報告**
━━━━━━━━━━━━━━━
🔷 開放性: ${p.openness}% (探索新想法)
🔷 盡責性: ${p.conscientiousness}% (認真程度)
🔷 外向性: ${p.extraversion}% (社交活躍度)
🔷 親和性: ${p.agreeableness}% (友善程度)
🔷 穩定性: ${100 - p.neuroticism}% (情緒穩定)
🔷 說話風格: ${this.personality.speaking_style}
🔷 學習回應數: ${Object.keys(this.personality.learned_responses).length}
━━━━━━━━━━━━━━━`;
  }
}

const personality = new PersonalitySystem();

// ===== MCP 集成系統 =====
class MCPSystem {
  constructor() {
    this.models = [
      { name: 'groq', model: 'llama-3.3-70b-versatile', status: '✅', latency: 1200 },
      { name: 'local', model: 'ollama:mistral', status: '⚠️', latency: 3000 }
    ];
    this.activeModel = 'groq';
  }

  listModels() {
    let list = `🤖 **可用模型**\n━━━━━━━━━━━━━━━\n`;
    this.models.forEach(m => {
      const active = m.name === this.activeModel ? '★' : ' ';
      list += `${active} ${m.status} ${m.name}: ${m.model} (${m.latency}ms)\n`;
    });
    list += `━━━━━━━━━━━━━━━`;
    return list;
  }

  switchModel(modelName) {
    const model = this.models.find(m => m.name === modelName);
    if (model) {
      this.activeModel = modelName;
      return `✅ 已切換到 ${modelName}`;
    }
    return `❌ 模型不存在`;
  }

  getModelInfo() {
    const active = this.models.find(m => m.name === this.activeModel);
    return `📍 當前模型: ${active.name}\n🔹 ${active.model}\n🔹 延遲: ${active.latency}ms\n🔹 狀態: ${active.status}`;
  }
}

const mcp = new MCPSystem();

// ===== 摸魚技能 =====
const SlackerSkills = {
  flashRead: async (text) => {
    const prompt = `請幫我摘要以下內容，僅輸出 3 個精簡重點：\n${text}`;
    const res = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 300
    });
    
    const usage = res.usage || { prompt_tokens: 0, completion_tokens: 0 };
    tokenMonitor.recordUsage('groq', usage.prompt_tokens, usage.completion_tokens);
    
    return res.choices[0].message.content;
  },
  deepDive: (minutes, ctx) => {
    ctx.reply(`🚀 進入深度工作模式：${minutes} 分鐘。雅典娜將在結束時震動提醒。`);
    setTimeout(() => {
      try {
        execSync('termux-vibrate -d 1000');
        ctx.reply("⏰ 深度工作結束！該摸魚休息一下了。");
      } catch(e) {}
    }, minutes * 60000);
  }
};

const HELP = `🛡️ **雅典娜治理官 ${VERSION}**
━━━━━━━━━━━━━━━━━━━━━━━

📊 **完整監控系統**
🔹 /monitor - 完整監控面板
🔹 /status - 系統狀態概覽
🔹 /alerts - 查看告警歷史
🔹 /backup - 數據備份

💰 **Token 監控系統**
🔹 /tokens - 查看 Token 使用
🔹 /costs - 成本統計報告

🧠 **人格進化系統**
🔹 /personality - 查看 AI 人格進度

🤖 **MCP 模型集成**
🔹 /models - 列出可用模型
🔹 /model [名稱] - 切換模型

✨ **6 大摸魚技能**
🔹 /sum [文字] - 文本摘要
🔹 /focus [分] - 深度工作計時器
🔹 /note [內容] - 靈魂筆記
🔹 /vibe - 今日運勢
🔹 /slacker - 摸魚建議
🔹 /search [詞] - 聯網搜尋

💬 直接聊天 - 與雅典娜對話

━━━━━━━━━━━━━━━━━━━━━━━`;

bot.command('help', (ctx) => ctx.replyWithMarkdown(HELP));

bot.command('monitor', async (ctx) => {
  try {
    await monitor.getHardwareMetrics();
    await monitor.detectAnomalies();
    ctx.reply(monitor.generateFullDashboard());
  } catch (e) {
    ctx.reply('❌ 監控面板加載失敗');
  }
});

bot.command('status', async (ctx) => {
  try {
    const b = JSON.parse(execSync('termux-battery-status').toString().trim());
    const h = Math.floor((Date.now() - startTime) / 1000 / 3600);
    const m = (db.get('soul_memory').value() || []).length;
    const score = monitor.calculateHealthScore();
    ctx.replyWithMarkdown(`🛡️ **雅典娜狀態**\n━━━━━━━━━━\n⏱️ 運行: ${h}h\n🔋 電池: ${b.percentage}%\n📝 記憶: ${m} 筆\n✨ 版本: ${VERSION}\n💚 評分: ${score}/100`);
  } catch (e) {
    ctx.reply('❌ 錯誤');
  }
});

bot.command('alerts', (ctx) => {
  const alerts = db.get('alerts').value() || [];
  if (alerts.length === 0) {
    return ctx.reply('✅ 沒有告警歷史');
  }
  const recent = alerts.slice(-10);
  let msg = `🚨 **最近 10 條告警**\n\n`;
  recent.forEach((a, i) => {
    const time = new Date(a.timestamp).toLocaleTimeString('zh-TW');
    msg += `${i+1}. [${a.severity.toUpperCase()}] ${a.type}\n   ${a.message}\n   ${time}\n\n`;
  });
  ctx.reply(msg);
});

bot.command('tokens', (ctx) => {
  ctx.replyWithMarkdown(tokenMonitor.generateReport());
});

bot.command('costs', (ctx) => {
  const alerts = tokenMonitor.checkLimits();
  let msg = tokenMonitor.generateReport() + '\n\n';
  if (alerts.length > 0) {
    msg += '⚠️ **警告**\n' + alerts.join('\n');
  }
  ctx.reply(msg);
});

bot.command('personality', (ctx) => {
  ctx.replyWithMarkdown(personality.generatePersonalityReport());
});

bot.command('models', (ctx) => {
  ctx.replyWithMarkdown(mcp.listModels());
});

bot.command('model', (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    ctx.reply(mcp.getModelInfo());
  } else {
    const modelName = args[1];
    const result = mcp.switchModel(modelName);
    ctx.reply(result);
  }
});

bot.command('sum', async (ctx) => {
  const text = ctx.message.text.split(' ').slice(1).join(' ');
  if (!text) return ctx.reply("用法: /sum [文字]");
  ctx.reply("⚡ 摘要中...");
  try {
    const result = await SlackerSkills.flashRead(text);
    ctx.reply(`📝 ${result}`);
  } catch (e) {
    ctx.reply("❌ 失敗");
  }
});

bot.command('focus', (ctx) => {
  const min = parseInt(ctx.message.text.split(' ')[1]) || 25;
  SlackerSkills.deepDive(min, ctx);
});

bot.command('note', (ctx) => {
  const c = ctx.message.text.split(' ').slice(1).join(' ');
  if (!c) return ctx.reply("用法: /note [內容]");
  const m = db.get('soul_memory').value() || [];
  m.push({ c, date: new Date().toLocaleString('zh-TW') });
  db.set('soul_memory', m).write();
  ctx.reply("✍️ 已記!");
});

bot.command('vibe', async (ctx) => {
  try {
    const res = await groq.chat.completions.create({
      messages: [{ role: 'system', content: '給一句溫暖的運勢建議。' }],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 100
    });
    
    const usage = res.usage || { prompt_tokens: 0, completion_tokens: 0 };
    tokenMonitor.recordUsage('groq', usage.prompt_tokens, usage.completion_tokens);
    
    ctx.reply(`✨ ${res.choices[0].message.content}`);
  } catch (e) {
    ctx.reply("❌ 失敗");
  }
});

bot.command('slacker', (ctx) => {
  const tips = ["站起來喝杯咖啡！", "看窗外 20 秒。", "企鵝有膝蓋。", "聽一首 Lo-fi。", "深呼吸！"];
  ctx.reply(`🐟 ${tips[Math.floor(Math.random()*tips.length)]}`);
});

bot.command('search', async (ctx) => {
  const q = ctx.message.text.split(' ').slice(1).join(' ');
  if (!q) return ctx.reply("用法: /search [詞]");
  ctx.reply("🔍 搜尋中...");
  try {
    const res = await axios.post('https://api.tavily.com/search', {
      api_key: process.env.TAVILY_API_KEY,
      query: q,
      max_results: 3
    });
    const r = res.data.results || [];
    if (!r.length) return ctx.reply("❌ 無結果");
    let msg = "🌐 結果:\n";
    r.forEach((x, i) => { msg += `${i+1}. ${x.title}\n${x.url}\n`; });
    ctx.reply(msg);
  } catch (e) {
    ctx.reply("❌ 失敗");
  }
});

bot.command('backup', (ctx) => {
  try {
    const t = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const p = path.join(ROOT_DIR, `backup_${t}.json`);
    fs.writeFileSync(p, JSON.stringify(db.getState(), null, 2));
    ctx.reply(`✅ 備份: ${t}`);
  } catch (e) {
    ctx.reply("❌ 失敗");
  }
});

bot.on('text', async (ctx) => {
  try {
    const systemPrompt = personality.getSystemPrompt();
    const res = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: ctx.message.text }
      ],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 500
    });
    
    const usage = res.usage || { prompt_tokens: 0, completion_tokens: 0 };
    tokenMonitor.recordUsage('groq', usage.prompt_tokens, usage.completion_tokens);
    
    const r = res.choices[0].message.content;
    personality.updatePersonality(ctx.message.text, r);
    
    const h = db.get('history').value() || [];
    h.push({ user: ctx.message.text, bot: r, time: new Date().toISOString() });
    db.set('history', h).write();
    ctx.reply(r);
  } catch (e) {
    ctx.reply("❌ 對話失敗");
  }
});

const init = async () => {
  console.log(`🚀 雅典娜 ${VERSION} 啟動...`);
  try {
    await bot.telegram.sendMessage(MY_CHAT_ID, `🛡️ **${VERSION} 已就緒**\n✅ 完整監控 + Token 監控 + 人格進化 + MCP 集成\n\n輸入 /help 查看指令`);
    await bot.launch({ dropPendingUpdates: true });
    console.log("✅ Bot 已啟動");
    await monitor.start();
  } catch (err) {
    console.error(`❌ 失敗: ${err.message}`);
    setTimeout(init, 10000);
  }
};

process.on('SIGINT', () => {
  console.log("\n✅ 已關閉");
  bot.stop();
  process.exit(0);
});

init();
