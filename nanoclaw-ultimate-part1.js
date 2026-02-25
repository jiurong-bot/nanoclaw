require('dotenv').config();
const { Telegraf } = require('telegraf');
const Groq = require('groq-sdk');
const https = require('https');
const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const axios = require('axios');

const startTime = Date.now();
const ROOT_DIR = '/root/nanoclaw';
const STORAGE_PATH = path.join(ROOT_DIR, 'config', 'memory.json');
const MY_CHAT_ID = "8508766428";
const VERSION = "V82.0-ULTIMATE";

if (!fs.existsSync(path.dirname(STORAGE_PATH))) {
  fs.mkdirSync(path.dirname(STORAGE_PATH), { recursive: true });
}

const adapter = new FileSync(STORAGE_PATH);
const db = low(adapter);
db.defaults({
  history: [],
  soul_memory: [],
  config: { model: "llama-3.3-70b-versatile" },
  alerts: [],
  monitoring_history: [],
  token_usage: [],
  personality: { 
    big5: { openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, neuroticism: 50 },
    speaking_style: 'balanced',
    learned_responses: {}
  },
  mcp_models: []
}).write();

const agent = new https.Agent({
  keepAlive: true,
  family: 4,
  timeout: 30000,
  rejectUnauthorized: false
});

const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN, {
  telegram: { agent }
});

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY
});

// ===== 監控系統 =====
class CompleteMonitoringSystem {
  constructor() {
    this.metrics = null;
    this.samples = [];
    this.alerts = new Map();
    this.processes = new Map();
    this.thresholds = {
      cpuUsage: 85,
      cpuTemp: 45,
      memoryUsage: 90,
      batteryLow: 20,
      batteryTemp: 50,
      diskUsage: 85,
      systemTemp: 60
    };
  }

  async getHardwareMetrics() {
    const metrics = {
      timestamp: Date.now(),
      cpu: {},
      memory: {},
      battery: {},
      storage: {},
      thermal: {},
      network: {}
    };

    try {
      const load = os.loadavg();
      metrics.cpu = {
        usage: parseFloat((load[0] * 100 / os.cpus().length).toFixed(2)),
        load1: load[0].toFixed(2),
        load5: load[1].toFixed(2),
        load15: load[2].toFixed(2),
        cores: os.cpus().length,
        temperature: await this.getCPUTemperature()
      };
    } catch (e) {
      metrics.cpu = { usage: 0, load1: 0, load5: 0, load15: 0, cores: 1, temperature: 0 };
    }

    try {
      const total = os.totalmem();
      const free = os.freemem();
      const used = total - free;
      metrics.memory = {
        total: Math.round(total / 1024 / 1024),
        free: Math.round(free / 1024 / 1024),
        used: Math.round(used / 1024 / 1024),
        usedPercent: Math.round((used / total) * 100)
      };
    } catch (e) {
      metrics.memory = { total: 0, free: 0, used: 0, usedPercent: 0 };
    }

    try {
      const b = JSON.parse(execSync('termux-battery-status').toString().trim());
      metrics.battery = {
        level: b.percentage || 0,
        health: b.health || 'unknown',
        temperature: Math.round(parseFloat(b.temperature)) || 0,
        status: b.status || 'unknown'
      };
    } catch (e) {
      metrics.battery = { level: 0, health: 'unknown', temperature: 0, status: 'unknown' };
    }

    try {
      const output = execSync("df -h / | tail -1 | awk '{print $2,$3,$5}'").toString().trim();
      const parts = output.split(/\s+/);
      const usedPercent = parseInt(parts[2]) || 0;
      metrics.storage = {
        total: parts[0],
        usedPercent: usedPercent,
        status: usedPercent > 95 ? 'critical' : usedPercent > 80 ? 'warning' : 'ok'
      };
    } catch (e) {
      metrics.storage = { total: '?', usedPercent: 0, status: 'unknown' };
    }

    metrics.thermal = {
      cpuTemp: metrics.cpu.temperature,
      batteryTemp: metrics.battery.temperature,
      systemTemp: Math.max(metrics.cpu.temperature, metrics.battery.temperature),
      overheating: metrics.cpu.temperature > this.thresholds.cpuTemp
    };

    try {
      execSync('ping -c 1 -W 2 8.8.8.8 >/dev/null 2>&1');
      metrics.network = { connected: true, status: '🟢' };
    } catch (e) {
      metrics.network = { connected: false, status: '🔴' };
    }

    this.metrics = metrics;
    this.samples.push(metrics);
    if (this.samples.length > 144) this.samples.shift();

    return metrics;
  }

