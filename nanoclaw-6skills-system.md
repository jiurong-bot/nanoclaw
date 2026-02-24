# NanoClaw 6 個核心 Skills 實戰系統
## 「打工人高效摸鱼攻略」- NanoClaw 版本

基於智星云文章，為 NanoClaw 實現 6 個硬核 Skills，從「找資源」到「高分結課」一條龍自動化。

---

## 六大核心 Skills 架構

```
第一步：獲取知識資源
  └─ Skill 1️⃣ : agent-browser（網絡手腳，搜索+下載）

第二步：進行知識拆解
  ├─ Skill 2️⃣ : diagram-generator（視覺化思維導圖）
  └─ Skill 3️⃣ : pptx（深度解析課件）

第三步：從學習轉化為行動
  └─ Skill 4️⃣ : ship-learn-next（行動派規劃）

第四步：數據建聯，持久記憶
  └─ Skill 5️⃣ : personal-assistant（24小時管家）

第五步：增添靈魂，生動內容
  └─ Skill 6️⃣ : humanizer-zh（中文潤色大師）
```

---

## Part 1：Skill 1️⃣ - agent-browser（網絡搜索+下載）

### Step 1：創建瀏覽器技能

```bash
mkdir -p src/skills/advanced
nano src/skills/advanced/agent-browser.ts
```

**複製以下代碼：**

```typescript
import axios from 'axios';
import * as fs from 'fs-extra';
import * as path from 'path';
import tavilySearch from '../tavily-search';

class AgentBrowser {
  private workspaceDir: string;

  constructor() {
    this.workspaceDir = process.env.MCP_WORKSPACE_ROOT || '/root/.nanoclaw/workspace';
  }

  /**
   * 多引擎搜索並下載資源
   */
  async searchAndDownload(query: string, outputDir?: string): Promise<string> {
    try {
      console.log(`🔍 Agent Browser 搜索：${query}`);

      // 使用 Tavily 搜索
      const searchResult = await tavilySearch.search(query);

      // 解析搜索結果中的可下載鏈接
      const downloadLinks = this.extractDownloadLinks(searchResult);

      if (downloadLinks.length === 0) {
        return `🔍 完成搜索「${query}」\n\n結果：${searchResult}\n\n⚠️ 未找到可直接下載的資源，請手動訪問連結。`;
      }

      // 嘗試下載
      const targetDir = outputDir || path.join(this.workspaceDir, 'downloads');
      await fs.ensureDir(targetDir);

      let downloadReport = `✅ Agent Browser 搜索完成\n查詢：${query}\n\n`;
      downloadReport += `📊 找到 ${downloadLinks.length} 個資源連結\n\n`;

      for (const link of downloadLinks.slice(0, 3)) {
        try {
          const filename = path.basename(new URL(link).pathname) || `resource_${Date.now()}`;
          const filepath = path.join(targetDir, filename);

          console.log(`📥 下載：${link}`);
          await this.downloadFile(link, filepath);

          downloadReport += `✅ 已下載：${filename}\n`;
        } catch (error) {
          downloadReport += `❌ 下載失敗：${link}\n`;
        }
      }

      downloadReport += `\n📁 文件保存到：${targetDir}`;
      return downloadReport;
    } catch (error) {
      return `❌ 搜索失敗：${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * 從搜索結果提取下載鏈接
   */
  private extractDownloadLinks(searchResult: string): string[] {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const matches = searchResult.match(urlRegex) || [];

    // 過濾出可能的資源鏈接（PDF、文檔、科研論文等）
    return matches.filter(url => {
      const lower = url.toLowerCase();
      return lower.includes('.pdf') || 
             lower.includes('.doc') ||
             lower.includes('arxiv') ||
             lower.includes('github') ||
             lower.includes('download');
    });
  }

  /**
   * 下載文件
   */
  private async downloadFile(url: string, filepath: string): Promise<void> {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'NanoClaw/1.0'
      }
    });

    await fs.writeFile(filepath, response.data);
  }

  /**
   * 解析網頁內容
   */
  async parseWebpage(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'NanoClaw/1.0'
        }
      });

      // 簡單的 HTML 清理
      const text = response.data
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      return text.substring(0, 5000);
    } catch (error) {
      throw new Error(`無法解析網頁：${url}`);
    }
  }
}

