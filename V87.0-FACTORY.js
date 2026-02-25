// V87.0-FACTORY - 自動代碼生成工廠（本地優先版）
// 部署日期：2026-02-25
// 版本：V87.0-FACTORY-L1
// 特色：本地修改 index.js + 自動重啟 + 異步 GitHub 備份

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
const { google } = require('googleapis');
const { OAuth2Client } = require('google-auth-library');

const startTime = Date.now();
const ROOT_DIR = '/root/nanoclaw';
const STORAGE_PATH = path.join(ROOT_DIR, 'config', 'memory.json');
const TOPICS_DIR = path.join('/home/openclaw/.openclaw/workspace/memory/topics');
const INDEX_FILE = path.join(ROOT_DIR, 'index.js');
const MY_CHAT_ID = "8508766428";
const VERSION = "V87.0-FACTORY-L1";

if (!fs.existsSync(path.dirname(STORAGE_PATH))) {
  fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });
}
if (!fs.existsSync(TOPICS_DIR)) {
  fs.mkdirSync(TOPICS_DIR, { recursive: true });
}

const topicFiles = ['06-email-notes.md', '07-schedule-notes.md', '08-meeting-notes.md', '09-project-progress.md', '10-research-notes.md', '11-personal-notes.md', '12-bug-reports.md', '13-storage-sync.md'];
topicFiles.forEach(file => {
  const filePath = path.join(TOPICS_DIR, file);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `# ${file.replace('.md', '')}\n\n`, 'utf8');
  }
});

const adapter = new FileSync(STORAGE_PATH);
const db = low(adapter);
db.defaults({
  history: [],
  soul_memory: [],
  config: { model: "llama-3.3-70b-versatile" },
  alerts: [],
  token_usage: [],
  personality: { big5: { openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, neuroticism: 50 }, speaking_style: 'balanced' },
  google_tokens: null,
  classified_logs: [],
  email_context: null,
  schedule_context: null,
  drive_files_cache: [],
  last_sync: null,
  factory_history: []
}).write();

const agent = new https.Agent({ keepAlive: true, family: 4, timeout: 30000, rejectUnauthorized: false });
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN, { telegram: { agent } });
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

// ===== 自動分類系統 =====
class EnhancedAutoClassifier {
  constructor() {
    this.topics = {
      'hardware': ['mac', 'm5', '購買', '硬體', '電腦', 'chip', 'gpu'],
      'nanoclaw': ['v8', 'v86', 'v87', 'bot', '功能', '命令', 'drive', 'factory'],
      'learning': ['學習', 'python', 'llm', '課程', 'ai'],
      'preferences': ['偏好', '風格', '語言', '時區'],
      'failedencode': ['失敗', '放棄', 'error', 'bug'],
      'workflow': ['流程', '約定', '標準', '部署'],
      'email': ['郵件', 'email', 'gmail'],
      'schedule': ['日程', '行程', '日曆'],
      'meeting': ['會議', '討論', '溝通'],
      'project': ['專案', '進度', '開發'],
      'research': ['研究', '調查', '分析'],
      'personal': ['個人', '生活', '感受'],
      'bug': ['bug', '問題', '異常'],
      'storage': ['雲', 'drive', '備份', '同步']
    };
  }

  detectTopic(text) {
    const lowerText = text.toLowerCase();
    for (const [topic, keywords] of Object.entries(this.topics)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) return topic;
      }
    }
    return 'personal';
  }

  async classifyAndSave(topic, content, category) {
    const topicMap = {
      'hardware': '00-hardware-plan.md', 'nanoclaw': '01-nanoclaw-project.md', 'learning': '02-learning-roadmap.md', 'preferences': '03-preferences.md',
      'failedencode': '04-failed-attempts.md', 'workflow': '05-workflow-rules.md', 'email': '06-email-notes.md', 'schedule': '07-schedule-notes.md',
      'meeting': '08-meeting-notes.md', 'project': '09-project-progress.md', 'research': '10-research-notes.md', 'personal': '11-personal-notes.md',
      'bug': '12-bug-reports.md', 'storage': '13-storage-sync.md'
    };
    const fileName = topicMap[topic];
    if (!fileName) return;
    const filePath = path.join(TOPICS_DIR, fileName);
    try {
      const timestamp = new Date().toLocaleString('zh-TW');
      const entry = `\n[${timestamp}] ${category}\n${content}\n`;
      if (fs.existsSync(filePath)) {
        fs.appendFileSync(filePath, entry, 'utf8');
      }
      const classified = db.get('classified_logs').value() || [];
      classified.push({ timestamp: Date.now(), topic, category });
      db.set('classified_logs', classified.slice(-2000)).write();
    } catch (e) {
      console.log(`[分類] 失敗`);
    }
  }
}

