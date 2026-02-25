// 🔍 NanoClaw 主動式監控系統 V1.0
// 基於 nanoclaw-proactive-monitoring.md 規劃實現

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

class MonitoringSystem {
  constructor(db, bot, myChartId) {
    this.db = db;
    this.bot = bot;
    this.myChatId = myChartId;
    this.metrics = null;
    this.alerts = [];
    this.samples = [];
    this.thresholds = {
      cpu: 85,
      memory: 90,
      battery: 20,
      temperature: 60,
      disk: 85
    };
    this.lastAlerts = new Map(); // 去重機制
  }

  // ========== 硬體監控（60秒） ==========
  
  async getHardwareMetrics() {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        cpu: this.getCpuMetrics(),
        memory: this.getMemoryMetrics(),
        battery: this.getBatteryMetrics(),
        disk: this.getDiskMetrics(),
        network: this.getNetworkMetrics(),
        temperature: this.getTemperature()
      };
      
      this.metrics = metrics;
      this.samples.push(metrics);
      
      // 保留最近 100 個採樣
      if (this.samples.length > 100) {
        this.samples.shift();
      }
      
      return metrics;
    } catch (e) {
      console.error('硬體監控錯誤:', e.message);
      return null;
    }
  }

  getCpuMetrics() {
    try {
      const load = require('os').loadavg();
      return {
        load1: load[0].toFixed(2),
        load5: load[1].toFixed(2),
        load15: load[2].toFixed(2)
      };
    } catch (e) {
      return { load1: 0, load5: 0, load15: 0 };
    }
  }

  getMemoryMetrics() {
    try {
      const os = require('os');
      const total = os.totalmem();
      const free = os.freemem();
      const used = total - free;
      const usedPercent = Math.round((used / total) * 100);
      
      return {
        total: Math.round(total / 1024 / 1024),
        free: Math.round(free / 1024 / 1024),
        used: Math.round(used / 1024 / 1024),
        usedPercent: usedPercent
      };
    } catch (e) {
      return { total: 0, free: 0, used: 0, usedPercent: 0 };
    }
  }

  getBatteryMetrics() {
    try {
      const batteryStatus = JSON.parse(
        execSync('termux-battery-status').toString()
      );
      return {
        percentage: batteryStatus.percentage,
        temperature: parseFloat(batteryStatus.temperature),
        health: batteryStatus.health,
        status: batteryStatus.status
      };
    } catch (e) {
      return { percentage: 0, temperature: 0, health: 'unknown', status: 'unknown' };
    }
  }

  getDiskMetrics() {
    try {
      const output = execSync("df -h / | tail -1 | awk '{print $2, $3, $5}'").toString().trim();
      const parts = output.split(' ');
      const usedPercent = parseInt(parts[2]);
      
      return {
        usedPercent: usedPercent,
        status: usedPercent > 95 ? 'critical' : usedPercent > 80 ? 'warning' : 'ok'
      };
    } catch (e) {
      return { usedPercent: 0, status: 'unknown' };
    }
  }

  getNetworkMetrics() {
    try {
      execSync('ping -c 1 -W 1 8.8.8.8').toString();
      return {
        connected: true,
        status: '🟢 已連接'
      };
    } catch (e) {
      return {
        connected: false,
        status: '🔴 離線'
      };
    }
  }

  getTemperature() {
    try {
      const batteryStatus = JSON.parse(
        execSync('termux-battery-status').toString()
      );
      const temp = parseFloat(batteryStatus.temperature);
      return {
        value: temp,
        status: temp > 60 ? '🔴 過熱' : temp > 50 ? '🟠 偏熱' : '🟢 正常'
      };
    } catch (e) {
      return { value: 0, status: '❓ 未知' };
    }
  }

  // ========== 軟體監控（120秒） ==========

  async getSoftwareMetrics() {
    try {
      const metrics = {
        timestamp: new Date().toISOString(),
        processes: this.getProcessMetrics(),
        memory_leak: this.detectMemoryLeak(),
        dependencies: this.checkDependencies(),
        logs: this.analyzeErrors()
      };
      
      return metrics;
    } catch (e) {
      console.error('軟體監控錯誤:', e.message);
      return null;
    }
  }

  getProcessMetrics() {
    try {
      const ps = execSync('ps aux | grep node | grep -v grep').toString();
      return {
        running: ps.length > 0 ? '✅ 運行中' : '❌ 未運行',
        count: ps.split('\n').filter(x => x).length
      };
    } catch (e) {
      return { running: '❓ 未知', count: 0 };
    }
  }

  detectMemoryLeak() {
    if (this.samples.length < 5) {
      return { detected: false, trend: '↔️ 無法判定' };
    }

    const recentSamples = this.samples.slice(-5);
    const memoryTrend = recentSamples.map(s => s.memory.usedPercent);
    
    // 檢查是否持續上升
    let rising = 0;
    for (let i = 1; i < memoryTrend.length; i++) {
      if (memoryTrend[i] > memoryTrend[i-1]) rising++;
    }

    const detected = rising >= 4; // 持續 4 次上升
    
    return {
      detected: detected,
      trend: detected ? '⚠️ 可能洩漏' : '✅ 正常',
      rate: detected ? '+' + (memoryTrend[4] - memoryTrend[0]).toFixed(1) + '%' : '穩定'
    };
  }

  checkDependencies() {
    try {
      const packagePath = '/root/nanoclaw/package.json';
      const nodeModulesPath = '/root/nanoclaw/node_modules';
      
      const hasPackageJson = fs.existsSync(packagePath);
      const hasNodeModules = fs.existsSync(nodeModulesPath);
      
      const essentials = ['telegraf', 'groq-sdk', 'dotenv', 'lowdb', 'axios'];
      let allPresent = true;
      
      for (const dep of essentials) {
        if (!fs.existsSync(path.join(nodeModulesPath, dep))) {
          allPresent = false;
          break;
        }
      }
      
      return {
        status: allPresent ? '✅ 完整' : '⚠️ 缺少依賴',
        essential: allPresent,
        count: essentials.filter(d => fs.existsSync(path.join(nodeModulesPath, d))).length
      };
    } catch (e) {
      return { status: '❓ 檢查失敗', essential: false, count: 0 };
    }
  }

  analyzeErrors() {
    try {
      // 簡單的錯誤計數（實際應從日誌分析）
      const errors = this.db.get('history').value().filter(h => h.bot && h.bot.includes('Error'));
      const recentErrors = errors.slice(-10).length;
      
      return {
        count: recentErrors,
        status: recentErrors > 5 ? '⚠️ 較多' : '✅ 正常',
        trend: recentErrors > 3 ? '上升趨勢' : '穩定'
      };
    } catch (e) {
      return { count: 0, status: '✅ 正常', trend: '無法判定' };
    }
  }

  // ========== 服務健康檢測（300秒） ==========

  async getServiceHealth() {
    try {
      const health = {
        timestamp: new Date().toISOString(),
        ai_model: this.checkAiModel(),
        database: this.checkDatabase(),
        telegram: this.checkTelegram(),
        score: 0
      };

      // 計算總分（0-100）
      const scores = [
        health.ai_model.score || 0,
        health.database.score || 0,
        health.telegram.score || 0,
        this.metrics ? (100 - this.metrics.memory.usedPercent) : 50
      ];
      
      health.score = Math.round(scores.reduce((a, b) => a + b) / scores.length);

      return health;
    } catch (e) {
      console.error('健康檢測錯誤:', e.message);
      return null;
    }
  }

  checkAiModel() {
    // Groq 連接狀態檢測
    return {
      name: 'Groq API',
      status: process.env.GROQ_API_KEY ? 'active' : 'inactive',
      score: process.env.GROQ_API_KEY ? 80 : 0
    };
  }

  checkDatabase() {
    try {
      const memoryPath = '/root/nanoclaw/config/memory.json';
      const exists = fs.existsSync(memoryPath);
      const data = exists ? JSON.parse(fs.readFileSync(memoryPath, 'utf-8')) : null;
      
      return {
        name: 'Database (lowdb)',
        status: exists && data ? 'active' : 'inactive',
        score: exists && data ? 85 : 0
      };
    } catch (e) {
      return { name: 'Database', status: 'error', score: 0 };
    }
  }

  checkTelegram() {
    return {
      name: 'Telegram Bot',
      status: process.env.TELEGRAM_BOT_TOKEN ? 'active' : 'inactive',
      score: process.env.TELEGRAM_BOT_TOKEN ? 80 : 0
    };
  }

  // ========== 主動告警系統 ==========

  async checkAndAlert() {
    try {
      // 獲取最新指標
      const hw = await this.getHardwareMetrics();
      if (!hw) return;

      const alerts = [];

      // CPU 告警
      if (hw.cpu.load1 > 2) {
        alerts.push({
          level: 'P2',
          title: '⚠️ CPU 負載高',
          message: `負載: ${hw.cpu.load1}`,
          timestamp: Date.now()
        });
      }

      // 內存告警
      if (hw.memory.usedPercent > this.thresholds.memory) {
        alerts.push({
          level: 'P1',
          title: '🔴 內存告警',
          message: `使用率: ${hw.memory.usedPercent}% (超過 ${this.thresholds.memory}%)`,
          timestamp: Date.now()
        });
      }

      // 電池告警
      if (hw.battery.percentage < this.thresholds.battery) {
        alerts.push({
          level: 'P1',
          title: '🔋 電池過低',
          message: `電量: ${hw.battery.percentage}%`,
          timestamp: Date.now()
        });
      }

      // 溫度告警
      if (hw.temperature.value > this.thresholds.temperature) {
        alerts.push({
          level: 'P0',
          title: '🌡️ 過熱告警',
          message: `溫度: ${hw.temperature.value}°C`,
          timestamp: Date.now()
        });
      }

      // 磁盤告警
      if (hw.disk.usedPercent > this.thresholds.disk) {
        alerts.push({
          level: 'P2',
          title: '💿 磁盤告警',
          message: `使用率: ${hw.disk.usedPercent}%`,
          timestamp: Date.now()
        });
      }

      // 網絡告警
      if (!hw.network.connected) {
        alerts.push({
          level: 'P0',
          title: '📡 網絡離線',
          message: '無法連接互聯網',
          timestamp: Date.now()
        });
      }

      // 推送告警
      for (const alert of alerts) {
        await this.sendAlert(alert);
      }

    } catch (e) {
      console.error('告警檢測錯誤:', e.message);
    }
  }

  async sendAlert(alert) {
    // 去重機制：30 秒內相同告警只推送一次
    const key = alert.title;
    const lastTime = this.lastAlerts.get(key);
    
    if (lastTime && Date.now() - lastTime < 30000) {
      return; // 最近 30 秒內已推送過
    }

    this.lastAlerts.set(key, Date.now());

    try {
      await this.bot.telegram.sendMessage(this.myChatId, 
        `${alert.title}\n${alert.message}\n[${alert.level}]`);
    } catch (e) {
      console.error('告警推送失敗:', e.message);
    }
  }

  // ========== 儀表板生成 ==========

  generateDashboard() {
    if (!this.metrics) return '📊 暫無數據';

    const m = this.metrics;
    const health = this.db.get('soul_memory') ? '✅' : '❌';
    const network = m.network.status;

    return `🛡️ **雅典娜監控面板**
━━━━━━━━━━━━━━━━━━
📊 硬體狀態：
  🔹 CPU 負載：${m.cpu.load1}
  🔹 內存：${m.memory.usedPercent}% (${m.memory.used}MB / ${m.memory.total}MB)
  🔹 電池：${m.battery.percentage}% | ${m.battery.health}
  🔹 溫度：${m.temperature.value}°C ${m.temperature.status}
  🔹 磁盤：${m.disk.usedPercent}% ${m.disk.status}
  🔹 網絡：${network}

📋 軟體狀態：
  🔹 進程：${m.processes.running}
  🔹 依賴：${m.dependencies.status}
  🔹 數據庫：${health}

💚 服務評分：${health.score || 0}/100
━━━━━━━━━━━━━━━━━━`;
  }

  // ========== 啟動監控 ==========

  start() {
    console.log('🚀 監控系統已啟動');

    // 60 秒硬體監控
    setInterval(() => this.getHardwareMetrics(), 60000);

    // 120 秒軟體監控
    setInterval(() => this.getSoftwareMetrics(), 120000);

    // 300 秒服務健康檢測
    setInterval(() => this.getServiceHealth(), 300000);

    // 實時告警檢測
    setInterval(() => this.checkAndAlert(), 60000);

    // 首次立即執行
    this.getHardwareMetrics();
    this.getSoftwareMetrics();
    this.getServiceHealth();
  }
}

module.exports = MonitoringSystem;