export default new AgentBrowser();
```

---

## Part 2：Skill 2️⃣ - diagram-generator（思維導圖）

### Step 2：創建圖表生成技能

```bash
nano src/skills/advanced/diagram-generator.ts
```

**複製以下代碼：**

```typescript
class DiagramGenerator {
  /**
   * 生成 Mermaid 思維導圖
   */
  generateMindmap(title: string, content: string): string {
    try {
      // 簡單的內容解析
      const lines = content.split('\n').filter(l => l.trim());
      
      let mermaid = 'mindmap\n  root((' + title + '))\n';

      for (const line of lines) {
        const indent = (line.match(/^\s*/)[0].length / 2);
        const text = line.trim();
        
        if (text && !text.startsWith('#')) {
          mermaid += '  '.repeat(indent + 1) + text + '\n';
        }
      }

      return `📊 **思維導圖：${title}**\n\n\`\`\`mermaid\n${mermaid}\`\`\`\n\n💡 複製上方代碼到 https://mermaid.live 查看完整圖表`;
    } catch (error) {
      return `❌ 生成失敗：${error instanceof Error ? error.message : 'Unknown'}`;
    }
  }

  /**
   * 生成流程圖
   */
  generateFlowchart(title: string, steps: string[]): string {
    try {
      let mermaid = 'flowchart TD\n';
      
      for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        mermaid += `    A${i}["${step}"]\n`;
        
        if (i < steps.length - 1) {
          mermaid += `    A${i} --> A${i + 1}\n`;
        }
      }

      return `📈 **流程圖：${title}**\n\n\`\`\`mermaid\n${mermaid}\`\`\`\n\n💡 複製上方代碼到 https://mermaid.live 查看完整圖表`;
    } catch (error) {
      return `❌ 生成失敗`;
    }
  }

  /**
   * 生成時間軸
   */
  generateTimeline(title: string, events: { date: string; event: string }[]): string {
    try {
      let mermaid = 'timeline\n  title ' + title + '\n';

      for (const { date, event } of events) {
        mermaid += `    ${date} : ${event}\n`;
      }

      return `📅 **時間軸：${title}**\n\n\`\`\`mermaid\n${mermaid}\`\`\``;
    } catch (error) {
      return `❌ 生成失敗`;
    }
  }
}

export default new DiagramGenerator();
```

---

## Part 3：Skill 3️⃣ - pptx（課件深度解析）

### Step 3：創建 PPT 解析技能

```bash
npm install pptxparse

nano src/skills/advanced/pptx-analyzer.ts
```

**複製以下代碼：**

```typescript
import * as fs from 'fs-extra';
import * as path from 'path';

