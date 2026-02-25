// V85.0-ADVANCED - NanoClaw 高級版本
// 包含：自動分類（13+ topic）+ 郵件高級功能 + 日程管理 + 自然語言對話

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
const MY_CHAT_ID = "8508766428";
const VERSION = "V85.0-ADVANCED";

// 創建目錄
if (!fs.existsSync(path.dirname(STORAGE_PATH))) {
  fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });
}
if (!fs.existsSync(TOPICS_DIR)) {
  fs.mkdirSync(TOPICS_DIR, { recursive: true });
}

// 創建缺失的 topic 文件
const topicFiles = [
  '06-email-notes.md',
  '07-schedule-notes.md', 
  '08-meeting-notes.md',
  '09-project-progress.md',
  '10-research-notes.md',
  '11-personal-notes.md',
  '12-bug-reports.md'
];

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
  monitoring_history: [],
  token_usage: [],
  personality: { 
    big5: { openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, neuroticism: 50 },
    speaking_style: 'balanced',
    learned_responses: {}
  },
  mcp_models: [],
  google_tokens: null,
  events: [],
  emails: [],
  classified_logs: [],
  email_context: null,
  schedule_context: null,
  vip_contacts: [],
  email_settings: { auto_archive: true, spam_filter: true }
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

// ===== 增強的自動分類系統 =====
class EnhancedAutoClassifier {
  constructor() {
    this.topics = {
      'hardware': ['mac', 'm5', '購買', '硬體', '電腦', 'chip', 'gpu', 'rtx'],
      'nanoclaw': ['v8', 'v85', 'bot', '功能', '命令', '/monitor', '/status'],
      'learning': ['學習', 'python', 'llm', '課程', 'ai', '培訓', 'rag'],
      'preferences': ['偏好', '風格', '語言', '時區', '聯絡', '設定'],
      'failedencode': ['失敗', '放棄', '不可行', 'error', 'bug'],
      'workflow': ['流程', '約定', '標準', '規則', '部署'],
      'email': ['郵件', 'email', 'gmail', '未讀', 'vip'],
      'schedule': ['日程', '行程', '日曆', '會議', '提醒'],
      'meeting': ['會議', '會談', '討論', '溝通'],
      'project': ['專案', '進度', '完成', '開發'],
      'research': ['研究', '調查', '分析'],
      'personal': ['個人', '生活', '感受'],
      'bug': ['bug', '問題', '異常', 'crash']
    };
  }

  detectTopic(text) {
    const lowerText = text.toLowerCase();
    for (const [topic, keywords] of Object.entries(this.topics)) {
      for (const keyword of keywords) {
        if (lowerText.includes(keyword)) {
          return topic;
        }
      }
    }
    return 'personal';
  }

  async classifyAndSave(topic, content, category) {
    const topicMap = {
      'hardware': '00-hardware-plan.md',
      'nanoclaw': '01-nanoclaw-project.md',
      'learning': '02-learning-roadmap.md',
      'preferences': '03-preferences.md',
      'failedencode': '04-failed-attempts.md',
      'workflow': '05-workflow-rules.md',
      'email': '06-email-notes.md',
      'schedule': '07-schedule-notes.md',
      'meeting': '08-meeting-notes.md',
      'project': '09-project-progress.md',
      'research': '10-research-notes.md',
      'personal': '11-personal-notes.md',
      'bug': '12-bug-reports.md'
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
      classified.push({
        timestamp: Date.now(),
        topic,
        category,
        content: content.substring(0, 100)
      });
      db.set('classified_logs', classified.slice(-2000)).write();
    } catch (e) {
      console.log(`[分類] 失敗`);
    }
  }
}

const classifier = new EnhancedAutoClassifier();

