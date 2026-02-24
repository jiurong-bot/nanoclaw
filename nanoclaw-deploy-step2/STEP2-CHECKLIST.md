# ✅ NanoClaw Step 2 完成清單

## 【準備階段】

- [ ] ✅ 確認在 Termux Ubuntu 環境中（~/nanoclaw）
- [ ] ✅ Node.js v24+ 已安裝（`node -v`）
- [ ] ✅ npm 11+ 已安裝（`npm -v`）
- [ ] ✅ 三個 API Keys 已獲取：
  - [ ] Groq API Key（gsk_...）
  - [ ] Tavily API Key（tvly_...）
  - [ ] Telegram Bot Token（123456789:ABC...）

---

## 【部署階段】

### Sub-Step 2.1：目錄準備
- [ ] ✅ 執行：`mkdir -p ~/nanoclaw`
- [ ] ✅ 執行：`cd ~/nanoclaw`
- [ ] ✅ 驗證：`pwd` 顯示 `/root/nanoclaw`

### Sub-Step 2.2：建立 .env 文件
- [ ] ✅ 使用 `nano .env` 建立文件
- [ ] ✅ 複製所有環境變數配置
- [ ] ✅ 檢查 API Keys 已正確填入
- [ ] ✅ 保存文件（Ctrl+X → Y → Enter）
- [ ] ✅ 驗證：`cat .env | grep TELEGRAM_BOT_TOKEN`

### Sub-Step 2.3：建立 package.json
- [ ] ✅ 使用 `nano package.json` 建立文件
- [ ] ✅ 複製 JSON 內容
- [ ] ✅ 保存文件
- [ ] ✅ 驗證：`cat package.json | grep name`

### Sub-Step 2.4：安裝 npm 依賴
- [ ] ✅ 執行：`npm install`
- [ ] ✅ 等待完成（可能 10-20 分鐘）
- [ ] ✅ 檢查輸出：沒有 ERR! 或 WARN
- [ ] ✅ 驗證：`ls -la node_modules | wc -l` 應 > 100

### Sub-Step 2.5：建立 index.js（主程序）
- [ ] ✅ 使用 `nano index.js` 建立文件
- [ ] ✅ 複製完整的 index.js 代碼
- [ ] ✅ 保存文件
- [ ] ✅ 驗證：`wc -l index.js` 應 > 300

### Sub-Step 2.6：建立靈魂文件 soul.md
- [ ] ✅ 使用 `nano soul.md` 建立文件
- [ ] ✅ 複製 soul.md 內容
- [ ] ✅ 保存文件
- [ ] ✅ 驗證：`cat soul.md | head -5`

### Sub-Step 2.7：建立目錄結構
- [ ] ✅ 執行：`mkdir -p config backups logs scripts`
- [ ] ✅ 驗證：`ls -la | grep "^d"`

---

## 【測試階段】

### 核心功能測試

#### 測試 1：Node.js 環境
```bash
root@localhost:~/nanoclaw# node -e "console.log('✅ Node.js 正常')"
```
- [ ] ✅ 成功：看到 `✅ Node.js 正常`

#### 測試 2：環境變數加載
```bash
root@localhost:~/nanoclaw# node -e "require('dotenv').config(); console.log('GROQ:', process.env.GROQ_API_KEY ? '✅' : '❌')"
```
- [ ] ✅ 成功：看到 `GROQ: ✅`

#### 測試 3：啟動 Bot
```bash
root@localhost:~/nanoclaw# npm start
```
- [ ] ✅ 看到：`🚀 NanoClaw V80.1-L1 啟動...`
- [ ] ✅ 看到：`✅ 數據庫初始化完成`
- [ ] ✅ 看到：`✅ Groq API 連接成功`
- [ ] ✅ 看到：`✅ Bot 已啟動並監聽`

---

## 【Telegram 集成測試】

打開 Telegram，搜索你的機器人。

### 測試指令 1：/help
```
發送：/help
預期：收到指令清單，包含 /status、/model、/vibrate 等
```
- [ ] ✅ 成功收到指令清單