const classifier = new EnhancedAutoClassifier();

// ===== LAYER 1: 需求分析器 =====
class RequirementAnalyzer {
  constructor() {
    this.patterns = {
      new_feature: [/加.*功能|新增|添加/i, /集成|接入/i],
      modify_feature: [/改|修改|調整|更新/i],
      fix_bug: [/修復|修正|解決|bug/i],
      api_integration: [/使用.+api|接入.+服務/i]
    };
  }

  async analyze(requirement) {
    try {
      const res = await groq.chat.completions.create({
        messages: [{
          role: 'user',
          content: `分析這個需求，回傳 JSON：
          需求：${requirement}
          
          回傳格式（ONLY JSON）：
          {
            "type": "new_feature|modify_feature|fix_bug|api_integration",
            "name": "功能英文名稱",
            "description": "功能描述",
            "requires_api": true/false,
            "api_name": "api名稱或null",
            "complexity": "simple|medium|complex"
          }`
        }],
        model: 'llama-3.3-70b-versatile',
        max_tokens: 300
      });

      const text = res.choices[0].message.content;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return {
        type: 'new_feature',
        name: 'unknown',
        description: requirement,
        requires_api: false,
        complexity: 'medium'
      };
    } catch (e) {
      return { type: 'new_feature', name: 'error', description: requirement, complexity: 'medium' };
    }
  }
}

// ===== LAYER 2: 代碼生成器 =====
class CodeGenerator {
  constructor() {
    this.templates = {
      weather: `
// ===== Weather Service =====
class WeatherService {
  constructor() {
    this.apiUrl = 'https://api.open-meteo.com/v1/forecast';
  }

  async getWeather(latitude = 25.0, longitude = 121.5) {
    try {
      const res = await axios.get(this.apiUrl, {
        params: {
          latitude: latitude,
          longitude: longitude,
          current: 'temperature_2m,weather_code,precipitation',
          timezone: 'Asia/Taipei'
        }
      });
      const data = res.data.current;
      return \`🌡️ 溫度：\${data.temperature_2m}°C\n🌧️ 降水：\${data.precipitation}mm\`;
    } catch (e) {
      return '❌ 天氣查詢失敗';
    }
  }
}

const weatherService = new WeatherService();
`,
      time_tracker: `
// ===== Time Tracker Service =====
class TimeTrackerService {
  constructor() {
    this.sessions = [];
  }

  startSession(name) {
    this.sessions.push({ name, start: Date.now() });
    return name;
  }

  endSession() {
    if (this.sessions.length === 0) return null;
    const session = this.sessions.pop();
    const duration = Math.round((Date.now() - session.start) / 1000 / 60);
    return { name: session.name, duration };
  }
}

const timeTracker = new TimeTrackerService();
`,
      reminder: `
// ===== Reminder Service =====
class ReminderService {
  constructor() {
    this.reminders = [];
  }

  addReminder(text, minutesFromNow) {
    const timestamp = Date.now() + minutesFromNow * 60 * 1000;
    this.reminders.push({ text, timestamp });
    return \`✅ 提醒已設置：\${minutesFromNow} 分鐘後\`;
  }

  checkReminders() {
    return this.reminders.filter(r => r.timestamp <= Date.now());
  }
}

const reminderService = new ReminderService();
`
    };
  }

  async generateCode(analysis) {
    if (analysis.type === 'new_feature') {
      const template = this.templates[analysis.name] || this.generateCustomTemplate(analysis);
      return template;
    }
    return '';
  }

  generateCustomTemplate(analysis) {
    return `
// ===== ${analysis.name.toUpperCase()} Service =====
class ${this.capitalize(analysis.name)}Service {
  constructor() {
    // ${analysis.description}
  }
}

const ${analysis.name}Service = new ${this.capitalize(analysis.name)}Service();
`;
  }

  capitalize(str) {
    return str.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
  }
}

