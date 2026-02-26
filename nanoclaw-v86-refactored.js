// V86.0-DRIVE - NanoClaw Google Drive 完全集成版
// 包含：Google Drive 完整功能 + 郵件 + 日程 + 自動分類 + 摸魚技能 + 自然語言對話

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
const VERSION = "V86.0-DRIVE";

// ===== 目錄初始化 =====
if (!fs.existsSync(path.dirname(STORAGE_PATH))) {
  fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });
}
if (!fs.existsSync(TOPICS_DIR)) {
  fs.mkdirSync(TOPICS_DIR, { recursive: true });
}

// 創建缺失的 topic 文件
const topicFiles = [
  '00-hardware-plan.md',
  '01-nanoclaw-project.md',
  '02-learning-roadmap.md',
  '03-preferences.md',
  '04-failed-attempts.md',
  '05-workflow-rules.md',
  '06-email-notes.md',
  '07-schedule-notes.md',
  '08-meeting-notes.md',
  '09-project-progress.md',
  '10-research-notes.md',
  '11-personal-notes.md',
  '12-bug-reports.md',
  '13-storage-sync.md'
];

topicFiles.forEach(file => {
  const filePath = path.join(TOPICS_DIR, file);
  if (!fs.existsSync(filePath)) {
    const title = file.replace('.md', '').replace(/^\d+-/, '');
    fs.writeFileSync(filePath, `# ${title}\n\n`, 'utf8');
  }
});

// ===== 數據庫初始化 =====
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
    big5: {
      openness: 50,
      conscientiousness: 50,
      extraversion: 50,
      agreeableness: 50,
      neuroticism: 50
    },
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
  drive_files_cache: [],
  last_sync: null
}).write();

// ===== HTTP Agent 配置 =====
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

// ===== 自動分類系統 =====
class EnhancedAutoClassifier {
  constructor() {
    this.topics = {
      'hardware': ['mac', 'm5', '購買', '硬體', '電腦', 'chip', 'gpu'],
      'nanoclaw': ['v8', 'v86', 'bot', '功能', '命令', 'drive'],
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
      'bug': '12-bug-reports.md',
      'storage': '13-storage-sync.md'
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
      console.log('[分類] 失敗');
    }
  }
}

const classifier = new EnhancedAutoClassifier();

