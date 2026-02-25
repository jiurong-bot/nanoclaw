# 工作流程 & 約定

## 📋 標準工作流程（2026-02-25 確定）

### 🔄 代碼修改 → 部署流程

**Step 1：需求溝通**
- 用户提出修改需求（例：「加入 X 功能」「修改 Y 參數」）

**Step 2：代碼準備**
- AI 讀取相關報告書（如需要）
- AI 生成完整 JavaScript 代碼
- ✅ **關鍵**：提供完整代碼，不分段拼接

**Step 3：用户部署**
```bash
cd ~/nanoclaw
nano index.js          # 打開編輯器
# 清空舊代碼 → 粘貼完整新代碼 → 保存
Ctrl+X → Y → Enter

npm start              # 啟動 Bot
```

**Step 4：驗證**
- 用户在 Telegram 中測試功能
- 報告結果或問題

---

## ✅ 代碼交付標準

### 格式要求
- ✅ **完整代碼**：一次性給出，不分段
- ✅ **清晰格式**：正確的縮進、空行、註釋
- ✅ **可直接複製**：無需額外拼接或修改

### 部分劃分（如必要）
- Part 1、Part 2、Part 3 等
- 每個 Part 都是**完整可複製**的代碼塊
- 清楚標註銜接點

### 禁止的方式
- ❌ Shell 一行命令拼接（容易出錯）
- ❌ 分段貼上需要拼接（低效率）
- ❌ `cat > file << EOF` 這樣的方式
- ❌ 理論描述代替實際代碼

---

## 🎯 優先級決策框架

### P1（立即實現）
- 核心功能缺陷修復
- 用户明確需要的功能
- 穩定性相關

### P2（近期實現）
- 增強現有功能
- 新的實用功能
- 預計需要 1-2 週

### P3（探索性）
- 新概念驗證
- 低優先級增強
- 無明確時間表

---

## 📝 溝通約定

### 我的責任
- ✅ 理解需求準確性
- ✅ 提供可執行的解決方案
- ✅ 清楚的說明文檔
- ✅ 考慮邊界情況

### 用户的責任
- ✅ 清楚表達需求
- ✅ 測試部署後的結果
- ✅ 及時反饋問題
- ✅ 遵循標準部署流程

---

## 🔧 技術決策原則

### 選擇標準
1. **穩定性優先**（> 新穎性）
2. **完整性優先**（> 快速）
3. **易用性優先**（> 強大但複雜）
4. **本地優先**（> 雲服務，除非必要）

### 技術棧
- **語言**：Node.js + JavaScript
- **數據庫**：lowdb（Pure JS，無編譯依賴）
- **框架**：Telegraf（Telegram Bot）、Groq（AI）
- **部署**：Termux SSH over Tailscale

---

## 📅 版本管理

### 版本命名
- `V82.0-ULTIMATE`：主版本.小版本-描述
- 新增重大功能 → 小版本 +1
- Bug 修復 → 維護版本 +1

### 備份策略
- `/backup` 命令自動備份到 `backup_*.json`
- GitHub 倉庫保存完整代碼歷史

---

## ⚠️ 特殊規則

### Termux 限制
- ⚠️ 網絡隔離（需要 SSH）
- ⚠️ 內存限制（avoid 大型編譯）
- ⚠️ 進程限制（background 任務有時間限制）

### 性能考量
- 監控採樣間隔：60 秒（平衡頻率 vs 負載）
- 告警歷史保留：最近 1000 條
- Token 日誌保留：最近 10000 條

---

## 🔴 **關鍵更新（2026-02-25 13:25）**

### GitHub 同步納入工作流
> 「Github文件要同步更新」

**新約定**：
- ✅ **手機端部署** → 完整代碼粘貼 → npm start
- ✅ **GitHub 自動同步** → AI 更新倉庫 + commit + push
- ✅ **記憶更新** → topics 文件自動分類
- ✅ **版本追蹤** → 每個版本都有對應的代碼備份

**工作流變化**：
1. 用户：「想加 X 功能」
2. AI：提供完整代碼 + 部署步驟
3. 用户：nano 粘貼 → npm start
4. AI：自動 git commit + push （新增）
5. 記憶：更新 topics + MEMORY-INDEX

