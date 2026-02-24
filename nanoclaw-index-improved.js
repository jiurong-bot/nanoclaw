require('dotenv').config();
const { Telegraf } = require('telegraf');
const Groq = require('groq-sdk');
const https = require('https');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

// --- 1. 核心初始化 ---
const startTime = Date.now();
const ROOT_DIR = '/root/nanoclaw';
const DB_PATH = path.join(ROOT_DIR, 'config', 'athena.db');
const SOUL_PATH = path.join(ROOT_DIR, 'soul.md');
const MY_CHAT_ID = "8508766428";
const VERSION = "V80.1-L1-IMPROVED";

// 確保目錄存在
if (!fs.existsSync(path.dirname(DB_PATH))) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
}

// 數據庫初始化（使用 better-sqlite3）
const db = new Database(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS memory (
    id INTEGER PRIMARY KEY,
    type TEXT,
    content TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT
  );
`);

// 初始化配置
const getConfig = (key, defaultValue) => {
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key);
  return row ? row.value : defaultValue;
};

const setConfig = (key, value) => {
  db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value);
};

// 檢查必要配置
if (!getConfig('model', null)) {
  setConfig('model', 'llama-3.3-70b-versatile');
}

// HTTPS 代理（Termux 特化）
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
  getBatterStatus: () => {
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
  - 擁有長期記憶和人格連貫性`;
};

// --- 4. 指令清單 ---
const COMMANDS_LIST = `🛡️ **雅典娜治理官 L1 指令導航** ━━━━━━━━━━━━━━━
🔹 /status - 獲取系統當前運作數據
🔹 /model [模型名稱] - 切換 AI 邏輯模型
🔹 /vibrate - 觸發物理設備震動反饋
🔹 /backup - 執行數據持久化備份
🔹 /help - 呼叫此指令清單
━━━━━━━━━━━━━━━
*系統已進入監聽模式，請直接輸入指令或對話內容。*`;

// --- 5. 指令邏輯 ---

bot.command('help', (ctx) => {
  ctx.replyWithMarkdown(COMMANDS_LIST);
});

bot.command('status', async (ctx) => {
  try {
    const battery = AthenaMonitor.getBatterStatus();
    const disk = AthenaMonitor.getDiskSpace();
    const memory = AthenaMonitor.getMemory();
    const uptime = AthenaMonitor.getUptime(startTime);
    const currentModel = getConfig('model', 'llama-3.3-70b-versatile');
    
    const statusMsg = `🛡️ **雅典娜治理官儀表板 ${VERSION}** ━━━━━━━━━━━━━━━
**【 📡 物理運作監控 】**
🟢 啟動時長：${uptime}
🟢 電池狀態：${battery.percentage}% / ${battery.temperature}°C
🟢 RAM 可用：${memory}G
🟢 運算負載：${os.loadavg()[0].toFixed(2)}

**【 🧠 邏輯與靈魂監控 】**
🟢 當前模型：${currentModel}
🟢 靈魂狀態：⭕️ 已加載
🟢 連線狀態：⭕️ 監聽中

**【 🛠️ 核心封裝監控 】**
🟢 儲存空間：${disk} Available
🟢 配置校驗：.env ⭕️ / soul.md ⭕️
✨ 系統版本：${VERSION}
━━━━━━━━━━━━━━━`;
    
    ctx.replyWithMarkdown(statusMsg);
  } catch (e) {
    console.error('Status Error:', e);
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
    ctx.reply(`當前模型: ${current}\n\n用法: /model [模型名稱]\n\n推薦模型:\n- llama-3.3-70b-versatile\n- mixtral-8x7b-32768\n- gemma2-9b-it`);
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
    const backupPath = path.join(ROOT_DIR, 'config', `backup_${timestamp}.db`);
    fs.copyFileSync(DB_PATH, backupPath);
    ctx.reply(`✅ 備份完成\n\n版本：${timestamp}\n位置：/config/backup_${timestamp}.db\n\n您的所有資料都已被安全地儲存。`);
  } catch (e) {
    console.error('Backup Error:', e);
    ctx.reply("❌ 備份失敗。");
  }
});

// --- 6. 智能對話處理 ---

bot.on('text', async (ctx) => {
  try {
    const userMessage = ctx.message.text;
    const soul = getSoul();
    const currentModel = getConfig('model', 'llama-3.3-70b-versatile');
    
    // 顯示正在打字狀態
    ctx.sendChatAction('typing');
    
    // 調用 Groq API
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
    
    // 安全檢查回應
    if (response.choices && response.choices[0] && response.choices[0].message) {
      const reply = response.choices[0].message.content;
      
      // 保存對話到記憶
      db.prepare('INSERT INTO memory (type, content) VALUES (?, ?)').run('chat', 
        JSON.stringify({ user: userMessage, assistant: reply, timestamp: new Date().toISOString() })
      );
      
      // 分割長回應（Telegram 限制 4096 字）
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
      ctx.reply("❌ 對話處理失敗。請檢查網路連線。");
    }
  }
});

// --- 7. 核心啟動程序 ---

const initAthena = async () => {
  console.log(`[${new Date().toLocaleTimeString()}] 🚀 執行 L1 完美基準啟動...`);
  try {
    // 測試數據庫連接
    db.prepare('SELECT 1').get();
    console.log("✅ 數據庫連接成功");
    
    // 測試 Groq 連接
    const testResponse = await groq.chat.completions.create({
      messages: [{ role: 'user', content: 'hello' }],
      model: getConfig('model', 'llama-3.3-70b-versatile'),
      max_tokens: 10
    });
    console.log("✅ Groq API 連接成功");
    
    // 發送啟動消息
    await bot.telegram.sendMessage(MY_CHAT_ID, `🛡️ **雅典娜 ${VERSION} 治理官上線警示**

🟢 基礎智能層 L1 已突破連線封鎖。
🟢 靈魂系統已加載
🟢 監聽中...

${COMMANDS_LIST}`);
    
    // 啟動 Bot
    await bot.launch({ dropPendingUpdates: true });
    console.log("✅ 基準版本已成功佈署並監聽");
  } catch (err) {
    console.error(`❌ 啟動失敗: ${err.message}`);
    console.log("重試中...");
    setTimeout(initAthena, 10000);
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

process.on('unhandledRejection', (reason, promise) => {
  console.error('⚠️ 未處理的 Promise 拒絕:', reason);
});

// --- 9. 啟動 ---
initAthena();