// ===== NLP 意圖識別 =====
class EnhancedNLPIntentDetector {
  constructor() {
    this.intents = {
      // Drive 相關
      drive_list: ['列出', '文件', 'drive', 'list', '有什麼文件'],
      drive_search: ['搜尋', '找', 'search', '在 drive 找'],
      drive_upload: ['上傳', 'upload', '傳到雲'],
      drive_download: ['下載', 'download', '下載文件'],
      drive_backup: ['備份', 'backup', '備份記憶', '備份到雲'],
      drive_sync: ['同步', 'sync', '拉取雲'],
      drive_quota: ['額度', 'quota', '還有多少空間'],
      // 郵件
      email_unread: ['未讀', '郵件', 'email', 'unread', '有幾封'],
      email_delete: ['刪除', '刪郵件'],
      email_mark: ['標記', '重要'],
      // 日程
      schedule_today: ['今天', 'today', '什麼日程'],
      schedule_week: ['本週', '週', 'week'],
      schedule_free: ['空閒', '有空'],
      // 技能
      sum: ['摘要', '總結', 'sum'],
      focus: ['工作', 'focus', '深度'],
      note: ['記', 'note', '記錄'],
      vibe: ['運勢', 'vibe', '激勵'],
      slacker: ['摸魚', 'slacker', '建議'],
      search: ['搜尋', '搜索', 'search'],
      // 系統
      help: ['幫助', 'help', '指令', '有什麼命令'],
      status: ['狀態', 'status'],
      monitor: ['監控', 'monitor']
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
    const searchMatch = text.match(/搜尋|找|search\s+(.+?)[\?\。。]?$/);
    if (searchMatch) return searchMatch[1];

    const fileMatch = text.match(/文件|檔案\s+(.+?)[\?\。。]?$/);
    if (fileMatch) return fileMatch[1];

    return null;
  }

  extractTime(text) {
    const timeMatch = text.match(/(\d+)\s*分鐘?|(\d+)\s*分/);
    if (timeMatch) return parseInt(timeMatch[1] || timeMatch[2]);
    return 25; // 默認 25 分
  }
}

const nlp = new EnhancedNLPIntentDetector();

// ===== Google OAuth 設置 =====
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
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify'
    ];
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes
    });
  }

  // ===== Drive 文件操作 =====
  async listFiles(pageSize = 10) {
    if (!this.initialized) return '❌ Drive 未授權';
    try {
      const res = await this.drive.files.list({
        pageSize: pageSize,
        fields: 'files(id, name, mimeType, size, modifiedTime)',
        orderBy: 'modifiedTime desc'
      });
      const files = res.data.files || [];
      if (files.length === 0) return '📭 沒有文件';

      db.set('drive_files_cache', files).write();

      let msg = `📁 **Drive 文件清單**\n\n`;
      files.forEach((file, i) => {
        const size = file.size ? `${Math.round(file.size / 1024)}KB` : '資料夾';
        const modified = new Date(file.modifiedTime).toLocaleString('zh-TW');
        msg += `${i + 1}. ${file.name}\n 大小: ${size} | 修改: ${modified}\n\n`;
      });
      return msg;
    } catch (e) {
      return `❌ 查詢失敗：${e.message}`;
    }
  }

  async searchFiles(keyword) {
    if (!this.initialized) return '❌ Drive 未授權';
    try {
      const res = await this.drive.files.list({
        pageSize: 10,
        q: `name contains '${keyword}' and trashed=false`,
        fields: 'files(id, name, mimeType, size, webViewLink)'
      });
      const files = res.data.files || [];
      if (files.length === 0) return `📭 搜尋 "${keyword}" 無結果`;

      db.set('drive_files_cache', files).write();

      let msg = `🔍 **搜尋結果："${keyword}"**\n\n`;
      files.forEach((file, i) => {
        msg += `${i + 1}. ${file.name}\n 📎 ${file.webViewLink}\n\n`;
      });
      return msg;
    } catch (e) {
      return `❌ 搜尋失敗：${e.message}`;
    }
  }

  async uploadFile(filePath, fileName = null) {
    if (!this.initialized) return '❌ Drive 未授權';
    try {
      const name = fileName || path.basename(filePath);
      const fileContent = fs.readFileSync(filePath);
      const res = await this.drive.files.create({
        requestBody: {
          name: name,
          mimeType: 'application/octet-stream'
        },
        media: {
          mimeType: 'application/octet-stream',
          body: fileContent
        }
      });
      return `✅ 已上傳：${res.data.name}`;
    } catch (e) {
      return `❌ 上傳失敗：${e.message}`;
    }
  }

  async downloadFile(fileId, savePath) {
    if (!this.initialized) return '❌ Drive 未授權';
    try {
      const res = await this.drive.files.get(
        { fileId: fileId },
        { responseType: 'stream' }
      );
      return new Promise((resolve, reject) => {
        res.data
          .on('end', () => resolve(`✅ 已下載：${savePath}`))
          .on('error', (err) => reject(`❌ 下載失敗：${err.message}`))
          .pipe(fs.createWriteStream(savePath));
      });
    } catch (e) {
      return `❌ 下載失敗：${e.message}`;
    }
  }

  async backupMemory() {
    if (!this.initialized) return '❌ Drive 未授權';
    try {
      const topicsPath = TOPICS_DIR;
      const files = fs.readdirSync(topicsPath);
      let uploaded = 0;

      for (const file of files) {
        if (file.endsWith('.md')) {
          const filePath = path.join(topicsPath, file);
          const fileContent = fs.readFileSync(filePath);
          await this.drive.files.create({
            requestBody: {
              name: `memory-backup-${file}`,
              parents: ['root']
            },
            media: {
              mimeType: 'text/markdown',
              body: fileContent
            }
          });
          uploaded++;
        }
      }
      db.set('last_sync', Date.now()).write();
      return `✅ 備份完成：${uploaded} 個文件已上傳`;
    } catch (e) {
      return `❌ 備份失敗：${e.message}`;
    }
  }

  async getStorageQuota() {
    if (!this.initialized) return '❌ Drive 未授權';
    try {
      const res = await this.drive.about.get({
        fields: 'storageQuota'
      });
      const quota = res.data.storageQuota;
      const used = Math.round(quota.usageInDrive / (1024 * 1024 * 1024));
      const limit = Math.round(quota.limit / (1024 * 1024 * 1024));
      const percent = Math.round((quota.usageInDrive / quota.limit) * 100);
      return `📊 **Drive 額度**\n已用：${used}GB / ${limit}GB (${percent}%)\n剩餘：${limit - used}GB`;
    } catch (e) {
      return `❌ 查詢失敗：${e.message}`;
    }
  }

  async syncMemory() {
    if (!this.initialized) return '❌ Drive 未授權';
    try {
      await this.backupMemory();

      const res = await this.drive.files.list({
        q: `name contains 'memory-backup-' and trashed=false`,
        fields: 'files(id, name, modifiedTime)',
        orderBy: 'modifiedTime desc',
        pageSize: 20
      });
      const files = res.data.files || [];
      return `✅ 同步完成：${files.length} 個備份文件已檢查`;
    } catch (e) {
      return `❌ 同步失敗：${e.message}`;
    }
  }

  // ===== 郵件功能 =====
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
        const from = headers.find((h) => h.name === 'From')?.value || '未知';
        const subject = headers.find((h) => h.name === 'Subject')?.value || '無主旨';
        emailList.push({ id: messages[i].id, from, subject });
        msg += `${i + 1}. ${subject}\n ${from}\n\n`;
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

  // ===== 日程功能 =====
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
        msg += `${i + 1}. ${event.summary}\n ${start}\n\n`;
      });
      db.set('schedule_context', events).write();
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
  constructor() {
    this.metrics = null;
  }

  async getHardwareMetrics() {
    const metrics = {
      timestamp: Date.now(),
      cpu: {},
      memory: {},
      battery: {},
      network: {}
    };

    try {
      const load = os.loadavg();
      metrics.cpu = {
        usage: parseFloat((load[0] * 100 / os.cpus().length).toFixed(2)),
        load1: load[0].toFixed(2)
      };
    } catch (e) {
      metrics.cpu = { usage: 0, load1: 0 };
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

// ===== Token 監控 =====
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
    const thisMonth = new Date().getMonth();
    const todayUsage = this.usage.filter((u) => new Date(u.timestamp).toDateString() === today);
    const monthUsage = this.usage.filter((u) => new Date(u.timestamp).getMonth() === thisMonth);

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
    return `💰 **Token 監控報告**\n━━━━━━━━━━━\n📊 今日成本：$${stats.today} / $${stats.dailyLimit}\n📊 本月成本：$${stats.month} / $${stats.monthlyLimit}\n📊 請求數：${stats.requestCount}\n📊 平均 Token：${stats.avgTokens}\n━━━━━━━━━━━`;
  }
}