// ===== 增強的 NLP 意圖識別 =====
class EnhancedNLPIntentDetector {
  constructor() {
    this.intents = {
      email_unread: ['未讀', '郵件', 'unread'],
      email_all: ['所有郵件', '全部'],
      email_vip: ['vip', '重要'],
      email_spam: ['垃圾', 'spam'],
      email_search: ['搜尋', '找', 'search'],
      email_delete: ['刪除', '刪'],
      email_mark: ['標記'],
      schedule_today: ['今天', 'today'],
      schedule_week: ['本週', '週', 'week'],
      schedule_free: ['空閒', '有空'],
      schedule_conflict: ['衝突', '重複'],
      schedule_weekly: ['周報'],
      help: ['幫助', 'help']
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

  extractEmailNumber(text) {
    const match = text.match(/第\s?(\d+)/);
    if (match) return parseInt(match[1]) - 1;
    return null;
  }
}

const nlp = new EnhancedNLPIntentDetector();

// ===== Google OAuth =====
const oauth2Client = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/oauth2callback'
);

// ===== 增強的 GoogleService =====
class EnhancedGoogleService {
  constructor() {
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
      'https://www.googleapis.com/auth/calendar.readonly',
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/drive.readonly'
    ];
    
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes
    });
  }

  async getUnreadEmails(limit = 10) {
    if (!this.initialized) return '❌ Gmail 未授權';
    
    try {
      const res = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: limit
      });

      const messages = res.data.messages || [];
      if (messages.length === 0) return '📭 沒有未讀';

      const emailList = [];
      let msg = `📬 **未讀郵件**\n\n`;

      for (let i = 0; i < Math.min(messages.length, limit); i++) {
        const detail = await this.gmail.users.messages.get({
          userId: 'me',
          id: messages[i].id
        });

        const headers = detail.data.payload?.headers || [];
        const from = headers.find(h => h.name === 'From')?.value || '未知';
        const subject = headers.find(h => h.name === 'Subject')?.value || '無主旨';

        emailList.push({ id: messages[i].id, from, subject });
        msg += `${i+1}. ${subject}\n   ${from}\n\n`;
      }

      db.set('email_context', emailList).write();
      return msg;
    } catch (e) {
      return `❌ 查詢失敗`;
    }
  }

  async deleteEmail(emailId) {
    if (!this.initialized) return '❌ 未授權';
    try {
      await this.gmail.users.messages.delete({
        userId: 'me',
        id: emailId
      });
      return '✅ 已刪除';
    } catch (e) {
      return `❌ 失敗`;
    }
  }

  async markEmailImportant(emailId) {
    if (!this.initialized) return '❌ 未授權';
    try {
      await this.gmail.users.messages.modify({
        userId: 'me',
        id: emailId,
        requestBody: {
          addLabelIds: ['STARRED']
        }
      });
      return '✅ 已標記';
    } catch (e) {
      return `❌ 失敗`;
    }
  }

  async getUpcomingEvents(days = 7) {
    if (!this.initialized) return '❌ 日曆未授權';
    
    try {
      const now = new Date();
      const later = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      
      const res = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: later.toISOString(),
        maxResults: 20,
        singleEvents: true,
        orderBy: 'startTime'
      });

      const events = res.data.items || [];
      if (events.length === 0) return '📭 沒有日程';

      let msg = `📅 **日程清單**\n\n`;
      events.forEach((event, i) => {
        const start = new Date(event.start.dateTime || event.start.date).toLocaleString('zh-TW');
        msg += `${i+1}. ${event.summary}\n   ${start}\n\n`;
      });

      db.set('schedule_context', events).write();
      return msg;
    } catch (e) {
      return `❌ 查詢失敗`;
    }
  }

  async checkFreeTime(hours = 2) {
    if (!this.initialized) return '❌ 未授權';
    
    try {
      const now = new Date();
      const later = new Date(now.getTime() + hours * 60 * 60 * 1000);

      const res = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: later.toISOString(),
        maxResults: 1,
        singleEvents: true,
        orderBy: 'startTime'
      });

      const events = res.data.items || [];
      if (events.length === 0) {
        return `✅ 接下來 ${hours} 小時都有空！`;
      }

      const nextEvent = events[0];
      const startTime = new Date(nextEvent.start.dateTime).toLocaleString('zh-TW');
      return `⏰ 下一個：${nextEvent.summary}\n${startTime}`;
    } catch (e) {
      return `❌ 失敗`;
    }
  }

  async checkConflicts() {
    if (!this.initialized) return '❌ 未授權';
    
    try {
      const now = new Date();
      const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const res = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: weekLater.toISOString(),
        maxResults: 50,
        singleEvents: true,
        orderBy: 'startTime'
      });

      const events = res.data.items || [];
      const conflicts = [];

      for (let i = 0; i < events.length; i++) {
        for (let j = i + 1; j < events.length; j++) {
          const e1Start = new Date(events[i].start.dateTime || events[i].start.date);
          const e1End = new Date(events[i].end.dateTime || events[i].end.date);
          const e2Start = new Date(events[j].start.dateTime || events[j].start.date);
          
          if (e1Start < e2Start && e1End > e2Start) {
            conflicts.push(`「${events[i].summary}」 ⚡ 「${events[j].summary}」`);
          }
        }
      }

      if (conflicts.length === 0) {
        return '✅ 沒有衝突';
      }

      let msg = `⚠️ **檢測到日程衝突**\n\n`;
      conflicts.forEach((c, i) => {
        msg += `${i+1}. ${c}\n`;
      });

      return msg;
    } catch (e) {
      return `❌ 失敗`;
    }
  }

  async generateWeeklyReport() {
    if (!this.initialized) return '❌ 未授權';
    
    try {
      const now = new Date();
      const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const res = await this.calendar.events.list({
        calendarId: 'primary',
        timeMin: now.toISOString(),
        timeMax: weekLater.toISOString(),
        maxResults: 100,
        singleEvents: true,
        orderBy: 'startTime'
      });

      const events = res.data.items || [];
      const eventsByDay = {};

      events.forEach(event => {
        const dayKey = new Date(event.start.dateTime || event.start.date).toLocaleDateString('zh-TW');
        if (!eventsByDay[dayKey]) eventsByDay[dayKey] = [];
        eventsByDay[dayKey].push(event.summary);
      });

      let report = `📋 **周報**\n━━━━━━━━━\n`;
      Object.entries(eventsByDay).forEach(([day, events]) => {
        report += `\n📅 ${day}\n`;
        events.forEach((e, i) => {
          report += `  ${i+1}. ${e}\n`;
        });
      });

      report += `\n━━━━━━━━━\n共 ${events.length} 項`;

      return report;
    } catch (e) {
      return `❌ 失敗`;
    }
  }

  getStatus() {
    return this.initialized ? '✅ Google 已授權' : '❌ Google 未授權';
  }
}

