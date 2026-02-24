# NanoClaw 技能庫架構設計
## 「獨立技能庫」- 解耦核心系統

技能與核心系統完全隔離，支持動態加載/卸載，不影響系統穩定性。

---

## 核心設計原則

```
❌ 舊架構的問題
   ├─ 技能與核心代碼混合
   ├─ 刪除技能時可能破壞依賴
   ├─ 難以維護和更新
   ├─ 單個技能 bug 影響全系統
   └─ 無法獨立測試技能

✅ 新架構的目標
   ├─ 技能完全隔離（獨立目錄結構）
   ├─ 核心系統零依賴
   ├─ 動態加載/卸載機制
   ├─ 技能故障隔離
   ├─ 獨立測試與版本管理
   └─ 即插即用
```

---

## 目錄結構設計

### 新的項目結構

```
/root/nanoclaw/
│
├─ src/
│  ├─ core/                          ← 【核心系統】隔離不動
│  │  ├─ index.ts                    (入口點)
│  │  ├─ bot-engine.ts               (Telegram bot)
│  │  └─ system-manager.ts           (系統管理器)
│  │
│  ├─ foundation/                    ← 【基礎層】必須
│  │  ├─ models/                     (AI 模型)
│  │  ├─ memory/                     (長期記憶)
│  │  ├─ personality/                (人格系統)
│  │  ├─ mcp/                        (MCP 協議)
│  │  ├─ monitoring/                 (監控系統)
│  │  └─ database.ts                 (數據庫)
│  │
│  └─ skill-loader/                  ← 【技能加載器】管理所有技能
│     ├─ skill-manager.ts            (技能管理)
│     ├─ skill-registry.ts           (技能註冊表)
│     ├─ skill-sandbox.ts            (沙箱隔離)
│     └─ skill-health-check.ts       (健康檢查)
│
├─ skills/                            ← 【獨立技能庫】可自由增刪
│  ├─ skill-library.config.json      (技能配置清單)
│  │
│  ├─ official/                      (官方技能)
│  │  ├─ browser/                    (agent-browser)
│  │  ├─ diagram/                    (diagram-generator)
│  │  ├─ pptx/                       (pptx 解析)
│  │  ├─ planning/                   (ship-learn-next)
│  │  ├─ assistant/                  (personal-assistant)
│  │  └─ humanizer/                  (humanizer-zh)
│  │
│  ├─ google/                        (Google 套件技能)
│  │  ├─ gmail/
│  │  ├─ calendar/
│  │  └─ drive/
│  │
│  ├─ coding/                        (編碼工具技能)
│  │  ├─ agent-council/
│  │  ├─ claw-swarm/
│  │  ├─ tdd/
│  │  └─ code-doctor/
│  │
│  ├─ custom/                        (用戶自定義技能)
│  │  └─ [動態添加]
│  │
│  └─ disabled/                      (已禁用的技能)
│     └─ [移動至此以禁用]
│
├─ skill-marketplace/                ← 【技能市場】未來擴展
│  ├─ available-skills.json
│  └─ community-skills/
│
└─ config/
   ├─ .env                           (環境變量)
   ├─ skill-settings.json            (技能全局設置)
   └─ system-config.json             (系統配置)
```

---

## 技能包結構（每個技能的標準格式）

```
/skills/official/browser/
│
├─ package.json                      ← 技能元數據
│  {
│    "name": "browser-skill",
│    "version": "1.0.0",
│    "description": "網絡搜索和資源下載",
│    "skillId": "browser-v1",
│    "author": "NanoClaw",
│    "dependencies": ["@tavily/core", "axios"],
│    "permissions": ["read_files", "write_downloads"],
│    "category": "productivity",
│    "weight": 1,                    (優先級)
│    "maxMemory": "50MB",            (內存限制)
│    "timeout": 30000                (超時時間)
│  }
│
├─ manifest.json                     ← 技能清單
│  {
│    "skillId": "browser-v1",
│    "enabled": true,
│    "commands": ["/browser_search"],
│    "exports": ["searchAndDownload", "parseWebpage"],
│    "hooks": ["on_user_message", "on_startup"],
│    "healthCheck": "checkServiceHealth"
│  }
│
├─ index.ts                          ← 技能入口
│  export default class BrowserSkill {
│    async execute(command, args) { ... }
│    async healthCheck() { ... }
│    async cleanup() { ... }
│  }
│
├─ skill.ts                          ← 技能實現
├─ types.ts                          ← TypeScript 定義
├─ utils.ts                          ← 工具函數
├─ tests/                            ← 單元測試
│  └─ browser.test.ts
│
├─ README.md                         ← 技能文檔
│  • 功能說明
│  • 命令列表
│  • 依賴項
│  • 常見問題
│
├─ CHANGELOG.md                      ← 版本歷史
└─ .skillignore                      ← 打包忽略文件
```