---

## 🔴 **關鍵更新（2026-02-25 13:20）**

### 用户明確指示
> 「之後修改都是指本地手機端，都要給我程式碼。」

**含義**：
- ✅ **所有修改針對手機端** NanoClaw（/root/nanoclaw/index.js）
- ✅ **每次都提供完整代碼**（不是片段、不是指令）
- ✅ **用户直接 nano 粘貼**（不用工具中轉）
- ✅ **完整可執行**（npm start 立即可用）

### 新部署流程（手機 + GitHub 同步）

**用户端（手機）**：
```bash
cd ~/nanoclaw
pkill -f node
sleep 1
nano index.js              # 打開編輯

# 在 nano 中
Ctrl+A                     # 全選舊代碼
Delete                     # 刪除
Ctrl+Shift+V              # 粘貼新代碼（完整）
Ctrl+X → Y → Enter        # 保存退出

npm start                  # 啟動新版本
```

**AI 端（自動執行）**：
```bash
# 代碼已給出 → 用户粘貼部署 → AI 自動同步
cp /root/nanoclaw/index.js /home/openclaw/.openclaw/workspace/nanoclaw-v*.js
cd /home/openclaw/.openclaw/workspace
git add .
git commit -m "V*.0: 功能描述"
git push origin main
```

---

---

## 🟢 **最終工作流確定（2026-02-25 15:35 PM）**

### 用户決策
> 「以後就用這個方法提供我 index.js」（指：GitHub 下載 + 一行指令）

### 新標準流程（正式生效）

**Step 1：你提出需求**
```
「加個天氣功能」
「修改監控更新頻率」
「集成 XXX API」
```

**Step 2：我開發 → GitHub 上傳**
```
生成完整代碼 → V87.0-FACTORY.js
git add + git commit + git push
```

**Step 3：給你下載指令**
```bash
curl -L https://raw.githubusercontent.com/jiurong-bot/nanoclaw/master/V87.0-FACTORY.js -o index.js && npm start
```

**Step 4：你執行（兩種方式）**

方式 A - 一行完整：
```bash
curl -L https://raw.githubusercontent.com/jiurong-bot/nanoclaw/master/V87.0-FACTORY.js -o index.js && npm start
```

方式 B - 用巨集（更快）：
```bash
deploy-nanoclaw      # 自動更新 + 啟動
# 或
update-code && start-bot
```

### 優勢對比

| 比較項 | 舊方法（粘貼代碼） | 新方法（GitHub 下載） |
|--------|-----------------|-------------------|
| 手工複製粘貼 | ❌ 需要 | ✅ 無需 |
| 出錯可能性 | 高 | 低 |
| 易用性 | 中 | 高 |
| GitHub 同步 | 手工 | 自動 |
| 重複部署 | 需重新粘貼 | 一行指令 |
| 巨集支持 | 無 | ✅ 完全支持 |

### Bash 巨集（已建立）

```bash
alias deploy-nanoclaw='cd ~/nanoclaw && pkill -f node; sleep 1 && curl -L https://raw.githubusercontent.com/jiurong-bot/nanoclaw/master/V86.0-DRIVE-FIXED.js -o index.js && npm start'

alias update-code='cd ~/nanoclaw && curl -L https://raw.githubusercontent.com/jiurong-bot/nanoclaw/master/V86.0-DRIVE-FIXED.js -o index.js && echo "✅ 更新完成"'

alias start-bot='cd ~/nanoclaw && npm start'

alias stop-bot='pkill -f node'

alias xc='cd ~/nanoclaw'
```

### 注意事項

⚠️ **每次新版本發布，巨集 URL 需要更新**
- V87.0-FACTORY 發布時：`V86.0-DRIVE-FIXED.js` → `V87.0-FACTORY.js`
- 我會告訴你新的下載鏈接

---

## 🔴 **治理系統 - 2026-02-25 16:10 PM**

### 問題根源
- ❌ V87.0-FACTORY 倉促生成 → 掛掉
- ❌ 同類錯誤重複（V86.0 重複類 → V87.0 整合失敗）
- ❌ 無計劃直接改檔 → 難以追溯和修復
- ❌ 缺乏驗證流程 → 質量難以保證

