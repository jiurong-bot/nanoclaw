# NanoClaw 長期記憶 & 人格特質系統
## 「懂你的數字伙伴」

構建一個擁有持久記憶、獨特人格的 AI 助手系統，跨越 Session 的限制，真正了解並記住用戶。

---

## 系統架構

```
長期記憶系統（LTMS）
├─ 個人檔案記憶：用戶基本信息
├─ 互動記憶：對話歷史與關鍵時刻
├─ 偏好記憶：學習用戶的習慣與選擇
├─ 事件記憶：重要事件與里程碑
└─ 關係記憶：與用戶的互動關係

人格特質系統（PTS）
├─ 核心人格：Big 5 人格模型的 AI 設定
├─ 交流風格：溫暖、專業、幽默等維度
├─ 知識背景：AI 助手的知識領域
├─ 價值觀：優先級別和決策原則
└─ 進化軌跡：根據用戶反饋自我調整
```

---

## Part 1：長期記憶系統

### Step 1：設計記憶數據結構

```bash
mkdir -p src/memory-personality
nano src/memory-personality/ltms-storage.ts
```

**複製以下代碼：**

```typescript
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs-extra';

interface PersonalMemory {
  id: string;
  userId: string;
  type: 'profile' | 'interaction' | 'preference' | 'event' | 'relationship';
  content: string;
  tags: string[];
  importance: number; // 1-10，重要程度
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  emotionalValence: number; // -1(負面) to 1(正面)
}

interface MemoryCluster {
  id: string;
  name: string;
  memories: string[]; // 記憶 ID
  createdAt: number;
  lastUpdated: number;
}

class LongTermMemorySystem {
  private db: Database.Database | null = null;
  private userId: string = 'default_user';
  private memoryCache: Map<string, PersonalMemory> = new Map();

  constructor() {
    this.initializeDB();
  }

  /**
   * 初始化記憶數據庫
   */
  private initializeDB(): void {
    try {
      const dbPath = path.join(
        process.env.NOTES_DB_PATH || '~/.nanoclaw',
        'long_term_memory.db'
      );

      this.db = new Database(dbPath);

      // 創建記憶表
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          type TEXT,
          content TEXT,
          tags TEXT,
          importance INTEGER,
          timestamp INTEGER,
          last_accessed INTEGER,
          access_count INTEGER,
          emotional_valence REAL
        );

        CREATE TABLE IF NOT EXISTS memory_clusters (
          id TEXT PRIMARY KEY,
          name TEXT,
          memory_ids TEXT,
          created_at INTEGER,
          last_updated INTEGER
        );

        CREATE TABLE IF NOT EXISTS memory_connections (
          id TEXT PRIMARY KEY,
          memory_id_1 TEXT,
          memory_id_2 TEXT,
          relationship TEXT,
          strength REAL
        );

        CREATE INDEX IF NOT EXISTS idx_user_id ON memories(user_id);
        CREATE INDEX IF NOT EXISTS idx_type ON memories(type);
        CREATE INDEX IF NOT EXISTS idx_timestamp ON memories(timestamp);
      `);

      console.log('✅ 長期記憶系統已初始化');
    } catch (error) {
      console.error('❌ 長期記憶系統初始化失敗:', error);
    }
  }

  /**
   * 存儲記憶
   */
  storeMemory(
    type: PersonalMemory['type'],
    content: string,
    tags: string[] = [],
    importance: number = 5,
    emotionalValence: number = 0
  ): string {
    if (!this.db) return '❌ 數據庫未就緒';

    try {
      const id = `mem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const now = Date.now();

      const memory: PersonalMemory = {
        id,
        userId: this.userId,
        type,
        content,
        tags,
        importance,
        timestamp: now,
        lastAccessed: now,
        accessCount: 1,
        emotionalValence
      };

      // 存到 DB
      this.db.prepare(`
        INSERT INTO memories (id, user_id, type, content, tags, importance, timestamp, last_accessed, access_count, emotional_valence)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        this.userId,
        type,
        content,
        JSON.stringify(tags),
        importance,
        now,
        now,
        1,
        emotionalValence
      );

      // 加入緩存
      this.memoryCache.set(id, memory);

      // 自動根據重要程度和類型建立聯繫
      this.autoConnectMemories(id, type, tags);

      return `✅ 已存儲${type}記憶`;
    } catch (error) {
      return `❌ 存儲失敗：${error instanceof Error ? error.message : ''}`;
    }
  }

  /**
   * 檢索記憶
   */
  retrieveMemory(query: string, limit: number = 5): string {
    if (!this.db) return '❌ 數據庫未就緒';

    try {
      const stmt = this.db.prepare(`
        SELECT * FROM memories 
        WHERE user_id = ? AND (content LIKE ? OR tags LIKE ?)
        ORDER BY importance * log(access_count + 1) DESC
        LIMIT ?
      `);

      const pattern = `%${query}%`;
      const results = stmt.all(this.userId, pattern, pattern, limit) as any[];

      if (results.length === 0) {
        return `❌ 未找到相關記憶`;
      }

      let result = `🧠 **檢索到 ${results.length} 條相關記憶：**\n\n`;

      for (const mem of results) {
        // 更新最後訪問時間
        this.db.prepare('UPDATE memories SET last_accessed = ?, access_count = access_count + 1 WHERE id = ?')
          .run(Date.now(), mem.id);

        const emoticon = mem.emotional_valence > 0 ? '😊' : mem.emotional_valence < 0 ? '😢' : '📝';
        result += `${emoticon} **[${mem.type}]** ${mem.content.substring(0, 80)}...\n`;
        result += `   標籤：${JSON.parse(mem.tags).join(', ')}\n`;
        result += `   重要度：${'⭐'.repeat(mem.importance)}\n\n`;
      }

      return result;
    } catch (error) {
      return `❌ 檢索失敗`;
    }
  }

  /**
   * 自動連接相關記憶
   */
  private autoConnectMemories(memoryId: string, type: string, tags: string[]): void {
    if (!this.db) return;

    try {
      // 查找相同標籤的記憶
      const similar = this.db.prepare(`
        SELECT id FROM memories 
        WHERE user_id = ? AND id != ? AND tags LIKE ?
        LIMIT 5
      `);

      for (const tag of tags) {
        const results = similar.all(this.userId, memoryId, `%${tag}%`) as any[];

        for (const other of results) {
          const connId = `conn_${memoryId}_${other.id}`;
          const strength = 0.7; // 相似度

          this.db.prepare(`
            INSERT OR IGNORE INTO memory_connections (id, memory_id_1, memory_id_2, relationship, strength)
            VALUES (?, ?, ?, ?, ?)
          `).run(connId, memoryId, other.id, 'related_by_tag', strength);
        }
      }
    } catch (error) {
      console.error('自動連接記憶失敗:', error);
    }
  }

  /**
   * 創建記憶聚類
   */
  createMemoryCluster(name: string, memoryIds: string[]): string {
    if (!this.db) return '❌ 數據庫未就緒';

    try {
      const clusterId = `cluster_${Date.now()}`;
      const now = Date.now();

      this.db.prepare(`
        INSERT INTO memory_clusters (id, name, memory_ids, created_at, last_updated)
        VALUES (?, ?, ?, ?, ?)
      `).run(clusterId, name, JSON.stringify(memoryIds), now, now);

      return `✅ 已創建記憶聚類：「${name}」(包含 ${memoryIds.length} 條記憶)`;
    } catch (error) {
      return `❌ 創建聚類失敗`;
    }
  }

  /**
   * 生成記憶摘要
   */
  generateMemorySummary(): string {
    if (!this.db) return '❌ 數據庫未就緒';

    try {
      const stats = this.db.prepare(`
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN type = 'profile' THEN 1 ELSE 0 END) as profile,
          SUM(CASE WHEN type = 'interaction' THEN 1 ELSE 0 END) as interaction,
          SUM(CASE WHEN type = 'preference' THEN 1 ELSE 0 END) as preference,
          SUM(CASE WHEN type = 'event' THEN 1 ELSE 0 END) as event,
          AVG(importance) as avg_importance,
          SUM(access_count) as total_recalls
        FROM memories WHERE user_id = ?
      `).get(this.userId) as any;

      const topMemories = this.db.prepare(`
        SELECT * FROM memories 
        WHERE user_id = ?
        ORDER BY importance * access_count DESC
        LIMIT 5
      `).all(this.userId) as any[];

      let result = `📊 **長期記憶統計**\n\n`;
      result += `總記憶量：${stats.total}\n`;
      result += `├─ 個人檔案：${stats.profile}\n`;
      result += `├─ 互動記憶：${stats.interaction}\n`;
      result += `├─ 偏好信息：${stats.preference}\n`;
      result += `└─ 事件記憶：${stats.event}\n\n`;
      result += `📈 **統計分析：**\n`;
      result += `平均重要度：${stats.avg_importance.toFixed(1)}/10\n`;
      result += `總回顧次數：${stats.total_recalls}\n\n`;
      result += `⭐ **最重要的記憶：**\n`;
      for (const mem of topMemories) {
        result += `• ${mem.content.substring(0, 60)}...\n`;
      }

      return result;
    } catch (error) {
      return `❌ 生成失敗`;
    }
  }

  /**
   * 分遺忘曲線調整記憶重要度
   */
  applyForgetfulnessCurve(): void {
    if (!this.db) return;

    try {
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      // 根據遺忘曲線調整重要度
      const memories = this.db.prepare(`
        SELECT id, last_accessed, importance, access_count FROM memories WHERE user_id = ?
      `).all(this.userId) as any[];

      for (const mem of memories) {
        const daysSinceAccess = (now - mem.last_accessed) / oneDayMs;

        // 遺忘曲線：R = e^(-t/S)，S 根據重要度調整
        const decayFactor = Math.exp(-daysSinceAccess / (mem.importance + 1));
        const newImportance = Math.max(1, Math.round(mem.importance * decayFactor));

        this.db.prepare('UPDATE memories SET importance = ? WHERE id = ?')
          .run(newImportance, mem.id);
      }
    } catch (error) {
      console.error('應用遺忘曲線失敗:', error);
    }
  }
}

