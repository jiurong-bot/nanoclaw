# NanoClaw Step 2 部署指南

## 快速部署（5 分鐘）

### 📋 前置條件檢查

```bash
# 確認在 Ubuntu 環境中
root@localhost:~# pwd
/root

# 確認 Node.js 已安裝
root@localhost:~# node -v
# 應顯示 v24+ 版本

# 確認 npm 已安裝
root@localhost:~# npm -v
# 應顯示 11+ 版本
```

---

## 🚀 部署步驟

### **步驟 1：建立項目目錄**

```bash
root@localhost:~# mkdir -p ~/nanoclaw
root@localhost:~# cd ~/nanoclaw
root@localhost:~/nanoclaw# pwd
```

確認輸出：`/root/nanoclaw`

---

### **步驟 2：建立 .env 文件**

```bash
root@localhost:~/nanoclaw# cat > .env << 'EOF'
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
EOF

# ⚠️ 重要：現在用 nano 編輯 .env，將占位符替換為你的真實 API Keys
nano .env
```

驗證：
```bash
root@localhost:~/nanoclaw# cat .env | head -20
```

---

### **步驟 3：建立 package.json**

```bash
root@localhost:~/nanoclaw# cat > package.json << 'EOF'
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
EOF
```

---

### **步驟 4：安裝 npm 依賴**

⚠️ **這一步可能需要 10-20 分鐘！**

```bash
root@localhost:~/nanoclaw# npm install
```

**預期輸出：**
```
added XXX packages in XXX seconds
```

如果卡住，按 `Ctrl+C` 重試：
```bash
root@localhost:~/nanoclaw# npm install --verbose
```

---

### **步驟 5：建立 index.js（主程序）**

直接複製下面的完整代碼到你的編輯器，或使用以下命令：

```bash
root@localhost:~/nanoclaw# nano index.js
```

然後粘貼完整的 `index.js` 代碼（見下方）。

**快速驗證：**
```bash
root@localhost:~/nanoclaw# ls -la
```

應該看到：
```
-rw-r--r-- 1 root root   889 Feb 24 ... .env
-rw-r--r-- 1 root root   695 Feb 24 ... package.json
-rw-r--r-- 1 root root 10133 Feb 24 ... index.js
drwxr-xr-x 2 root root  4096 Feb 24 ... node_modules
```

---

### **步驟 6：建立目錄結構**

```bash
root@localhost:~/nanoclaw# mkdir -p config backups logs scripts
root@localhost:~/nanoclaw# ls -la
```

---

### **步驟 7：測試系統**

#### 測試 1：檢查 Node.js

```bash
root@localhost:~/nanoclaw# node -e "console.log('✅ Node.js 正常')"
```

預期：`✅ Node.js 正常`

#### 測試 2：檢查環境變數

```bash
root@localhost:~/nanoclaw# node -e "require('dotenv').config(); console.log('TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN?.substring(0, 10) + '...')"
```

預期顯示部分 Token

#### 測試 3：啟動 Bot

```bash
root@localhost:~/nanoclaw# npm start
```

**預期輸出：**
```
[HH:MM:SS] 🚀 NanoClaw V80.1-L1 啟動...
📁 根目錄：/root/nanoclaw
✅ 數據庫初始化完成
🔍 測試 Groq API 連接...
✅ Groq API 連接成功
✅ Bot 已啟動並監聽
```

---

## 📱 測試 Telegram Bot

1. 打開 Telegram App
2. 搜索你的機器人（用戶名：根據你建立時使用的名稱）
3. 開始對話：
   - 輸入：`/help`
   - 機器人應該回覆指令清單
   - 輸入：`/status`
   - 機器人應該回覆系統狀態

---

## 🛠️ 常見問題

### ❌ `npm install` 失敗

**原因：** better-sqlite3 編譯需要 C++ 編譯器

```bash
# 安裝編譯工具
pkg install build-essential python3 -y

# 重試
npm install
```

### ❌ Groq API 連接失敗

**原因：** API Key 無效或過期

```bash
# 檢查 .env
cat .env | grep GROQ_API_KEY
```

確保 Key 是完整的，沒有多餘空格。

### ❌ Telegram 沒有收到消息

**原因：** Bot Token 無效或網路問題

```bash
# 檢查 Token
cat .env | grep TELEGRAM_BOT_TOKEN

# 測試網路
ping 8.8.8.8
```

### ❌ 進程卡住不動

**解決：** 按 `Ctrl+C` 停止，再重新運行

```bash
npm start
```

---

## ✅ Step 2 完成檢查清單

- ✅ `.env` 文件已建立，API Keys 已配置
- ✅ `package.json` 已建立
- ✅ `npm install` 已完成（無錯誤）
- ✅ `index.js` 已建立
- ✅ 目錄結構已建立（config, backups, logs, scripts）
- ✅ `npm start` 能夠啟動 Bot
- ✅ Telegram 能夠接收 Bot 的消息
- ✅ `/help` 指令能返回指令清單
- ✅ `/status` 能返回系統狀態

---

## 🚀 Next Steps（Step 3）

完成 Step 2 後，接下來：

- 📚 **Step 3：靈魂系統與長期記憶**
  - 建立 soul.md（人格設定）
  - 實現長期記憶機制
  - 整合 Big 5 人格進化

- 🧠 **Step 4：Google Integration**
  - Gmail 讀取
  - Calendar 同步
  - Drive 存儲

- 📊 **Step 5：監控與診斷**
  - Token 使用監控
  - 系統健康檢查
  - 自動故障恢復

---

## 📞 支持

有問題？檢查：
1. `/root/nanoclaw/logs/` 日誌文件
2. `.env` 配置
3. Node.js 版本（須 ≥ v24）
4. 網路連接（ping 8.8.8.8）

祝部署順利！🎉
