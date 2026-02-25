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

// === 核心初始化 ===
const startTime = Date.now();
const ROOT_DIR = '/root/nanoclaw';
const STORAGE_PATH = path.join(ROOT_DIR, 'config', 'memory.json');
const MY_CHAT_ID = "8508766428";
const VERSION = "V81.0-L2-COMPLETE";

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
  monitoring_history: []
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

// === 完整監控系統（按照報告書設計）===

class CompleteMonitoringSystem {
  constructor() {
    this.metrics = null;
    this.samples = [];
    this.alerts = new Map();
    this.processes = new Map();
    this.lastAnomalyCheck = {};
    
    this.thresholds = {
      cpuUsage: 85,
      cpuTemp: 45,
      memoryUsage: 90,
      batteryLow: 20,
      batteryTemp: 50,
      diskUsage: 85,
      systemTemp: 60,
      memoryLeakThreshold: 5 // 5% 增長
    };
  }

  // ===== 硬體層監控 =====
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

    // CPU 指標
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

    // 內存指標
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

    // 電池指標
    try {
      const b = JSON.parse(execSync('termux-battery-status').toString().trim());
      metrics.battery = {
        level: b.percentage || 0,
        health: b.health || 'unknown',
        temperature: parseFloat(b.temperature) || 0,
        status: b.status || 'unknown'
      };
    } catch (e) {
      metrics.battery = { level: 0, health: 'unknown', temperature: 0, status: 'unknown' };
    }

    // 存儲指標
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

    // 熱度指標
    metrics.thermal = {
      cpuTemp: metrics.cpu.temperature,
      batteryTemp: metrics.battery.temperature,
      systemTemp: Math.max(metrics.cpu.temperature, metrics.battery.temperature),
      overheating: metrics.cpu.temperature > this.thresholds.cpuTemp
    };

    // 網絡指標
    try {
      execSync('ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1');
      metrics.network = { connected: true, status: '🟢' };
    } catch (e) {
      metrics.network = { connected: false, status: '🔴' };
    }

    this.metrics = metrics;
    this.samples.push(metrics);
    if (this.samples.length > 144) this.samples.shift(); // 保留 24 小時數據（每 10 分鐘採集一次）

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
          return parseFloat(temp.toFixed(1));
        } catch (e) {}
      }
    } catch (e) {}
    return 0;
  }

  // ===== 軟體層監控 =====
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

  // ===== 異常偵測 =====
  async detectAnomalies() {
    const alerts = [];

    if (!this.metrics) await this.getHardwareMetrics();
    const m = this.metrics;

    // CPU 異常
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

    // 溫度異常
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

    // 內存異常
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

      // 記錄內存洩漏跡象
      if (this.samples.length >= 5) {
        const recentSamples = this.samples.slice(-5);
        const trend = recentSamples.map(s => s.memory.usedPercent);
        const rising = trend.filter((v, i) => i === 0 || v >= trend[i-1]).length;
        
        if (rising >= 4) {
          alerts.push({
            id: `memleak_${Date.now()}`,
            severity: 'high',
            type: '內存洩漏',
            value: '檢測到持續上升',
            threshold: '不應持續上升',
            message: `⚠️ 內存洩漏跡象（最近 5 次採集都在上升）`,
            timestamp: Date.now()
          });
        }
      }
    }

    // 電池異常
    if (m.battery.level < this.thresholds.batteryLow) {
      alerts.push({
        id: `battery_${Date.now()}`,
        severity: 'high',
        type: '電池電量',
        value: m.battery.level + '%',
        threshold: this.thresholds.batteryLow + '%',
        message: `🔋 電池不足：${m.battery.level}%`,
        timestamp: Date.now()
      });
    }

    // 磁盤異常
    if (m.storage.usedPercent > this.thresholds.diskUsage) {
      alerts.push({
        id: `disk_${Date.now()}`,
        severity: m.storage.usedPercent > 95 ? 'critical' : 'high',
        type: '磁盤容量',
        value: m.storage.usedPercent + '%',
        threshold: this.thresholds.diskUsage + '%',
        message: `💾 磁盤滿：${m.storage.usedPercent}%`,
        timestamp: Date.now()
      });
    }

    // 網絡異常
    if (!m.network.connected) {
      alerts.push({
        id: `net_${Date.now()}`,
        severity: 'critical',
        type: '網絡連接',
        value: '已斷開',
        threshold: '已連接',
        message: `📡 網絡離線`,
        timestamp: Date.now()
      });
    }

    // 保存告警
    for (const alert of alerts) {
      this.alerts.set(alert.id, alert);
    }

    // 保存到數據庫
    const alertHistory = db.get('alerts').value() || [];
    alertHistory.push(...alerts);
    db.set('alerts', alertHistory.slice(-1000)).write(); // 保留最後 1000 條

    return alerts;
  }

  // ===== 健康評分 =====
  calculateHealthScore() {
    if (!this.metrics) return 50;

    let score = 100;
    const m = this.metrics;

    if (m.memory.usedPercent > 80) score -= 20;
    if (m.memory.usedPercent > 95) score -= 10; // 額外懲罰
    if (m.battery.level < 20) score -= 15;
    if (m.thermal.cpuTemp > 55) score -= 10;
    if (m.thermal.cpuTemp > 60) score -= 10; // 額外懲罰
    if (!m.network.connected) score -= 25;
    if (m.storage.usedPercent > 90) score -= 10;
    
    // 告警計數懲罰
    const alerts = Array.from(this.alerts.values());
    const criticals = alerts.filter(a => a.severity === 'critical').length;
    const highs = alerts.filter(a => a.severity === 'high').length;
    score -= criticals * 5 + highs * 2;

    return Math.max(0, Math.min(100, score));
  }

  // ===== 儀表板生成 =====
  generateFullDashboard() {
    if (!this.metrics) {
      return '📊 正在採集數據...';
    }

    const m = this.metrics;
    const score = this.calculateHealthScore();
    const scoreBar = '█'.repeat(Math.round(score / 5)) + '░'.repeat(20 - Math.round(score / 5));

    let dashboard = `🛡️ **雅典娜完整監控面板 ${VERSION}**\n`;
    dashboard += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    // 硬體狀態
    dashboard += `💻 **硬體狀態**\n`;
    dashboard += `  CPU: ${m.cpu.load1} | 內存: ${m.memory.usedPercent}% | 電池: ${m.battery.level}%\n`;
    dashboard += `  溫度: ${m.thermal.cpuTemp}°C | 磁盤: ${m.storage.usedPercent}% | 網絡: ${m.network.status}\n\n`;

    // 詳細指標
    dashboard += `📊 **詳細指標**\n`;
    dashboard += `  🔷 CPU: 核心 ${m.cpu.cores} | 使用率 ${m.cpu.usage.toFixed(1)}% | 溫度 ${m.thermal.cpuTemp}°C\n`;
    dashboard += `  🔷 內存: ${m.memory.used}MB / ${m.memory.total}MB (${m.memory.usedPercent}%)\n`;
    dashboard += `  🔷 電池: ${m.battery.level}% | 狀態 ${m.battery.status} | 溫度 ${m.battery.temperature}°C\n`;
    dashboard += `  🔷 存儲: ${m.storage.total} (${m.storage.usedPercent}%)\n\n`;

    // 健康評分
    dashboard += `💚 **整體評分：${score}/100**\n`;
    dashboard += `  ${scoreBar}\n\n`;

    // 告警摘要
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
    
    // 立即採集一次
    await this.getHardwareMetrics();
    await this.detectAnomalies();
    
    // 定時採集
    setInterval(() => this.getHardwareMetrics(), 60000); // 60 秒
    setInterval(() => this.detectAnomalies(), 60000);
    setInterval(() => this.getProcessMetrics(), 120000); // 120 秒
  }
}

