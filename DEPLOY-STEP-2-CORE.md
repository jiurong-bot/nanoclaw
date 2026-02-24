# NanoClaw 部署 Step 2：核心系统部署
## 「构建 AI 助手的大脑」- 45-60 分钟完成

---

## 🎯 **Step 2 目标**

在 ~/nanoclaw 项目中部署 NanoClaw 的核心系统，包括：

```
✅ 基础 npm 依赖安装
✅ 环境变量配置（.env）
✅ 项目目录结构创建
✅ 数据库初始化（SQLite）
✅ Telegram Bot 配置
✅ 基础模型管理器
✅ 测试系统可用性
```

完成后，你会有一个可以接收 Telegram 消息并回复的基础 AI 助手。

---

## 📋 **前置条件**

确保你已完成 Step 1：

```
✅ 在 Ubuntu 环境中（root@localhost:~/nanoclaw#）
✅ Node.js v24 已安装
✅ npm 已安装
✅ ~/nanoclaw 目录已创建
✅ package.json 文件存在
```

---

## ⚙️ **Sub-Step 2.1：获取 API Keys（必需）**

在开始部署之前，你需要准备三个 API Key。这一步在手机浏览器中完成。

### 🔑 1️⃣ Groq API Key（免费）

Groq 是我们的主要 AI 模型提供商，完全免费且无限制。

```
1️⃣ 在手机浏览器打开：https://console.groq.com
2️⃣ 点击「Sign Up」或用 Google 账号登录
3️⃣ 验证邮箱
4️⃣ 进入 Dashboard
5️⃣ 点击左侧「API Keys」
6️⃣ 点击「Create API Key」
7️⃣ 复制生成的 Key（类似：gsk_xxxxxxxxxxxxx）
8️⃣ 保存到记事本，备用
```

**你会得到类似这样的 Key：**
```
gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

### 🔑 2️⃣ Tavily API Key（免费）

Tavily 提供网络搜索功能。

```
1️⃣ 在手机浏览器打开：https://tavily.com
2️⃣ 点击「Sign Up」
3️⃣ 使用邮箱注册
4️⃣ 登录后进入 API Keys 页面
5️⃣ 复制你的 API Key
6️⃣ 保存到记事本
```

**你会得到类似这样的 Key：**
```
tvly-xxxxxxxxxxxxxxxxxxxxx
```

---

### 🔑 3️⃣ Telegram Bot Token（免费）

Telegram Bot 是你与 NanoClaw 通信的接口。

```
1️⃣ 打开 Telegram app（必须有 Telegram）
2️⃣ 搜索 @BotFather
3️⃣ 点击 /start
4️⃣ 点击 /newbot
5️⃣ 按照提示：
   - 输入机器人昵称（如：NanoClawBot）
   - 输入机器人用户名（如：nanoclaw_bot）
6️⃣ BotFather 会给你一个 Token
7️⃣ 复制 Token 到记事本
```

**你会得到类似这样的 Token：**
```
123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi
```

---

## 📝 **Sub-Step 2.2：创建 .env 环境变量文件**

现在在 ~/nanoclaw 目录中创建 .env 文件来存储 API Keys。

**在 Ubuntu 环境中（root@localhost:~/nanoclaw#）执行：**

```bash
root@localhost:~/nanoclaw# cat > .env << 'EOF'
# NanoClaw 环境变量配置
# 2026-02-23

# ========== 核心配置 ==========
NODE_ENV=production
APP_NAME=NanoClaw
APP_VERSION=1.0.0
LOG_LEVEL=info

# ========== Groq API（必需）==========
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=gemma-2-9b-it

# ========== Tavily Search（必需）==========
TAVILY_API_KEY=your_tavily_api_key_here

# ========== Telegram Bot（必需）==========
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# ========== 数据库配置 ==========
DATABASE_PATH=./nanoclaw.db
DATABASE_BACKUP_PATH=./backups/