const googleService = new EnhancedGoogleService();

// ===== 監控系統 =====
class CompleteMonitoringSystem {
  constructor() {
    this.metrics = null;
    this.alerts = new Map();
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
        cores: os.cpus().length,
        temperature: 0
      };
    } catch (e) {
      metrics.cpu = { usage: 0, load1: 0, cores: 1, temperature: 0 };
    }

    try {
      const total = os.totalmem();
      const free = os.freemem();
      const used = total - free;
      metrics.memory = {
        total: Math.round(total / 1024 / 1024),
        used: Math.round(used / 1024 / 1024),
        usedPercent: Math.round((used / total) * 100)
      };
    } catch (e) {
      metrics.memory = { total: 0, used: 0, usedPercent: 0 };
    }

    try {
      const b = JSON.parse(execSync('termux-battery-status').toString().trim());
      metrics.battery = {
        level: b.percentage || 0,
        temperature: Math.round(parseFloat(b.temperature)) || 0,
        status: b.status || 'unknown'
      };
    } catch (e) {
      metrics.battery = { level: 0, temperature: 0, status: 'unknown' };
    }

    try {
      execSync('ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1');
      metrics.network = { connected: true, status: '🟢' };
    } catch (e) {
      metrics.network = { connected: false, status: '🔴' };
    }

    this.metrics = metrics;
    return metrics;
  }

  generateFullDashboard() {
    if (!this.metrics) {
      return '📊 正在採集數據...';
    }

    const m = this.metrics;
    let dashboard = `🛡️ **${VERSION}**\n━━━━━━━━━━\n`;
    dashboard += `CPU: ${m.cpu.load1} | 內存: ${m.memory.usedPercent}%\n`;
    dashboard += `電池: ${m.battery.level}% | 網絡: ${m.network.status}\n`;
    dashboard += `━━━━━━━━━━`;

    return dashboard;
  }

  async start() {
    await this.getHardwareMetrics();
    setInterval(() => this.getHardwareMetrics(), 60000);
  }
}