class PPTXAnalyzer {
  /**
   * 解析 PPTX 文件
   */
  async analyzePPTX(filePath: string): Promise<string> {
    try {
      // 檢查文件存在
      if (!await fs.pathExists(filePath)) {
        return `❌ 文件不存在：${filePath}`;
      }

      // 簡單的文件讀取（需要 pptxparse 庫）
      const filename = path.basename(filePath);
      const size = (await fs.stat(filePath)).size;

      let analysis = `📊 **PPT 深度分析：${filename}**\n\n`;
      analysis += `文件大小：${(size / 1024 / 1024).toFixed(2)} MB\n`;
      analysis += `路徑：${filePath}\n\n`;

      // 讀取文件內容（簡化版）
      const content = await fs.readFile(filePath, 'utf-8').catch(() => '');
      
      if (content) {
        analysis += `📝 **提取的文本內容：**\n\n`;
        analysis += content.substring(0, 2000);
        if (content.length > 2000) {
          analysis += '\n\n... (內容已截斷)';
        }
      }

      analysis += `\n\n💡 **建議：** 使用在線工具進一步解析複雜的 PPT 結構`;
      return analysis;
    } catch (error) {
      return `❌ 解析失敗：${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * 從 PPT 提取考點
   */
  async extractKeyPoints(filePath: string, keyword: string): Promise<string> {
    try {
      if (!await fs.pathExists(filePath)) {
        return `❌ 文件不存在`;
      }

      let result = `🎯 **考點提取：「${keyword}」**\n\n`;
      result += `正在分析課件... \n`;
      result += `⚠️ 此功能需要更高級的 PPT 解析庫\n\n`;
      result += `📋 **建議操作步驟：**\n`;
      result += `1. 將 PPT 轉換為 PDF\n`;
      result += `2. 使用 OCR 提取文本\n`;
      result += `3. AI 分析提取考點`;

      return result;
    } catch (error) {
      return `❌ 提取失敗`;
    }
  }
}

export default new PPTXAnalyzer();
```

---

## Part 4：Skill 4️⃣ - ship-learn-next（行動派規劃）

### Step 4：創建行動規劃技能

```bash
nano src/skills/advanced/ship-learn-next.ts
```

**複製以下代碼：**

```typescript
import Database from 'better-sqlite3';
import * as path from 'path';

interface LearningGoal {
  id: string;
  title: string;
  reps: ShipRep[];
  createdAt: number;
}

interface ShipRep {
  id: number;
  title: string;
  deliverable: string; // 交付物：寫評論、剪視頻等
  completed: boolean;
  deadline: number;
}

class ShipLearnNext {
  private db: Database.Database | null = null;

  constructor() {
    this.initializeDB();
  }

  private initializeDB(): void {
    try {
      const dbPath = path.join(process.env.NOTES_DB_PATH || '~/.nanoclaw/notes', 'learning.db');
      this.db = new Database(dbPath);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS learning_goals (
          id TEXT PRIMARY KEY,
          title TEXT,
          created_at INTEGER
        );
        
        CREATE TABLE IF NOT EXISTS ship_reps (
          id TEXT PRIMARY KEY,
          goal_id TEXT,
          rep_number INTEGER,
          title TEXT,
          deliverable TEXT,
          completed BOOLEAN,
          deadline INTEGER,
          FOREIGN KEY (goal_id) REFERENCES learning_goals(id)
        );
      `);
    } catch (error) {
      console.error('Learning DB 初始化失敗:', error);
    }
  }

  /**
   * 創建學習目標（Ship-Learn-Next 循環）
   */
  createLearningGoal(title: string, timeline: number): string {
    if (!this.db) return '❌ 數據庫未就緒';

    try {
      const goalId = `goal_${Date.now()}`;
      const now = Date.now();
      const endDate = now + timeline * 24 * 60 * 60 * 1000;

      // 插入目標
      const insertGoal = this.db.prepare(
        'INSERT INTO learning_goals (id, title, created_at) VALUES (?, ?, ?)'
      );
      insertGoal.run(goalId, title, now);

      // 自動生成 5 個 Rep（練習回合）
      const reps = this.generateReps(goalId, title, 5, endDate);

      let result = `🚀 **【Ship-Learn-Next】學習目標已創建**\n\n`;
      result += `🎯 目標：${title}\n`;
      result += `⏰ 完成期限：${new Date(endDate).toLocaleString('zh-TW')}\n\n`;
      result += `📋 **5 個練習回合（Rep）：**\n\n`;

      for (const rep of reps) {
        result += `${rep.id}. **${rep.title}**\n`;
        result += `   📤 交付物：${rep.deliverable}\n`;
        result += `   ⏱️ 期限：${new Date(rep.deadline).toLocaleDateString('zh-TW')}\n\n`;
      }

      result += `💡 每個 Rep 都是一個實踐回合，強制你通過產出作品來驅動學習！`;
      return result;
    } catch (error) {
      return `❌ 創建失敗`;
    }
  }

  /**
   * 生成練習回合
   */
  private generateReps(goalId: string, title: string, count: number, endDate: number): ShipRep[] {
    const reps: ShipRep[] = [];
    const stepSize = Math.floor((endDate - Date.now()) / (count + 1));

    const deliverables = [
      `寫一篇 500 字評論：「${title}入門」`,
      `創建一份思維導圖，總結 ${title} 的核心框架`,
      `完成一個實踐作品，應用所學的知識`,
      `製作一個 10 分鐘的講解視頻`,
      `寫一份深度分析報告，提出你的見解`
    ];

    for (let i = 0; i < count; i++) {
      const repId = `${goalId}_rep_${i + 1}`;
      
      this.db?.prepare(`
        INSERT INTO ship_reps (id, goal_id, rep_number, title, deliverable, completed, deadline)
        VALUES (?, ?, ?, ?, ?, 0, ?)
      `).run(
        repId,
        goalId,
        i + 1,
        `Rep ${i + 1}: ${title}`,
        deliverables[i % deliverables.length],
        Date.now() + (i + 1) * stepSize
      );

      reps.push({
        id: i + 1,
        title: `Rep ${i + 1}`,
        deliverable: deliverables[i % deliverables.length],
        completed: false,
        deadline: Date.now() + (i + 1) * stepSize
      });
    }

    return reps;
  }

  /**
   * 查看進度
   */
  viewProgress(goalId: string): string {
    if (!this.db) return '❌ 數據庫未就緒';

    try {
      const goal = this.db.prepare('SELECT * FROM learning_goals WHERE id = ?').get(goalId) as any;
      if (!goal) return `❌ 目標不存在`;

      const reps = this.db.prepare('SELECT * FROM ship_reps WHERE goal_id = ? ORDER BY rep_number').all(goalId) as any[];

      let result = `📊 **${goal.title}** - 學習進度\n\n`;
      
      let completed = 0;
      for (const rep of reps) {
        const status = rep.completed ? '✅' : '⏳';
        result += `${status} Rep ${rep.rep_number}: ${rep.deliverable}\n`;
        if (rep.completed) completed++;
      }

      const progress = Math.round((completed / reps.length) * 100);
      result += `\n📈 完成度：${progress}%`;

      return result;
    } catch (error) {
      return `❌ 查詢失敗`;
    }
  }

  /**
   * 完成 Rep
   */
  completeRep(repId: string): string {
    if (!this.db) return '❌ 數據庫未就緒';

    try {
      this.db.prepare('UPDATE ship_reps SET completed = 1 WHERE id = ?').run(repId);
      return `✅ Rep 已完成！繼續加油 💪`;
    } catch (error) {
      return `❌ 更新失敗`;
    }
  }
}

