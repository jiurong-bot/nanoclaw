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

// --- 1. 核心初始化 ---
const startTime = Date.now();
const ROOT_DIR = '/root/nanoclaw';
const STORAGE_PATH = path.join(ROOT_DIR, 'config', 'memory.json');
const SOUL_PATH = path.join(ROOT_DIR, 'soul.md');
const MY_CHAT_ID = "8508766428";
const VERSION = "V81.0-L2-MONITOR";

if (!fs.existsSync(path.dirname(STORAGE_PATH))) {
  fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });
}

const adapter = new FileSync(STORAGE_PATH);
const db = low(adapter);
db.defaults({ 
  history: [], 
  google_tokens: {}, 
  soul_memory: [], 
  stats: { total_tokens: 0 }, 
  config: { model: "llama-3.3-70b-versatile" },
  alerts: []
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

// --- 2. 監控系統 ---

class MonitoringSystem {
  constructor(db, bot, myChartId) {
    this.db = db;
    this.bot = bot;
    this.myChatId = myChartId;
    this.metrics = null;
    this.alerts = [];
    this.samples = [];
    this.thresholds = {
      cpu: 85,
      memory: 90,
      battery: 20,
      temperature: 60,
      disk: 85
    };
    this.lastAlerts = new Map();
  }

  async getHardwareMetrics() {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        cpu: this.getCpuMetrics(),
        memory: this.getMemoryMetrics(),
        battery: this.getBatteryMetrics(),
        disk: this.getDiskMetrics(),
        network: this.getNetworkMetrics(),
        temperature: this.getTemperature()
      };
      
      this.metrics = metrics;
      this.samples.push(metrics);
      
      if (this.samples.length > 100) {
        this.samples.shift();
      }
      
      return metrics;
    } catch (e) {
      console.error('硬體監控錯誤:', e.message);
      return null;
    }
  }

  getCpuMetrics() {
    try {
      const load = os.loadavg();
      return {
        load1: load[0].toFixed(2),
        load5: load[1].toFixed(2),
        load15: load[2].toFixed(2)
      };
    } catch (e) {
      return { load1: 0, load5: 0, load15: 0 };
    }
  }

  getMemoryMetrics() {
    try {
      const total = os.totalmem();
      const free = os.freemem();
      const used = total - free;
      const usedPercent = Math.round((used / total) * 100);
      
      return {
        total: Math.round(total / 1024 / 1024),
        free: Math.round(free / 1024 / 1024),
        used: Math.round(used / 1024 / 1024),
        usedPercent: usedPercent
      };
    } catch (e) {
      return { total: 0, free: 0, used: 0, usedPercent: 0 };
    }
  }

  getBatteryMetrics() {
    try {
      const batteryStatus = JSON.parse(
        execSync('termux-battery-status').toString()
      );
      return {
        percentage: batteryStatus.percentage,
        temperature: parseFloat(batteryStatus.temperature),
        health: batteryStatus.health,
        status: batteryStatus.status
      };
    } catch (e) {
      return { percentage: 0, temperature: 0, health: 'unknown', status: 'unknown' };
    }
  }

  getDiskMetrics() {
    try {
      const output = execSync("df -h / | tail -1 | awk '{print $5}'").toString().trim();
      const usedPercent = parseInt(output);
      
      return {
        usedPercent: usedPercent,
        status: usedPercent > 95 ? '🔴 Critical' : usedPercent > 80 ? '⚠️ Warning' : '✅ OK'
      };
    } catch (e) {
      return { usedPercent: 0, status: '❓' };
    }
  }

  getNetworkMetrics() {
    try {
      execSync('ping -c 1 -W 1 8.8.8.8').toString();
      return { connected: true, status: '🟢' };
    } catch (e) {
      return { connected: false, status: '🔴' };
    }
  }

  getTemperature() {
    try {
      const batteryStatus = JSON.parse(
        execSync('termux-battery-status').toString()
      );
      const temp = parseFloat(batteryStatus.temperature);
      return {
        value: temp,
        status: temp > 60 ? '🔴' : temp > 50 ? '🟠' : '🟢'
      };
    } catch (e) {
      return { value: 0, status: '❓' };
    }
  }

  detectMemoryLeak() {
    if (this.samples.length < 5) {
      return { detected: false, trend: '↔️' };
    }

    const recentSamples = this.samples.slice(-5);
    const memoryTrend = recentSamples.map(s => s.memory.usedPercent);
    
    let rising = 0;
    for (let i = 1; i < memoryTrend.length; i++) {
      if (memoryTrend[i] > memoryTrend[i-1]) rising++;
    }

    const detected = rising >= 4;
    
    return {
      detected: detected,
      trend: detected ? '⚠️ Leak' : '✅',
      rate: detected ? '+' + (memoryTrend[4] - memoryTrend[0]).toFixed(1) + '%' : '穩定'
    };
  }

  checkDependencies() {
    try {
      const essentials = ['telegraf', 'groq-sdk', 'dotenv', 'lowdb', 'axios'];
      const nodeModulesPath = '/root/nanoclaw/node_modules';
      
      let count = 0;
      for (const dep of essentials) {
        if (fs.existsSync(path.join(nodeModulesPath, dep))) {
          count++;
        }
      }
      
      return {
        status: count === essentials.length ? '✅' : '⚠️',
        count: count
      };
    } catch (e) {
      return { status: '❓', count: 0 };
    }
  }

  calculateHealthScore() {
    if (!this.metrics) return 50;

    let score = 100;
    
    if (this.metrics.memory.usedPercent > 80) score -= 20;
    if (this.metrics.cpu.load1 > 2) score -= 10;
    if (this.metrics.battery.percentage < 20) score -= 15;
    if (this.metrics.temperature.value > 55) score -= 10;
    if (!this.metrics.network.connected) score -= 25;

    return Math.max(0, Math.min(100, score));
  }

  generateDashboard() {
    if (!this.metrics) return '📊 暫無數據，請稍候...';

    const m = this.metrics;
    const score = this.calculateHealthScore();
    const scoreBar = '█'.repeat(Math.round(score / 5)) + '░'.repeat(20 - Math.round(score / 5));

    return `🛡️ **雅典娜監控面板 ${VERSION}**
━━━━━━━━━━━━━━━━━━━━━
📊 硬體狀態：
  CPU: ${m.cpu.load1} | 內存: ${m.memory.usedPercent}%
  電池: ${m.battery.percentage}% | 溫度: ${m.temperature.value}°C ${m.temperature.status}
  磁盤: ${m.disk.usedPercent}% ${m.disk.status}
  網絡: ${m.network.status}

💚 整體評分：${score}/100
  ${scoreBar}

⚙️ 系統檢測：
  內存洩漏: ${this.detectMemoryLeak().trend}
  依賴: ${this.checkDependencies().status}
━━━━━━━━━━━━━━━━━━━━━`;
  }

  async checkAndAlert() {
    try {
      const hw = await this.getHardwareMetrics();
      if (!hw) return;

      const alerts = [];

      if (hw.cpu.load1 > 2) {
        alerts.push({ level: 'P2', title: '⚠️ CPU 高', msg: `負載: ${hw.cpu.load1}` });
      }

      if (hw.memory.usedPercent > this.thresholds.memory) {
        alerts.push({ level: 'P1', title: '🔴 內存', msg: `${hw.memory.usedPercent}%` });
      }

      if (hw.battery.percentage < this.thresholds.battery) {
        alerts.push({ level: 'P1', title: '🔋 電池低', msg: `${hw.battery.percentage}%` });
      }

      if (hw.temperature.value > this.thresholds.temperature) {
        alerts.push({ level: 'P0', title: '🌡️ 過熱', msg: `${hw.temperature.value}°C` });
      }

      if (hw.disk.usedPercent > this.thresholds.disk) {
        alerts.push({ level: 'P2', title: '💿 磁盤', msg: `${hw.disk.usedPercent}%` });
      }

      if (!hw.network.connected) {
        alerts.push({ level: 'P0', title: '📡 離線', msg: '無網絡連接' });
      }

      for (const alert of alerts) {
        const key = alert.title;
        const lastTime = this.lastAlerts.get(key);
        
        if (lastTime && Date.now() - lastTime < 30000) {
          continue;
        }

        this.lastAlerts.set(key, Date.now());

        try {
          await this.bot.telegram.sendMessage(this.myChatId, 
            `${alert.title}\n${alert.msg}\n[${alert.level}]`);
          
          const alertRecord = this.db.get('alerts').value() || [];
          alertRecord.push({
            timestamp: new Date().toISOString(),
            ...alert
          });
          this.db.set('alerts', alertRecord).write();
        } catch (e) {
          console.error('告警推送失敗:', e.message);
        }
      }

    } catch (e) {
      console.error('告警檢測錯誤:', e.message);
    }
  }

  async start() {
    console.log('🔍 監控系統已啟動');

    // 立即執行一次
    await this.getHardwareMetrics();
    console.log('✅ 首次監控數據已採集');

    // 設定定時任務
    setInterval(() => this.getHardwareMetrics(), 60000);
    setInterval(() => this.checkDependencies(), 120000);
    setInterval(() => this.checkAndAlert(), 60000);
  }
}