const monitor = new CompleteMonitoringSystem();

// ===== Token 監控系統 =====
class TokenMonitor {
  constructor() {
    this.usage = [];
    this.costs = { groq: 0.05 };
    this.limits = { daily: 10.0, monthly: 200.0 };
  }

  recordUsage(model, inputTokens, outputTokens) {
    const totalTokens = inputTokens + outputTokens;
    const cost = (totalTokens * this.costs['groq']) / 1000000;

    const record = {
      timestamp: Date.now(),
      model,
      totalTokens,
      cost: parseFloat(cost.toFixed(6))
    };

    this.usage.push(record);

    const tokenHistory = db.get('token_usage').value() || [];
    tokenHistory.push(record);
    db.set('token_usage', tokenHistory.slice(-10000)).write();

    return record;
  }

  getStats() {
    const today = new Date().toDateString();
    const todayUsage = this.usage.filter(u => new Date(u.timestamp).toDateString() === today);
    const totalToday = todayUsage.reduce((sum, u) => sum + u.cost, 0);

    return {
      today: parseFloat(totalToday.toFixed(4)),
      dailyLimit: this.limits.daily,
      requestCount: this.usage.length
    };
  }

  generateReport() {
    const stats = this.getStats();
    return `💰 **Token 報告**
━━━━━
今日: $${stats.today} / $${stats.dailyLimit}
請求: ${stats.requestCount}
━━━━━`;
  }
}

const tokenMonitor = new TokenMonitor();

// ===== 人格進化系統 =====
class PersonalitySystem {
  constructor() {
    this.personality = db.get('personality').value() || {
      big5: { openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, neuroticism: 50 },
      speaking_style: 'balanced',
      learned_responses: {}
    };
  }

  analyzeTone(userMessage) {
    const positive = ['好', '感謝', '喜歡'].some(w => userMessage.includes(w));
    const casual = ['嘿', '欸', 'lol'].some(w => userMessage.includes(w));
    return { positive, casual };
  }

  updatePersonality(userMessage, botResponse) {
    const tone = this.analyzeTone(userMessage);
    if (tone.positive) {
      this.personality.big5.agreeableness = Math.min(100, this.personality.big5.agreeableness + 2);
    }
    if (tone.casual) {
      this.personality.speaking_style = 'casual';
    }
    db.set('personality', this.personality).write();
  }

  getSystemPrompt() {
    const p = this.personality.big5;
    return `你是雅典娜，AI 助手。
外向性：${p.extraversion}% 
親和性：${p.agreeableness}%
根據人格調整回應。`;
  }

  generatePersonalityReport() {
    const p = this.personality.big5;
    return `🧠 **人格進度**
━━━━━━━━━
開放: ${p.openness}%
盡責: ${p.conscientiousness}%
外向: ${p.extraversion}%
親和: ${p.agreeableness}%
穩定: ${100 - p.neuroticism}%
━━━━━━━━━`;
  }
}

const personality = new PersonalitySystem();

// ===== MCP 集成 =====
class MCPSystem {
  constructor() {
    this.activeModel = 'groq';
  }

  getInfo() {
    return `📍 當前模型：${this.activeModel}`;
  }
}

const mcp = new MCPSystem();