### 測試指令 2：/status
```
發送：/status
預期：收到儀表板，包含系統運行時間、電池、記憶條目等
```
- [ ] ✅ 成功收到系統狀態

### 測試指令 3：/memory
```
發送：/memory
預期：收到記憶統計信息
```
- [ ] ✅ 成功收到記憶統計

### 測試對話 1：簡單提問
```
發送：Hello, how are you?
預期：Bot 應該用 soul.md 中定義的人格回覆
```
- [ ] ✅ 收到自然對話回覆

### 測試對話 2：繁體中文
```
發送：你好，今天天氣如何？
預期：Bot 用繁體中文回覆
```
- [ ] ✅ 收到繁體中文回覆

### 測試對話 3：長對話
```
發送：請幫我解釋一下什麼是機器學習？
預期：收到詳細回覆（可能分多條消息）
```
- [ ] ✅ 收到詳細解釋

---

## 【數據持久化測試】

### 測試記憶保存
```bash
root@localhost:~/nanoclaw# ls -la *.db
```
- [ ] ✅ 看到 `nanoclaw.db` 文件

```bash
root@localhost:~/nanoclaw# sqlite3 nanoclaw.db "SELECT COUNT(*) FROM memory;"
```
- [ ] ✅ 看到數字 > 0（表示對話已保存）

### 測試備份功能
```
Telegram 中發送：/backup
```
- [ ] ✅ 收到備份完成消息

```bash
root@localhost:~/nanoclaw# ls -la backups/
```
- [ ] ✅ 看到 `backup_*.db` 文件

---

## 【系統穩定性測試】

### 測試 1：連續對話
```
發送 5 條消息，都應該得到回覆
```
- [ ] ✅ 所有消息都有回覆

### 測試 2：長運行測試
```bash
# 在後台運行 Bot，讓它運行至少 5 分鐘
npm start &
```
- [ ] ✅ Bot 沒有崩潰
- [ ] ✅ 仍能回應 Telegram 消息

### 測試 3：優雅關閉
```bash
# 按 Ctrl+C 停止 Bot
```
- [ ] ✅ 看到 `✅ 系統已安全關閉`
- [ ] ✅ 沒有遺留的進程

---

## 【文件完整性驗證】

```bash
root@localhost:~/nanoclaw# ls -lh
```

應該看到：
```
-rw-r--r-- .env                    (~1KB)
-rw-r--r-- package.json            (~700B)
-rw-r--r-- index.js                (~10KB)
-rw-r--r-- soul.md                 (~1KB)
drwxr-xr-x node_modules/           (多個依賴)
drwxr-xr-x config/
drwxr-xr-x backups/
drwxr-xr-x logs/
drwxr-xr-x scripts/
```

- [ ] ✅ 所有文件都存在
- [ ] ✅ 文件大小合理

---

## 【最終檢查】

### 日誌檢查
```bash
root@localhost:~/nanoclaw# cat logs/* 2>/dev/null || echo "暫無日誌"
```
- [ ] ✅ 有日誌記錄（如果有的話）

### 配置檢查
```bash
root@localhost:~/nanoclaw# grep -E "GROQ|TAVILY|TELEGRAM" .env
```
- [ ] ✅ 所有 API Keys 都已配置

### 數據庫檢查
```bash
root@localhost:~/nanoclaw# sqlite3 nanoclaw.db ".tables"
```
- [ ] ✅ 看到所有表：memory config token_usage

---

## ✨ Step 2 完成！

當你打勾了上面所有的項目後，**Step 2 就完成了！** 🎉

### 你現在擁有：
- ✅ 完整的 NanoClaw 核心系統
- ✅ Telegram Bot 與 AI 集成
- ✅ 本地數據庫存儲對話
- ✅ 系統監控和備份功能
- ✅ 人格化的 AI 助手

### 下一步：
進入 **Step 3：靈魂系統與長期記憶**，你將：
- 📚 實現真正的長期記憶
- 🧬 添加 Big 5 人格進化
- 🎯 自定義 AI 行為規則

---

**日期：** ________________
**完成時間：** ________________
**備註：** ________________________________________________

祝賀！你已經成功部署了 NanoClaw 的核心系統！🚀