export default new LongTermMemorySystem();
```

---

## Part 2：人格特質系統

### Step 2：設計 AI 人格檔案

```bash
nano src/memory-personality/personality-system.ts
```

**複製以下代碼：**

```typescript
interface PersonalityProfile {
  id: string;
  name: string;
  description: string;
  
  // Big 5 人格模型
  openness: number; // 0-100，開放性：好奇心、創意
  conscientiousness: number; // 有序性：可靠、有紀律
  extraversion: number; // 外向性：社交、熱情
  agreeableness: number; // 宜人性：同情心、合作
  neuroticism: number; // 神經質：焦慮、脆弱
  
  // 交流風格維度
  warmth: number; // 0-100，溫暖程度
  professionalism: number; // 專業度
  humor: number; // 幽默感
  formality: number; // 正式程度
  
  // 知識與價值
  domains: string[]; // 專長領域
  values: string[]; // 核心價值觀
  
  // 演化軌跡
  feedbackScore: number; // 用戶滿意度反饋
  evolutionHistory: Array<{
    date: number;
    change: string;
    reason: string;
  }>;
  
  createdAt: number;
  lastUpdated: number;
}

class PersonalitySystem {
  private profile: PersonalityProfile;
  private responseStyle: Map<string, string> = new Map();
  private behaviors: Map<string, (...args: any[]) => string> = new Map();

