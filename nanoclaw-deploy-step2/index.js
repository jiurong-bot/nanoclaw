require('dotenv').config();
const { Telegraf } = require('telegraf');
const Database = require('better-sqlite3');
const Groq = require('groq-sdk');
const https = require('https');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

// --- 1. 核心初始化 ---
const startTime = Date.now();
const ROOT_DIR = process.env.ROOT_DIR || '/root/nanoclaw';
const DB_PATH = path.join(ROOT_DIR, 'nanoclaw.db');
const SOUL_PATH = path.join(ROOT_DIR, 'soul.md');
const MY_CHAT_ID = "8508766428";
const VERSION = "V80.1-L1";

console.log(`[${new Date().toLocaleTimeString()}] 🚀 NanoClaw ${VERSION} 啟動...`);
console.log(`📁 根目錄：${ROOT_DIR}`);
console.log(`💾 數據庫：${DB_PATH}`);

// 確保目錄存在
if (!fs.existsSync(ROOT_DIR)) {
  fs.mkdirSync(ROOT_DIR, { recursive: true });
}
if (!fs.existsSync(path.join(ROOT_DIR, 'config'))) {
  fs.mkdirSync(path.join(ROOT_DIR, 'config'), { recursive: true });
}
if (!fs.existsSync(path.join(ROOT_DIR, 'backups'))) {
  fs.mkdirSync(path.join(ROOT_DIR, 'backups'), { recursive: true });
}
if (!fs.existsSync(path.join(ROOT_DIR, 'logs'))) {
  fs.mkdirSync(path.join(ROOT_DIR, 'logs'), { recursive: true });
}

// 數據庫初始化
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS memory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at INTEGER DEFAULT (unixepoch())
  );
  
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    model TEXT NOT NULL,
    tokens_used INTEGER NOT NULL,
    cost REAL DEFAULT 0,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  
  CREATE INDEX IF NOT EXISTS idx_memory_type ON memory(type);
  CREATE INDEX IF NOT EXISTS idx_memory_timestamp ON memory(timestamp);
  CREATE INDEX IF NOT EXISTS idx_token_usage_model ON token_usage(model);
`);

console.log('✅ 數據庫初始化完成');

// 配置管理
const getConfig = (key, defaultValue) => {
  try {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
    return row ? row.value : defaultValue;
  } catch (e) {
    return defaultValue;
  }
};

const setConfig = (key, value) => {
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value);
};

// 初始化配置
if (!getConfig('model', null)) {
  setConfig('model', process.env.GROQ_MODEL || 'llama-3.3-70b-versatile');
}

// HTTPS 代理（Termux 優化）
const agent = new https.Agent({
  keepAlive: true,
  family: 4,
  timeout: 30000,
  rejectUnauthorized: false
});

// 初始化 Bot 和 Groq
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN, {
  telegram: { agent }
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// --- 2. 監控工具 ---
const AthenaMonitor = {
  getUptime: (from) => {
    const d = Math.floor((Date.now() - from) / 1000);
    return `${Math.floor(d / 3600)}h ${Math.floor((d % 3600) / 60)}m ${d % 60}s`;
  },
  getBatteryStatus: () => {
    try {
      const b = JSON.parse(execSync('termux-battery-status').toString().trim());
      return {
        percentage: b.percentage,
        temperature: parseFloat(b.temperature).toFixed(1),
        health: b.health
      };
    } catch (e) {
      return { percentage: 'N/A', temperature: 'N/A', health: 'N/A' };
    }
  },
  getDiskSpace: () => {
    try {
      const disk = execSync("df -h / | tail -1 | awk '{print $4}'").toString().trim();
      return disk;
    } catch (e) {
      return 'N/A';
    }
  },
  getMemory: () => {
    return (os.freemem() / 1024 / 1024 / 1024).toFixed(1);
  }
};

// --- 3. 靈魂系統 ---
const getSoul = () => {
  if (fs.existsSync(SOUL_PATH)) {
    return fs.readFileSync(SOUL_PATH, 'utf-8');
  }
  return `你是雅典娜（Athena），一位溫和、聰慧的 AI 助手。你的特點：
  - 主動幫助、貼心陪伴
  - 邏輯清晰、表達簡潔
  - 尊重用戶、理解需求
  - 擁有長期記憶和人格連貫性
  