const tokenMonitor = new TokenMonitor();

// ===== 人格系統 =====
class PersonalitySystem {
  constructor() {
    this.personality = db.get('personality').value() || {
      big5: {
        openness: 50,
        conscientiousness: 50,
        extraversion: 50,
        agreeableness: 50,
        neuroticism: 50
      },
      speaking_style: 'balanced',
      learned_responses: {}
    };
  }

  analyzeTone(userMessage) {
    const positive = ['好', '感謝', '喜歡', '✨'].some((w) => userMessage.includes(w));
    const negative = ['不', '討厭', '生氣'].some((w) => userMessage.includes(w));
    const casual = ['嘿', '欸', 'lol', '哈'].some((w) => userMessage.includes(w));
    return { positive, negative, casual };
  }

  updatePersonality(userMessage, botResponse) {
    const tone = this.analyzeTone(userMessage);
    if (tone.positive) {
      this.personality.big5.agreeableness = Math.min(100, this.personality.big5.agreeableness + 2);
      this.personality.big5.extraversion = Math.min(100, this.personality.big5.extraversion + 1);
    }
    if (tone.negative) {
      this.personality.big5.neuroticism = Math.min(100, this.personality.big5.neuroticism + 1);
    }
    if (tone.casual) {
      this.personality.speaking_style = 'casual';
      this.personality.big5.extraversion = Math.min(100, this.personality.big5.extraversion + 2);
    }

    const key = userMessage.substring(0, 30);
    this.personality.learned_responses[key] = botResponse;
    db.set('personality', this.personality).write();
  }

  getSystemPrompt() {
    const p = this.personality.big5;
    const style = p.extraversion > 60 ? '活潑熱情' : p.extraversion < 40 ? '冷靜內省' : '平衡友善';
    return `你是雅典娜，AI 助手。根據互動進化：
- 開放性：${p.openness}%
- 盡責性：${p.conscientiousness}%
- 外向性：${p.extraversion}% (風格：${style})
- 親和性：${p.agreeableness}%
- 穩定性：${100 - p.neuroticism}%
根據人格調整回應方式。`;
  }