# ========== 监控配置 ==========
TOKEN_MONITOR_ENABLED=true
TOKEN_CLEANUP_DAYS=90

# ========== 模型配额 ==========
GROQ_DAILY_LIMIT=0
GROQ_MONTHLY_LIMIT=0
GROQ_RPS_LIMIT=3

# ========== 自动切换 ==========
AUTO_SWITCH_ENABLED=true
AUTO_SWITCH_MIN_INTERVAL=60000

# ========== 日志 ==========
LOG_DIR=./logs/
BACKUP_DIR=./backups/
EOF
```

**说明：** 这个命令会创建一个 .env 文件，所有 API Keys 都用占位符「your_xxx_here」表示。

### 验证文件创建

```bash
root@localhost:~/nanoclaw# cat .env
```

应该显示上面的内容。

---

## 🔑 **Sub-Step 2.3：更新 .env 中的真实 API Keys**

现在我们要用真实的 API Keys 替换占位符。

使用 nano 编辑器打开 .env 文件：

```bash
root@localhost:~/nanoclaw# nano .env
```

**操作步骤：**

```
1️⃣ nano 编辑器会打开 .env 文件
2️⃣ 用方向键导航到这一行：
   GROQ_API_KEY=your_groq_api_key_here
3️⃣ 删除「your_groq_api_key_here」
4️⃣ 粘贴你的真实 Groq API Key
5️⃣ 重复步骤 2-4，更新：
   - TAVILY_API_KEY
   - TELEGRAM_BOT_TOKEN
6️⃣ 按 Ctrl+X（或 Ctrl+O 然后 Enter 保存）
7️⃣ 按 Y 确认保存
8️⃣ 按 Enter 确认文件名
```

**最终结果应该看起来像：**

```
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxx
TAVILY_API_KEY=tvly_xxxxxxxxxxxxx
TELEGRAM_BOT_TOKEN=123456789:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi
```

### 验证保存

```bash
root@localhost:~/nanoclaw# cat .env | grep "_KEY="
```

应该显示你的真实 Keys（不是占位符）。

---

## 📦 **Sub-Step 2.4：安装 npm 依赖**

现在安装 NanoClaw 需要的所有 npm 包。

```bash
root@localhost:~/nanoclaw# npm install
```

**这一步会做什么：**

```
1️⃣ 创建 node_modules/ 目录
2️⃣ 下载所有依赖包（约 50-100 个）
3️⃣ 安装 SQLite、Telegram Bot API、Groq SDK 等
4️⃣ 生成 package-lock.json 文件
```

**预期输出：**

```
added XXX packages in XXX seconds
```

**耗时：** 10-20 分钟（取决于网速）

### 必需的依赖

```bash
npm install dotenv
npm install better-sqlite3
npm install node-telegram-bot-api
npm install @groq-cloud/sdk
npm install axios
npm install date-fns
npm install uuid
```

**如果上面的命令不行，执行这个一条龙安装：**

```bash
root@localhost:~/nanoclaw# npm install --save \
  dotenv \
  better-sqlite3 \
  node-telegram-bot-api \
  @groq-cloud/sdk \
  axios \
  date-fns \
  uuid