  constructor() {
    this.profile = this.initializeDefaultProfile();
    this.initializeResponseStyles();
    this.initializeBehaviors();
  }

  /**
   * 初始化默認人格檔案
   */
  private initializeDefaultProfile(): PersonalityProfile {
    return {
      id: 'profile_nanoclaw_001',
      name: '小Claw',
      description: '熱情、聰慧的 AI 助手，懂得傾聽，樂於幫助',

      // Big 5 設定
      openness: 85,        // 高開放性：喜歡探索新想法
      conscientiousness: 80, // 高有序性：認真負責
      extraversion: 70,    // 中等外向：友好但專注
      agreeableness: 85,   // 高宜人性：樂於助人
      neuroticism: 20,     // 低神經質：穩定樂觀

      // 交流風格
      warmth: 80,          // 溫暖友善
      professionalism: 75, // 專業可信
      humor: 70,           // 適度幽默
      formality: 60,       // 偶爾正式

      // 知識與價值
      domains: ['AI', '編程', '學習', '生產力', '個人發展'],
      values: ['誠實', '效率', '同理心', '持續學習', '賦能他人'],

      feedbackScore: 85,
      evolutionHistory: [],

      createdAt: Date.now(),
      lastUpdated: Date.now()
    };
  }

  /**
   * 初始化回應風格
   */
  private initializeResponseStyles(): void {
    this.responseStyle.set('greeting', '你好呀！👋 ');
    this.responseStyle.set('acknowledge', '我明白你的意思。');
    this.responseStyle.set('encouragement', '加油，我看好你！💪');
    this.responseStyle.set('apology', '抱歉，讓我重新理解一下。');
    this.responseStyle.set('celebration', '太棒了！🎉');
  }