---

## Part 1：技能加載器系統

### Step 1：創建技能管理器

```bash
nano src/skill-loader/skill-manager.ts
```

**複製以下代碼：**

```typescript
import * as fs from 'fs-extra';
import * as path from 'path';
import { EventEmitter } from 'events';

interface SkillMetadata {
  skillId: string;
  name: string;
  version: string;
  enabled: boolean;
  category: string;
  weight: number;
  dependencies: string[];
  permissions: string[];
  maxMemory: string;
  timeout: number;
}

interface SkillLoadResult {
  skillId: string;
  status: 'loaded' | 'failed' | 'disabled';
  error?: string;
  loadTime: number;
}

class SkillManager extends EventEmitter {
  private loadedSkills: Map<string, any> = new Map();
  private skillMetadata: Map<string, SkillMetadata> = new Map();
  private skillsDir: string;
  private registryFile: string;

  constructor() {
    super();
    this.skillsDir = '/root/nanoclaw/skills';
    this.registryFile = path.join(this.skillsDir, 'skill-library.config.json');
    this.loadRegistry();
  }

  /**
   * 加載技能註冊表
   */
  private loadRegistry(): void {
    try {
      if (fs.existsSync(this.registryFile)) {
        const registry = fs.readJsonSync(this.registryFile);
        this.skillMetadata = new Map(Object.entries(registry));
        console.log(`✅ 技能註冊表加載完成 (${this.skillMetadata.size} 個技能)`);
      }
    } catch (error) {
      console.error('❌ 加載技能註冊表失敗:', error);
    }
  }

  /**
   * 掃描並註冊所有技能
   */
  async scanAndRegister(): Promise<SkillLoadResult[]> {
    const results: SkillLoadResult[] = [];

    try {
      // 掃描 official、google、coding 目錄
      for (const category of ['official', 'google', 'coding']) {
        const categoryDir = path.join(this.skillsDir, category);

        if (!fs.existsSync(categoryDir)) {
          continue;
        }

        const skills = fs.readdirSync(categoryDir);

        for (const skillFolder of skills) {
          const skillPath = path.join(categoryDir, skillFolder);
          const manifestPath = path.join(skillPath, 'manifest.json');

          if (fs.existsSync(manifestPath)) {
            try {
              const manifest = fs.readJsonSync(manifestPath);
              const result = await this.registerSkill(
                skillPath,
                manifest,
                category
              );
              results.push(result);
            } catch (error) {
              results.push({
                skillId: skillFolder,
                status: 'failed',
                error: error instanceof Error ? error.message : 'Unknown error',
                loadTime: 0
              });
            }
          }
        }
      }

      // 保存更新的註冊表
      this.saveRegistry();

      return results;
    } catch (error) {
      console.error('❌ 掃描技能失敗:', error);
      return [];
    }
  }

  /**
   * 註冊單個技能
   */
  private async registerSkill(
    skillPath: string,
    manifest: any,
    category: string
  ): Promise<SkillLoadResult> {
    const startTime = Date.now();
    const skillId = manifest.skillId;

    try {
      // 檢查是否已禁用
      const disabledPath = path.join(this.skillsDir, 'disabled', path.basename(skillPath));
      if (fs.existsSync(disabledPath)) {
        return {
          skillId,
          status: 'disabled',
          loadTime: Date.now() - startTime
        };
      }

      // 驗證依賴
      const packagePath = path.join(skillPath, 'package.json');
      if (!fs.existsSync(packagePath)) {
        throw new Error('缺少 package.json');
      }

      const pkgJson = fs.readJsonSync(packagePath);

      // 加載技能
      const indexPath = path.join(skillPath, 'index.ts');
      if (!fs.existsSync(indexPath)) {
        throw new Error('缺少 index.ts 入口');
      }

      // 動態加載技能模塊
      // 注：實際實現中需要使用 require() 或 import()
      const Skill = require(indexPath).default;
      const skillInstance = new Skill();

      // 存儲技能實例
      this.loadedSkills.set(skillId, skillInstance);

      // 存儲元數據
      const metadata: SkillMetadata = {
        skillId,
        name: pkgJson.name,
        version: pkgJson.version,
        enabled: manifest.enabled !== false,
        category,
        weight: pkgJson.weight || 1,
        dependencies: pkgJson.dependencies || [],
        permissions: pkgJson.permissions || [],
        maxMemory: pkgJson.maxMemory || '50MB',
        timeout: pkgJson.timeout || 30000
      };

      this.skillMetadata.set(skillId, metadata);

      // 執行技能初始化鉤子
      if (skillInstance.onLoad) {
        await skillInstance.onLoad();
      }

      console.log(`✅ 技能已加載: ${skillId}`);

      this.emit('skill_loaded', { skillId, metadata });

      return {
        skillId,
        status: 'loaded',
        loadTime: Date.now() - startTime
      };
    } catch (error) {
      console.error(`❌ 加載技能 ${skillId} 失敗:`, error);

      return {
        skillId,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
        loadTime: Date.now() - startTime
      };
    }
  }

  /**
   * 動態禁用技能（不刪除，只禁用）
   */
  async disableSkill(skillId: string): Promise<string> {
    try {
      const metadata = this.skillMetadata.get(skillId);
      if (!metadata) {
        return `❌ 技能不存在: ${skillId}`;
      }

      // 執行卸載鉤子
      const skill = this.loadedSkills.get(skillId);
      if (skill && skill.onUnload) {
        await skill.onUnload();
      }

      // 從內存中移除
      this.loadedSkills.delete(skillId);

      // 標記為禁用
      metadata.enabled = false;
      this.skillMetadata.set(skillId, metadata);

      // 保存註冊表
      this.saveRegistry();

      console.log(`✅ 技能已禁用: ${skillId}`);
      this.emit('skill_disabled', { skillId });

      return `✅ 技能 ${skillId} 已禁用`;
    } catch (error) {
      return `❌ 禁用技能失敗: ${error}`;
    }
  }

  /**
   * 動態啟用技能
   */
  async enableSkill(skillId: string): Promise<string> {
    try {
      const metadata = this.skillMetadata.get(skillId);
      if (!metadata) {
        return `❌ 技能不存在: ${skillId}`;
      }

      // 重新加載技能
      const skillPath = await this.findSkillPath(skillId);
      if (!skillPath) {
        return `❌ 找不到技能路徑: ${skillId}`;
      }

      const manifest = fs.readJsonSync(path.join(skillPath, 'manifest.json'));
      const result = await this.registerSkill(
        skillPath,
        manifest,
        metadata.category
      );

      if (result.status === 'loaded') {
        metadata.enabled = true;
        this.saveRegistry();
        this.emit('skill_enabled', { skillId });
        return `✅ 技能 ${skillId} 已啟用`;
      } else {
        return `❌ 啟用技能失敗: ${result.error}`;
      }
    } catch (error) {
      return `❌ 啟用失敗: ${error}`;
    }
  }

  /**
   * 查找技能路徑
   */
  private async findSkillPath(skillId: string): Promise<string | null> {
    for (const category of ['official', 'google', 'coding', 'custom']) {
      const categoryDir = path.join(this.skillsDir, category);
      if (!fs.existsSync(categoryDir)) continue;

      const skills = fs.readdirSync(categoryDir);
      for (const skill of skills) {
        const manifestPath = path.join(
          categoryDir,
          skill,
          'manifest.json'
        );
        if (fs.existsSync(manifestPath)) {
          const manifest = fs.readJsonSync(manifestPath);
          if (manifest.skillId === skillId) {
            return path.join(categoryDir, skill);
          }
        }
      }
    }
    return null;
  }

  /**
   * 執行技能命令
   */
  async executeSkill(skillId: string, command: string, args: any[]): Promise<string> {
    const skill = this.loadedSkills.get(skillId);

    if (!skill) {
      return `❌ 技能未加載或不存在: ${skillId}`;
    }

    try {
      const metadata = this.skillMetadata.get(skillId);
      if (!metadata?.enabled) {
        return `❌ 技能已禁用: ${skillId}`;
      }

      // 執行技能命令（帶超時保護）
      const result = await Promise.race([
        skill.execute(command, args),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('技能執行超時')), metadata.timeout)
        )
      ]);

      return result;
    } catch (error) {
      console.error(`❌ 技能執行失敗 ${skillId}:`, error);
      return `❌ 執行失敗: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
  }

  /**
   * 列出所有技能
   */
  listSkills(): string {
    let list = `📦 **【技能庫概覽】**\n\n`;

    const categories = new Map<string, SkillMetadata[]>();

    for (const [_, metadata] of this.skillMetadata) {
      if (!categories.has(metadata.category)) {
        categories.set(metadata.category, []);
      }
      categories.get(metadata.category)!.push(metadata);
    }

    for (const [category, skills] of categories) {
      list += `📂 **${category}** (${skills.length} 個)\n`;

      for (const skill of skills) {
        const status = skill.enabled ? '✅' : '❌';
        list += `${status} ${skill.name} v${skill.version}\n`;
        list += `   ID: ${skill.skillId}\n`;
      }

      list += '\n';
    }

    return list;
  }

  /**
   * 保存註冊表
   */
  private saveRegistry(): void {
    try {
      const registry = Object.fromEntries(this.skillMetadata);
      fs.writeJsonSync(this.registryFile, registry, { spaces: 2 });
    } catch (error) {
      console.error('❌ 保存技能註冊表失敗:', error);
    }
  }

  /**
   * 獲取技能健康狀態
   */
  async getSkillHealth(skillId: string): Promise<any> {
    const skill = this.loadedSkills.get(skillId);

    if (!skill) {
      return { status: 'not_loaded', skillId };
    }

    try {
      if (skill.healthCheck) {
        const health = await skill.healthCheck();
        return { status: 'healthy', skillId, details: health };
      } else {
        return { status: 'ok', skillId };
      }
    } catch (error) {
      return {
        status: 'unhealthy',
        skillId,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * 獲取技能統計
   */
  getStats(): string {
    const total = this.skillMetadata.size;
    const enabled = Array.from(this.skillMetadata.values()).filter(
      s => s.enabled
    ).length;
    const disabled = total - enabled;
    const loaded = this.loadedSkills.size;

    let stats = `📊 **技能庫統計**\n\n`;
    stats += `總計：${total} 個\n`;
    stats += `✅ 已啟用：${enabled} 個\n`;
    stats += `❌ 已禁用：${disabled} 個\n`;
    stats += `💾 已加載：${loaded} 個\n\n`;

    const memoryUsage = Array.from(this.skillMetadata.values())
      .map(s => s.maxMemory)
      .join(' + ');

    stats += `💾 內存限制：${memoryUsage}`;

    return stats;
  }
}

export default new SkillManager();
```

---

## Part 2：技能註冊表格式

### 技能庫配置文件示例

```bash
nano /root/nanoclaw/skills/skill-library.config.json
```

**複製以下代碼：**

```json
{
  "browser-v1": {
    "skillId": "browser-v1",
    "name": "browser-skill",
    "version": "1.0.0",
    "enabled": true,
    "category": "official",
    "weight": 1,
    "dependencies": ["@tavily/core", "axios"],
    "permissions": ["read_files", "write_downloads"],
    "maxMemory": "50MB",
    "timeout": 30000
  },
  "diagram-v1": {
    "skillId": "diagram-v1",
    "name": "diagram-generator",
    "version": "1.0.0",
    "enabled": true,
    "category": "official",
    "weight": 1,
    "dependencies": [],
    "permissions": [],
    "maxMemory": "30MB",
    "timeout": 20000
  },
  "gmail-v1": {
    "skillId": "gmail-v1",
    "name": "gmail-service",
    "version": "1.0.0",
    "enabled": true,
    "category": "google",
    "weight": 2,
    "dependencies": ["@google-cloud/gmail"],
    "permissions": ["read_email", "write_email"],
    "maxMemory": "40MB",
    "timeout": 25000
  },
  "agent-council-v1": {
    "skillId": "agent-council-v1",
    "name": "agent-council",
    "version": "1.0.0",
    "enabled": true,
    "category": "coding",
    "weight": 3,
    "dependencies": [],
    "permissions": ["read_files", "create_files"],
    "maxMemory": "80MB",
    "timeout": 60000
  }
}
```

---

## Part 3：更新核心系統集成

### 更新 src/core/index.ts

```bash
nano src/core/index.ts
```

**添加技能加載集成：**

```typescript
import TelegramBot from 'node-telegram-bot-api';
import skillManager from '../skill-loader/skill-manager';

const tgBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// ========== 系統啟動時加載技能 ==========

async function initializeSystem() {
  console.log('🚀 NanoClaw 啟動中...\n');

  // 1. 掃描並註冊所有技能
  console.log('📦 掃描技能庫...');
  const scanResults = await skillManager.scanAndRegister();

  let loaded = 0, failed = 0;
  for (const result of scanResults) {
    if (result.status === 'loaded') loaded++;
    else if (result.status === 'failed') failed++;
  }

  console.log(`✅ 技能加載完成: ${loaded} 個成功, ${failed} 個失敗\n`);

  // 2. 設置技能命令動態路由
  setupSkillRouting();

  // 3. 啟動系統
  console.log('✅ 系統已就緒！');
}

/**
 * 設置技能命令路由
 */
function setupSkillRouting() {
  // 監聽所有消息
  tgBot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const text = msg.text || '';

    // 檢查是否匹配任何技能命令
    for (const [skillId, metadata] of skillManager.getLoadedSkills()) {
      if (!metadata.enabled) continue;

      // 檢查命令前綴
      for (const command of metadata.commands || []) {
        if (text.startsWith(command)) {
          const args = text.substring(command.length).trim().split(' ');
          const result = await skillManager.executeSkill(skillId, command, args);
          await tgBot.sendMessage(chatId, result);
          return;
        }
      }
    }

    // 如果沒有技能匹配，使用 AI 回應
    // ...（正常 AI 邏輯）
  });
}

