# NanoClaw on Android Termux + Ubuntu 完整安裝指南

## 目標
在 Android 手機上通過 Termux + Ubuntu proot 運行 NanoClaw，並集成 Telegram Bot。

---

## 第一部分：基礎環境設置（與 OpenClaw 相同）

### Step 1：Termux 安裝和權限配置

```bash
# 下載：https://github.com/termux/termux-app/releases
# 選擇 ...universal.apk 或對應 CPU 型號

# 安裝後給予權限：
# - 後台彈出界面
# - 自啟動
# - 無限制省電策略
```

### Step 2：更新 Termux 並安裝核心

```bash
pkg update -y && pkg upgrade -y
pkg install proot-distro termux-api -y
```

### Step 3：安裝 Ubuntu

```bash
proot-distro install ubuntu
```

### Step 4：進入 Ubuntu 並更新

```bash
proot-distro login ubuntu

# 在 Ubuntu 內執行：
apt update && apt upgrade -y
```

### Step 5：安裝 Node.js 和必要工具

```bash
# 安裝基礎工具
apt install curl git build-essential python3 -y

# 添加 NodeSource 源（Node.js v24）
curl -fsSL https://deb.nodesource.com/setup_24.x | bash -

# 安裝 Node.js
apt install nodejs -y

# 驗證
node -v
npm -v
```

---

## 第二部分：Android 系統補丁（必須）

### Step 6：創建 bionic-bypass.js 補丁

```bash
# 創建配置目錄
mkdir -p /root/.nanoclaw

# 創建補丁文件
nano /root/.nanoclaw/bionic-bypass.js
```

**複製以下代碼到編輯器：**

```javascript
const os = require('os');
const originalNetworkInterfaces = os.networkInterfaces;

os.networkInterfaces = function() {
  try {
    const interfaces = originalNetworkInterfaces.call(os);
    if (interfaces && Object.keys(interfaces).length > 0) {
      return interfaces;
    }
  } catch (e) {}
  
  return {
    lo: [
      {
        address: '127.0.0.1',
        netmask: '255.0.0.0',
        family: 'IPv4',
        mac: '00:00:00:00:00:00',
        internal: true,
        cidr: '127.0.0.1/8'
      }
    ]
  };
};
```

**保存：** Ctrl+O → Enter → Ctrl+X

### Step 7：配置環境變量

```bash
# 將補丁和 DNS 設置寫入 .bashrc
echo 'export NODE_OPTIONS="--require /root/.nanoclaw/bionic-bypass.js --dns-result-order=ipv4first"' >> ~/.bashrc

# DNS 設置
echo -e "nameserver 8.8.8.8\nnameserver 8.8.4.4" > /etc/resolv.conf

# 清除無效代理
unset http_proxy https_proxy

# 立即生效
source ~/.bashrc
```

---

## 第三部分：NanoClaw 安裝和配置（使用 Groq）

### Step 8：克隆 NanoClaw 倉庫

```bash
cd /root

# 克隆官方倉庫
git clone https://github.com/qwibitai/nanoclaw
cd nanoclaw

# 或者備用倉庫
# git clone https://github.com/gavrielc/nanoclaw
```

### Step 9：安裝依賴（包括 Groq）

```bash
npm install

# 另外安裝 Groq SDK
npm install @groq-cloud/sdk
```

### Step 10：配置 Groq API Key

```bash
# 創建 .env 文件
nano .env
```

**輸入內容：**

```
GROQ_API_KEY=你的_Groq_API_key
GROQ_MODEL=mixtral-8x7b-32768
NODE_ENV=production
```

**說明：**
- 去 https://console.groq.com 免費註冊取得 API key
- 可用模型：
  - `mixtral-8x7b-32768`（推薦，快速）
  - `llama-3.3-70b-versatile`
  - `llama-2-70b-chat`
- 保存文件

---

## 第四部分：Telegram Bot 集成

### Step 11：修改 NanoClaw 以支持 Groq + Telegram

NanoClaw 默認支持 WhatsApp 和 Anthropic。我們需要修改代碼以使用 Groq 並支持 Telegram。

#### 11.1：編輯主配置文件

```bash
nano src/index.ts
# 或 index.js，取決於項目結構
```

**使用 Groq 的代碼片段：**

```typescript
import Groq from '@groq-cloud/sdk';
import TelegramBot from 'node-telegram-bot-api';

// 初始化 Groq 客戶端
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// 初始化 Telegram Bot
const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const tgBot = new TelegramBot(telegramToken, { polling: true });

// 使用 Groq 調用 Claude（兼容 OpenAI 格式）
async function callGroqClaude(userMessage: string): Promise<string> {
  const message = await groq.messages.create({
    model: process.env.GROQ_MODEL || 'mixtral-8x7b-32768',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: userMessage
      }
    ]
  });
  
  return message.content[0].type === 'text' ? message.content[0].text : '';
}

// 接收 Telegram 消息
tgBot.onText(/(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userMessage = match[1];
  
  try {
    // 與 Groq Claude 交互
    const response = await callGroqClaude(userMessage);
    
    // 發送回覆
    tgBot.sendMessage(chatId, response);
  } catch (error) {
    console.error('Telegram/Groq error:', error);
    tgBot.sendMessage(chatId, '⚠️ 發生錯誤，請稍後重試');
  }
});

// 啟動 Bot
console.log('NanoClaw with Groq + Telegram is running...');
```