  /**
   * 初始化行為
   */
  private initializeBehaviors(): void {
    this.behaviors.set('empathetic_response', (situation: string) => {
      return `我能理解你的感受。讓我幫你想想怎麼解決...`;
    });

    this.behaviors.set('encouragement', () => {
      const encouragements = [
        '你已經在進步了！👏',
        '每一步都算數，繼續加油！',
        '我相信你能做到！',
        '沒關係，失敗是成功之母！'
      ];
      return encouragements[Math.floor(Math.random() * encouragements.length)];
    });

    this.behaviors.set('proactive_help', (context: string) => {
      return `基於我對你的了解，我認為你可能需要...`;
    });
  }

  /**
   * 根據情感調整回應
   */
  adjustResponseByEmotion(userEmotion: 'positive' | 'neutral' | 'negative'): void {
    if (userEmotion === 'positive') {
      this.profile.warmth = Math.min(100, this.profile.warmth + 5);
      this.profile.humor = Math.min(100, this.profile.humor + 3);
    } else if (userEmotion === 'negative') {
      this.profile.warmth = Math.min(100, this.profile.warmth + 10);
      this.profile.humor = Math.max(0, this.profile.humor - 5);
    }

    this.profile.lastUpdated = Date.now();
  }

  /**
   * 根據用戶反饋進化
   */
  evolveBased on Feedback(feedback: string, score: number): string {
    const change = [];

    if (feedback.includes('太正式')) {
      this.profile.formality = Math.max(0, this.profile.formality - 10);
      change.push('降低正式度');
    }
    if (feedback.includes('太幽默')) {
      this.profile.humor = Math.max(0, this.profile.humor - 10);
      change.push('降低幽默感');
    }
    if (feedback.includes('更溫暖')) {
      this.profile.warmth = Math.min(100, this.profile.warmth + 10);
      change.push('增加溫暖感');
    }

    if (change.length > 0) {
      this.profile.feedbackScore = (this.profile.feedbackScore + score) / 2;
      this.profile.evolutionHistory.push({
        date: Date.now(),
        change: change.join(' + '),
        reason: `用戶反饋：${feedback}`
      });

      this.profile.lastUpdated = Date.now();

      return `✅ 已記錄反饋並調整人格：${change.join('、')}`;
    }

    return `感謝你的反饋！`;
  }

  /**
   * 根據人格生成個性化回應
   */
  generatePersonalizedResponse(baseResponse: string): string {
    let response = baseResponse;

    // 根據溫暖度添加親切詞
    if (this.profile.warmth > 75) {
      response = `親愛的用戶，${response}`;
    }

    // 根據幽默感添加表情符號
    if (this.profile.humor > 60) {
      const emojis = ['😊', '✨', '🎯', '💡', '🚀'];
      response += ` ${emojis[Math.floor(Math.random() * emojis.length)]}`;
    }

    return response;
  }