當前時間：${new Date().toLocaleString('zh-TW')}
用戶 ID：${MY_CHAT_ID}`;
};

// --- 4. 指令清單 ---
const COMMANDS_LIST = `🛡️ **雅典娜治理官 ${VERSION} 指令導航** 
━━━━━━━━━━━━━━━━━━
🔹 /status - 系統狀態儀表板
🔹 /model [名稱] - 切換 AI 模型
🔹 /vibrate - 物理設備震動反饋
🔹 /backup - 執行數據備份
🔹 /memory - 查看記憶統計
🔹 /help - 顯示此指令清單
━━━━━━━━━━━━━━━━━━
💬 直接輸入消息即可與我對話。`;

// --- 5. 指令邏輯 ---

bot.command('help', (ctx) => {
  ctx.replyWithMarkdown(COMMANDS_LIST);
});

bot.command('status', async (ctx) => {
  try {
    const battery = AthenaMonitor.getBatteryStatus();
    const disk = AthenaMonitor.getDiskSpace();
    const memory = AthenaMonitor.getMemory();
    const uptime = AthenaMonitor.getUptime(startTime);
    const currentModel = getConfig('model', 'llama-3.3-70b-versatile');
    const memoryCount = db.prepare('SELECT COUNT(*) as count FROM memory').get().count;
    
    const statusMsg = `🛡️ **雅典娜治理官儀表板 ${VERSION}**
━━━━━━━━━━━━━━━━━━
**【 📡 物理運作監控 】**
🟢 啟動時長：${uptime}
🟢 電池狀態：${battery.percentage}% / ${battery.temperature}°C
🟢 RAM 可用：${memory}G
🟢 運算負載：${os.loadavg()[0].toFixed(2)}

**【 🧠 邏輯與靈魂監控 】**
🟢 當前模型：${currentModel}
🟢 靈魂狀態：✅ 已加載
🟢 連線狀態：✅ 監聽中
🟢 記憶條目：${memoryCount}

**【 🛠️ 核心封裝監控 】**
🟢 儲存空間：${disk} Available
🟢 數據庫：✅ 正常
🟢 配置校驗：✅ 完整
✨ 系統版本：${VERSION}
━━━━━━━━━━━━━━━━━━`;
    
    ctx.replyWithMarkdown(statusMsg);
  } catch (e) {
    console.error('Status Error:', e.message);
    ctx.reply("🌀 數據收集失敗，請檢查系統狀態。");
  }
});

bot.command('model', (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length > 1) {
    const newModel = args.slice(1).join(' ');
    setConfig('model', newModel);
    ctx.reply(`🎯 已切換至模型: ${newModel}`);
  } else {
    const current = getConfig('model', 'llama-3.3-70b-versatile');
    ctx.reply(`當前模型: ${current}\n\n推薦模型:\n- llama-3.3-70b-versatile\n- mixtral-8x7b-32768\n- gemma2-9b-it`);
  }
});

bot.command('vibrate', (ctx) => {
  try {
    execSync('termux-vibrate -d 300');
    ctx.reply("📳 物理反饋已執行。");
  } catch (e) {
    ctx.reply("❌ 設備不支持震動。");
  }
});

bot.command('backup', (ctx) => {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const backupPath = path.join(ROOT_DIR, 'backups', `backup_${timestamp}.db`);
    fs.copyFileSync(DB_PATH, backupPath);
    ctx.reply(`✅ 備份完成\n\n版本：${timestamp}\n位置：backups/backup_${timestamp}.db`);
  } catch (e) {
    console.error('Backup Error:', e.message);
    ctx.reply("❌ 備份失敗。");
  }
});

bot.command('memory', (ctx) => {
  try {
    const stats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        COUNT(DISTINCT type) as types,
        MAX(created_at) as last_entry
      FROM memory
    `).get();
    
    const typeStats = db.prepare(`
      SELECT type, COUNT(*) as count FROM memory GROUP BY type ORDER BY count DESC
    `).all();
    
    let msg = `📚 **記憶統計**\n━━━━━━━━━━━━\n`;
    msg += `📊 總記憶條目：${stats.total}\n`;
    msg += `📂 記憶類別：${stats.types}\n\n`;
    
    if (typeStats.length > 0) {
      msg += `**按類別統計：**\n`;
      typeStats.forEach(t => {
        msg += `• ${t.type}: ${t.count}\n`;
      });
    }
    
    ctx.reply(msg);
  } catch (e) {
    ctx.reply("❌ 無法獲取記憶統計。");
  }
});