export default new ShipLearnNext();
```

---

## Part 5：Skill 5️⃣ - personal-assistant（24 小時管家）

### Step 5：創建持久記憶技能

```bash
nano src/skills/advanced/personal-assistant.ts
```

**複製以下代碼：**

```typescript
import Database from 'better-sqlite3';
import * as path from 'path';

interface UserProfile {
  userId: string;
  name: string;
  goals: string[];
  preferences: Record<string, any>;
  lastSeen: number;
}

class PersonalAssistant {
  private db: Database.Database | null = null;
  private currentUserId: string = 'default_user';

  constructor() {
    this.initializeDB();
  }

  private initializeDB(): void {
    try {
      const dbPath = path.join(process.env.NOTES_DB_PATH || '~/.nanoclaw/notes', 'assistant.db');
      this.db = new Database(dbPath);

      this.db.exec(`
        CREATE TABLE IF NOT EXISTS user_profiles (
          user_id TEXT PRIMARY KEY,
          name TEXT,
          goals TEXT,
          preferences TEXT,
          last_seen INTEGER
        );
        
        CREATE TABLE IF NOT EXISTS memory_log (
          id INTEGER PRIMARY KEY,
          user_id TEXT,
          event TEXT,
          data TEXT,
          timestamp INTEGER
        );
      `);
    } catch (error) {
      console.error('Assistant DB 初始化失敗:', error);
    }
  }

  /**
   * 記錄用戶信息
   */
  recordUserInfo(name: string, goals: string[], preferences: any): string {
    if (!this.db) return '❌ 數據庫未就緒';

    try {
      this.db.prepare(`
        INSERT OR REPLACE INTO user_profiles (user_id, name, goals, preferences, last_seen)
        VALUES (?, ?, ?, ?, ?)
      `).run(
        this.currentUserId,
        name,
        JSON.stringify(goals),
        JSON.stringify(preferences),
        Date.now()
      );

      return `✅ 已記錄用戶信息\n👤 姓名：${name}\n🎯 目標：${goals.join(', ')}`;
    } catch (error) {
      return `❌ 記錄失敗`;
    }
  }