```

### 验证安装

```bash
root@localhost:~/nanoclaw# ls -la | grep node_modules
```

应该显示 node_modules 目录。

```bash
root@localhost:~/nanoclaw# npm list --depth=0
```

应该显示已安装的主要包。

---

## 📁 **Sub-Step 2.5：创建项目目录结构**

现在创建 NanoClaw 的核心目录结构。

**创建所有必需的目录：**

```bash
root@localhost:~/nanoclaw# mkdir -p src/core
root@localhost:~/nanoclaw# mkdir -p src/foundation
root@localhost:~/nanoclaw# mkdir -p src/skill-loader
root@localhost:~/nanoclaw# mkdir -p src/models
root@localhost:~/nanoclaw# mkdir -p src/memory
root@localhost:~/nanoclaw# mkdir -p skills/official
root@localhost:~/nanoclaw# mkdir -p skills/google
root@localhost:~/nanoclaw# mkdir -p skills/coding
root@localhost:~/nanoclaw# mkdir -p skills/disabled
root@localhost:~/nanoclaw# mkdir -p data
root@localhost:~/nanoclaw# mkdir -p logs
root@localhost:~/nanoclaw# mkdir -p backups
```

### 验证目录结构

```bash
root@localhost:~/nanoclaw# tree -L 2
```

或者简单的：

```bash
root@localhost:~/nanoclaw# find . -type d -maxdepth 2 | sort
```

应该显示所有你创建的目录。

---

## 💾 **Sub-Step 2.6：初始化数据库**

现在创建 SQLite 数据库和必需的表。

**创建 db-init.js 文件：**

```bash
root@localhost:~/nanoclaw# cat > db-init.js << 'EOF'
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DATABASE_PATH || './nanoclaw.db';
const db = new Database(dbPath);

console.log('📊 初始化数据库...');

// 创建 token_usage 表
db.exec(`
  CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    model_provider TEXT NOT NULL,
    model_name TEXT NOT NULL,
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    cost REAL,
    duration_ms INTEGER,
    success BOOLEAN,
    error_message TEXT,
    user_id TEXT DEFAULT 'default'
  );
  
  CREATE INDEX IF NOT EXISTS idx_timestamp ON token_usage(timestamp);
  CREATE INDEX IF NOT EXISTS idx_provider ON token_usage(model_provider);
`);

// 创建 memories 表
db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id INTEGER PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    type TEXT,
    content TEXT,
    importance INTEGER DEFAULT 1,
    category TEXT,
    tags TEXT
  );
  
  CREATE INDEX IF NOT EXISTS idx_type ON memories(type);
  CREATE INDEX IF NOT EXISTS idx_timestamp_mem ON memories(timestamp);
`);

// 创建 notes 表
db.exec(`
  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    title TEXT,
    content TEXT,
    tags TEXT,
    pinned BOOLEAN DEFAULT 0
  );
`);

// 创建 user_profile 表
db.exec(`
  CREATE TABLE IF NOT EXISTS user_profile (
    id INTEGER PRIMARY KEY,
    key TEXT UNIQUE,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

db.close();
console.log('✅ 数据库初始化完成！');
EOF
```

**现在运行初始化脚本：**

```bash
root@localhost:~/nanoclaw# node db-init.js
```

**预期输出：**

```
📊 初始化数据库...
✅ 数据库初始化完成！
```

### 验证数据库

```bash
root@localhost:~/nanoclaw# ls -la nanoclaw.db
```

应该显示 nanoclaw.db 文件已创建。

---

## 🤖 **Sub-Step 2.7：创建主入口文件（index.js）**

现在创建 NanoClaw 的主程序文件。

```bash
root@localhost:~/nanoclaw# cat > index.js << 'EOF'
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const Groq = require('@groq-cloud/sdk');
const Database = require('better-sqlite3');

console.log('🚀 NanoClaw 启动中...\n');

// ========== 初始化组件 ==========

// 环境变量验证
const requiredEnvVars = ['GROQ_API_KEY', 'TELEGRAM_BOT_TOKEN', 'TAVILY_API_KEY'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`❌ 环境变量缺失: ${envVar}`);
    process.exit(1);
  }
}

console.log('✅ 环境变量验证成功');

// 初始化 Groq
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

console.log(`✅ Groq API 已连接 (模型: ${process.env.GROQ_MODEL})`);

// 初始化数据库
const db = new Database('./nanoclaw.db');
console.log('✅ 数据库已连接');

// 初始化 Telegram Bot
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
  polling: true
});

console.log('✅ Telegram Bot 已启动\n');

// ========== Telegram 事件处理 ==========