### 新治理流程（PLAN → READ → CHANGE → QC → PERSIST）

#### Phase 1: PLAN（計劃）
```
需求來臨 → 寫計劃文檔
├─ 改什麼：具體描述
├─ 為什麼：理由和依據
├─ 如何改：分步驟說明
├─ 風險評估：可能的問題
└─ 回滾方案：失敗時怎麼辦
```

**範例**（V87.0-FACTORY 應該這樣）：
```
計劃文檔：V87.0-FACTORY-PLAN.md
├─ 問題：需要自動代碼生成
├─ 方案：5 層架構設計
├─ 測試計劃：
│  ├─ Layer 1 單獨測試（需求分析）
│  ├─ Layer 2 單獨測試（代碼生成）
│  ├─ Layer 3 單獨測試（整合）
│  └─ 完整集成測試
├─ 風險：代碼整合可能失敗 → 解決：先備份 index.js
└─ 批准：等待用户批准再開發
```

#### Phase 2: READ（讀）
```
開發前必須讀：
├─ 現有 V86.0-DRIVE 完整代碼
├─ 相關官方文檔（Node.js、Telegraf）
├─ 之前的錯誤記錄（從 12-bug-reports.md）
└─ 版本歷史和變更日誌
```

#### Phase 3: CHANGE（改）
```
改動時：
├─ 只改必要部分（小步快走）
├─ 每個改動都有註釋說明
├─ 備份原始文件
└─ 不跳過任何步驟
```

#### Phase 4: QC（質量檢查）
```
改好後立即檢查：
├─ 語法檢查（無重複定義）
├─ 邏輯驗證（API 調用正確）
├─ 邊界情況（異常處理）
└─ 回滾測試（確保能恢復）
```

#### Phase 5: PERSIST（記錄）
```
部署前建檔案：
├─ CHANGE-REPORT.md：改了什麼，為什麼改
├─ QC-RESULT.md：檢查結果
├─ INDEX.md：完整變更索引
└─ ROLLBACK-PLAN.md：回滾步驟
```

### 優先級調整

**從前**：
- 快速 > 穩定
- 功能多 > 質量好
- 直接改 > 先計劃

**從現在起**：
```
🥇 穩定性 > 新功能
🥈 可驗證 > 快速
🥉 可追溯 > 省時間
```

### 新工作流（實施細節）

**開發流程**：
```
1️⃣ 需求來臨
   用户：「我想要 X 功能」

2️⃣ 寫計劃（PLAN）
   我提出詳細計劃文檔供批准
   
3️⃣ 等待批准
   用户確認計劃沒問題

4️⃣ 讀現有代碼（READ）
   我完整研究 V86.0 代碼

5️⃣ 開發 + QC（CHANGE + QC）
   ├─ 分模塊開發
   ├─ 每模塊單獨測試
   ├─ 語法檢查（eslint 級別）
   └─ 邏輯驗證

6️⃣ 提交變更報告（PERSIST）
   ├─ 完整的 CHANGE-REPORT
   ├─ QC 檢查結果
   ├─ 變更索引
   └─ 回滾方案

7️⃣ 用户批准後部署
   部署到手機
```

### 禁止清單

❌ **不再允許**：
- 直接改檔未先計劃
- 倉促生成代碼並部署
- 跳過 QC 直接上線
- 無法解釋「改了什麼、為何而改」
- 同類錯誤重複出現
- 無變更記錄的修改

✅ **必須做**：
- 每次改動前寫計劃
- 改動前讀現有代碼
- 改動後進行 QC
- 部署前提交完整報告
- 建立變更索引（便於回溯）
- 准備回滾方案

### 受影響的版本

- **V86.0-DRIVE**：穩定版本 ✅（保持不動）
- **V87.0-FACTORY**：需重新規劃
- **未來所有版本**：都遵循此流程

---

**最後更新**：2026-02-25 16:10 PM  
**約定狀態**：✅ 正式確定 + 立即生效
**適用範圍**：所有 NanoClaw 變更和開發
**下一步**：遵循新治理流程重新規劃 V87.0-FACTORY