#### 11.2：安裝所有依賴

```bash
npm install node-telegram-bot-api @groq-cloud/sdk
```

#### 11.3：配置 Telegram Bot

在 `.env` 文件中添加：

```
TELEGRAM_BOT_TOKEN=你的_Telegram_bot_token
```

**如何獲取 Telegram Bot Token：**

```
1️⃣ 在 Telegram 上搜索 @BotFather
2️⃣ 點 /start
3️⃣ 點 /newbot
4️⃣ 給 Bot 命名（例如：nine-yoga-bot）
5️⃣ 給 Bot 用戶名（例如：nine_yoga_bot）
6️⃣ BotFather 會給你一個 HTTP API token
7️⃣ 複製這個 token
```

---

## 第五部分：NanoClaw 啟動和運行

### Step 12：啟動 NanoClaw

```bash
# 方法 1：直接運行
npm start

# 或

# 方法 2：用 node 運行（如果沒有 npm start 腳本）
node index.js
```

### Step 13：驗證運行

應該看到類似的輸出：

```
NanoClaw is starting...
Anthropic API connected
Telegram Bot polling active
Server listening on port 3000 (or configured port)
```

---

## 第六部分：持久化運行（可選但推薦）

### Step 14：用 screen 保持運行

```bash
# 啟動新的 screen 會話
screen -S nanoclaw

# 在 screen 內啟動 NanoClaw
npm start

# 分離會話（按 Ctrl+A，然後 D）
# 按 Ctrl+A D
```

**之後的操作：**

```bash
# 查看運行中的會話
screen -ls

# 重新連接會話
screen -r nanoclaw

# 終止會話
screen -X -S nanoclaw quit
```

### Step 15：用 PM2 管理（更穩定）

```bash
# 全局安裝 PM2
npm install -g pm2

# 啟動 NanoClaw
pm2 start npm --name "nanoclaw" -- start

# 設置開機自啟
pm2 startup
pm2 save

# 查看狀態
pm2 status
```

---

## 第七部分：Telegram 使用

### Step 16：測試 Telegram Bot

```
1️⃣ 在 Telegram 上搜索你的 bot（例如：@nine_yoga_bot）

2️⃣ 點「開始」或傳任意訊息

3️⃣ 應該收到 Bot 的回覆（由 Claude AI 生成）

4️⃣ 測試各種命令和對話
```

---

## 常見問題和解決方案

### Q1：DNS 連接失敗

```bash
# 檢查 DNS
cat /etc/resolv.conf

# 重新設置
echo -e "nameserver 8.8.8.8\nnameserver 8.8.4.4" > /etc/resolv.conf
```

### Q2：NanoClaw 啟動時退出

```bash
# 檢查日誌
cat npm-debug.log

# 確認所有環境變量都已設置
echo $ANTHROPIC_API_KEY
echo $TELEGRAM_BOT_TOKEN
```

### Q3：Telegram 接收不到消息

```bash
# 確認 bot token 正確
# 檢查 NanoClaw 是否在 polling Telegram

# 在另一個 Termux 窗口檢查進程
ps aux | grep node
```

### Q4：內存或性能問題

```bash
# NanoClaw 使用很少的資源（~500 行代碼）
# 但如果有問題，可以檢查進程內存使用
ps aux | grep nanoclaw

# 或用 PM2 查看
pm2 monit
```

---

## 快速參考命令

```bash
# 進入 Ubuntu
proot-distro login ubuntu

# 進入 NanoClaw 目錄
cd /root/nanoclaw

# 查看日誌
tail -f logs/nanoclaw.log

# 停止 NanoClaw（使用 PM2）
pm2 stop nanoclaw

# 重啟
pm2 restart nanoclaw

# 查看日誌
pm2 logs nanoclaw
```

---

## 完整檢查清單

- [ ] Termux 已安裝並有必要權限
- [ ] Ubuntu proot-distro 已安裝
- [ ] Node.js v24+ 已安裝
- [ ] bionic-bypass.js 補丁已創建
- [ ] 環境變量已配置
- [ ] NanoClaw 已克隆
- [ ] npm dependencies 已安裝
- [ ] GROQ_API_KEY 已設置
- [ ] GROQ_MODEL 已配置（mixtral-8x7b-32768）
- [ ] TELEGRAM_BOT_TOKEN 已設置
- [ ] NanoClaw 成功啟動
- [ ] Telegram Bot 可以接收消息
- [ ] Claude AI 可以正常回覆

---

**最後更新：2026 年 2 月 23 日**

**下一步：** 如果一切運行正常，你可以進一步定制 NanoClaw 以實現特定功能（例如：九容瑜伽預約系統）。
