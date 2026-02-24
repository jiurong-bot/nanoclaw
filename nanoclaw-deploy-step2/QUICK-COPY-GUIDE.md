# 🚀 NanoClaw Step 2 快速複製指南

## 最快的方法（推薦）

如果你有外網手機或電腦，可以在 5 分鐘內完成部署。

---

## 📋 需要的文件清單

```
✅ .env                     （環境變數配置）
✅ package.json             （npm 配置）
✅ index.js                 （主程序）
✅ soul.md                  （人格設定）
✅ DEPLOY-INSTRUCTIONS.md   （部署指南）
```

---

## 方法 A：直接複製代碼（推薦）

### 步驟 1：在 Termux Ubuntu 中建立目錄

```bash
root@localhost:~# mkdir -p ~/nanoclaw
root@localhost:~# cd ~/nanoclaw
```

### 步驟 2：複製 .env 文件內容

**打開記事本，複製下面的全部內容：**

```
# NanoClaw 環境變數配置
# 2026-02-24

# ========== 核心配置 ==========
NODE_ENV=production
APP_NAME=NanoClaw
APP_VERSION=1.0.0
LOG_LEVEL=info

# ========== Groq API（必需）==========
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile

# ========== Tavily Search（必需）==========
TAVILY_API_KEY=your_tavily_api_key_here

# ========== Telegram Bot（必需）==========
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# ========== 數據庫配置 ==========
DATABASE_PATH=./nanoclaw.db
DATABASE_BACKUP_PATH=./backups/

# ========== 監控配置 ==========
TOKEN_MONITOR_ENABLED=true
TOKEN_CLEANUP_DAYS=90

# ========== 模型配額 ==========
GROQ_DAILY_LIMIT=0
GROQ_MONTHLY_LIMIT=0
GROQ_RPS_LIMIT=3

# ========== 自動切換 ==========
AUTO_SWITCH_ENABLED=true
AUTO_SWITCH_MIN_INTERVAL=60000

# ========== 日誌 ==========
LOG_DIR=./logs/
BACKUP_DIR=./backups/
```

在 Termux 中建立文件：

```bash
root@localhost:~/nanoclaw# nano .env
```

粘貼內容，按 `Ctrl+X` → `Y` → `Enter` 保存。

驗證：
```bash
root@localhost:~/nanoclaw# cat .env | head -5
```

### 步驟 3：複製 package.json

```bash
root@localhost:~/nanoclaw# nano package.json
```

複製並粘貼以下內容：

```json
{
  "name": "nanoclaw",
  "version": "1.0.0",
  "description": "NanoClaw - AI Assistant for Termux",
  "main": "index.js",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js",
    "test": "node test.js",
    "backup": "node scripts/backup.js",
    "monitor": "node scripts/monitor.js"
  },
  "keywords": ["ai", "telegram", "groq", "assistant"],
  "author": "jiurong",
  "license": "MIT",
  "dependencies": {
    "dotenv": "^16.3.1",
    "better-sqlite3": "^9.2.2",
    "telegraf": "^4.14.0",
    "groq-sdk": "^0.4.0",
    "axios": "^1.6.5",
    "date-fns": "^2.30.0",
    "uuid": "^9.0.1"
  },
  "devDependencies": {
    "nodemon": "^3.0.2"
  }
}
```

### 步驟 4：複製 index.js

```bash
root@localhost:~/nanoclaw# nano index.js
```

**⚠️ 注意：** index.js 很長（約 350 行），請在電腦上：

1. 打開 GitHub 倉庫：https://github.com/jiurong-bot/nanoclaw
2. 進入 `nanoclaw-deploy-step2/` 文件夾
3. 點開 `index.js`
4. 按 Raw 按鈕
5. Ctrl+A 全選，Ctrl+C 複製
6. 粘貼到 Termux 的 nano 編輯器中
7. Ctrl+X → Y → Enter 保存

### 步驟 5：複製 soul.md

```bash
root@localhost:~/nanoclaw# nano soul.md
```

複製以下內容：

```markdown
# 🛡️ 雅典娜的靈魂設定 (soul.md)

## 基本身份

**名字：** 雅典娜（Athena）
**角色：** 智能 AI 助手與生活伴侶
**形象：** 溫和、聰慧、主動、可靠

---

## 核心特質

### 1️⃣ 工作方式
- **主動幫助** — 不只等待提問，而是主動提供建議
- **邏輯清晰** — 思考過程透明，易於理解
- **精准簡潔** — 避免冗長，直奔主題
- **持續學習** — 根據對話改進自己的理解

### 2️⃣ 溝通風格
- **尊重用戶** — 承認你是獨立的個體，我是助手
- **貼心陪伴** — 理解情緒，適當共鳴
- **無評判** — 接納你的想法，不強加價值觀
- **幽默感** — 在適當時刻加入輕鬆的語氣

### 3️⃣ 能力邊界
- ✅ 我能做：回答問題、寫代碼、分析信息、給建議
- ❌ 我不能做：真正的行動、存取真實數據、替你決定
- 🤝 我會說：「這是我的建議，最終由你決定」

---

[更多內容請見完整文件]
```

### 步驟 6：建立目錄結構

```bash
root@localhost:~/nanoclaw# mkdir -p config backups logs scripts
```

### 步驟 7：安裝 npm 依賴

```bash
root@localhost:~/nanoclaw# npm install
```

⚠️ 這可能需要 10-20 分鐘。耐心等待。

### 步驟 8：測試運行

```bash
root@localhost:~/nanoclaw# npm start
```

預期看到：
```
🚀 NanoClaw V80.1-L1 啟動...
✅ Groq API 連接成功
✅ Bot 已啟動並監聽
```

---

## 方法 B：使用打包檔案（最快）

如果你能在 GitHub 下載檔案：

```bash
# 在 Termux 中
root@localhost:~# cd ~
root@localhost:~# wget https://github.com/jiurong-bot/nanoclaw/raw/master/nanoclaw-deploy-step2/nanoclaw-step2-complete.tar.gz
root@localhost:~# tar -xzf nanoclaw-step2-complete.tar.gz -C ~/nanoclaw/
root@localhost:~# cd ~/nanoclaw && npm install
```

---

## 驗證清單

完成後檢查：

```bash
root@localhost:~/nanoclaw# ls -la
```

應該看到：
```
-rw-r--r-- .env
-rw-r--r-- package.json
-rw-r--r-- index.js
-rw-r--r-- soul.md
drwxr-xr-x node_modules/
drwxr-xr-x config/
drwxr-xr-x backups/
drwxr-xr-x logs/
drwxr-xr-x scripts/
```

---

## 🧪 測試 Bot

啟動後，在 Telegram 中：

1. 發送 `/help` → 應看到指令清單
2. 發送 `/status` → 應看到系統狀態
3. 發送任意消息 → Bot 應該回覆

---

## 💾 文件位置參考

所有文件已上傳到 GitHub：
https://github.com/jiurong-bot/nanoclaw/tree/master/nanoclaw-deploy-step2

如果遇到問題，可以在那裡直接查看原始代碼。

---

## 🆘 常見問題

### npm install 失敗？
```bash
pkg install build-essential python3 -y
npm install
```

### Bot 無法啟動？
```bash
# 檢查環境變數
cat .env | grep TELEGRAM_BOT_TOKEN

# 檢查 Node.js
node -v
```

### Telegram 收不到消息？
重檢查 API Keys 是否正確無誤。

---

祝部署順利！🎉