  /**
   * 查看用戶檔案
   */
  viewUserProfile(): string {
    if (!this.db) return '❌ 數據庫未就緒';

    try {
      const profile = this.db.prepare('SELECT * FROM user_profiles WHERE user_id = ?')
        .get(this.currentUserId) as any;

      if (!profile) {
        return `❌ 還沒有用戶檔案，請先運行 /assistant_setup`;
      }

      let result = `👤 **用戶檔案**\n\n`;
      result += `姓名：${profile.name}\n`;
      result += `目標：${JSON.parse(profile.goals).join(', ')}\n`;
      result += `上次見面：${new Date(profile.last_seen).toLocaleString('zh-TW')}`;

      return result;
    } catch (error) {
      return `❌ 查詢失敗`;
    }
  }

  /**
   * 記錄事件
   */
  logEvent(event: string, data: any): void {
    if (!this.db) return;

    try {
      this.db.prepare(`
        INSERT INTO memory_log (user_id, event, data, timestamp)
        VALUES (?, ?, ?, ?)
      `).run(
        this.currentUserId,
        event,
        JSON.stringify(data),
        Date.now()
      );
    } catch (error) {
      console.error('事件記錄失敗:', error);
    }
  }

  /**
   * 智能提醒
   */
  generateReminder(): string {
    if (!this.db) return '❌ 數據庫未就緒';

    try {
      const profile = this.db.prepare('SELECT * FROM user_profiles WHERE user_id = ?')
        .get(this.currentUserId) as any;

      if (!profile) return '❌ 沒有用戶檔案';

      const goals = JSON.parse(profile.goals);
      const now = new Date();
      
      let reminder = `📢 **AI 助手每日提醒**\n\n`;
      reminder += `早上好，${profile.name}！\n\n`;
      reminder += `📌 **你的目標：**\n`;
      for (const goal of goals) {
        reminder += `• ${goal}\n`;
      }

      reminder += `\n💡 **今日建議：**\n`;
      reminder += `1. 先完成最重要的任務\n`;
      reminder += `2. 記得休息，保持效率\n`;
      reminder += `3. 反思今天的進度`;

      return reminder;
    } catch (error) {
      return `❌ 生成提醒失敗`;
    }
  }
}

export default new PersonalAssistant();
```

---

## Part 6：Skill 6️⃣ - humanizer-zh（中文潤色大師）

### Step 6：創建中文潤色技能

```bash
nano src/skills/advanced/humanizer-zh.ts
```

**複製以下代碼：**

```typescript
class HumanizerZH {
  /**
   * 潤色中文文本，去除機器味
   */
  humanizeText(text: string): string {
    try {
      let result = text;

      // 1. 替換機械句式
      result = this.replaceMechanicalPhrases(result);

      // 2. 優化句式結構（長短句混搭）
      result = this.optimizeSentenceStructure(result);

      // 3. 注入情感邏輯
      result = this.addEmotionalLogic(result);

      // 4. 消除翻譯腔
      result = this.removeTranslationAccent(result);

      return result;
    } catch (error) {
      return text; // 失敗時返回原文
    }
  }

  /**
   * 替換機械句式
   */
  private replaceMechanicalPhrases(text: string): string {
    const replacements: [RegExp, string][] = [
      [/可以看出/g, '顯然'],
      [/需要指出的是/g, '值得注意的是'],
      [/一方面.*?另一方面/gs, '既要...又要...'],
      [/因此/g, '所以'],
      [/與此同時/g, '同時'],
      [/本文認為/g, '我認為'],
      [/作者認為/g, '我的看法是'],
    ];

    let result = text;
    for (const [pattern, replacement] of replacements) {
      result = result.replace(pattern, replacement);
    }

    return result;
  }

  /**
   * 優化句式結構
   */
  private optimizeSentenceStructure(text: string): string {
    const sentences = text.split(/[。！？]/);
    
    const optimized = sentences.map((sentence, index) => {
      if (sentence.length > 50) {
        // 長句分解
        return this.breakLongSentence(sentence);
      } else if (sentence.length < 20 && index < sentences.length - 1) {
        // 過短句子可以合併
        return sentence;
      }
      return sentence;
    });

    return optimized.join('。').trim();
  }

  /**
   * 分解長句
   */
  private breakLongSentence(sentence: string): string {
    const splitPoints = ['，', '、', '而且', '或者'];
    
    for (const point of splitPoints) {
      if (sentence.includes(point)) {
        return sentence.replace(point, '。') + '。';
      }
    }

    return sentence + '。';
  }