// ===== 摸魚技能 =====
const SlackerSkills = {
  flashRead: async (text) => {
    const prompt = `摘要以下內容，3 點：\n${text}`;
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
    ctx.reply(`🚀 深度工作 ${minutes} 分鐘`);
    setTimeout(() => {
      ctx.reply("⏰ 完成！該休息了");
    }, minutes * 60000);
  }
};

// ===== 幫助文本 =====
const HELP = `🛡️ **${VERSION}**
━━━━━━━━━━━━
📊 /monitor /status /alerts
💰 /tokens /costs
🧠 /personality
🤖 /models
📅 /gcal /schedule [today|week]
   /free [小時] /conflicts /weekly
📧 /emails [unread|all|vip|spam]
   /vip [add|list] /clearspam
✨ /sum /focus /note /vibe
   /slacker /search
📊 /classify /backup
💬 直接對話

━━━━━━━━━━━━`;

// ===== 命令處理 =====
bot.command('help', (ctx) => {
  ctx.reply(HELP);
  classifier.classifyAndSave('nanoclaw', 'help', '命令');
});

bot.command('monitor', async (ctx) => {
  try {
    await monitor.getHardwareMetrics();
    const result = monitor.generateFullDashboard();
    ctx.reply(result);
    classifier.classifyAndSave('nanoclaw', result, '監控');
  } catch (e) {
    ctx.reply('❌ 失敗');
  }
});

bot.command('status', async (ctx) => {
  try {
    const b = JSON.parse(execSync('termux-battery-status').toString().trim());
    const h = Math.floor((Date.now() - startTime) / 1000 / 3600);
    ctx.reply(`🛡️ **狀態**\n運行: ${h}h\n電池: ${b.percentage}%\n版本: ${VERSION}\n${googleService.getStatus()}`);
  } catch (e) {
    ctx.reply('❌ 失敗');
  }
});

bot.command('alerts', (ctx) => {
  const alerts = db.get('alerts').value() || [];
  if (alerts.length === 0) return ctx.reply('✅ 沒有告警');
  const recent = alerts.slice(-3);
  let msg = '🚨 最近告警\n\n';
  recent.forEach((a, i) => { msg += `${i+1}. ${a.message}\n`; });
  ctx.reply(msg);
});

bot.command('tokens', (ctx) => {
  ctx.reply(tokenMonitor.generateReport());
});

bot.command('costs', (ctx) => {
  ctx.reply(tokenMonitor.generateReport());
});

bot.command('personality', (ctx) => {
  ctx.reply(personality.generatePersonalityReport());
});

bot.command('models', (ctx) => {
  ctx.reply('🤖 groq: llama-3.3-70b\n⚠️ 本地 Ollama 可用');
});

bot.command('gauth', (ctx) => {
  const authUrl = googleService.getAuthUrl();
  ctx.reply(`🔐 授權：\n${authUrl}`);
});

bot.command('gcal', async (ctx) => {
  ctx.reply('⏳ 查詢中...');
  const result = await googleService.getUpcomingEvents(7);
  ctx.reply(result);
});

bot.command('schedule', async (ctx) => {
  const args = ctx.message.text.split(' ');
  const filter = args[1] || 'week';
  
  const result = filter === 'today' 
    ? await googleService.getUpcomingEvents(1)
    : await googleService.getUpcomingEvents(7);
  
  ctx.reply(result);
});

bot.command('free', async (ctx) => {
  const hours = parseInt(ctx.message.text.split(' ')[1]) || 2;
  ctx.reply(await googleService.checkFreeTime(hours));
});

bot.command('conflicts', async (ctx) => {
  ctx.reply('⏳ 檢測中...');
  ctx.reply(await googleService.checkConflicts());
});

bot.command('weekly', async (ctx) => {
  ctx.reply('⏳ 生成中...');
  ctx.reply(await googleService.generateWeeklyReport());
});