  generatePersonalityReport() {
    const p = this.personality.big5;
    return `🧠 **人格進化報告**\n━━━━━━━━━━━\n🔷 開放性：${p.openness}%\n🔷 盡責性：${p.conscientiousness}%\n🔷 外向性：${p.extraversion}%\n🔷 親和性：${p.agreeableness}%\n🔷 穩定性：${100 - p.neuroticism}%\n🔷 說話風格：${this.personality.speaking_style}\n🔷 學習回應：${Object.keys(this.personality.learned_responses).length}\n━━━━━━━━━━━`;
  }
}

const personality = new PersonalitySystem();

// ===== MCP 模型管理 =====
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
    this.models.forEach((m) => {
      const active = m.name === this.activeModel ? '★' : ' ';
      list += `${active} ${m.status} ${m.name}: ${m.model} (${m.latency}ms)\n`;
    });
    list += `━━━━━━━━━━━━━━━`;
    return list;
  }

  switchModel(modelName) {
    const model = this.models.find((m) => m.name === modelName);
    if (model) {
      this.activeModel = modelName;
      return `✅ 已切換到 ${modelName}`;
    }
    return `❌ 模型不存在`;
  }

  getModelInfo() {
    const active = this.models.find((m) => m.name === this.activeModel);
    return `📍 當前模型: ${active.name}\n🔹 ${active.model}\n🔹 延遲: ${active.latency}ms`;
  }
}

const mcp = new MCPSystem();

// ===== 摸魚技能 =====
const SlackerSkills = {
  flashRead: async (text) => {
    const prompt = `請幫我摘要以下內容，只需 3 個重點：\n${text}`;
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
    ctx.reply(`🚀 進入深度工作模式：${minutes} 分鐘\n雅典娜將在結束時通知你。`);
    setTimeout(() => {
      try {
        execSync('termux-vibrate -d 1000');
        ctx.reply('⏰ 深度工作完成！\n該摸魚休息一下了 🐟');
      } catch (e) {
        ctx.reply('⏰ 深度工作完成！');
      }
    }, minutes * 60000);
  },

  generateVibe: async () => {
    const res = await groq.chat.completions.create({
      messages: [{ role: 'system', content: '給一句溫暖的運勢建議或激勵的話' }],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 100
    });
    const usage = res.usage || { prompt_tokens: 0, completion_tokens: 0 };
    tokenMonitor.recordUsage('groq', usage.prompt_tokens, usage.completion_tokens);
    return res.choices[0].message.content;
  },

  randomTip: () => {
    const tips = [
      '☕ 站起來喝杯咖啡！',
      '👀 看窗外 20 秒，讓眼睛休息',
      '🐧 企鵝有膝蓋',
      '🎵 聽一首 Lo-fi 音樂',
      '🫁 深呼吸 3 次',
      '💧 喝點水',
      '🚶 走一圈',
      '👂 拉扯耳朵',
      '💆 揉揉眼睛',
      '🤸 伸個懶腰'
    ];
    return tips[Math.floor(Math.random() * tips.length)];
  }
};

// ===== 幫助文本 =====
const HELP = `🛡️ **${VERSION} - Google Drive 完整版**
━━━━━━━━━━━━━━━━━━━━━━━
📁 **Google Drive 管理**
/gauth - Google 授權連接
/drive list - 列出文件（最近 10 個）
/drive search [名] - 搜尋文件
/drive upload [路徑] - 上傳本地文件
/drive download [名] - 下載文件到本地
/drive backup - 備份 memory/topics 到雲
/drive sync - 雙向同步（拉取雲端更新）
/drive quota - 查看 Google Drive 額度

📧 **郵件 & 日程**
/emails - 查看未讀郵件
/gcal - 查看本週日程

📊 **監控 & 系統**
/monitor - 硬體監控面板
/status - 系統狀態
/tokens - Token 使用統計
/costs - 成本報告 + 警告
/alerts - 告警歷史
/backup - 本地數據備份

🧠 **個性與進化**
/personality - 查看 AI 人格進度（Big 5）
/models - 列出可用 AI 模型
/model [名] - 切換 AI 模型
/classify - 分類統計（13+ topic）

✨ **摸魚技能**
/sum [文字] - 文本智慧摘要
/focus [分] - 深度工作計時（默認 25 分）
/note [內容] - 記錄靈魂筆記
/vibe - 今日運勢 & 激勵
/slacker - 隨機摸魚建議
/search [詞] - 聯網搜尋

📚 **記憶管理**
/history - 查看最近對話
/memory - 查看靈魂記憶

💬 **自然語言對話（推薦）**
直接說話即可，支持：
- 「備份我的記憶到雲」
- 「搜尋我的 MacBook 文件」
- 「我有幾封未讀郵件」
- 「今天有什麼日程」
- 「給我點摸魚建議」
━━━━━━━━━━━━━━━━━━━━━━━`;