  /**
   * 注入情感邏輯
   */
  private addEmotionalLogic(text: string): string {
    // 添加過渡詞和情感表達
    const emotionalPhrases = [
      '有趣的是',
      '令人驚奇的是',
      '值得注意的是',
      '更加深層的思考',
      '從另一個角度看',
    ];

    // 在段落開頭隨機添加情感詞
    if (Math.random() > 0.5 && text.length > 100) {
      const phrase = emotionalPhrases[Math.floor(Math.random() * emotionalPhrases.length)];
      return phrase + '，' + text;
    }

    return text;
  }

  /**
   * 消除翻譯腔
   */
  private removeTranslationAccent(text: string): string {
    const translationPatterns: [RegExp, string][] = [
      [/...的地方/g, '...之處'],
      [/...的過程中/g, '...過程中'],
      [/...的方式/g, '...方式'],
      [/\s+/g, ''],
    ];

    let result = text;
    for (const [pattern, replacement] of translationPatterns) {
      result = result.replace(pattern, replacement);
    }

    return result;
  }

  /**
   * 檢測機器味指數
   */
  detectAISignature(text: string): number {
    let score = 0;

    // 檢測機械詞彙
    const mechanicalWords = ['可以看出', '需要指出', '因此', '另一方面', '本文認為'];
    const count = mechanicalWords.reduce((acc, word) => 
      acc + (text.includes(word) ? 1 : 0), 0);
    
    score += count * 20;

    // 檢測句式單調性
    const avgLength = text.length / (text.match(/[。！？]/g) || []).length;
    if (avgLength > 60) score += 30; // 長句過多
    if (avgLength < 15) score += 20; // 短句過多

    // 檢測重複詞彙
    const words = text.split('');
    const uniqueRatio = new Set(words).size / words.length;
    if (uniqueRatio < 0.4) score += 30;

    return Math.min(score, 100);
  }
}

export default new HumanizerZH();
```

---

## Part 7：整合所有技能

### Step 7：更新 src/index.ts

```bash
nano src/index.ts
```

**添加 6 Skills 命令：**

```typescript
import TelegramBot from 'node-telegram-bot-api';
import agentBrowser from './skills/advanced/agent-browser';
import diagramGenerator from './skills/advanced/diagram-generator';
import pptxAnalyzer from './skills/advanced/pptx-analyzer';
import shipLearnNext from './skills/advanced/ship-learn-next';
import personaAss from './skills/advanced/personal-assistant';
import humanizerZH from './skills/advanced/humanizer-zh';

const tgBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// ========== Skill 1️⃣ : agent-browser ==========

tgBot.onText(/\/browser_search (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  await tgBot.sendMessage(chatId, '🔍 正在搜索和下載資源...');
  const result = await agentBrowser.searchAndDownload(query);
  await tgBot.sendMessage(chatId, result);
});

// ========== Skill 2️⃣ : diagram-generator ==========