// ========== 技能管理命令 ==========

tgBot.onText(/\/skill_list/, async (msg) => {
  const chatId = msg.chat.id;
  const list = skillManager.listSkills();
  await tgBot.sendMessage(chatId, list);
});

tgBot.onText(/\/skill_disable (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const skillId = match[1];
  const result = await skillManager.disableSkill(skillId);
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/skill_enable (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const skillId = match[1];
  const result = await skillManager.enableSkill(skillId);
  await tgBot.sendMessage(chatId, result);
});

tgBot.onText(/\/skill_health (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const skillId = match[1];
  const health = await skillManager.getSkillHealth(skillId);
  await tgBot.sendMessage(chatId, `📊 **技能健康狀態**\n${JSON.stringify(health, null, 2)}`);
});

tgBot.onText(/\/skill_stats/, async (msg) => {
  const chatId = msg.chat.id;
  const stats = skillManager.getStats();
  await tgBot.sendMessage(chatId, stats);
});

tgBot.onText(/\/skill_reload/, async (msg) => {
  const chatId = msg.chat.id;
  await tgBot.sendMessage(chatId, '⏳ 正在重新加載技能庫...');
  
  const results = await skillManager.scanAndRegister();
  let loaded = 0;
  for (const result of results) {
    if (result.status === 'loaded') loaded++;
  }
  
  await tgBot.sendMessage(chatId, `✅ 技能庫已重新加載 (${loaded} 個技能)`);
});

// 啟動系統
initializeSystem();
```

---

## 技能包標準模板

### 為每個技能創建本地化包

```bash
# 創建一個技能包模板
mkdir -p /root/nanoclaw/skills/official/new-skill

# 創建必要文件
cat > /root/nanoclaw/skills/official/new-skill/package.json << 'EOF'
{
  "name": "new-skill",
  "version": "1.0.0",
  "description": "新技能描述",
  "skill": true,
  "dependencies": [],
  "weight": 1,
  "maxMemory": "30MB",
  "timeout": 20000
}
EOF

cat > /root/nanoclaw/skills/official/new-skill/manifest.json << 'EOF'
{
  "skillId": "new-skill-v1",
  "enabled": true,
  "commands": ["/new_command"],
  "exports": ["execute"],
  "hooks": ["on_load", "on_unload", "health_check"]
}
EOF

cat > /root/nanoclaw/skills/official/new-skill/index.ts << 'EOF'
export default class NewSkill {
  async onLoad() {
    console.log('✅ 技能已加載');
  }

  async onUnload() {
    console.log('⏹️ 技能已卸載');
  }

  async execute(command: string, args: any[]) {
    return `執行了命令: ${command}`;
  }

  async healthCheck() {
    return { status: 'healthy', uptime: Date.now() };
  }
}
EOF
```

---

## 核心優勢

```
✅ 技能完全隔離
   ├─ 獨立目錄結構
   ├─ 獨立依賴管理
   ├─ 獨立版本控制
   └─ 獨立測試

✅ 動態管理
   ├─ 無需重啟系統
   ├─ 實時啟用/禁用
   ├─ 熱加載支持
   └─ 安全回滾

✅ 核心保護
   ├─ 技能故障隔離
   ├─ 內存限制
   ├─ 執行超時
   └─ 沙箱保護

✅ 易於擴展
   ├─ 簡單的模板
   ├─ 標準的接口
   ├─ 一鍵安裝
   └─ 社區技能市場

✅ 版本管理
   ├─ 獨立版本號
   ├─ 向後兼容
   ├─ 無縫升級
   └─ 快速回滾
```

---

## 命令清單

```
/skill_list           - 列出所有技能
/skill_disable [id]   - 禁用技能
/skill_enable [id]    - 啟用技能
/skill_health [id]    - 查看技能健康狀態
/skill_stats          - 查看技能統計
/skill_reload         - 重新加載技能庫
```

---

## 技能禁用與還原

```
禁用技能（不刪除，只禁用）
  /skill_disable browser-v1
  ↓
  • 從內存移除
  • 標記為禁用
  • 原文件保留在 skills/ 目錄

還原技能
  /skill_enable browser-v1
  ↓
  • 重新掃描並加載
  • 恢復為啟用狀態
  • 無需重啟系統

完全卸載技能
  rm -rf /root/nanoclaw/skills/official/browser
  /skill_reload
  ↓
  • 完全刪除技能
  • 不影響其他技能
  • 不影響核心系統
```

---

## 新架構 vs 舊架構

```
比較項         | 舊架構 | 新架構
──────────────────────────────────────
技能與核心耦合 | 高     | 零
禁用技能影響   | 需重啟 | 無需重啟
故障隔離       | 低     | 完全隔離
內存管理       | 全部加載 | 按需加載
版本管理       | 困難   | 完全版本控制
擴展難度       | 高     | 低
用戶自定義     | 困難   | 容易
社區共享       | 不支持 | 支持市場
回滾恢復       | 困難   | 一鍵恢復
```

---

## 實施計劃

```
Phase 1：技能庫結構重組（1-2 小時）
  ├─ 創建新目錄結構
  ├─ 遷移現有技能
  └─ 建立標準模板

Phase 2：技能加載器實現（2-3 小時）
  ├─ 實現 skill-manager.ts
  ├─ 實現技能註冊表
  └─ 整合到核心系統

Phase 3：測試驗證（1-2 小時）
  ├─ 測試各技能加載/卸載
  ├─ 測試隔離機制
  └─ 性能基準測試

Phase 4：文檔與推送（1 小時）
  ├─ 編寫技能開發指南
  ├─ 更新用戶手冊
  └─ 發布社區技能市場

總計：5-8 小時
```

---

**這樣設計，技能系統變成了「樂高積木」！** 🧩

```
✨ 完全隔離：刪除任何技能都不影響系統
✨ 動態加載：無需重啟，實時啟用/禁用
✨ 可靠性：技能故障不會波及核心
✨ 易於擴展：簡單模板，一鍵添加
✨ 版本管理：每個技能獨立版本控制
✨ 社區生態：社區技能市場（未來）
```

要我更新 NANOCLAW-BLUEPRINT.md 來反映這個新的技能庫架構嗎？