// 监听所有消息
bot.on('message', async (msg) => {
  const chatId = msg.chat.id;
  const userMessage = msg.text;

  console.log(`📨 收到消息 (${msg.from.first_name}): ${userMessage}`);

  // 不处理命令（以 / 开头）
  if (userMessage.startsWith('/')) {
    return;
  }

  try {
    // 发送「正在输入」状态
    await bot.sendChatAction(chatId, 'typing');

    // 调用 Groq API
    console.log('🤖 正在生成回复...');
    
    const completion = await groq.chat.completions.create({
      messages: [
        {
          role: 'user',
          content: userMessage,
        },
      ],
      model: process.env.GROQ_MODEL || 'gemma-2-9b-it',
      temperature: 0.7,
      max_tokens: 1024,
    });

    const aiResponse = completion.choices[0].message.content;

    // 记录 token 使用
    const usage = completion.usage;
    db.prepare(`
      INSERT INTO token_usage 
      (model_provider, model_name, input_tokens, output_tokens, cost, duration_ms, success)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'groq',
      process.env.GROQ_MODEL || 'gemma-2-9b-it',
      usage.prompt_tokens,
      usage.completion_tokens,
      0,
      100,
      1
    );

    // 发送回复
    await bot.sendMessage(chatId, aiResponse);
    console.log(`✅ 已发送回复\n`);

  } catch (error) {
    console.error('❌ 错误:', error.message);
    await bot.sendMessage(chatId, `❌ 出错了: ${error.message}`);
  }
});

// 处理 /start 命令
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const welcomeMessage = `
👋 欢迎使用 NanoClaw！

我是你的 AI 助手。

📚 可用命令：
/help - 帮助
/status - 系统状态
/token_today - 今日 token 统计

直接发送任何消息，我会回复你！
  `;
  await bot.sendMessage(chatId, welcomeMessage);
});

// 处理 /help 命令
bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  const helpMessage = `
📖 **NanoClaw 帮助**

可用命令：
/start - 开始
/help - 帮助
/status - 系统状态
/token_today - 今日 token 统计

发送任何文本会获得 AI 回复。
  `;
  await bot.sendMessage(chatId, helpMessage);
});

// 处理 /status 命令
bot.onText(/\/status/, async (msg) => {
  const chatId = msg.chat.id;
  
  // 获取今日统计
  const todayStats = db.prepare(`
    SELECT 
      COUNT(*) as count,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens
    FROM token_usage
    WHERE DATE(timestamp) = DATE('now')
  `).get();

  const statusMessage = `
📊 **系统状态**

✅ Groq API: 已连接
✅ Telegram Bot: 已连接
✅ 数据库: 已连接

📈 今日统计：
- 请求数: ${todayStats.count || 0}
- 输入 tokens: ${todayStats.input_tokens || 0}
- 输出 tokens: ${todayStats.output_tokens || 0}

🚀 NanoClaw 运行中...
  `;
  
  await bot.sendMessage(chatId, statusMessage);
});

// 处理 /token_today 命令
bot.onText(/\/token_today/, async (msg) => {
  const chatId = msg.chat.id;
  
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as count,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens
    FROM token_usage
    WHERE DATE(timestamp) = DATE('now')
  `).get();

  const message = `
📊 **今日 Token 统计**

- 请求数: ${stats.count || 0}
- 输入 tokens: ${stats.input_tokens || 0}
- 输出 tokens: ${stats.output_tokens || 0}
- 总 tokens: ${(stats.input_tokens || 0) + (stats.output_tokens || 0)}
  `;
  
  await bot.sendMessage(chatId, message);
});

// 错误处理
bot.on('error', (error) => {
  console.error('❌ Telegram Bot 错误:', error);
});

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✨ NanoClaw 已就绪！');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('\n💬 发送你的 Telegram 消息来测试...\n');
EOF
```

**验证文件创建：**

```bash
root@localhost:~/nanoclaw# ls -la index.js
```

应该显示 index.js 文件已创建。

---

## 🧪 **Sub-Step 2.8：测试系统（首次启动）**

现在，让我们启动 NanoClaw 并测试它是否工作！

```bash
root@localhost:~/nanoclaw# node index.js
```

**预期输出：**

```
🚀 NanoClaw 启动中...

✅ 环境变量验证成功
✅ Groq API 已连接 (模型: gemma-2-9b-it)
✅ 数据库已连接
✅ Telegram Bot 已启动

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ NanoClaw 已就绪！
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💬 发送你的 Telegram 消息来测试...
```

如果看到这样的输出，说明 NanoClaw 已经成功启动！

### 在另一个窗口中测试

现在打开 Telegram app，找到你创建的 Bot，发送一条消息测试：

```
在 Telegram 中向你的 Bot 发送：
「hello」

期望回复：Bot 会用 AI 回复你的问候
```

如果收到了 AI 的回复，说明整个系统都在正常工作！🎉

### 停止 NanoClaw

按 `Ctrl+C` 停止运行。

---

## ✅ **Step 2 完成检查清单**

```
□ .env 文件已创建，包含所有真实 API Keys
□ npm 依赖已安装（node_modules/ 目录存在）
□ 项目目录结构已创建
□ nanoclaw.db 数据库已初始化
□ index.js 主程序已创建
□ NanoClaw 可以成功启动
□ Telegram Bot 能接收和回复消息

全部 ✅ = Step 2 完成！
```

---

## 🔧 **常见问题**

### ❌ 问题 1：API Key 无效

**症状：** 启动时报错关于无效的 API Key

**解决：**
1. 检查 .env 文件中的 Keys 是否正确
2. 确保没有多余的空格或换行符
3. 验证你复制的是完整的 Key

---

### ❌ 问题 2：Telegram Bot 无法连接

**症状：** 启动时报错关于 Telegram

**解决：**
1. 检查 TELEGRAM_BOT_TOKEN 是否正确
2. 确保你已在 @BotFather 中创建了 Bot
3. 确保手机有网络连接

---

### ❌ 问题 3：npm install 失败

**症状：** 安装依赖时出错

**解决：**
1. 删除 node_modules 目录：`rm -rf node_modules`
2. 删除 package-lock.json：`rm package-lock.json`
3. 重新安装：`npm install`

---

### ❌ 问题 4：数据库初始化失败

**症状：** `node db-init.js` 报错

**解决：**
1. 确保 better-sqlite3 已安装：`npm install better-sqlite3`
2. 删除旧的数据库：`rm nanoclaw.db`
3. 重新运行：`node db-init.js`

---

## 📊 **预期耗时统计**

```
获取 API Keys：10 分钟
创建 .env 文件：5 分钟
npm install：20 分钟
创建目录结构：2 分钟
初始化数据库：2 分钟
创建主程序：5 分钟
测试系统：10 分钟

总计：50-60 分钟
```

---

## 🎯 **现在的状态**

你已经有了：

```
✅ 完整的开发环境（Step 1）
✅ 可运行的 NanoClaw 核心系统（Step 2）
✅ 工作的 Telegram Bot
✅ 数据库和 token 监控
✅ 能接收和回复消息的 AI 助手
```

---

## 📍 **下一步**

Step 3 我们将添加：

```
1️⃣ 记忆系统（长期记憶）
2️⃣ 人格系统（Big 5 特质）
3️⃣ Google Workspace 集成
4️⃣ Notes 系统（本地日程）
5️⃣ 更多命令和功能
```

---

## 💬 **完成后告诉我：**

```
「Step 2 完成」

并确认：
✅ NanoClaw 可以启动
✅ Telegram Bot 能收到消息
✅ Bot 能回复消息
✅ 系统运行正常

然后我们进入 Step 3！
```

---

**现在开始吧！你已经接近成功了！** 🚀