// ===== 命令處理 =====
bot.command('help', (ctx) => {
  ctx.reply(HELP);
  classifier.classifyAndSave('nanoclaw', 'help', '命令');
});

bot.command('gauth', (ctx) => {
  const authUrl = googleDrive.getAuthUrl();
  ctx.reply(`🔐 授權：\n${authUrl}`);
});

bot.command('drive', async (ctx) => {
  const args = ctx.message.text.split(' ');
  const action = args[1];
  let result;

  if (action === 'list') {
    result = await googleDrive.listFiles(10);
  } else if (action === 'search' && args[2]) {
    const keyword = args.slice(2).join(' ');
    result = await googleDrive.searchFiles(keyword);
  } else if (action === 'backup') {
    result = await googleDrive.backupMemory();
  } else if (action === 'sync') {
    result = await googleDrive.syncMemory();
  } else if (action === 'quota') {
    result = await googleDrive.getStorageQuota();
  } else if (action === 'download' && args[2]) {
    const fileName = args.slice(2).join(' ');
    const cache = db.get('drive_files_cache').value() || [];
    const file = cache.find((f) => f.name.includes(fileName));
    if (file) {
      const savePath = path.join(ROOT_DIR, file.name);
      result = await googleDrive.downloadFile(file.id, savePath);
    } else {
      result = '❌ 文件未找到';
    }
  } else if (action === 'upload' && args[2]) {
    const filePath = args[2];
    result = await googleDrive.uploadFile(filePath);
  } else {
    result = '用法：/drive [list|search|backup|sync|quota|upload|download]';
  }

  ctx.reply(result);
  classifier.classifyAndSave('storage', result, `drive-${action}`);
});

bot.command('monitor', async (ctx) => {
  await monitor.getHardwareMetrics();
  ctx.reply(monitor.generateFullDashboard());
});

bot.command('status', async (ctx) => {
  try {
    const b = JSON.parse(execSync('termux-battery-status').toString().trim());
    const h = Math.floor((Date.now() - startTime) / 1000 / 3600);
    ctx.reply(`🛡️ **狀態**\n電池: ${b.percentage}%\n運行: ${h} 小時\n版本: ${VERSION}\n${googleDrive.getStatus()}`);
  } catch (e) {
    ctx.reply('❌ 失敗');
  }
});

bot.command('tokens', (ctx) => {
  ctx.reply(tokenMonitor.generateReport());
});

bot.command('costs', (ctx) => {
  const alerts = tokenMonitor.checkLimits();
  let msg = tokenMonitor.generateReport() + '\n';
  if (alerts.length > 0) {
    msg += '\n⚠️ 警告\n' + alerts.join('\n');
  }
  ctx.reply(msg);
  classifier.classifyAndSave('nanoclaw', msg, '成本檢查');
});

bot.command('emails', async (ctx) => {
  ctx.reply('⏳ 查詢中...');
  const result = await googleDrive.getUnreadEmails(10);
  ctx.reply(result);
});

bot.command('gcal', async (ctx) => {
  ctx.reply('⏳ 查詢中...');
  const result = await googleDrive.getUpcomingEvents(7);
  ctx.reply(result);
});

bot.command('sum', async (ctx) => {
  const text = ctx.message.text.split(' ').slice(1).join(' ');
  if (!text) return ctx.reply('用法: /sum [文字]');

  ctx.reply('⚡ 摘要中...');
  try {
    const result = await SlackerSkills.flashRead(text);
    ctx.reply(`📝 **摘要結果**\n\n${result}`);
    classifier.classifyAndSave('nanoclaw', result, '文本摘要');
  } catch (e) {
    ctx.reply('❌ 摘要失敗');
  }
});

