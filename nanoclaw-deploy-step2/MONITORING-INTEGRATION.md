# 🔍 NanoClaw 監控系統集成指南

## 📊 新增功能

### **V81.0-L2-MONITOR 版本包含：**

#### **1️⃣ 硬體監控（60秒執行）**
- CPU 負載監控
- 內存使用率追蹤
- 電池電量和溫度
- 磁盤使用情況
- 網絡連接狀態
- 系統過熱檢測

#### **2️⃣ 軟體監控（120秒執行）**
- 進程狀態檢查
- 內存洩漏檢測
- 依賴完整性驗證
- 錯誤日誌分析

#### **3️⃣ 服務健康檢測（300秒執行）**
- AI 模型服務狀態
- 數據庫連接檢測
- 系統整體評分（0-100）

#### **4️⃣ 主動告警系統（實時）**
- 4 級優先順序（P0 ~ P3）
- CPU / 內存 / 電池 / 溫度 告警
- 網絡離線檢測
- Telegram 實時推送
- 30 秒去重機制（避免刷屏）
- 完整告警歷史記錄

---

## 🚀 使用方法

### **方案 A：使用新的監控版本（推薦）**

```bash
# 1. 備份現在的 index.js
cd ~/nanoclaw
cp index.js index-backup.js

# 2. 使用新版本
cp index-with-monitoring.js index.js

# 3. 重新啟動
npm start
```

### **方案 B：保留現在版本，手動集成**

如果你想保留現在的 index.js，可以：

1. 複製 `monitoring.js` 到 ~/nanoclaw/
2. 在你的 index.js 開頭添加：
```javascript
const MonitoringSystem = require('./monitoring');
const monitor = new MonitoringSystem(db, bot, MY_CHAT_ID);
```

3. 在 Bot 啟動後調用：
```javascript
monitor.start();
```

---

## 📱 新增命令

### **/monitor**
顯示實時監控面板：
```
🛡️ **雅典娜監控面板**
📊 硬體狀態：
  CPU: 0.45 | 內存: 62%
  電池: 88% | 溫度: 38°C 🟢
  磁盤: 9% ✅
  網絡: 🟢

💚 整體評分：85/100
```

### **/status**
顯示系統狀態（新增監控數據）：
```
🛡️ **雅典娜治理官儀表板**
啟動時長：1h
電池狀態：88% / 38.0°C
技能狀態：✅ L2 已激活
靈魂記憶：42 筆
健康評分：85/100
```

---

## 🚨 告警機制

### **告警優先順序**

| 優先級 | 觸發條件 | 行為 |
|-------|--------|------|
| **P0** | 過熱 (>60°C) 或網絡離線 | 立即推送 |
| **P1** | 內存 >90% 或電池 <20% | 立即推送 |
| **P2** | CPU 高 或磁盤 >85% | 立即推送 |
| **P3** | 普通信息 | 每 5 分鐘匯總 |

### **告警示例**

```
🌡️ 過熱告警
溫度：62°C
[P0]

🔴 內存告警
使用率：92%
[P1]
```

---

## 💾 監控數據存儲

### **告警歷史**

所有告警會自動保存到 `memory.json` 中的 `alerts` 陣列：

```javascript
{
  "alerts": [
    {
      "timestamp": "2026-02-25T14:30:45Z",
      "level": "P0",
      "title": "🌡️ 過熱",
      "msg": "溫度：62°C"
    },
    ...
  ]
}
```

### **監控採樣**

系統保留最近 100 個採樣（每 60 秒一個）：

```javascript
{
  timestamp: "2026-02-25T14:30:00Z",
  cpu: { load1: 0.45, ... },
  memory: { total: 4096, used: 2560, usedPercent: 62 },
  battery: { percentage: 88, temperature: 38 },
  ...
}
```

---

## 📊 健康評分計算

```
基礎分：100

扣分項：
- 內存 > 80%：-20 分
- CPU 負載 > 2：-10 分
- 電池 < 20%：-15 分
- 溫度 > 55°C：-10 分
- 網絡離線：-25 分

最終分 = MAX(0, MIN(100, 100 - 扣分))

評分標準：
✅ 優秀：> 80
⚠️ 良好：60-80
🟠 一般：40-60
🔴 故障：< 40
```

---

## 🔧 配置閾值

編輯 index-with-monitoring.js 中的：

```javascript
this.thresholds = {
  cpu: 85,           // CPU 使用率（%）
  memory: 90,        // 內存使用率（%）
  battery: 20,       // 電池低電量（%）
  temperature: 60,   // 系統溫度（°C）
  disk: 85           // 磁盤使用率（%）
};
```

---

## 📈 監控週期

- **60 秒**：硬體監控（CPU、內存、電池、磁盤、網絡、溫度）
- **120 秒**：軟體監控（進程、依賴、日誌）
- **300 秒**：服務健康檢測（AI、數據庫、系統評分）
- **實時**：告警檢測和推送

---

## 🎯 下一步優化

### **Phase 2（未來）**
- [ ] 數據持久化（SQLite）
- [ ] 歷史趨勢分析圖表
- [ ] 預測性告警
- [ ] 自動修復建議

### **Phase 3（遠期）**
- [ ] Web 儀表板
- [ ] 手機 App
- [ ] 機器學習異常檢測

---

## 🚀 部署步驟

### **Step 1：停止當前 Bot**

```bash
# 按 Ctrl+C 停止
```

### **Step 2：使用監控版本**

```bash
cd ~/nanoclaw

# 方案 A：完全替換
cp index-with-monitoring.js index.js

# 方案 B：備份後替換
mv index.js index-old.js
cp index-with-monitoring.js index.js
```

### **Step 3：確保依賴完整**

```bash
npm install
```

### **Step 4：重新啟動**

```bash
npm start
```

### **Step 5：測試**

在 Telegram 發送：
```
/monitor        → 看監控面板
/status         → 看系統狀態
```

---

## ⚠️ 故障排除

### ❌ Bot 無法啟動

**檯誤信息**：`Cannot find module 'lowdb'`

**解決**：
```bash
npm install lowdb
npm start
```

### ❌ 監控面板顯示不正常

**檯誤信息**：`termux-battery-status: command not found`

**原因**：不在 Termux 環境中

**解決**：確認在 Ubuntu proot 環境中運行

### ❌ 告警推送失敗

**檯誤信息**：`sendMessage failed`

**檢查**：
1. Telegram Bot Token 是否有效
2. 網絡連接是否正常
3. MY_CHAT_ID 是否正確

---

## 💡 最佳實踐

1. **定期檢查告警**
   - `/monitor` 每小時檢查一次
   - 及時處理 P0/P1 級告警

2. **數據備份**
   - 使用 `/backup` 定期備份
   - 監控歷史保留 30 天

3. **閾值調整**
   - 根據實際硬體調整告警閾值
   - 避免頻繁虛假告警

4. **日誌分析**
   - 定期查看錯誤趨勢
   - 及時修復重複出現的問題

---

*文檔版本：V1.0*
*更新日期：2026-02-25*
*適用版本：V81.0-L2-MONITOR*