const monitor = new MonitoringSystem(db, bot, MY_CHAT_ID);

// --- 3. 摸魚技能邏輯 ---
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

// --- 4. 治理指令清單 ---
const COMMANDS_LIST = `🛡️ **雅典娜治理官 V81.0-L2 完整指令清單**
━━━━━━━━━━━━━━━━━━━━━━━

📊 **系統監控指令**
🔹 /status - 查看系統狀態儀表板
   └─ 顯示：運行時長、電池、技能狀態、記憶筆數、健康評分

🔹 /monitor - 實時監控面板
   └─ 顯示：CPU負載、內存、電池溫度、磁盤、網絡、健康評分

🔹 /backup - 執行數據備份
   └─ 自動備份所有對話和記憶到備份文件

━━━━━━━━━━━━━━━━━━━━━━━

✨ **Level 2 摸魚技能系統**

🔹 /sum [文字] - 智慧文本摘要
   用法：/sum 你好世界這是一段很長的文章...
   └─ AI 精簡為 3 個關鍵要點

🔹 /focus [分鐘] - 深度工作計時器
   用法：/focus 25（默認 25 分鐘）
   └─ 倒計時結束時設備震動提醒

🔹 /note [內容] - 靈魂筆記（L4 記憶）
   用法：/note 今天很開心，運動了 1 小時
   └─ 永久保存到靈魂記憶數據庫

🔹 /vibe - 今日運勢與壓力檢測
   └─ AI 根據日期生成溫暖運勢和建議

🔹 /slacker - 隨機摸魚建議
   └─ 給你 5 個有趣的休息建議

━━━━━━━━━━━━━━━━━━━━━━━

🌐 **聯網與搜尋**

🔹 /search [關鍵字] - Tavily 聯網搜尋
   用法：/search 台灣天氣預報
   └─ 返回最新的網絡搜尋結果前 3 項

━━━━━━━━━━━━━━━━━━━━━━━

💬 **對話與交互**

🔹 直接輸入任何消息 - 與 AI 對話
   └─ 雅典娜會用 Groq 大模型智能回覆
   └─ 所有對話自動保存到記憶

🔹 /help - 顯示此完整指令清單
   └─ 你現在看的就是！

━━━━━━━━━━━━━━━━━━━━━━━

⚙️ **系統信息**

版本：V81.0-L2-MONITOR
模型：Groq llama-3.3-70b-versatile（可通過 /model 切換）
記憶：低功耗數據庫 (lowdb)
監控：24/7 硬體/軟體/服務監控 + 實時告警

━━━━━━━━━━━━━━━━━━━━━━━

💡 **使用建議**

✅ 每天檢查 /status 監控系統健康度
✅ 重要事項用 /note 保存到靈魂記憶
✅ 工作時用 /focus 啟動計時器
✅ 需要信息時用 /search 聯網查詢
✅ 感覺累時用 /slacker 獲得休息建議
✅ 大量文本用 /sum 快速摘要

━━━━━━━━━━━━━━━━━━━━━━━`;