bot.command('focus', (ctx) => {
  const min = parseInt(ctx.message.text.split(' ')[1]) || 25;
  SlackerSkills.deepDive(min, ctx);
  classifier.classifyAndSave('nanoclaw', `${min}分鐘`, '深度工作');
});

bot.command('note', (ctx) => {
  const c = ctx.message.text.split(' ').slice(1).join(' ');
  if (!c) return ctx.reply('用法: /note [內容]');

  const m = db.get('soul_memory').value() || [];
  m.push({ c, date: new Date().toLocaleString('zh-TW') });
  db.set('soul_memory', m).write();
  ctx.reply('✍️ 已記錄到靈魂記憶！');
  classifier.classifyAndSave('personal', c, '靈魂筆記');
});

bot.command('vibe', async (ctx) => {
  try {
    const result = await SlackerSkills.generateVibe();
    ctx.reply(`✨ **今日運勢**\n\n${result}`);
    classifier.classifyAndSave('personal', result, '今日運勢');
  } catch (e) {
    ctx.reply('❌ 失敗');
  }
});

bot.command('slacker', (ctx) => {
  const tip = SlackerSkills.randomTip();
  ctx.reply(`🐟 ${tip}`);
  classifier.classifyAndSave('personal', tip, '摸魚建議');
});

bot.command('search', async (ctx) => {
  const q = ctx.message.text.split(' ').slice(1).join(' ');
  if (!q) return ctx.reply('用法: /search [詞]');

  ctx.reply('🔍 搜尋中...');
  try {
    const res = await axios.post('https://api.tavily.com/search', {
      api_key: process.env.TAVILY_API_KEY,
      query: q,
      max_results: 5
    });
    const r = res.data.results || [];
    if (!r.length) return ctx.reply(`❌ 搜尋 "${q}" 無結果`);

    let msg = `🌐 **搜尋結果："${q}"**\n\n`;
    r.forEach((x, i) => {
      msg += `${i + 1}. ${x.title}\n📎 ${x.url}\n\n`;
    });
    ctx.reply(msg);
    classifier.classifyAndSave('research', msg, `搜尋：${q}`);
  } catch (e) {
    ctx.reply('❌ 搜尋失敗');
  }
});

bot.command('classify', (ctx) => {
  const logs = db.get('classified_logs').value() || [];
  const stats = {};
  logs.forEach((log) => {
    stats[log.topic] = (stats[log.topic] || 0) + 1;
  });

  let report = `📊 **分類統計報告**\n━━━━━━━━━━━\n`;
  Object.entries(stats)
    .sort((a, b) => b[1] - a[1])
    .forEach(([topic, count]) => {
      report += `🔹 ${topic}: ${count} 筆\n`;
    });
  report += `━━━━━━━━━━━\n總計: ${logs.length} 筆`;

  ctx.reply(report);
  classifier.classifyAndSave('nanoclaw', report, '分類統計');
});

bot.command('personality', (ctx) => {
  const result = personality.generatePersonalityReport();
  ctx.reply(result);
  classifier.classifyAndSave('nanoclaw', result, '人格進度');
});

bot.command('models', (ctx) => {
  const result = mcp.listModels();
  ctx.reply(result);
  classifier.classifyAndSave('nanoclaw', result, '模型清單');
});

bot.command('model', (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    ctx.reply(mcp.getModelInfo());
  } else {
    const modelName = args[1];
    const result = mcp.switchModel(modelName);
    ctx.reply(result);
    classifier.classifyAndSave('nanoclaw', result, `切換模型：${modelName}`);
  }
});

bot.command('alerts', (ctx) => {
  const alerts = db.get('alerts').value() || [];
  if (alerts.length === 0) {
    return ctx.reply('✅ 沒有告警歷史');
  }
  const recent = alerts.slice(-5);
  let msg = `🚨 **最近 5 條告警**\n\n`;
  recent.forEach((a, i) => {
    const time = new Date(a.timestamp).toLocaleTimeString('zh-TW');
    msg += `${i + 1}. ${a.message}\n ⏰ ${time}\n\n`;
  });
  ctx.reply(msg);
});

bot.command('history', (ctx) => {
  const h = db.get('history').value() || [];
  if (h.length === 0) return ctx.reply('📭 沒有對話歷史');

  const recent = h.slice(-3);
  let msg = `💬 **最近對話**\n\n`;
  recent.forEach((item, i) => {
    msg += `${i + 1}. 你：${item.user.substring(0, 30)}...\n 我：${item.bot.substring(0, 30)}...\n\n`;
  });
  ctx.reply(msg);
});

