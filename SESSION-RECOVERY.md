# 🔄 Session 恢復指南

當你開新 session 時，使用這份指南快速恢復項目進度。

---

## 📋 當前項目狀態快照

**日期**：2026-02-25
**版本**：V81.0-L2 穩定版
**環境**：Termux + Ubuntu proot
**狀態**：🟢 完全運行中

---

## ✅ 已完成的工作

### 核心系統
- ✅ Step 1：環境準備（Node.js v24、npm 11）
- ✅ Step 2：核心系統部署（Bot + Groq + Telegram）
- ✅ Step 3：V81.0-L2 生活工作層（6 大 Skills）

### 已激活的功能
- ✅ AI 智能對話（Groq llama-3.3-70b）
- ✅ Telegram Bot 連接
- ✅ Tavily 聯網搜尋
- ✅ 6 大摸魚 Skills（/sum, /focus, /note, /vibe, /slacker）
- ✅ 硬體監控（CPU/電池/溫度）
- ✅ 靈魂記憶數據庫（lowdb）
- ✅ 數據自動備份

### API 配置
- ✅ Groq API Key：已激活
- ✅ Tavily API Key：已激活
- ✅ Telegram Bot Token：已激活

---

## 🔧 如何恢復項目

### 步驟 1：檢查 Bot 是否還在運行

```bash
# SSH 進入 Termux Ubuntu proot
proot-distro login ubuntu

# 檢查 Node.js 進程
ps aux | grep node
ps aux | grep npm

# 如果看到 `node index.js` 運行中 → 跳到步驟 3
# 如果沒看到 → 執行步驟 2
```

### 步驟 2：重新啟動 Bot

```bash
# 進入項目目錄
cd ~/nanoclaw

# 確認文件完整
ls -la
# 應該看到：.env, package.json, index.js, node_modules/

# 啟動 Bot
npm start

# 預期輸出：
# 🚀 雅典娜 V81.0-L2 啟動...
# ✅ Bot 已啟動並監聽
```

### 步驟 3：驗證 Telegram 連接

在 Telegram 中發送：
```
/status
```

應該收到系統狀態回覆。

### 步驟 4：檢查數據完整性

```bash
# 查看靈魂記憶
cat config/memory.json

# 查看備份列表
ls -la backup_*.json

# 查看日誌
tail -20 logs/*.log 2>/dev/null || echo "暫無日誌"
```

---

## 📊 項目目錄結構

```
~/nanoclaw/
├── .env                  ← API Keys 配置
├── package.json          ← npm 依賴清單
├── index.js              ← Bot 主程序（V81.0-L2）
├── soul.md               ← AI 人格設定
├── nanoclaw.db           ← SQLite 數據庫（如果有）
├── node_modules/         ← npm 依賴包
├── config/
│   └── memory.json       ← 靈魂記憶數據
├── backups/              ← 備份文件夾
├── logs/                 ← 日誌文件夾
└── scripts/              ← 輔助腳本（備用）
```

---

## 🆘 常見問題恢復

### ❌ Bot 無法啟動

**症狀**：`npm start` 報錯

**解決**：
```bash
# 1. 檢查依賴
npm list

# 2. 重新安裝（如果缺少）
npm install

# 3. 檢查 Node.js 版本
node -v
# 應該是 v24+

# 4. 清空 node_modules 重裝
rm -rf node_modules
npm install
```

### ❌ Telegram 收不到消息

**症狀**：Bot 啟動但 Telegram 無回應

**解決**：
```bash
# 檢查 API Key
cat .env | grep TELEGRAM_BOT_TOKEN

# 測試網路
ping -c 3 8.8.8.8

# 檢查是否有錯誤日誌
tail -50 /root/nanoclaw/*.log 2>/dev/null
```

### ❌ npm install 失敗

**症狀**：`npm install` 卡住或報編譯錯誤

**解決**：
```bash
# 1. 安裝編譯工具
pkg install build-essential python3 -y

# 2. 清空 npm 緩存
npm cache clean --force

# 3. 重試
npm install --verbose
```

---

## 📝 重要文件位置

| 文件 | 路徑 | 用途 |
|------|------|------|
| 環境配置 | `~/.env` | API Keys |
| 主程序 | `~/nanoclaw/index.js` | Bot 邏輯 |
| 記憶數據 | `~/nanoclaw/config/memory.json` | 靈魂數據 |
| 備份文件 | `~/nanoclaw/backup_*.json` | 定期備份 |
| GitHub | https://github.com/jiurong-bot/nanoclaw | 源代碼 |

---

## 🚀 下一步計畫

當前版本已完成的：
- ✅ V81.0-L2（核心 + 6 大 Skills）

後續要添加的：
- ⏳ Step 4：Google Integration（Gmail、Calendar）
- ⏳ Step 5：Token 監控與成本優化
- ⏳ Step 6：Big 5 人格進化系統
- ⏳ Step 7：自動化與智能診斷

---

## 📞 快速命令參考

```bash
# 進入項目
cd ~/nanoclaw

# 啟動 Bot
npm start

# 後台運行（可選）
nohup npm start > bot.log 2>&1 &

# 查看運行狀態
ps aux | grep node

# 停止 Bot
pkill -f "node index.js"

# 重新啟動
npm start

# 查看最新日誌
tail -f bot.log
```

---

## ✅ Session 恢復清單

新 session 時，逐項檢查：

- [ ] 已 SSH 連進 Termux Ubuntu proot
- [ ] 檢查 Bot 是否仍在運行（`ps aux | grep node`）
- [ ] 檢查 API Keys 是否仍有效
- [ ] 在 Telegram 中發送 `/status` 測試
- [ ] 檢查 memory.json 是否完整
- [ ] 查看 GitHub 上有無新的代碼更新

**若一切正常，項目已恢復！** ✅

---

*最後更新：2026-02-25 01:28*
*版本：V81.0-L2*