// ===== LAYER 3: 代碼整合器 =====
class CodeIntegrator {
  mergeCode(currentCode, newCode, serviceName) {
    // 檢查是否已存在
    if (currentCode.includes(`class ${serviceName.toUpperCase()}Service`)) {
      return currentCode; // 已存在，跳過
    }

    // 找到插入點：在最後一個 "bot.on('text'" 之前
    const insertPoint = currentCode.lastIndexOf("bot.on('text'");
    if (insertPoint === -1) {
      return currentCode + '\n\n' + newCode;
    }

    return currentCode.slice(0, insertPoint) + newCode + '\n\n' + currentCode.slice(insertPoint);
  }

  updateNLPIntent(currentCode, intents) {
    // 在 nlp.intents 中添加新的意圖
    // 簡單版本：直接追加
    return currentCode;
  }

  updateCommandHandler(currentCode, command, handler) {
    // 添加新的 bot.command() 處理器
    const insertPoint = currentCode.lastIndexOf('bot.command');
    if (insertPoint === -1) return currentCode;
    return currentCode + '\n\n' + handler;
  }
}

// ===== LAYER 4: 本地文件修改器 =====
class LocalFileModifier {
  async modifyIndexFile(newCode, serviceName) {
    try {
      const currentCode = fs.readFileSync(INDEX_FILE, 'utf8');
      const integrator = new CodeIntegrator();
      const mergedCode = integrator.mergeCode(currentCode, newCode, serviceName);

      fs.writeFileSync(INDEX_FILE, mergedCode, 'utf8');
      return { success: true, message: '✅ 本地文件已更新' };
    } catch (e) {
      return { success: false, message: `❌ 文件修改失敗：${e.message}` };
    }
  }

  async restartBot() {
    try {
      execSync('pkill -f "node.*index.js"');
      return { success: true, message: '✅ Bot 已停止，將在 5 秒後重啟...' };
    } catch (e) {
      return { success: false, message: `❌ 重啟失敗：${e.message}` };
    }
  }
}

// ===== LAYER 5: GitHub 異步備份 =====
class GitHubBackup {
  async backupAsync(featureName) {
    // 異步執行，不阻塞主流程
    setTimeout(async () => {
      try {
        execSync(`
          cd /home/openclaw/.openclaw/workspace
          cp ${INDEX_FILE} ./releases/V87.0-FACTORY-${Date.now()}.js
          git add -A
          git commit -m "V87.0-FACTORY: 自動生成功能 - ${featureName}"
          git push origin master
        `);
        console.log('✅ GitHub 備份成功');
      } catch (e) {
        console.log('⚠️ GitHub 備份失敗（不影響本地使用）：' + e.message);
      }
    }, 5000);
  }
}

// ===== FACTORY 命令 =====
bot.command('factory', async (ctx) => {
  try {
    const requirement = ctx.message.text.replace('/factory', '').trim();
    
    if (!requirement) {
      return ctx.reply(`🏭 **NanoClaw Code Factory**

用法：/factory [需求描述]

範例：
• /factory 加個天氣功能
• /factory 集成時間追蹤
• /factory 添加提醒系統

說明：我會自動分析、生成、部署新功能！`);
    }

    // 1️⃣ 分析需求
    await ctx.reply('🔍 分析需求中...');
    const analyzer = new RequirementAnalyzer();
    const analysis = await analyzer.analyze(requirement);

    // 2️⃣ 生成代碼
    await ctx.reply('⚙️ 生成代碼中...');
    const generator = new CodeGenerator();
    const newCode = await generator.generateCode(analysis);

    // 3️⃣ 修改本地文件
    await ctx.reply('💾 更新本地文件...');
    const modifier = new LocalFileModifier();
    const modifyResult = await modifier.modifyIndexFile(newCode, analysis.name);

    if (!modifyResult.success) {
      return ctx.reply(modifyResult.message);
    }

    // 4️⃣ 通知重啟
    await ctx.reply('⏳ 正在重啟 Bot（15 秒左右）...');

    // 5️⃣ 自動重啟
    setTimeout(() => {
      execSync('pkill -f "node.*index.js"');
    }, 2000);

    // 6️⃣ 異步備份到 GitHub
    const backup = new GitHubBackup();
    backup.backupAsync(analysis.name);

    // 記錄到 factory_history
    const history = db.get('factory_history').value() || [];
    history.push({
      timestamp: Date.now(),
      requirement,
      analysis,
      status: 'success'
    });
    db.set('factory_history', history).write();

    classifier.classifyAndSave('nanoclaw', `Factory: ${analysis.name} - ${analysis.description}`, 'factory');

  } catch (e) {
    ctx.reply(`❌ 工廠出錯：${e.message}`);
  }
});