// --- 5. 指令實作 ---
bot.command('help', (ctx) => {
  ctx.replyWithMarkdown(COMMANDS_LIST);
});

bot.command('monitor', async (ctx) => {
  try {
    // 先採集最新數據
    await monitor.getHardwareMetrics();
    
    // 如果還是沒有數據，返回提示
    if (!monitor.metrics) {
      return ctx.reply('📊 數據採集中，請稍候...');
    }
    
    ctx.reply(monitor.generateDashboard());
  } catch (e) {
    ctx.reply('❌ 監控面板加載失敗');
  }
});

bot.command('status', async (ctx) => {
  try {
    const b = JSON.parse(execSync('termux-battery-status').toString().trim());
    const uptime = Math.floor((Date.now()-startTime)/1000/3600);
    const soulMemory = (db.get('soul_memory').value() || []).length;
    const score = monitor.calculateHealthScore();
    
    const statusMsg = `🛡️ **雅典娜治理官儀表板 ${VERSION}**
━━━━━━━━━━━━━━━━━━
🟢 啟動時長：${uptime}h
🟢 電池狀態：${b.percentage}% / ${b.temperature.toFixed(1)}°C
🟢 技能狀態：✅ L2 已激活
🟢 靈魂記憶：${soulMemory} 筆
✨ 健康評分：${score}/100
━━━━━━━━━━━━━━━━━━`;
    
    ctx.replyWithMarkdown(statusMsg);
  } catch (e) {
    ctx.reply("🌀 數據獲取中...");
  }
});

bot.command('sum', async (ctx) => {
  const text = ctx.message.text.split(' ').slice(1).join(' ');
  if (!text) return ctx.reply("請貼上文字內容，例如：/sum [文章內容]");
  
  ctx.reply("⚡ 正在進行智慧摘要...");
  try {
    const result = await SlackerSkills.flashRead(text);
    ctx.reply(`📝 **摘要結果：**\n\n${result}`);
  } catch (e) {
    ctx.reply("❌ 摘要失敗");
  }
});