tgBot.onText(/\/diagram_mindmap (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const input = match[1];
  const [title, ...content] = input.split('|');
  const result = diagramGenerator.generateMindmap(title.trim(), content.join('|'));
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/diagram_flow (.+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const title = match[1];
  const steps = match[2].split(',').map(s => s.trim());
  const result = diagramGenerator.generateFlowchart(title, steps);
  await tgBot.sendMessage(chatId, result);
});

// ========== Skill 3️⃣ : pptx ==========

tgBot.onText(/\/pptx_analyze (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const filePath = match[1];
  const result = await pptxAnalyzer.analyzePPTX(filePath);
  await tgBot.sendMessage(chatId, result);
});

// ========== Skill 4️⃣ : ship-learn-next ==========

tgBot.onText(/\/goal_create (.+) (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const title = match[1];
  const days = parseInt(match[2]);
  const result = shipLearnNext.createLearningGoal(title, days);
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/goal_progress (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const goalId = match[1];
  const result = shipLearnNext.viewProgress(goalId);
  await tgBot.sendMessage(chatId, result);
});

// ========== Skill 5️⃣ : personal-assistant ==========

tgBot.onText(/\/assistant_setup (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [name, goals] = match[1].split('|');
  const goalList = goals.split(',').map(g => g.trim());
  const result = personaAss.recordUserInfo(name.trim(), goalList, {});
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/assistant_profile/, async (msg) => {
  const chatId = msg.chat.id;
  const result = personaAss.viewUserProfile();
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/assistant_reminder/, async (msg) => {
  const chatId = msg.chat.id;
  const result = personaAss.generateReminder();
  await tgBot.sendMessage(chatId, result);
});

// ========== Skill 6️⃣ : humanizer-zh ==========

tgBot.onText(/\/humanize (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const text = match[1];
  const humanized = humanizerZH.humanizeText(text);
  const aiScore = humanizerZH.detectAISignature(text);
  
  let result = `✨ **中文潤色完成**\n\n`;
  result += `**原文：** ${text}\n\n`;
  result += `**潤色後：** ${humanized}\n\n`;
  result += `📊 原文機器味指數：${aiScore}% （越低越好）`;
  
  await tgBot.sendMessage(chatId, result);
});

console.log('🚀 NanoClaw 6 個核心 Skills 已全部啟動！');
```

---

## 完整命令列表

```
========== Skill 1️⃣ : agent-browser ==========
/browser_search [query]     - 搜索並下載資源

========== Skill 2️⃣ : diagram-generator ==========
/diagram_mindmap [title]|[內容]    - 生成思維導圖
/diagram_flow [標題] [步驟1,步驟2...] - 生成流程圖

========== Skill 3️⃣ : pptx ==========
/pptx_analyze [文件路徑]   - 深度分析 PPT

========== Skill 4️⃣ : ship-learn-next ==========
/goal_create [標題] [天數]   - 創建學習目標（自動生成 5 個 Rep）
/goal_progress [目標ID]      - 查看學習進度

========== Skill 5️⃣ : personal-assistant ==========
/assistant_setup [姓名]|[目標1,目標2...] - 初始化用戶檔案
/assistant_profile          - 查看用戶檔案
/assistant_reminder         - 獲取每日提醒

========== Skill 6️⃣ : humanizer-zh ==========
/humanize [文本]            - 中文潤色（去除機器味）
```

---

## 完整的實戰工作流

```
【世界電影史】學習摸鱼指南

一、獲取資源（Skill 1️⃣）
   /browser_search 世界電影史教材 PDF
   ↓ 自動搜索並下載資源

二、知識拆解（Skill 2️⃣ + 3️⃣）
   /diagram_mindmap 電影史|默片時代|有聲電影|彩色電影
   /pptx_analyze /downloads/lecture.pptx
   ↓ 生成思維導圖 + 提取課件重點

三、行動規劃（Skill 4️⃣）
   /goal_create 從電影初心者到影評家 90
   ↓ 自動生成 5 個 Rep（寫評論、剪視頻等）

四、持久記憶（Skill 5️⃣）
   /assistant_setup 小王|成為影評家,掌握電影賞析技巧
   /assistant_reminder
   ↓ AI 記住你的目標，每天提醒進度

五、內容潤色（Skill 6️⃣）
   /humanize 本文通過分析電影鏡頭語言來探討...
   ↓ 文論文初稿變成資深影評人的獨立觀察

📊 結果：3 個月後，你已完成 5 個實踐回合，
         寫了深度評論、剪了視頻分析、提交了論文。
         摸鱼效率和學習效果雙雙拉滿！
```

---

## 完整檢查清單

- [ ] 安裝所有依賴（axios、pptxparse 等）
- [ ] 創建 src/skills/advanced/ 目錄
- [ ] 創建 agent-browser.ts
- [ ] 創建 diagram-generator.ts
- [ ] 創建 pptx-analyzer.ts
- [ ] 創建 ship-learn-next.ts
- [ ] 創建 personal-assistant.ts
- [ ] 創建 humanizer-zh.ts
- [ ] 更新 src/index.ts
- [ ] npm start 成功運行
- [ ] 在 Telegram 測試所有 6 個技能

---

**NanoClaw 現在是「打工人摸鱼高效利器」！** 🚀

從找資源 → 拆解知識 → 行動規劃 → 持久記憶 → 內容潤色，
一條龍自動化，讓你真正的「高效摸鱼」！