bot.command('factory_history', (ctx) => {
  const history = db.get('factory_history').value() || [];
  if (history.length === 0) return ctx.reply('📭 沒有記錄');

  let msg = `📋 **Factory 歷史**\n\n`;
  history.slice(-5).reverse().forEach((item, i) => {
    const time = new Date(item.timestamp).toLocaleString('zh-TW');
    msg += `${i+1}. ${item.analysis.name}\n   需求：${item.requirement}\n   時間：${time}\n\n`;
  });
  ctx.reply(msg);
});

// ===== NLP 意圖識別 =====
class EnhancedNLPIntentDetector {
  constructor() {
    this.intents = {
      drive_list: ['列出', '文件', 'drive', 'list'], drive_search: ['搜尋', '找', 'search'], drive_upload: ['上傳', 'upload'],
      drive_download: ['下載', 'download'], drive_backup: ['備份', 'backup'], drive_sync: ['同步', 'sync'], drive_quota: ['額度', 'quota'],
      email_unread: ['未讀', '郵件', 'email', 'unread'], schedule_today: ['今天', 'today'], schedule_week: ['本週', '週', 'week'],
      sum: ['摘要', '總結'], focus: ['工作', 'focus'], note: ['記', 'note'], vibe: ['運勢', 'vibe'], slacker: ['摸魚', 'slacker'],
      search: ['搜尋', '搜索'], help: ['幫助', 'help'], status: ['狀態', 'status'], monitor: ['監控', 'monitor'], factory: ['工廠', 'factory', '功能']
    };
  }

  detectIntent(text) {
    const lowerText = text.toLowerCase();
    const detectedIntents = [];
    for (const [intent, keywords] of Object.entries(this.intents)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          detectedIntents.push(intent);
          break;
        }
      }
    }
    return detectedIntents.length > 0 ? detectedIntents : null;
  }

  extractKeyword(text) {
    const match = text.match(/[「]?(.{2,20})[」]?[功能]?/);
    return match ? match[1] : null;
  }
}

const nlp = new EnhancedNLPIntentDetector();

// ===== Google OAuth =====
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/oauth2callback'
);

// ===== Google Drive Service =====
class GoogleDriveService {
  constructor() {
    this.drive = null;
    this.calendar = null;
    this.gmail = null;
    this.initialized = false;
    this.tokens = db.get('google_tokens').value();
    if (this.tokens) {
      oauth2Client.setCredentials(this.tokens);
      this.initializeGoogle();
    }
  }

  initializeGoogle() {
    try {
      this.drive = google.drive({ version: 'v3', auth: oauth2Client });
      this.calendar = google.calendar({ version: 'v3', auth: oauth2Client });
      this.gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      this.initialized = true;
      console.log('✅ Google 初始化');
    } catch (e) {
      console.log('⚠️ Google 需要授權');
    }
  }

  getAuthUrl() {
    const scopes = [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.readonly'
    ];
    return oauth2Client.generateAuthUrl({ access_type: 'offline', scope: scopes });
  }

  async listFiles(pageSize = 10) {
    if (!this.initialized) return '❌ Drive 未授權';
    try {
      const res = await this.drive.files.list({
        pageSize: pageSize,
        fields: 'files(id, name, size, modifiedTime)',
        orderBy: 'modifiedTime desc'
      });
      const files = res.data.files || [];
      if (files.length === 0) return '📭 沒有文件';
      let msg = `📁 **Drive 文件**\n\n`;
      files.forEach((file, i) => {
        const size = file.size ? `${Math.round(file.size / 1024)}KB` : '資料夾';
        msg += `${i+1}. ${file.name} (${size})\n`;
      });
      return msg;
    } catch (e) {
      return `❌ 查詢失敗`;
    }
  }

  getStatus() {
    return this.initialized ? '✅ Google 已授權' : '❌ Google 未授權';
  }
}

const googleDrive = new GoogleDriveService();

// ===== 監控系統 =====
class CompleteMonitoringSystem {
  async getHardwareMetrics() {
    const metrics = { timestamp: Date.now(), cpu: {}, memory: {}, battery: {}, network: {} };
    try {
      const load = os.loadavg();
      metrics.cpu = { load1: load[0].toFixed(2) };
    } catch (e) {
      metrics.cpu = { load1: 0 };
    }
    try {
      const total = os.totalmem();
      const used = total - os.freemem();
      metrics.memory = { usedPercent: Math.round((used / total) * 100) };
    } catch (e) {
      metrics.memory = { usedPercent: 0 };
    }
    try {
      const b = JSON.parse(execSync('termux-battery-status').toString().trim());
      metrics.battery = { level: b.percentage || 0 };
    } catch (e) {
      metrics.battery = { level: 0 };
    }
    try {
      execSync('ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1');
      metrics.network = { status: '🟢' };
    } catch (e) {
      metrics.network = { status: '🔴' };
    }
    return metrics;
  }