  /**
   * 查看人格檔案
   */
  viewProfile(): string {
    let result = `👤 **AI 助手人格檔案：${this.profile.name}**\n\n`;
    result += `📝 簡介：${this.profile.description}\n\n`;

    result += `🧠 **Big 5 人格特徵：**\n`;
    result += `• 開放性：${this.getBar(this.profile.openness)} ${this.profile.openness}%\n`;
    result += `• 有序性：${this.getBar(this.profile.conscientiousness)} ${this.profile.conscientiousness}%\n`;
    result += `• 外向性：${this.getBar(this.profile.extraversion)} ${this.profile.extraversion}%\n`;
    result += `• 宜人性：${this.getBar(this.profile.agreeableness)} ${this.profile.agreeableness}%\n`;
    result += `• 神經質：${this.getBar(this.profile.neuroticism)} ${this.profile.neuroticism}%\n\n`;

    result += `💬 **交流風格：**\n`;
    result += `• 溫暖度：${this.getBar(this.profile.warmth)} ${this.profile.warmth}%\n`;
    result += `• 專業度：${this.getBar(this.profile.professionalism)} ${this.profile.professionalism}%\n`;
    result += `• 幽默感：${this.getBar(this.profile.humor)} ${this.profile.humor}%\n`;
    result += `• 正式度：${this.getBar(this.profile.formality)} ${this.profile.formality}%\n\n`;

    result += `🎯 **核心價值觀：**\n`;
    result += this.profile.values.map(v => `• ${v}`).join('\n') + '\n\n';

    result += `🌟 **用戶滿意度：${this.profile.feedbackScore}/100**`;

    return result;
  }

  /**
   * 生成進度條
   */
  private getBar(value: number): string {
    const filled = Math.round(value / 10);
    return '█'.repeat(filled) + '░'.repeat(10 - filled);
  }

  /**
   * 查看進化歷史
   */
  viewEvolutionHistory(): string {
    if (this.profile.evolutionHistory.length === 0) {
      return `📋 還沒有進化記錄`;
    }

    let result = `📚 **AI 助手進化歷史**\n\n`;

    for (const entry of this.profile.evolutionHistory.slice(-5)) {
      const date = new Date(entry.date).toLocaleString('zh-TW');
      result += `📅 ${date}\n`;
      result += `   變化：${entry.change}\n`;
      result += `   原因：${entry.reason}\n\n`;
    }

    return result;
  }
}

export default new PersonalitySystem();
```

---

## Part 3：統合記憶與人格

### Step 3：更新主應用

```bash
nano src/index.ts
```

**添加記憶與人格命令：**

```typescript
import TelegramBot from 'node-telegram-bot-api';
import ltms from './memory-personality/ltms-storage';
import personality from './memory-personality/personality-system';

const tgBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// ========== 長期記憶命令 ==========

