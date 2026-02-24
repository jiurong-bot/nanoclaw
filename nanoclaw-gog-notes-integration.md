# NanoClaw Google Workspace & Notes 整合系統

## 概述

為 NanoClaw 添加 Google Workspace 和本機日程管理能力：

```
✅ gog (Google Workspace CLI)：接管 Gmail、Google 日曆、雲端硬碟、文件
✅ Notes 集成：本機日程、聯絡人、記事、待辦事項
✅ 統一界面：Telegram 命令控制一切
✅ 自動同步：雙向同步本機和雲端
```

---

## Part 1：安裝 Google Workspace SDK

### Step 1：安裝依賴

```bash
cd /root/nanoclaw

# 安裝 Google API 官方 SDK
npm install @google-cloud/gmail @google-cloud/calendar @google-cloud/drive

# 安裝認證庫
npm install google-auth-library

# 安裝本機日程庫
npm install better-sqlite3 uuid

# 其他工具
npm install date-fns
```

---

## Part 2：Google 認證設置

### Step 2：配置 Google Cloud 認證

```bash
# 創建認證目錄
mkdir -p ~/.nanoclaw/credentials

# 設置環境變量
echo 'export GOOGLE_APPLICATION_CREDENTIALS=~/.nanoclaw/credentials/google-credentials.json' >> ~/.bashrc
source ~/.bashrc
```

**如何獲取 Google Credentials：**

```
1️⃣ 去 Google Cloud Console：https://console.cloud.google.com
2️⃣ 創建新項目
3️⃣ 啟用 API：
   - Gmail API
   - Google Calendar API
   - Google Drive API
4️⃣ 創建服務賬戶
5️⃣ 下載 JSON 密鑰
6️⃣ 保存到 ~/.nanoclaw/credentials/google-credentials.json
```

### Step 3：更新 .env

```bash
nano .env
```

**添加 Google 配置：**

```
# ========== Google Workspace 配置 ==========
GOOGLE_CREDENTIALS_PATH=~/.nanoclaw/credentials/google-credentials.json
GOOGLE_WORKSPACE_ENABLED=true

# Gmail
GMAIL_ENABLED=true
GMAIL_EMAIL=你的@gmail.com
GMAIL_SYNC_INTERVAL=300000

# Google Calendar
GCAL_ENABLED=true
GCAL_CALENDAR_ID=primary
GCAL_SYNC_INTERVAL=300000

# Google Drive
GDRIVE_ENABLED=true
GDRIVE_SYNC_INTERVAL=600000

# ========== 本機 Notes 配置 ==========
NOTES_ENABLED=true
NOTES_DB_PATH=~/.nanoclaw/notes/notes.db
NOTES_BACKUP_INTERVAL=3600000
```

---

## Part 3：實現 Google Workspace 集成

### Step 4：創建 Gmail 模組

```bash
mkdir -p src/services/google
nano src/services/google/gmail-service.ts
```

**複製以下代碼：**