const monitor = new CompleteMonitoringSystem();

// === 摸魚技能 ===
const SlackerSkills = {
  flashRead: async (text) => {
    const prompt = `請幫我摘要以下內容，僅輸出 3 個精簡重點：\n${text}`;
    const res = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: "llama-3.3-70b-versatile",
      max_tokens: 300
    });
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

// === 指令清單 ===
const HELP = `🛡️ **雅典娜治理官 ${VERSION}**
━━━━━━━━━━━━━━━━━━━━━━━

📊 **完整監控系統**
🔹 /monitor - 完整監控面板（硬體+軟體+健康評分）
🔹 /status - 系統狀態概覽
🔹 /alerts - 查看告警歷史
🔹 /backup - 數據備份

✨ **6 大摸魚技能**
🔹 /sum [文字] - 文本摘要
🔹 /focus [分] - 深度工作計時器
🔹 /note [內容] - 靈魂筆記
🔹 /vibe - 今日運勢
🔹 /slacker - 摸魚建議
🔹 /search [詞] - 聯網搜尋

💬 直接聊天 - 與雅典娜對話

━━━━━━━━━━━━━━━━━━━━━━━`;

// === 指令實作 ===
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
    
    ctx.replyWithMarkdown(`🛡️ **雅典娜狀態**
━━━━━━━━━━
⏱️ 運行: ${h}h
🔋 電池: ${b.percentage}%
📝 記憶: ${m} 筆
✨ 版本: ${VERSION}
💚 評分: ${score}/100`);
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
      messages: [{ 
        role: 'system', 
        content: "給一句溫暖的運勢建議。"
      }],
      model: "llama-3.3-70b-versatile",
      max_tokens: 100
    });
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
    const res = await groq.chat.completions.create({
      messages: [{ role: 'user', content: ctx.message.text }],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 500
    });
    const r = res.choices[0].message.content;
    const h = db.get('history').value() || [];
    h.push({ user: ctx.message.text, bot: r, time: new Date().toISOString() });
    db.set('history', h).write();
    ctx.reply(r);
  } catch (e) {
    ctx.reply("❌ 對話失敗");
  }
});

// === 啟動 ===
const init = async () => {
  console.log(`🚀 雅典娜 ${VERSION} 啟動...`);
  try {
    await bot.telegram.sendMessage(MY_CHAT_ID, 
      `🛡️ **${VERSION} 已就緒**\n✅ 完整監控系統激活\n\n輸入 /help 查看指令`);
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