bot.command('focus', (ctx) => {
  const min = parseInt(ctx.message.text.split(' ')[1]) || 25;
  SlackerSkills.deepDive(min, ctx);
});

bot.command('note', (ctx) => {
  const content = ctx.message.text.split(' ').slice(1).join(' ');
  if (!content) return ctx.reply("請輸入要記錄的內容。");
  
  const memories = db.get('soul_memory').value() || [];
  memories.push({ 
    content, 
    date: new Date().toLocaleString('zh-TW'), 
    type: 'manual_note' 
  });
  db.set('soul_memory', memories).write();
  ctx.reply("✍️ 已記入 L4 靈魂記憶。");
});

bot.command('vibe', async (ctx) => {
  try {
    const res = await groq.chat.completions.create({
      messages: [{ 
        role: 'system', 
        content: "你是雅典娜，請根據今日日期隨機給主人一段溫暖的運勢、建議與壓力檢測。保持優雅且有韌性。" 
      }],
      model: "llama-3.3-70b-versatile",
      max_tokens: 300
    });
    ctx.reply(`✨ **今日靈魂共振：**\n\n${res.choices[0].message.content}`);
  } catch (e) {
    ctx.reply("❌ 運勢生成失敗");
  }
});

bot.command('slacker', (ctx) => {
  const tips = [
    "站起來喝杯咖啡，這是治理官的強制命令。",
    "看窗外 20 秒，保護您的視覺傳感器。",
    "隨機學習一個冷知識：企鵝其實有膝蓋。",
    "現在適合聽一首 Lo-fi 音樂，讓系統降溫。",
    "深呼吸 3 次，主人，你做得很好。"
  ];
  ctx.reply(`🐟 **摸魚指令：**\n\n${tips[Math.floor(Math.random()*tips.length)]}`);
});

bot.command('search', async (ctx) => {
  const query = ctx.message.text.split(' ').slice(1).join(' ');
  if (!query) return ctx.reply("請輸入搜尋內容");
  
  ctx.reply("🔍 正在聯網搜尋...");
  try {
    const res = await axios.post('https://api.tavily.com/search', {
      api_key: process.env.TAVILY_API_KEY,
      query: query,
      max_results: 3
    });
    
    const results = res.data.results || [];
    if (results.length === 0) {
      return ctx.reply("❌ 未找到結果");
    }
    
    let msg = `🌐 **聯網搜尋結果：**\n\n`;
    results.forEach((r, i) => {
      msg += `${i+1}. **${r.title}**\n${r.url}\n\n`;
    });
    ctx.reply(msg);
  } catch (e) {
    ctx.reply("❌ 搜尋失敗");
  }
});

bot.command('backup', (ctx) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const backupPath = path.join(ROOT_DIR, `backup_${timestamp}.json`);
    const data = db.getState();
    fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
    ctx.reply(`✅ 備份完成：${timestamp}`);
  } catch (e) {
    ctx.reply("❌ 備份失敗");
  }
});

// --- 6. 智能對話 ---
bot.on('text', async (ctx) => {
  try {
    const response = await groq.chat.completions.create({
      messages: [{ role: 'user', content: ctx.message.text }],
      model: db.get('config.model').value() || 'llama-3.3-70b-versatile',
      max_tokens: 500
    });
    
    const reply = response.choices[0].message.content;
    const history = db.get('history').value() || [];
    history.push({ 
      user: ctx.message.text, 
      bot: reply, 
      time: new Date().toISOString() 
    });
    db.set('history', history).write();
    
    ctx.reply(reply);
  } catch (e) {
    console.error('Chat error:', e.message);
    ctx.reply("❌ 對話失敗");
  }
});

// --- 7. 啟動程序 ---
const initAthena = async () => {
  console.log(`[${new Date().toLocaleTimeString()}] 🚀 雅典娜 ${VERSION} 啟動...`);
  try {
    await bot.telegram.sendMessage(MY_CHAT_ID, 
      `🛡️ **雅典娜 ${VERSION} 已就緒**\n\n✅ 監控系統已激活\n✅ L2 生活工作層功能啟動\n\n請輸入 /help 檢閱新技能。`);
    
    await bot.launch({ dropPendingUpdates: true });
    console.log("✅ Bot 已啟動並監聽");

    // 啟動監控系統（現在是 async）
    await monitor.start();

  } catch (err) {
    console.error(`❌ 啟動失敗: ${err.message}`);
    setTimeout(initAthena, 10000);
  }
};

process.on('SIGINT', () => {
  console.log("\n✅ 系統已優雅關閉");
  bot.stop();
  process.exit(0);
});

process.on('unhandledRejection', (e) => {
  console.log('⚠️ 異常攔截:', e.message);
});

initAthena();