```typescript
import { google, gmail_v1 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

interface Email {
  id: string;
  from: string;
  subject: string;
  preview: string;
  timestamp: number;
  read: boolean;
}

class GmailService {
  private gmail: gmail_v1.Gmail | null = null;
  private enabled: boolean;
  private email: string;

  constructor() {
    this.enabled = process.env.GMAIL_ENABLED === 'true';
    this.email = process.env.GMAIL_EMAIL || '';
    
    if (this.enabled) {
      this.initialize();
    }
  }

  private async initialize(): Promise<void> {
    try {
      const auth = new GoogleAuth({
        keyFile: process.env.GOOGLE_CREDENTIALS_PATH,
        scopes: [
          'https://www.googleapis.com/auth/gmail.readonly',
          'https://www.googleapis.com/auth/gmail.send'
        ]
      });

      this.gmail = google.gmail({ version: 'v1', auth });
      console.log('✅ Gmail 已初始化');
    } catch (error) {
      console.error('❌ Gmail 初始化失敗:', error);
      this.enabled = false;
    }
  }

  /**
   * 獲取未讀郵件
   */
  async getUnreadEmails(limit: number = 5): Promise<string> {
    if (!this.enabled || !this.gmail) {
      return '❌ Gmail 未啟用';
    }

    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread',
        maxResults: limit
      });

      if (!response.data.messages || response.data.messages.length === 0) {
        return '📭 沒有未讀郵件';
      }

      let result = `📬 未讀郵件（共 ${response.data.messages.length} 封）\n\n`;

      for (const msg of response.data.messages.slice(0, limit)) {
        const messageDetail = await this.gmail.users.messages.get({
          userId: 'me',
          id: msg.id!
        });

        const headers = messageDetail.data.payload?.headers || [];
        const fromHeader = headers.find(h => h.name === 'From')?.value || '未知';
        const subjectHeader = headers.find(h => h.name === 'Subject')?.value || '（無主旨）';

        result += `📧 **${subjectHeader}**\n   來自：${fromHeader}\n\n`;
      }

      return result;
    } catch (error) {
      return `❌ 獲取郵件失敗：${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * 發送郵件
   */
  async sendEmail(to: string, subject: string, body: string): Promise<string> {
    if (!this.enabled || !this.gmail) {
      return '❌ Gmail 未啟用';
    }

    try {
      const message = [
        `From: ${this.email}`,
        `To: ${to}`,
        `Subject: ${subject}`,
        '',
        body
      ].join('\n');

      const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      await this.gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: encodedMessage
        }
      });

      return `✅ 郵件已發送至 ${to}`;
    } catch (error) {
      return `❌ 發送失敗：${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * 搜尋郵件
   */
  async searchEmails(query: string, limit: number = 10): Promise<string> {
    if (!this.enabled || !this.gmail) {
      return '❌ Gmail 未啟用';
    }

    try {
      const response = await this.gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: limit
      });

      if (!response.data.messages || response.data.messages.length === 0) {
        return `🔍 未找到匹配「${query}」的郵件`;
      }

      let result = `🔍 搜尋結果（「${query}」，共 ${response.data.messages.length} 封）\n\n`;

      for (const msg of response.data.messages.slice(0, Math.min(limit, 5))) {
        const messageDetail = await this.gmail.users.messages.get({
          userId: 'me',
          id: msg.id!
        });

        const headers = messageDetail.data.payload?.headers || [];
        const subjectHeader = headers.find(h => h.name === 'Subject')?.value || '（無主旨）';
        result += `📧 ${subjectHeader}\n`;
      }

      return result;
    } catch (error) {
      return `❌ 搜尋失敗：${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getStatus(): string {
    return this.enabled ? '✅ Gmail 已連接' : '❌ Gmail 未啟用';
  }
}

export default new GmailService();
```

---

### Step 5：創建 Google Calendar 模組

```bash
nano src/services/google/calendar-service.ts
```

**複製以下代碼：**

```typescript
import { google, calendar_v3 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';
import { format, addDays } from 'date-fns';
import { zhTW } from 'date-fns/locale';

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  description: string;
}

class CalendarService {
  private calendar: calendar_v3.Calendar | null = null;
  private enabled: boolean;
  private calendarId: string;

  constructor() {
    this.enabled = process.env.GCAL_ENABLED === 'true';
    this.calendarId = process.env.GCAL_CALENDAR_ID || 'primary';
    
    if (this.enabled) {
      this.initialize();
    }
  }

  private async initialize(): Promise<void> {
    try {
      const auth = new GoogleAuth({
        keyFile: process.env.GOOGLE_CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/calendar']
      });

      this.calendar = google.calendar({ version: 'v3', auth });
      console.log('✅ Google Calendar 已初始化');
    } catch (error) {
      console.error('❌ Google Calendar 初始化失敗:', error);
      this.enabled = false;
    }
  }

  /**
   * 獲取今天和明天的日程
   */
  async getUpcomingEvents(daysAhead: number = 1): Promise<string> {
    if (!this.enabled || !this.calendar) {
      return '❌ Google Calendar 未啟用';
    }

    try {
      const now = new Date();
      const futureDate = addDays(now, daysAhead);

      const response = await this.calendar.events.list({
        calendarId: this.calendarId,
        timeMin: now.toISOString(),
        timeMax: futureDate.toISOString(),
        singleEvents: true,
        orderBy: 'startTime'
      });

      if (!response.data.items || response.data.items.length === 0) {
        return `📅 未來 ${daysAhead} 天沒有日程安排`;
      }

      let result = `📅 即將發生的日程（${daysAhead} 天內）\n\n`;

      for (const event of response.data.items) {
        const startTime = format(
          new Date(event.start?.dateTime || event.start?.date || ''),
          'HH:mm (dd/MM)',
          { locale: zhTW }
        );
        result += `⏰ **${event.summary}**\n   時間：${startTime}\n`;
        if (event.description) {
          result += `   📝 ${event.description.substring(0, 100)}\n`;
        }
        result += '\n';
      }

      return result;
    } catch (error) {
      return `❌ 獲取日程失敗：${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * 創建日程
   */
  async createEvent(
    title: string,
    startTime: Date,
    endTime: Date,
    description?: string
  ): Promise<string> {
    if (!this.enabled || !this.calendar) {
      return '❌ Google Calendar 未啟用';
    }

    try {
      const response = await this.calendar.events.insert({
        calendarId: this.calendarId,
        requestBody: {
          summary: title,
          description,
          start: { dateTime: startTime.toISOString() },
          end: { dateTime: endTime.toISOString() }
        }
      });

      return `✅ 已創建日程：${title}`;
    } catch (error) {
      return `❌ 創建失敗：${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getStatus(): string {
    return this.enabled ? '✅ Google Calendar 已連接' : '❌ Google Calendar 未啟用';
  }
}

export default new CalendarService();
```

---

### Step 6：創建 Google Drive 模組

```bash
nano src/services/google/drive-service.ts
```

**複製以下代碼：**

```typescript
import { google, drive_v3 } from 'googleapis';
import { GoogleAuth } from 'google-auth-library';

class DriveService {
  private drive: drive_v3.Drive | null = null;
  private enabled: boolean;

  constructor() {
    this.enabled = process.env.GDRIVE_ENABLED === 'true';
    
    if (this.enabled) {
      this.initialize();
    }
  }

  private async initialize(): Promise<void> {
    try {
      const auth = new GoogleAuth({
        keyFile: process.env.GOOGLE_CREDENTIALS_PATH,
        scopes: ['https://www.googleapis.com/auth/drive']
      });

      this.drive = google.drive({ version: 'v3', auth });
      console.log('✅ Google Drive 已初始化');
    } catch (error) {
      console.error('❌ Google Drive 初始化失敗:', error);
      this.enabled = false;
    }
  }

  /**
   * 列出最近文件
   */
  async listRecentFiles(limit: number = 10): Promise<string> {
    if (!this.enabled || !this.drive) {
      return '❌ Google Drive 未啟用';
    }

    try {
      const response = await this.drive.files.list({
        spaces: 'drive',
        fields: 'files(id, name, mimeType, modifiedTime)',
        pageSize: limit,
        orderBy: 'modifiedTime desc'
      });

      if (!response.data.files || response.data.files.length === 0) {
        return '📁 雲端硬碟中沒有文件';
      }

      let result = `📁 最近修改的文件（共 ${response.data.files.length} 個）\n\n`;

      for (const file of response.data.files) {
        result += `📄 **${file.name}**\n`;
        result += `   類型：${this.getMimeTypeName(file.mimeType)}\n`;
        result += `   修改：${new Date(file.modifiedTime!).toLocaleString('zh-TW')}\n\n`;
      }

      return result;
    } catch (error) {
      return `❌ 獲取文件列表失敗：${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * 搜尋文件
   */
  async searchFiles(query: string, limit: number = 5): Promise<string> {
    if (!this.enabled || !this.drive) {
      return '❌ Google Drive 未啟用';
    }

    try {
      const response = await this.drive.files.list({
        spaces: 'drive',
        q: `name contains '${query}'`,
        fields: 'files(id, name, mimeType)',
        pageSize: limit
      });

      if (!response.data.files || response.data.files.length === 0) {
        return `🔍 未找到匹配「${query}」的文件`;
      }

      let result = `🔍 搜尋結果（「${query}」，共 ${response.data.files.length} 個）\n\n`;

      for (const file of response.data.files) {
        result += `📄 ${file.name}\n`;
      }

      return result;
    } catch (error) {
      return `❌ 搜尋失敗：${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  private getMimeTypeName(mimeType?: string): string {
    const types: { [key: string]: string } = {
      'application/vnd.google-apps.document': '文檔',
      'application/vnd.google-apps.spreadsheet': '試算表',
      'application/vnd.google-apps.presentation': '簡報',
      'application/pdf': 'PDF',
      'text/plain': '文本'
    };
    return types[mimeType || ''] || '文件';
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getStatus(): string {
    return this.enabled ? '✅ Google Drive 已連接' : '❌ Google Drive 未啟用';
  }
}

export default new DriveService();
```

---

## Part 4：實現本機 Notes 系統

### Step 7：創建本機 Notes 模組

```bash
mkdir -p src/services/notes
nano src/services/notes/notes-service.ts
```

**複製以下代碼：**

```typescript
import Database from 'better-sqlite3';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs-extra';
import * as path from 'path';

interface Note {
  id: string;
  title: string;
  content: string;
  type: 'note' | 'todo' | 'contact' | 'event';
  tags: string[];
  createdAt: number;
  updatedAt: number;
  completed?: boolean;
}

class NotesService {
  private db: Database.Database | null = null;
  private enabled: boolean;
  private dbPath: string;

  constructor() {
    this.enabled = process.env.NOTES_ENABLED === 'true';
    this.dbPath = path.expandUser(process.env.NOTES_DB_PATH || '~/.nanoclaw/notes/notes.db');
    
    if (this.enabled) {
      this.initialize();
    }
  }

  private async initialize(): Promise<void> {
    try {
      // 創建目錄
      await fs.ensureDir(path.dirname(this.dbPath));

      // 初始化數據庫
      this.db = new Database(this.dbPath);
      
      // 創建表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content TEXT,
          type TEXT DEFAULT 'note',
          tags TEXT,
          completed BOOLEAN DEFAULT 0,
          created_at INTEGER,
          updated_at INTEGER
        )
      `);

      console.log('✅ Notes 已初始化');
    } catch (error) {
      console.error('❌ Notes 初始化失敗:', error);
      this.enabled = false;
    }
  }

  /**
   * 創建記事
   */
  createNote(title: string, content: string, tags: string[] = []): string {
    if (!this.enabled || !this.db) {
      return '❌ Notes 未啟用';
    }

    try {
      const id = uuidv4();
      const now = Date.now();
      
      const stmt = this.db.prepare(`
        INSERT INTO notes (id, title, content, type, tags, created_at, updated_at)
        VALUES (?, ?, ?, 'note', ?, ?, ?)
      `);

      stmt.run(id, title, content, JSON.stringify(tags), now, now);
      return `✅ 已創建記事：${title}`;
    } catch (error) {
      return `❌ 創建失敗：${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * 創建待辦事項
   */
  createTodo(title: string, description?: string, tags: string[] = []): string {
    if (!this.enabled || !this.db) {
      return '❌ Notes 未啟用';
    }

    try {
      const id = uuidv4();
      const now = Date.now();
      
      const stmt = this.db.prepare(`
        INSERT INTO notes (id, title, content, type, tags, completed, created_at, updated_at)
        VALUES (?, ?, ?, 'todo', ?, 0, ?, ?)
      `);

      stmt.run(id, title, description || '', JSON.stringify(tags), now, now);
      return `✅ 已添加待辦：${title}`;
    } catch (error) {
      return `❌ 添加失敗：${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * 完成待辦
   */
  completeTodo(id: string): string {
    if (!this.enabled || !this.db) {
      return '❌ Notes 未啟用';
    }

    try {
      const stmt = this.db.prepare('UPDATE notes SET completed = 1 WHERE id = ?');
      stmt.run(id);
      return `✅ 已完成待辦`;
    } catch (error) {
      return `❌ 更新失敗`;
    }
  }

  /**
   * 獲取所有待辦
   */
  getAllTodos(): string {
    if (!this.enabled || !this.db) {
      return '❌ Notes 未啟用';
    }

    try {
      const stmt = this.db.prepare('SELECT * FROM notes WHERE type = "todo" ORDER BY created_at DESC');
      const todos = stmt.all() as any[];

      if (todos.length === 0) {
        return '✅ 沒有待辦事項';
      }

      let result = `📋 待辦事項（共 ${todos.length} 個）\n\n`;

      for (const todo of todos) {
        const checkbox = todo.completed ? '☑️' : '☐';
        result += `${checkbox} **${todo.title}**\n`;
        if (todo.content) result += `   ${todo.content}\n`;
        result += '\n';
      }

      return result;
    } catch (error) {
      return `❌ 獲取失敗`;
    }
  }

  /**
   * 創建聯絡人
   */
  addContact(name: string, phone?: string, email?: string): string {
    if (!this.enabled || !this.db) {
      return '❌ Notes 未啟用';
    }

    try {
      const id = uuidv4();
      const now = Date.now();
      const contactInfo = JSON.stringify({ phone, email });
      
      const stmt = this.db.prepare(`
        INSERT INTO notes (id, title, content, type, created_at, updated_at)
        VALUES (?, ?, ?, 'contact', ?, ?)
      `);

      stmt.run(id, name, contactInfo, now, now);
      return `✅ 已添加聯絡人：${name}`;
    } catch (error) {
      return `❌ 添加失敗`;
    }
  }

  /**
   * 獲取所有聯絡人
   */
  getAllContacts(): string {
    if (!this.enabled || !this.db) {
      return '❌ Notes 未啟用';
    }

    try {
      const stmt = this.db.prepare('SELECT * FROM notes WHERE type = "contact"');
      const contacts = stmt.all() as any[];

      if (contacts.length === 0) {
        return '📇 沒有聯絡人';
      }

      let result = `📇 聯絡人簿（共 ${contacts.length} 人）\n\n`;

      for (const contact of contacts) {
        result += `👤 **${contact.title}**\n`;
        const info = JSON.parse(contact.content || '{}');
        if (info.phone) result += `   📱 ${info.phone}\n`;
        if (info.email) result += `   📧 ${info.email}\n`;
        result += '\n';
      }

      return result;
    } catch (error) {
      return `❌ 獲取失敗`;
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getStatus(): string {
    return this.enabled ? '✅ Notes 已就緒' : '❌ Notes 未啟用';
  }
}

export default new NotesService();
```

---

## Part 5：整合到主應用

### Step 8：更新 src/index.ts

```bash
nano src/index.ts
```

**添加 Google Workspace & Notes 命令：**

```typescript
import TelegramBot from 'node-telegram-bot-api';
import gmailService from './services/google/gmail-service';
import calendarService from './services/google/calendar-service';
import driveService from './services/google/drive-service';
import notesService from './services/notes/notes-service';

const tgBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// ========== Gmail 命令 ==========

tgBot.onText(/\/gmail_unread/, async (msg) => {
  const chatId = msg.chat.id;
  const result = await gmailService.getUnreadEmails(5);
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/gmail_search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  const result = await gmailService.searchEmails(query);
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/gmail_send (.+) (.+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [to, subject, body] = [match[1], match[2], match[3]];
  const result = await gmailService.sendEmail(to, subject, body);
  await tgBot.sendMessage(chatId, result);
});

// ========== Google Calendar 命令 ==========

tgBot.onText(/\/gcal_upcoming/, async (msg) => {
  const chatId = msg.chat.id;
  const result = await calendarService.getUpcomingEvents(2);
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/gcal_today/, async (msg) => {
  const chatId = msg.chat.id;
  const result = await calendarService.getUpcomingEvents(0);
  await tgBot.sendMessage(chatId, result);
});

// ========== Google Drive 命令 ==========

tgBot.onText(/\/gdrive_recent/, async (msg) => {
  const chatId = msg.chat.id;
  const result = await driveService.listRecentFiles(10);
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/gdrive_search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  const result = await driveService.searchFiles(query);
  await tgBot.sendMessage(chatId, result);
});

// ========== Notes 命令 ==========

tgBot.onText(/\/note_add (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [title, content] = match[1].split('|');
  const result = notesService.createNote(title.trim(), (content || '').trim());
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/todo_add (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const title = match[1];
  const result = notesService.createTodo(title);
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/todo_list/, async (msg) => {
  const chatId = msg.chat.id;
  const result = notesService.getAllTodos();
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/contact_add (.+) (.*)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [name, info] = [match[1], match[2]];
  const [phone, email] = info.split(',').map(s => s.trim());
  const result = notesService.addContact(name, phone, email);
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/contact_list/, async (msg) => {
  const chatId = msg.chat.id;
  const result = notesService.getAllContacts();
  await tgBot.sendMessage(chatId, result);
});

// ========== 統一狀態命令 ==========

tgBot.onText(/\/workspace_status/, async (msg) => {
  const chatId = msg.chat.id;
  let status = '🔌 **Google Workspace & Notes 狀態**\n\n';
  status += gmailService.getStatus() + '\n';
  status += calendarService.getStatus() + '\n';
  status += driveService.getStatus() + '\n';
  status += notesService.getStatus();
  await tgBot.sendMessage(chatId, status);
});

console.log('🚀 NanoClaw with Google Workspace & Notes 已啟動');
```

---

## 完整命令列表

```
========== Gmail ==========
/gmail_unread              - 查看未讀郵件
/gmail_search [query]      - 搜尋郵件
/gmail_send [to] [subject] [body]  - 發送郵件

========== Google Calendar ==========
/gcal_today               - 查看今天的日程
/gcal_upcoming            - 查看未來 2 天日程

========== Google Drive ==========
/gdrive_recent            - 查看最近文件
/gdrive_search [query]    - 搜尋文件

========== Notes & Todos ==========
/note_add [title]|[content]  - 添加記事
/todo_add [任務]              - 添加待辦
/todo_list                    - 查看所有待辦
/contact_add [name] [phone,email]  - 添加聯絡人
/contact_list                      - 查看所有聯絡人

========== 狀態 ==========
/workspace_status         - 查看所有連接狀態
```

---

## 完整檢查清單

- [ ] npm 依賴已安裝（Google API SDK、better-sqlite3）
- [ ] Google Cloud 認證文件已配置
- [ ] .env 設置完整（所有 Google 配置）
- [ ] src/services/google/gmail-service.ts 已創建
- [ ] src/services/google/calendar-service.ts 已創建
- [ ] src/services/google/drive-service.ts 已創建
- [ ] src/services/notes/notes-service.ts 已創建
- [ ] src/index.ts 已更新所有命令
- [ ] npm start 成功運行
- [ ] Telegram 測試各命令

---

**Google Workspace + Notes 現在已完全集成！** 🚀