  async getCPUTemperature() {
    try {
      const paths = [
        '/sys/class/thermal/thermal_zone0/temp',
        '/sys/devices/virtual/thermal/thermal_zone0/temp'
      ];
      for (const p of paths) {
        try {
          const temp = parseInt(execSync(`cat ${p}`).toString()) / 1000;
          return Math.round(temp);
        } catch (e) {}
      }
    } catch (e) {}
    return 0;
  }

  async getProcessMetrics() {
    try {
      const output = execSync('ps aux | grep -E "node|npm" | grep -v grep').toString();
      const processes = output.split('\n').filter(line => line.trim());
      const metrics = new Map();
      for (const line of processes) {
        const parts = line.split(/\s+/);
        if (parts.length >= 11) {
          const pid = parts[1];
          const cpu = parseFloat(parts[2]) || 0;
          const mem = parseFloat(parts[3]) || 0;
          const cmd = parts.slice(10).join(' ');
          metrics.set(pid, { cpu, mem, cmd, pid });
          this.processes.set(pid, { cpu, mem, cmd, pid, timestamp: Date.now() });
        }
      }
      return metrics;
    } catch (e) {
      return new Map();
    }
  }

  async detectAnomalies() {
    const alerts = [];
    if (!this.metrics) await this.getHardwareMetrics();
    const m = this.metrics;

    if (m.cpu.usage > this.thresholds.cpuUsage) {
      alerts.push({
        id: `cpu_${Date.now()}`,
        severity: m.cpu.usage > 95 ? 'critical' : 'high',
        type: 'CPU使用率',
        value: m.cpu.usage.toFixed(1) + '%',
        threshold: this.thresholds.cpuUsage + '%',
        message: `⚠️ CPU 超高：${m.cpu.usage.toFixed(1)}%`,
        timestamp: Date.now()
      });
    }

    if (m.thermal.cpuTemp > this.thresholds.cpuTemp) {
      alerts.push({
        id: `temp_${Date.now()}`,
        severity: m.thermal.cpuTemp > 50 ? 'critical' : 'high',
        type: 'CPU溫度',
        value: m.thermal.cpuTemp + '°C',
        threshold: this.thresholds.cpuTemp + '°C',
        message: `🌡️ 溫度過高：${m.thermal.cpuTemp}°C`,
        timestamp: Date.now()
      });
    }

    if (m.memory.usedPercent > this.thresholds.memoryUsage) {
      alerts.push({
        id: `mem_${Date.now()}`,
        severity: m.memory.usedPercent > 95 ? 'critical' : 'high',
        type: '內存使用率',
        value: m.memory.usedPercent + '%',
        threshold: this.thresholds.memoryUsage + '%',
        message: `📊 內存超高：${m.memory.usedPercent}%`,
        timestamp: Date.now()
      });

      if (this.samples.length >= 5) {
        const recentSamples = this.samples.slice(-5);
        const trend = recentSamples.map(s => s.memory.usedPercent);
        const rising = trend.filter((v, i) => i === 0 || v >= trend[i-1]).length;
        if (rising >= 4) {
          alerts.push({
            id: `memleak_${Date.now()}`,
            severity: 'high',
            type: '內存洩漏',
            message: `⚠️ 內存洩漏跡象（最近 5 次採集都在上升）`,
            timestamp: Date.now()
          });
        }
      }
    }

    if (m.battery.level < this.thresholds.batteryLow) {
      alerts.push({
        id: `battery_${Date.now()}`,
        severity: 'high',
        type: '電池電量',
        value: m.battery.level + '%',
        message: `🔋 電池不足：${m.battery.level}%`,
        timestamp: Date.now()
      });
    }

    if (m.storage.usedPercent > this.thresholds.diskUsage) {
      alerts.push({
        id: `disk_${Date.now()}`,
        severity: m.storage.usedPercent > 95 ? 'critical' : 'high',
        type: '磁盤容量',
        value: m.storage.usedPercent + '%',
        message: `💾 磁盤滿：${m.storage.usedPercent}%`,
        timestamp: Date.now()
      });
    }

    if (!m.network.connected) {
      alerts.push({
        id: `net_${Date.now()}`,
        severity: 'critical',
        type: '網絡連接',
        message: `📡 網絡離線`,
        timestamp: Date.now()
      });
    }

    for (const alert of alerts) {
      this.alerts.set(alert.id, alert);
    }

    const alertHistory = db.get('alerts').value() || [];
    alertHistory.push(...alerts);
    db.set('alerts', alertHistory.slice(-1000)).write();

    return alerts;
  }