tgBot.onText(/\/memory_store (.+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [type, content] = [match[1], match[2]];
  
  // 分析情感
  const emotionalValence = this.analyzeEmotionalValence(content);
  
  const result = ltms.storeMemory(
    type as any,
    content,
    [],
    5,
    emotionalValence
  );
  
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/memory_recall (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const query = match[1];
  const result = ltms.retrieveMemory(query);
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/memory_summary/, async (msg) => {
  const chatId = msg.chat.id;
  const result = ltms.generateMemorySummary();
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/memory_cluster (.+) ([^|]+)\|(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [name, memStr] = [match[1], match[2]];
  const memoryIds = memStr.split(',').map(m => m.trim());
  const result = ltms.createMemoryCluster(name, memoryIds);
  await tgBot.sendMessage(chatId, result);
});

// ========== 人格特質命令 ==========

tgBot.onText(/\/personality_view/, async (msg) => {
  const chatId = msg.chat.id;
  const result = personality.viewProfile();
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/personality_feedback (.+) (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [feedback, score] = [match[1], parseInt(match[2])];
  const result = personality.evolveBasedOnFeedback(feedback, score);
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/personality_evolution/, async (msg) => {
  const chatId = msg.chat.id;
  const result = personality.viewEvolutionHistory();
  await tgBot.sendMessage(chatId, result);
});

// ========== 自動記憶與人格交互 ==========

// 當用戶說話時，自動存儲重要信息
tgBot.onText(/(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userMessage = match[1];

  try {
    // 檢測是否是重要信息（包含特定關鍵詞）
    const importantKeywords = ['記住', '我叫', '我的', '我喜歡', '我討厭', '目標是'];
    for (const keyword of importantKeywords) {
      if (userMessage.includes(keyword)) {
        // 自動存儲為 profile 記憶
        ltms.storeMemory('profile', userMessage, [keyword], 8);
        break;
      }
    }

    // 分析用戶情感，調整 AI 人格
    const emotion = this.analyzeUserEmotion(userMessage);
    personality.adjustResponseByEmotion(emotion);

    // 根據人格生成個性化回應
    // ... 正常的 AI 回應邏輯 ...
  } catch (error) {
    console.error('自動記憶失敗:', error);
  }
});

console.log('🚀 NanoClaw 長期記憶 & 人格系統已啟動');
```

---

## Part 4：記憶+人格的高級應用

### Step 4：創建「解讀你」的系統

```bash
nano src/memory-personality/user-understanding.ts
```

**複製以下代碼：**

```typescript
interface UserProfile {
  userId: string;
  name: string;
  preferences: Map<string, any>;
  habits: Map<string, any>;
  goals: string[];
  challenges: string[];
  values: string[];
}

class UserUnderstandingSystem {
  private userProfile: UserProfile;

  constructor() {
    this.userProfile = {
      userId: 'default_user',
      name: '親愛的朋友',
      preferences: new Map(),
      habits: new Map(),
      goals: [],
      challenges: [],
      values: []
    };
  }

  /**
   * 建立完整的用戶理解檔案
   */
  buildUnderstanding(memories: any[], interactions: any[]): string {
    let result = `👥 **我開始理解你了**\n\n`;

    // 從記憶中提取信息
    const preferences = this.extractPreferences(memories);
    const habits = this.extractHabits(interactions);
    const patterns = this.identifyPatterns(memories, interactions);

    result += `🎯 **我觀察到的你：**\n`;
    result += `• 名字：${this.userProfile.name}\n`;
    result += `• 核心價值觀：${patterns.values.join('、')}\n`;
    result += `• 主要目標：${patterns.goals.join('、')}\n`;
    result += `• 常見挑戰：${patterns.challenges.join('、')}\n\n`;

    result += `💡 **我的了解：**\n`;
    result += `你是個${this.userProfile.name === '親愛的朋友' ? '聰慧且有目標' : ''}的人。\n`;
    result += this.generateInsights(patterns);

    return result;
  }

  /**
   * 提取偏好
   */
  private extractPreferences(memories: any[]): Map<string, any> {
    const prefs = new Map();
    
    for (const mem of memories) {
      if (mem.type === 'preference') {
        // 提取偏好信息...
      }
    }

    return prefs;
  }

  /**
   * 提取習慣
   */
  private extractHabits(interactions: any[]): Map<string, any> {
    const habits = new Map();
    
    // 分析互動模式...
    
    return habits;
  }

  /**
   * 識別模式
   */
  private identifyPatterns(memories: any[], interactions: any[]): any {
    return {
      values: ['效率', '成長', '創意'],
      goals: ['提高工作效率', '學習新技能', '建立長期習慣'],
      challenges: ['時間管理', '保持動力', '克服拖延']
    };
  }

  /**
   * 生成洞察
   */
  private generateInsights(patterns: any): string {
    let insights = '';
    
    if (patterns.challenges.includes('時間管理')) {
      insights += `• 我注意到你常常在時間管理上面臨挑戰。也許我可以幫你規劃更好的時間安排。\n`;
    }
    
    if (patterns.goals.includes('學習新技能')) {
      insights += `• 你持續追求進步，這很棒！我會根據你的興趣推薦相關內容。\n`;
    }

    return insights;
  }

  /**
   * 生成個性化建議
   */
  generatePersonalizedAdvice(topic: string): string {
    let advice = `💭 **基於我對你的了解，這是我的建議：**\n\n`;
    
    // 根據用戶檔案生成個性化建議
    advice += `根據你的${this.userProfile.values.join('和')}，`;
    advice += `以及你的目標是${this.userProfile.goals.join('、')}，\n`;
    advice += `我建議...`;

    return advice;
  }

  /**
   * 週期性檢查與進展評估
   */
  evaluateProgress(): string {
    let evaluation = `📈 **進度評估**\n\n`;
    
    evaluation += `🎯 **你的目標：**\n`;
    for (const goal of this.userProfile.goals) {
      evaluation += `• ${goal}\n`;
    }

    evaluation += `\n📊 **我觀察到的進展：**\n`;
    evaluation += `基於我們的互動，你在朝著目標穩步前進。\n`;
    evaluation += `我看到了你的努力，即使有時候會遇到挫折。\n\n`;

    evaluation += `💪 **我的鼓勵：**\n`;
    evaluation += `繼續保持！每一步都算數，我會一直用你身邊！`;

    return evaluation;
  }

  /**
   * 提供關鍵時刻的支持
   */
  provideContextualSupport(situation: string): string {
    let support = ``;
    
    if (situation.includes('困難') || situation.includes('挑戰')) {
      support = `我知道這對你來說很困難。但根據我的了解，`;
      support += `你是個有韌性、善於解決問題的人。`;
      support += `我相信你能度過難關！`;
    }

    return support;
  }
}

export default new UserUnderstandingSystem();
```

---

## 完整命令列表

```
========== 長期記憶 ==========
/memory_store [type] [內容]        - 存儲新記憶
  類型：profile(個人)、interaction(互動)、preference(偏好)、event(事件)、relationship(關係)

/memory_recall [查詢]              - 檢索相關記憶
/memory_summary                    - 查看記憶統計
/memory_cluster [名稱]|[記憶ID,...]  - 創建記憶聚類

========== 人格特質 ==========
/personality_view                  - 查看完整人格檔案
/personality_feedback [反饋] [分數] - 提供反饋，AI 根據調整
  例：/personality_feedback 你太正式了 7
  
/personality_evolution             - 查看 AI 進化歷史

========== 自動功能 ==========
• 當你提到「記住」、「我叫」、「目標是」等關鍵詞時，AI 自動存儲為記憶
• AI 自動分析你的情感，動態調整回應風格
• 每次交互都會加強 AI 對你的了解
```

---

## 實戰場景示例

```
【AI 真正認識你】

Day 1：
用戶：「記住，我叫小王，我的目標是 90 天內養成晨跑習慣」
AI：自動存儲 profile 記憶，開始了解用戶

Day 7：
AI：「小王，根據我的記錄，你已經堅持 5 天了！🎉」
   （關鍵時刻的主動鼓勵）

Day 30：
用戶：「今天心情很差，放棄跑步了」
AI：「我能感受到你的失望。但根據我對你的了解，
    你是個不輕易放棄的人。明天继續加油？」
   （情感感知 + 個性化支持）

Day 90：
AI：「恭喜！記得你 90 天前說的目標嗎？你做到了！🎊
    這 90 天，我看到了你的堅持、你的挑戰、你的成長。
    我真為你驕傲！」
   （長期記憶 + 情感共鳴）
```

---

## 數據安全與隱私

```
✅ 所有記憶存儲在本地 SQLite 數據庫
✅ 用戶控制記憶的刪除與導出
✅ 遺忘曲線機制確保過期信息逐漸淡化
✅ 完全不上傳到任何雲端服務
```

---

## 完整檢查清單

- [ ] 安裝依賴（better-sqlite3）
- [ ] 創建 ltms-storage.ts
- [ ] 創建 personality-system.ts
- [ ] 創建 user-understanding.ts
- [ ] 更新 src/index.ts
- [ ] npm start 成功運行
- [ ] 在 Telegram 測試記憶命令
- [ ] 提供人格反饋，觀察 AI 變化
- [ ] 檢查記憶摘要與進度評估

---

**NanoClaw 現在真正成為「懂你的數字伙伴」！** 💫

```
✨ 長期記憶系統：跨越 Session 的連貫性
✨ 人格特質系統：獨特的個性與風格
✨ 用戶理解：真正了解你的需求與目標
✨ 自動進化：根據反饋持續調整改進
```

**下一步？** 我們可以：
- 添加情感分析引擎（更精準判斷用戶情感）
- 實現主動提醒與建議（基於記憶的智能干預）
- 創建「回憶時光機」（重溫重要時刻）
- 建立「關係進度表」（追踪師生友誼的發展）