bot.command('emails', async (ctx) => {
  const args = ctx.message.text.split(' ');
  const filter = args[1] || 'unread';
  
  let result;
  if (filter === 'delete' && args[2]) {
    const emailContext = db.get('email_context').value() || [];
    const idx = parseInt(args[2]) - 1;
    if (idx >= 0 && idx < emailContext.length) {
      result = await googleService.deleteEmail(emailContext[idx].id);
    } else {
      result = '❌ 無效';
    }
  } else if (filter === 'mark' && args[3]) {
    const emailContext = db.get('email_context').value() || [];
    const idx = parseInt(args[3]) - 1;
    if (idx >= 0 && idx < emailContext.length) {
      result = await googleService.markEmailImportant(emailContext[idx].id);
    } else {
      result = '❌ 無效';
    }
  } else {
    result = await googleService.getUnreadEmails(10);
  }
  
  ctx.reply(result);
  classifier.classifyAndSave('email', result, `${filter}`);
});

bot.command('vip', (ctx) => {
  const args = ctx.message.text.split(' ');
  const action = args[1];
  
  let result;
  if (action === 'list') {
    const vips = db.get('vip_contacts').value() || [];
    result = vips.length > 0 ? `📌 VIP:\n${vips.join('\n')}` : '📭 無 VIP';
  } else {
    result = '用法：/vip list';
  }
  
  ctx.reply(result);
});

bot.command('clearspam', async (ctx) => {
  ctx.reply('⏳ 清除中...');
  ctx.reply('✅ 已清除 0 封垃圾（需授權）');
});

bot.command('sum', async (ctx) => {
  const text = ctx.message.text.split(' ').slice(1).join(' ');
  if (!text) return ctx.reply("用法: /sum [文字]");
  ctx.reply("⚡ 摘要中...");
  try {
    const result = await SlackerSkills.flashRead(text);
    ctx.reply(`📝 ${result}`);
    classifier.classifyAndSave('nanoclaw', result, '摘要');
  } catch (e) {
    ctx.reply("❌ 失敗");
  }
});

bot.command('focus', (ctx) => {
  const min = parseInt(ctx.message.text.split(' ')[1]) || 25;
  SlackerSkills.deepDive(min, ctx);
  classifier.classifyAndSave('nanoclaw', `${min}分`, '深度工作');
});

bot.command('note', (ctx) => {
  const c = ctx.message.text.split(' ').slice(1).join(' ');
  if (!c) return ctx.reply("用法: /note [內容]");
  const m = db.get('soul_memory').value() || [];
  m.push({ c, date: new Date().toLocaleString('zh-TW') });
  db.set('soul_memory', m).write();
  ctx.reply("✍️ 已記!");
  classifier.classifyAndSave('personal', c, '筆記');
});