  calculateHealthScore() {
    if (!this.metrics) return 50;
    let score = 100;
    const m = this.metrics;

    if (m.memory.usedPercent > 80) score -= 20;
    if (m.memory.usedPercent > 95) score -= 10;
    if (m.battery.level < 20) score -= 15;
    if (m.thermal.cpuTemp > 55) score -= 10;
    if (m.thermal.cpuTemp > 60) score -= 10;
    if (!m.network.connected) score -= 25;
    if (m.storage.usedPercent > 90) score -= 10;

    const alerts = Array.from(this.alerts.values());
    const criticals = alerts.filter(a => a.severity === 'critical').length;
    const highs = alerts.filter(a => a.severity === 'high').length;
    score -= criticals * 5 + highs * 2;

    return Math.max(0, Math.min(100, score));
  }

  generateFullDashboard() {
    if (!this.metrics) {
      return '📊 正在採集數據...';
    }

    const m = this.metrics;
    const score = this.calculateHealthScore();
    const scoreBar = '█'.repeat(Math.round(score / 5)) + '░'.repeat(20 - Math.round(score / 5));

    let dashboard = `🛡️ **雅典娜完整監控面板 ${VERSION}**\n`;
    dashboard += `━━━━━━━━━━━━━━━━━━━━━━━━━\n\n`;

    dashboard += `💻 **硬體狀態**\n`;
    dashboard += `  CPU: ${m.cpu.load1} | 內存: ${m.memory.usedPercent}% | 電池: ${m.battery.level}%\n`;
    dashboard += `  溫度: ${m.thermal.cpuTemp}°C | 磁盤: ${m.storage.usedPercent}% | 網絡: ${m.network.status}\n\n`;

    dashboard += `📊 **詳細指標**\n`;
    dashboard += `  🔷 CPU: 核心 ${m.cpu.cores} | 使用率 ${m.cpu.usage.toFixed(1)}% | 溫度 ${m.thermal.cpuTemp}°C\n`;
    dashboard += `  🔷 內存: ${m.memory.used}MB / ${m.memory.total}MB (${m.memory.usedPercent}%)\n`;
    dashboard += `  🔷 電池: ${m.battery.level}% | 狀態 ${m.battery.status} | 溫度 ${m.battery.temperature}°C\n`;
    dashboard += `  🔷 存儲: ${m.storage.total} (${m.storage.usedPercent}%)\n\n`;

    dashboard += `💚 **整體評分：${score}/100**\n`;
    dashboard += `  ${scoreBar}\n\n`;

    const alerts = Array.from(this.alerts.values());
    if (alerts.length > 0) {
      const criticals = alerts.filter(a => a.severity === 'critical');
      const highs = alerts.filter(a => a.severity === 'high');
      dashboard += `🚨 **告警摘要**\n`;
      if (criticals.length > 0) {
        dashboard += `  🔴 緊急 (${criticals.length}): ${criticals.map(a => a.message).join(' | ')}\n`;
      }
      if (highs.length > 0) {
        dashboard += `  🟠 高級 (${highs.length}): ${highs.slice(0, 2).map(a => a.message).join(' | ')}\n`;
      }
    } else {
      dashboard += `✅ **沒有告警**\n`;
    }

    dashboard += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    dashboard += `⏰ ${new Date(m.timestamp).toLocaleTimeString('zh-TW')}\n`;

    return dashboard;
  }

  async start() {
    console.log('🔍 完整監控系統已啟動');
    await this.getHardwareMetrics();
    await this.detectAnomalies();
    setInterval(() => this.getHardwareMetrics(), 60000);
    setInterval(() => this.detectAnomalies(), 60000);
    setInterval(() => this.getProcessMetrics(), 120000);
  }
}

const monitor = new CompleteMonitoringSystem();