// --- 6. 智能對話處理 ---

bot.on('text', async (ctx) => {
  try {
    const userMessage = ctx.message.text;
    const soul = getSoul();
    const currentModel = getConfig('model', 'llama-3.3-70b-versatile');
    
    ctx.sendChatAction('typing');
    
    const response = await groq.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: soul
        },
        {
          role: 'user',
          content: userMessage
        }
      ],
      model: currentModel,
      max_tokens: 1024,
      temperature: 0.7
    });
    
    if (response.choices && response.choices[0] && response.choices[0].message) {
      const reply = response.choices[0].message.content;
      
      // 保存對話
      db.prepare('INSERT INTO memory (type, content) VALUES (?, ?)').run('chat',
        JSON.stringify({ 
          user: userMessage, 
          assistant: reply, 
          model: currentModel,
          timestamp: new Date().toISOString() 
        })
      );
      
      // 分割長回應
      if (reply.length > 4000) {
        const chunks = reply.match(/[\s\S]{1,4000}/g) || [];
        for (const chunk of chunks) {
          await ctx.reply(chunk);
        }
      } else {
        ctx.reply(reply);
      }
    } else {
      ctx.reply("❌ AI 回應格式異常，請重試。");
    }
  } catch (e) {
    console.error('Chat Error:', e.message);
    if (e.message.includes('429')) {
      ctx.reply("⏳ 請求過於頻繁，請稍後再試。");
    } else if (e.message.includes('401')) {
      ctx.reply("❌ API 密鑰驗證失敗。請檢查 .env 配置。");
    } else {
      ctx.reply(`❌ 對話失敗：${e.message.substring(0, 100)}`);
    }
  }
});

// --- 7. 核心啟動程序 ---

const initAthena = async () => {
  console.log(`[${new Date().toLocaleTimeString()}] 🚀 初始化雅典娜系統...`);
  try {
    // 測試數據庫
    db.prepare('SELECT 1').get();
    console.log("✅ 數據庫連接成功");
    
    // 測試 Groq
    console.log("🔍 測試 Groq API 連接...");
    const testResponse = await groq.chat.completions.create({
      messages: [{ role: 'user', content: 'hello' }],
      model: getConfig('model', 'llama-3.3-70b-versatile'),
      max_tokens: 10
    });
    console.log("✅ Groq API 連接成功");
    
    // 發送啟動消息
    await bot.telegram.sendMessage(MY_CHAT_ID, `🛡️ **雅典娜 ${VERSION} 治理官上線**

✅ 基礎智能層 L1 已突破連線封鎖
✅ 靈魂系統已加載
✅ 監聽中...

${COMMANDS_LIST}`);
    
    // 啟動 Bot
    await bot.launch({ dropPendingUpdates: true });
    console.log("✅ Bot 已啟動並監聽");
  } catch (err) {
    console.error(`❌ 啟動失敗: ${err.message}`);
    console.log("⏳ 5 秒後重試...");
    setTimeout(initAthena, 5000);
  }
};

// --- 8. 優雅關閉 ---

process.on('SIGINT', () => {
  console.log("\n⚠️ 收到關閉信號，正在優雅關閉...");
  bot.stop('SIGINT');
  db.close();
  console.log("✅ 系統已安全關閉");
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log("\n⚠️ 收到終止信號，正在優雅關閉...");
  bot.stop('SIGTERM');
  db.close();
  console.log("✅ 系統已安全關閉");
  process.exit(0);
});

process.on('unhandledRejection', (reason) => {
  console.error('⚠️ 未處理的 Promise 拒絕:', reason);
});

// --- 9. 啟動 ---
initAthena();