  async generateFullDashboard() {
    const m = await this.getHardwareMetrics();
    let dashboard = `🛡️ **${VERSION}**\n━━━━━━━━━━\n`;
    dashboard += `CPU: ${m.cpu.load1} | 內存: ${m.memory.usedPercent}%\n`;
    dashboard += `電池: ${m.battery.level}% | 網絡: ${m.network.status}\n`;
    dashboard += `━━━━━━━━━━`;
    return dashboard;
  }
}

const monitor = new CompleteMonitoringSystem();

// ===== Token 監控 =====
class TokenMonitor {
  constructor() {
    this.usage = [];
  }

  recordUsage(inputTokens, outputTokens) {
    const total = inputTokens + outputTokens;
    const cost = (total * 0.05) / 1000000;
    this.usage.push({ timestamp: Date.now(), total, cost });
    const history = db.get('token_usage').value() || [];
    history.push({ timestamp: Date.now(), total, cost });
    db.set('token_usage', history.slice(-10000)).write();
  }

  generateReport() {
    const today = new Date().toDateString();
    const todayUsage = this.usage.filter(u => new Date(u.timestamp).toDateString() === today);
    const totalToday = todayUsage.reduce((sum, u) => sum + u.cost, 0);
    return `💰 **Token 報告**\n今日: $${totalToday.toFixed(4)} / $10.0`;
  }
}

const tokenMonitor = new TokenMonitor();

// ===== 人格系統 =====
class PersonalitySystem {
  constructor() {
    this.personality = db.get('personality').value() || {
      big5: { openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, neuroticism: 50 },
      speaking_style: 'balanced'
    };
  }

  getSystemPrompt() {
    const p = this.personality.big5;
    return `你是雅典娜，NanoClaw 的 AI 核心。可以自動生成代碼並部署功能。`;
  }
}

const personality = new PersonalitySystem();

// ===== 摸魚技能 =====
const SlackerSkills = {
  flashRead: async (text) => {
    const res = await groq.chat.completions.create({
      messages: [{ role: 'user', content: `摘要：${text}` }],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 300
    });
    const usage = res.usage || { prompt_tokens: 0, completion_tokens: 0 };
    tokenMonitor.recordUsage(usage.prompt_tokens, usage.completion_tokens);
    return res.choices[0].message.content;
  },

  deepDive: (minutes, ctx) => {
    ctx.reply(`🚀 開始 ${minutes} 分鐘深度工作...`);
    setTimeout(() => ctx.reply("⏰ 完成！"), minutes * 60000);
  },

  generateVibe: async () => {
    const res = await groq.chat.completions.create({
      messages: [{ role: 'system', content: '給句溫暖建議' }],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 100
    });
    const usage = res.usage || { prompt_tokens: 0, completion_tokens: 0 };
    tokenMonitor.recordUsage(usage.prompt_tokens, usage.completion_tokens);
    return res.choices[0].message.content;
  },

  randomTip: () => {
    const tips = ["☕ 喝杯咖啡", "👀 看窗外", "🎵 聽音樂", "💧 喝點水", "🚶 走一圈"];
    return tips[Math.floor(Math.random() * tips.length)];
  }
};

// ===== 幫助文本 =====
const HELP = `🛡️ **${VERSION} - 代碼生成工廠**
━━━━━━━━━━━━━━━━━━━━━━━

🏭 **代碼工廠**
  /factory [需求] - 自動生成功能
  /factory_history - 生成歷史

📁 **Google Drive**
  /gauth - 授權 | /drive list - 文件 | /drive search - 搜尋

📧 **郵件** | 📅 **日程**
  /emails - 未讀 | /gcal - 日程 | /schedule - 詳情

📊 **系統** | 💰 **成本**
  /monitor - 監控 | /status - 狀態 | /tokens - Token

✨ **技能**
  /sum - 摘要 | /focus - 計時 | /note - 筆記
  /vibe - 運勢 | /slacker - 建議 | /search - 搜尋

💬 **直接對話** （推薦）
  「加天氣功能」「修改監控」

━━━━━━━━━━━━━━━━━━━━━━━`;