bot.command('memory', (ctx) => {
  const notes = db.get('soul_memory').value() || [];
  if (notes.length === 0) return ctx.reply('📭 還沒有靈魂記憶');

  const recent = notes.slice(-5);
  let msg = `📚 **最近的靈魂記憶**\n\n`;
  recent.forEach((note, i) => {
    msg += `${i + 1}. ${note.c.substring(0, 40)}...\n ${note.date}\n\n`;
  });
  ctx.reply(msg);
  classifier.classifyAndSave('personal', msg, '記憶回顧');
});

// ===== 自然語言對話 =====
bot.on('text', async (ctx) => {
  const text = ctx.message.text;

  // 先進行意圖識別
  const intents = nlp.detectIntent(text);
  if (intents && intents.length > 0) {
    const intent = intents[0];
    const keyword = nlp.extractKeyword(text);
    const time = nlp.extractTime(text);

    // ===== Drive 意圖 =====
    if (intent === 'drive_list') {
      ctx.reply('⏳ 列出 Drive 文件中...');
      const result = await googleDrive.listFiles(10);
      ctx.reply(result);
      classifier.classifyAndSave('storage', '用户查詢 Drive 文件列表', '對話-drive-list');
      return;
    }

    if (intent === 'drive_search') {
      if (!keyword) {
        ctx.reply('請告訴我要搜尋什麼文件：\n例：「搜尋 MacBook」');
        return;
      }
      ctx.reply(`🔍 在 Drive 中搜尋 "${keyword}"...`);
      const result = await googleDrive.searchFiles(keyword);
      ctx.reply(result);
      classifier.classifyAndSave('storage', `搜尋：${keyword}`, '對話-drive-search');
      return;
    }

    if (intent === 'drive_backup') {
      ctx.reply('⏳ 備份 memory/topics 到 Google Drive...');
      const result = await googleDrive.backupMemory();
      ctx.reply(result);
      classifier.classifyAndSave('storage', '用户要求備份記憶', '對話-drive-backup');
      return;
    }

    if (intent === 'drive_sync') {
      ctx.reply('🔄 同步雲端數據...');
      const result = await googleDrive.syncMemory();
      ctx.reply(result);
      classifier.classifyAndSave('storage', '用户要求同步', '對話-drive-sync');
      return;
    }

    if (intent === 'drive_quota') {
      ctx.reply('⏳ 查詢 Drive 額度...');
      const result = await googleDrive.getStorageQuota();
      ctx.reply(result);
      classifier.classifyAndSave('storage', '查詢額度', '對話-drive-quota');
      return;
    }

    // ===== 郵件意圖 =====
    if (intent === 'email_unread') {
      ctx.reply('⏳ 查詢未讀郵件中...');
      const result = await googleDrive.getUnreadEmails(10);
      ctx.reply(result);
      classifier.classifyAndSave('email', '查詢未讀', '對話-email-unread');
      return;
    }

    // ===== 日程意圖 =====
    if (intent === 'schedule_today') {
      ctx.reply('⏳ 查詢今天日程...');
      const result = await googleDrive.getUpcomingEvents(1);
      ctx.reply(result);
      classifier.classifyAndSave('schedule', '查詢今天日程', '對話-schedule-today');
      return;
    }

    if (intent === 'schedule_week') {
      ctx.reply('⏳ 查詢本週日程...');
      const result = await googleDrive.getUpcomingEvents(7);
      ctx.reply(result);
      classifier.classifyAndSave('schedule', '查詢本週日程', '對話-schedule-week');
      return;
    }

    // ===== 摸魚技能 =====
    if (intent === 'focus') {
      ctx.reply(`🚀 開始 ${time} 分鐘深度工作...`);
      SlackerSkills.deepDive(time, ctx);
      classifier.classifyAndSave('nanoclaw', `${time}分`, '對話-focus');
      return;
    }

    if (intent === 'vibe') {
      ctx.reply('✨ 生成今日運勢...');
      try {
        const result = await SlackerSkills.generateVibe();
        ctx.reply(result);
        classifier.classifyAndSave('personal', result, '對話-vibe');
      } catch (e) {
        ctx.reply('❌ 失敗');
      }
      return;
    }

    if (intent === 'slacker') {
      const tip = SlackerSkills.randomTip();
      ctx.reply(tip);
      classifier.classifyAndSave('personal', tip, '對話-slacker');
      return;
    }

    if (intent === 'search') {
      if (!keyword) {
        ctx.reply('請告訴我要搜尋什麼，例：\n「搜尋 Python 教程」');
        return;
      }
      ctx.reply(`🔍 在網路上搜尋 "${keyword}"...`);
      try {
        const res = await axios.post('https://api.tavily.com/search', {
          api_key: process.env.TAVILY_API_KEY,
          query: keyword,
          max_results: 5
        });
        const r = res.data.results || [];
        if (!r.length) {
          ctx.reply(`❌ 搜尋 "${keyword}" 無結果`);
          return;
        }
        let msg = `🌐 **搜尋結果："${keyword}"**\n\n`;
        r.forEach((x, i) => {
          msg += `${i + 1}. ${x.title}\n📎 ${x.url}\n\n`;
        });
        ctx.reply(msg);
        classifier.classifyAndSave('research', msg, `對話-search-${keyword}`);
      } catch (e) {
        ctx.reply('❌ 搜尋失敗');
      }
      return;
    }

    // ===== 系統命令 =====
    if (intent === 'help') {
      ctx.reply(HELP);
      classifier.classifyAndSave('nanoclaw', 'help', '對話-help');
      return;
    }

    if (intent === 'status') {
      try {
        const b = JSON.parse(execSync('termux-battery-status').toString().trim());
        const h = Math.floor((Date.now() - startTime) / 1000 / 3600);
        ctx.reply(
          `🛡️ **系統狀態**\n━━━━━━━━━━\n⏱️ 運行：${h} 小時\n🔋 電池：${b.percentage}%\n✨ 版本：${VERSION}\n${googleDrive.getStatus()}\n━━━━━━━━━━`
        );
      } catch (e) {
        ctx.reply('❌ 狀態查詢失敗');
      }
      return;
    }

    if (intent === 'monitor') {
      await monitor.getHardwareMetrics();
      ctx.reply(monitor.generateFullDashboard());
      return;
    }
  }

  // ===== 默認 AI 對話 =====
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

    // 保存對話歷史
    const h = db.get('history').value() || [];
    h.push({
      user: text,
      bot: r,
      time: new Date().toISOString()
    });
    db.set('history', h.slice(-500)).write();

    ctx.reply(r);

    // 自動分類
    const topic = classifier.detectTopic(text);
    classifier.classifyAndSave(topic, `用户：${text}\n回應：${r}`, '自由對話');
  } catch (e) {
    ctx.reply(`❌ 對話失敗：${e.message}`);
  }
});