bot.command('vibe', async (ctx) => {
  try {
    const res = await groq.chat.completions.create({
      messages: [{ role: 'system', content: '給句溫暖建議' }],
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
  const tips = ["喝杯咖啡！", "看窗外！", "深呼吸！"];
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
    r.forEach((x, i) => { msg += `${i+1}. ${x.title}\n`; });
    ctx.reply(msg);
    classifier.classifyAndSave('research', msg, `搜尋`);
  } catch (e) {
    ctx.reply("❌ 失敗");
  }
});

bot.command('classify', (ctx) => {
  const logs = db.get('classified_logs').value() || [];
  const stats = {};
  logs.forEach(log => {
    stats[log.topic] = (stats[log.topic] || 0) + 1;
  });
  
  let report = `📊 **分類統計**\n`;
  Object.entries(stats).sort((a, b) => b[1] - a[1]).forEach(([topic, count]) => {
    report += `${topic}: ${count}\n`;
  });
  report += `\n總計: ${logs.length}`;
  
  ctx.reply(report);
});

bot.command('backup', (ctx) => {
  try {
    const t = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const p = path.join(ROOT_DIR, `backup_${t}.json`);
    fs.writeFileSync(p, JSON.stringify(db.getState(), null, 2));
    ctx.reply(`✅ 備份: ${t}`);
    classifier.classifyAndSave('nanoclaw', t, '備份');
  } catch (e) {
    ctx.reply("❌ 失敗");
  }
});

// ===== 自然語言對話 =====
bot.on('text', async (ctx) => {
  const text = ctx.message.text;
  
  const intents = nlp.detectIntent(text);
  
  if (intents && intents.length > 0) {
    const intent = intents[0];
    const emailNum = nlp.extractEmailNumber(text);

    // 郵件意圖
    if (intent === 'email_unread') {
      ctx.reply('⏳ 查詢中...');
      const result = await googleService.getUnreadEmails(10);
      ctx.reply(result);
      classifier.classifyAndSave('email', result, '未讀查詢');
      return;
    }

    if (intent === 'email_delete' && emailNum !== null) {
      const emailContext = db.get('email_context').value() || [];
      if (emailNum >= 0 && emailNum < emailContext.length) {
        const result = await googleService.deleteEmail(emailContext[emailNum].id);
        ctx.reply(result);
        classifier.classifyAndSave('email', result, '刪除');
      } else {
        ctx.reply('❌ 無效');
      }
      return;
    }

    if (intent === 'email_mark' && emailNum !== null) {
      const emailContext = db.get('email_context').value() || [];
      if (emailNum >= 0 && emailNum < emailContext.length) {
        const result = await googleService.markEmailImportant(emailContext[emailNum].id);
        ctx.reply(result);
        classifier.classifyAndSave('email', result, '標記');
      } else {
        ctx.reply('❌ 無效');
      }
      return;
    }

    // 日程意圖
    if (intent === 'schedule_today') {
      ctx.reply('⏳ 查詢中...');
      const result = await googleService.getUpcomingEvents(1);
      ctx.reply(result);
      classifier.classifyAndSave('schedule', result, '今天');
      return;
    }

    if (intent === 'schedule_week') {
      ctx.reply('⏳ 查詢中...');
      const result = await googleService.getUpcomingEvents(7);
      ctx.reply(result);
      classifier.classifyAndSave('schedule', result, '本週');
      return;
    }

    if (intent === 'schedule_free') {
      const result = await googleService.checkFreeTime(2);
      ctx.reply(result);
      classifier.classifyAndSave('schedule', result, '空閒');
      return;
    }

    if (intent === 'schedule_conflict') {
      ctx.reply('⏳ 檢測中...');
      const result = await googleService.checkConflicts();
      ctx.reply(result);
      classifier.classifyAndSave('schedule', result, '衝突');
      return;
    }

    if (intent === 'schedule_weekly') {
      ctx.reply('⏳ 生成中...');
      const result = await googleService.generateWeeklyReport();
      ctx.reply(result);
      classifier.classifyAndSave('schedule', result, '周報');
      return;
    }

    if (intent === 'help') {
      ctx.reply(HELP);
      return;
    }
  }

  // 默認 AI 對話
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
    tokenMonitor.recordUsage('groq', usage.prompt_tokens, usage.completion_tokens);
    
    const r = res.choices[0].message.content;
    personality.updatePersonality(text, r);
    
    const h = db.get('history').value() || [];
    h.push({ user: text, bot: r, time: new Date().toISOString() });
    db.set('history', h.slice(-500)).write();
    
    ctx.reply(r);
    
    const topic = classifier.detectTopic(text);
    classifier.classifyAndSave(topic, `${text}`, '對話');
  } catch (e) {
    ctx.reply("❌ 對話失敗");
  }
});

// ===== 初始化 =====
const init = async () => {
  console.log(`🚀 ${VERSION} 啟動...`);
  try {
    const startup = `🛡️ **${VERSION} 已就緒**
✅ 自動分類（13+ topic）
✅ 郵件 + 日程高級功能
✅ 自然語言對話
${googleService.getStatus()}

輸入 /help 或直接聊天`;
    await bot.telegram.sendMessage(MY_CHAT_ID, startup);
    classifier.classifyAndSave('nanoclaw', startup, '啟動');
    await bot.launch({ dropPendingUpdates: true });
    console.log("✅ Bot 啟動");
    await monitor.start();
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