// ===== 命令處理 =====
bot.command('help', (ctx) => {
  ctx.reply(HELP);
});

bot.command('gauth', (ctx) => {
  const authUrl = googleDrive.getAuthUrl();
  ctx.reply(`🔐 授權：\n${authUrl}`);
});

bot.command('drive', async (ctx) => {
  const args = ctx.message.text.split(' ');
  const action = args[1];
  let result = '❌ 命令錯誤';
  
  if (action === 'list') {
    result = await googleDrive.listFiles(10);
  }
  
  ctx.reply(result);
});

bot.command('monitor', async (ctx) => {
  const dashboard = await monitor.generateFullDashboard();
  ctx.reply(dashboard);
});

bot.command('status', async (ctx) => {
  ctx.reply(`🛡️ **狀態**\n版本: ${VERSION}\n${googleDrive.getStatus()}`);
});

bot.command('tokens', (ctx) => {
  ctx.reply(tokenMonitor.generateReport());
});

bot.command('sum', async (ctx) => {
  const text = ctx.message.text.split(' ').slice(1).join(' ');
  if (!text) return ctx.reply("用法: /sum [文字]");
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
    const result = await SlackerSkills.generateVibe();
    ctx.reply(`✨ ${result}`);
  } catch (e) {
    ctx.reply("❌ 失敗");
  }
});

bot.command('slacker', (ctx) => {
  ctx.reply(`🐟 ${SlackerSkills.randomTip()}`);
});

bot.command('search', async (ctx) => {
  const q = ctx.message.text.split(' ').slice(1).join(' ');
  if (!q) return ctx.reply("用法: /search [詞]");
  try {
    const res = await axios.post('https://api.tavily.com/search', {
      api_key: process.env.TAVILY_API_KEY,
      query: q,
      max_results: 3
    });
    const r = res.data.results || [];
    if (!r.length) return ctx.reply("❌ 無結果");
    let msg = `🌐 結果:\n`;
    r.forEach((x, i) => { msg += `${i+1}. ${x.title}\n`; });
    ctx.reply(msg);
  } catch (e) {
    ctx.reply("❌ 失敗");
  }
});

// ===== 自然語言對話 =====
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  const intents = nlp.detectIntent(text);
  
  if (intents && intents.includes('factory')) {
    const requirement = nlp.extractKeyword(text);
    if (requirement) {
      return bot.telegram.getMe().then(() => {
        ctx.message.text = `/factory ${requirement}`;
        bot.handleUpdate({ message: ctx.message, update_id: 0 });
      });
    }
  }

  if (intents && intents.length > 0) {
    const intent = intents[0];
    if (intent === 'help') return ctx.reply(HELP);
    if (intent === 'monitor') return ctx.reply(await monitor.generateFullDashboard());
    if (intent === 'status') return ctx.reply(`✅ ${VERSION} 運行中`);
  }

  try {
    const systemPrompt = personality.getSystemPrompt();
    const res = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text }
      ],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 500
    });
    
    const usage = res.usage || { prompt_tokens: 0, completion_tokens: 0 };
    tokenMonitor.recordUsage(usage.prompt_tokens, usage.completion_tokens);
    
    const r = res.choices[0].message.content;
    const h = db.get('history').value() || [];
    h.push({ user: text, bot: r, time: new Date().toISOString() });
    db.set('history', h.slice(-500)).write();
    
    ctx.reply(r);
    
    const topic = classifier.detectTopic(text);
    classifier.classifyAndSave(topic, `用户: ${text}`, '對話');
  } catch (e) {
    ctx.reply("❌ 對話失敗");
  }
});

// ===== 初始化 =====
const init = async () => {
  console.log(`🚀 ${VERSION} 啟動...`);
  try {
    const startup = `🛡️ **${VERSION} 已就緒！**
✅ Code Factory 激活
✅ 自動生成 + 部署
✅ 本地優先架構

輸入 /help 或 /factory [需求]`;
    await bot.telegram.sendMessage(MY_CHAT_ID, startup);
    classifier.classifyAndSave('nanoclaw', startup, '啟動');
    await bot.launch({ dropPendingUpdates: true });
    console.log("✅ Bot 啟動");
  } catch (err) {
    console.error(`❌ ${err.message}`);
    setTimeout(init, 10000);
  }
};

process.on('SIGINT', () => {
  console.log("\n✅ 已關閉");
  bot.stop();
  process.exit(0);
});

init();