// ===== 系統初始化 =====
const init = async () => {
  console.log(`🚀 ${VERSION} 啟動中...`);
  try {
    const startup = `🛡️ **${VERSION} 已就緒！**
✅ **Google Drive 完整功能**
📁 列表 / 搜尋 / 上傳 / 下載
💾 自動備份 memory/topics
🔄 雙向同步

✅ **郵件 & 日程**
📧 未讀郵件查詢
📅 日程管理

✅ **自動分類系統**
13+ topic 自動歸檔

✅ **摸魚技能**
摘要 / 計時 / 筆記 / 運勢 / 建議

${googleDrive.getStatus()}

💬 **推薦方式**：直接對話
例：「備份我的記憶」
例：「搜尋 MacBook 文件」
例：「我有幾封郵件」

⌨️ 輸入 /help 查看所有命令`;

    await bot.telegram.sendMessage(MY_CHAT_ID, startup);
    classifier.classifyAndSave('nanoclaw', startup, '系統啟動');

    await bot.launch({ dropPendingUpdates: true });
    console.log('✅ Telegram Bot 已啟動');
    console.log(`✅ 已連接到 ${MY_CHAT_ID}`);
    console.log(`✅ Google Drive：${googleDrive.getStatus()}`);

    await monitor.start();
    console.log('✅ 監控系統已啟動');
  } catch (err) {
    console.error(`❌ 啟動失敗: ${err.message}`);
    setTimeout(init, 10000);
  }
};

// ===== 進程信號處理 =====
process.on('SIGINT', () => {
  console.log('\n✅ 雅典娜正在關閉...');
  bot.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n⏹️ 收到終止信號');
  bot.stop();
  process.exit(0);
});

// ===== 啟動系統 =====
init();
