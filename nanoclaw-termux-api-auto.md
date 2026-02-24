# NanoClaw Termux:API & 自動修復優化系統
## 「硬體管家」+ 「智能醫生」+ 「功能工廠」

集成 Termux:API 實現硬體控制與軟硬體監控，同時具備自動修復、代碼優化和智能生成功能。核心保護機制確保系統穩定性。

---

## 系統架構與安全邊界

```
NanoClaw 核心層（只讀保護）
├─ src/index.ts（主入口）
├─ src/models/（模型層）
└─ src/mcp/（MCP 協議層）
   ❌ 這些文件不能修改

NanoClaw 功能層（可擴展）
├─ src/skills/（技能層）
├─ src/services/（服務層）
├─ src/memory-personality/（記憶層）
└─ src/coding-skills/（編碼層）
   ✅ 這些文件可以修改/生成

跨層沙箱（Termux:API）
├─ 硬體監控（只讀）
├─ 系統控制（受限）
└─ 自動修復（隔離環境）
```

---

## Part 1：Termux:API 集成

### Step 1：安裝與配置

```bash
# 在 Termux 中執行（Android 端）
pkg install termux-api

# 檢查 Termux:API app 是否安裝
# 去 Google Play 搜索「Termux:API」並安裝

# 重新啟動 Termux
exit

# 重新進入並授予權限
termux-info  # 測試 API
```

### Step 2：創建 Termux API 包裝層

```bash
cd /root/nanoclaw

mkdir -p src/termux-api
nano src/termux-api/termux-integration.ts
```

**複製以下代碼：**

```typescript
import { exec, execSync } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

interface DeviceInfo {
  deviceModel: string;
  androidVersion: string;
  uptime: string;
  cpuUsage: number;
  memoryUsage: {
    total: number;
    available: number;
    usedPercent: number;
  };
  batteryLevel: number;
  batteryHealth: string;
  temperature: number;
}

interface SystemStatus {
  timestamp: number;
  deviceInfo: DeviceInfo;
  sensors: Map<string, number>;
  processes: Array<{
    name: string;
    pid: number;
    memory: number;
    cpu: number;
  }>;
  diskSpace: {
    total: number;
    available: number;
    usedPercent: number;
  };
  networkInfo: {
    ipAddress: string;
    connected: boolean;
    signalStrength: number;
  };
}

class TermuxIntegration {
  private enabled: boolean;
  private lastStatus: SystemStatus | null = null;
  private monitoringInterval: NodeJS.Timer | null = null;

  constructor() {
    this.enabled = this.checkTermuxAPI();
  }

  /**
   * 檢查 Termux:API 是否可用
   */
  private checkTermuxAPI(): boolean {
    try {
      execSync('which termux-battery-stats', { stdio: 'ignore' });
      console.log('✅ Termux:API 已安裝');
      return true;
    } catch {
      console.warn('⚠️ Termux:API 不可用，部分硬體控制功能將被禁用');
      return false;
    }
  }

  /**
   * 獲取設備信息
   */
  async getDeviceInfo(): Promise<DeviceInfo> {
    if (!this.enabled) {
      throw new Error('Termux:API 未啟用');
    }

    try {
      // 獲取電池信息
      const battery = await execPromise('termux-battery-stats');
      const batteryJson = JSON.parse(battery.stdout);

      // 獲取設備信息
      const deviceModel = await this.runTermuxCommand('getprop ro.product.model');
      const androidVersion = await this.runTermuxCommand('getprop ro.build.version.release');

      // CPU 和內存信息
      const cpuUsage = await this.getCPUUsage();
      const memoryUsage = await this.getMemoryUsage();
      const temperature = await this.getDeviceTemperature();

      return {
        deviceModel: deviceModel.trim(),
        androidVersion: androidVersion.trim(),
        uptime: await this.getUptime(),
        cpuUsage,
        memoryUsage,
        batteryLevel: batteryJson.level,
        batteryHealth: batteryJson.health,
        temperature
      };
    } catch (error) {
      throw new Error(`獲取設備信息失敗：${error}`);
    }
  }

  /**
   * 獲取完整系統狀態
   */
  async getSystemStatus(): Promise<SystemStatus> {
    try {
      const deviceInfo = await this.getDeviceInfo();
      const processes = await this.getTopProcesses(5);
      const diskSpace = await this.getDiskSpace();
      const networkInfo = await this.getNetworkInfo();

      const status: SystemStatus = {
        timestamp: Date.now(),
        deviceInfo,
        sensors: new Map(),
        processes,
        diskSpace,
        networkInfo
      };

      this.lastStatus = status;
      return status;
    } catch (error) {
      throw new Error(`獲取系統狀態失敗：${error}`);
    }
  }

  /**
   * 獲取 CPU 使用率
   */
  private async getCPUUsage(): Promise<number> {
    try {
      const result = await execPromise("top -bn1 | head -n3 | tail -n1 | awk '{print $2}'");
      return parseFloat(result.stdout) || 0;
    } catch {
      return 0;
    }
  }

  /**
   * 獲取內存使用情況
   */
  private async getMemoryUsage(): Promise<any> {
    try {
      const result = await execPromise('free -m | tail -n 1');
      const parts = result.stdout.split(/\s+/).filter(p => p);

      return {
        total: parseInt(parts[1]) || 0,
        available: parseInt(parts[6]) || 0,
        usedPercent: 0
      };
    } catch {
      return { total: 0, available: 0, usedPercent: 0 };
    }
  }

  /**
   * 獲取設備溫度
   */
  private async getDeviceTemperature(): Promise<number> {
    try {
      const result = await execPromise('cat /sys/class/thermal/thermal_zone0/temp');
      const temp = parseInt(result.stdout) || 0;
      return temp / 1000; // 轉換為攝氏度
    } catch {
      return 0;
    }
  }

  /**
   * 獲取運行時間
   */
  private async getUptime(): Promise<string> {
    try {
      const result = await execPromise('uptime -p');
      return result.stdout.trim();
    } catch {
      return 'Unknown';
    }
  }

  /**
   * 獲取 Top 進程
   */
  private async getTopProcesses(limit: number): Promise<any[]> {
    try {
      const result = await execPromise(`ps aux | head -n ${limit + 1} | tail -n ${limit}`);
      const lines = result.stdout.trim().split('\n');

      return lines.map(line => {
        const parts = line.split(/\s+/);
        return {
          name: parts[10] || 'unknown',
          pid: parseInt(parts[1]) || 0,
          memory: parseInt(parts[5]) || 0,
          cpu: parseFloat(parts[2]) || 0
        };
      });
    } catch {
      return [];
    }
  }

  /**
   * 獲取磁盤空間
   */
  private async getDiskSpace(): Promise<any> {
    try {
      const result = await execPromise('df -h / | tail -n 1');
      const parts = result.stdout.split(/\s+/).filter(p => p);

      return {
        total: parts[1] || '0',
        available: parts[3] || '0',
        usedPercent: parseInt(parts[4]) || 0
      };
    } catch {
      return { total: '0', available: '0', usedPercent: 0 };
    }
  }

  /**
   * 獲取網路信息
   */
  private async getNetworkInfo(): Promise<any> {
    try {
      const result = await execPromise("ip addr show | grep 'inet ' | awk '{print $2}'");
      const ipAddress = result.stdout.trim().split('\n')[0]?.split('/')[0] || 'Unknown';

      return {
        ipAddress,
        connected: true,
        signalStrength: 100
      };
    } catch {
      return {
        ipAddress: 'Unknown',
        connected: false,
        signalStrength: 0
      };
    }
  }

  /**
   * 執行 Termux 命令
   */
  private async runTermuxCommand(cmd: string): Promise<string> {
    try {
      const result = await execPromise(cmd);
      return result.stdout;
    } catch {
      return '';
    }
  }

  /**
   * 格式化系統狀態報告
   */
  formatSystemReport(): string {
    if (!this.lastStatus) {
      return '❌ 還沒有系統信息';
    }

    const status = this.lastStatus;
    const device = status.deviceInfo;

    let report = `📊 **【系統監控】實時狀態**\n\n`;

    report += `📱 **設備信息：**\n`;
    report += `• 型號：${device.deviceModel}\n`;
    report += `• Android：${device.androidVersion}\n`;
    report += `• 運行時間：${device.uptime}\n\n`;

    report += `⚡ **性能指標：**\n`;
    report += `• CPU 使用率：${device.cpuUsage.toFixed(1)}%\n`;
    report += `• 內存：${device.memoryUsage.available}/${device.memoryUsage.total} MB\n`;
    report += `• 溫度：${device.temperature.toFixed(1)}°C\n\n`;

    report += `🔋 **電池：**\n`;
    report += `• 電量：${device.batteryLevel}%\n`;
    report += `• 狀態：${device.batteryHealth}\n\n`;

    report += `💾 **存儲：**\n`;
    report += `• 磁盤：${status.diskSpace.available} / ${status.diskSpace.total}\n`;
    report += `• 使用率：${status.diskSpace.usedPercent}%\n\n`;

    report += `🌐 **網絡：**\n`;
    report += `• IP：${status.networkInfo.ipAddress}\n`;
    report += `• 連接：${status.networkInfo.connected ? '✅ 已連接' : '❌ 未連接'}\n`;

    return report;
  }

  /**
   * 啟動持續監控
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.monitoringInterval) {
      console.log('⚠️ 監控已在運行');
      return;
    }

    console.log(`🔍 啟動系統監控（每 ${intervalMs / 1000} 秒）`);

    this.monitoringInterval = setInterval(async () => {
      try {
        await this.getSystemStatus();
        this.detectAnomalies();
      } catch (error) {
        console.error('監控失敗:', error);
      }
    }, intervalMs);
  }

  /**
   * 停止監控
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      console.log('⏹️ 已停止監控');
    }
  }

  /**
   * 檢測異常
   */
  private detectAnomalies(): void {
    if (!this.lastStatus) return;

    const status = this.lastStatus;
    const alerts = [];

    // 檢測高溫
    if (status.deviceInfo.temperature > 40) {
      alerts.push(`⚠️ 設備溫度過高：${status.deviceInfo.temperature.toFixed(1)}°C`);
    }

    // 檢測低電量
    if (status.deviceInfo.batteryLevel < 20) {
      alerts.push(`⚠️ 電量不足：${status.deviceInfo.batteryLevel}%`);
    }

    // 檢測高內存占用
    const memPercent = ((status.deviceInfo.memoryUsage.total - status.deviceInfo.memoryUsage.available) / status.deviceInfo.memoryUsage.total) * 100;
    if (memPercent > 90) {
      alerts.push(`⚠️ 內存占用過高：${memPercent.toFixed(1)}%`);
    }

    // 檢測磁盤容量不足
    if (status.diskSpace.usedPercent > 90) {
      alerts.push(`⚠️ 磁盤容量不足：${status.diskSpace.usedPercent}%`);
    }

    if (alerts.length > 0) {
      console.warn('🚨 檢測到異常：');
      alerts.forEach(alert => console.warn(alert));
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

export default new TermuxIntegration();
```

---

## Part 2：自動修復 & 代碼優化系統

### Step 3：創建代碼醫生

```bash
nano src/auto-repair/code-doctor.ts
```

**複製以下代碼：**

```typescript
import * as fs from 'fs-extra';
import * as path from 'path';

interface CodeIssue {
  type: 'syntax' | 'logic' | 'performance' | 'security' | 'style';
  severity: 'critical' | 'high' | 'medium' | 'low';
  line: number;
  message: string;
  suggestion: string;
}

interface CodeAnalysis {
  filePath: string;
  issues: CodeIssue[];
  score: number;
  suggestions: string[];
}

// ⚠️ 核心文件黑名單（絕不能修改）
const PROTECTED_PATTERNS = [
  /^src\/index\.ts$/,
  /^src\/models\//,
  /^src\/mcp\//,
  /package\.json$/,
  /\.env$/,
  /^\.git\//
];

class CodeDoctor {
  private workspaceRoot: string;
  private analysisCache: Map<string, CodeAnalysis> = new Map();

  constructor() {
    this.workspaceRoot = process.env.MCP_WORKSPACE_ROOT || '/root/nanoclaw';
  }

  /**
   * 檢查文件是否受保護
   */
  isFileProtected(filePath: string): boolean {
    const relativePath = path.relative(this.workspaceRoot, filePath);

    for (const pattern of PROTECTED_PATTERNS) {
      if (pattern.test(relativePath)) {
        return true;
      }
    }

    return false;
  }

  /**
   * 分析代碼
   */
  async analyzeCode(filePath: string): Promise<CodeAnalysis> {
    if (this.isFileProtected(filePath)) {
      return {
        filePath,
        issues: [],
        score: 100,
        suggestions: ['✅ 這是核心文件，已受保護']
      };
    }

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const issues = this.detectIssues(content, filePath);

      const analysis: CodeAnalysis = {
        filePath,
        issues,
        score: Math.max(0, 100 - issues.length * 10),
        suggestions: this.generateSuggestions(issues)
      };

      this.analysisCache.set(filePath, analysis);
      return analysis;
    } catch (error) {
      return {
        filePath,
        issues: [],
        score: 0,
        suggestions: ['❌ 無法讀取文件']
      };
    }
  }

  /**
   * 檢測代碼問題
   */
  private detectIssues(content: string, filePath: string): CodeIssue[] {
    const issues: CodeIssue[] = [];
    const lines = content.split('\n');

    // 語法檢查
    issues.push(...this.checkSyntax(lines, filePath));

    // 性能檢查
    issues.push(...this.checkPerformance(lines));

    // 安全檢查
    issues.push(...this.checkSecurity(lines));

    // 代碼風格檢查
    issues.push(...this.checkStyle(lines));

    return issues;
  }

  /**
   * 語法檢查
   */
  private checkSyntax(lines: string[], filePath: string): CodeIssue[] {
    const issues: CodeIssue[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 檢查未關閉的括號
      if ((line.match(/\(/g) || []).length > (line.match(/\)/g) || []).length) {
        issues.push({
          type: 'syntax',
          severity: 'high',
          line: i + 1,
          message: '檢測到未匹配的括號',
          suggestion: '檢查括號是否正確配對'
        });
      }

      // 檢查缺少分號
      if (filePath.endsWith('.ts') && /^\s*[a-zA-Z].*[^;{}\s]$/.test(line) && !line.includes('//')) {
        if (!/if|for|while|function|class|interface|type|const|let|var|import|export|return|async|await/.test(line)) {
          // 可能缺少分號
        }
      }
    }

    return issues;
  }

  /**
   * 性能檢查
   */
  private checkPerformance(lines: string[]): CodeIssue[] {
    const issues: CodeIssue[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 檢查 console.log 在生產環境中
      if (line.includes('console.log') && !line.includes('//')) {
        issues.push({
          type: 'performance',
          severity: 'low',
          line: i + 1,
          message: '檢測到 console.log',
          suggestion: '考慮使用日誌庫替代'
        });
      }

      // 檢查頻繁的循環
      if (/for\s*\(|while\s*\(/.test(line)) {
        if (lines[i + 1]?.includes('for') || lines[i + 1]?.includes('while')) {
          issues.push({
            type: 'performance',
            severity: 'medium',
            line: i + 1,
            message: '檢測到嵌套循環',
            suggestion: '考慮優化嵌套循環的時間複雜度'
          });
        }
      }
    }

    return issues;
  }

  /**
   * 安全檢查
   */
  private checkSecurity(lines: string[]): CodeIssue[] {
    const issues: CodeIssue[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 檢查硬編碼密鑰
      if (/password|secret|apikey|token/.test(line.toLowerCase()) && /=|:/.test(line)) {
        issues.push({
          type: 'security',
          severity: 'critical',
          line: i + 1,
          message: '檢測到可能的硬編碼密鑰',
          suggestion: '將敏感信息移到環境變量中'
        });
      }

      // 檢查 eval
      if (/eval\s*\(/.test(line)) {
        issues.push({
          type: 'security',
          severity: 'critical',
          line: i + 1,
          message: '檢測到 eval()，這是極大的安全風險',
          suggestion: '使用安全的替代方案'
        });
      }
    }

    return issues;
  }

  /**
   * 代碼風格檢查
   */
  private checkStyle(lines: string[]): CodeIssue[] {
    const issues: CodeIssue[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // 檢查過長的行
      if (line.length > 100) {
        issues.push({
          type: 'style',
          severity: 'low',
          line: i + 1,
          message: '代碼行太長',
          suggestion: '將行長度控制在 100 個字符以內'
        });
      }

      // 檢查不一致的縮進
      const indent = line.match(/^\s*/)[0].length;
      if (indent % 2 !== 0 && indent > 0) {
        issues.push({
          type: 'style',
          severity: 'low',
          line: i + 1,
          message: '縮進不一致',
          suggestion: '使用 2 或 4 個空格的一致縮進'
        });
      }
    }

    return issues;
  }

  /**
   * 生成優化建議
   */
  private generateSuggestions(issues: CodeIssue[]): string[] {
    const suggestions: string[] = [];

    const critical = issues.filter(i => i.severity === 'critical');
    const high = issues.filter(i => i.severity === 'high');

    if (critical.length > 0) {
      suggestions.push(`🔴 發現 ${critical.length} 個嚴重問題，需要立即修復`);
    }

    if (high.length > 0) {
      suggestions.push(`🟠 發現 ${high.length} 個高優先級問題`);
    }

    if (issues.length === 0) {
      suggestions.push('✅ 代碼質量優秀，沒有發現問題');
    }

    return suggestions;
  }

  /**
   * 自動修復（僅非核心文件）
   */
  async autoFix(filePath: string): Promise<string> {
    if (this.isFileProtected(filePath)) {
      return '❌ 無法修改受保護的文件';
    }

    try {
      let content = await fs.readFile(filePath, 'utf-8');

      // 修復 1: 刪除不必要的 console.log
      content = content.replace(/^\s*console\.log\([^)]*\);\n/gm, '');

      // 修復 2: 修復縮進不一致
      content = content.replace(/^\s+/gm, (match) => {
        const spaces = match.length;
        if (spaces % 2 !== 0) {
          return ' '.repeat(Math.round(spaces / 2) * 2);
        }
        return match;
      });

      // 修復 3: 添加缺失的分號
      content = content.replace(/([^;{}\s])\n/g, '$1;\n');

      await fs.writeFile(filePath, content);
      return `✅ 已自動修復 ${filePath}`;
    } catch (error) {
      return `❌ 修復失敗：${error instanceof Error ? error.message : ''}`;
    }
  }

  /**
   * 生成報告
   */
  generateReport(analyses: CodeAnalysis[]): string {
    let report = `📋 **【代碼分析報告】**\n\n`;

    const avgScore = analyses.reduce((sum, a) => sum + a.score, 0) / analyses.length;
    report += `📊 **平均評分：${avgScore.toFixed(1)}/100**\n\n`;

    report += `📂 **掃描的文件：**\n`;
    for (const analysis of analyses) {
      const scoreEmoji = analysis.score >= 80 ? '✅' : analysis.score >= 60 ? '⚠️' : '❌';
      report += `${scoreEmoji} ${path.basename(analysis.filePath)} (${analysis.score}/100)\n`;

      if (analysis.issues.length > 0) {
        for (const issue of analysis.issues.slice(0, 3)) {
          report += `   • [${issue.type}] ${issue.message}\n`;
        }
        if (analysis.issues.length > 3) {
          report += `   ... 還有 ${analysis.issues.length - 3} 個問題\n`;
        }
      }
    }

    return report;
  }
}

export default new CodeDoctor();
```

---

## Part 3：功能自動生成系統

### Step 4：創建功能工廠

```bash
nano src/auto-generation/feature-factory.ts
```

**複製以下代碼：**

```typescript
interface FeatureRequest {
  name: string;
  description: string;
  type: 'skill' | 'service' | 'command';
  requirements: string[];
  complexity: 'simple' | 'medium' | 'complex';
}

interface GeneratedCode {
  fileName: string;
  fileType: string;
  content: string;
  imports: string[];
  exports: string[];
  testCases: string[];
}

class FeatureFactory {
  private generatedFeatures: Map<string, GeneratedCode> = new Map();

  /**
   * 根據需求生成代碼框架
   */
  async generateFeature(request: FeatureRequest): Promise<GeneratedCode> {
    console.log(`🏭 正在生成功能：${request.name}`);

    let content = '';
    const imports: string[] = [];
    const exports: string[] = [];

    switch (request.type) {
      case 'skill':
        content = this.generateSkillTemplate(request, imports, exports);
        break;
      case 'service':
        content = this.generateServiceTemplate(request, imports, exports);
        break;
      case 'command':
        content = this.generateCommandTemplate(request, imports, exports);
        break;
    }

    const generated: GeneratedCode = {
      fileName: this.camelToSnake(request.name),
      fileType: 'ts',
      content,
      imports,
      exports,
      testCases: this.generateTestCases(request)
    };

    this.generatedFeatures.set(request.name, generated);

    return generated;
  }

  /**
   * 生成 Skill 模板
   */
  private generateSkillTemplate(
    request: FeatureRequest,
    imports: string[],
    exports: string[]
  ): string {
    imports.push("import axios from 'axios';");

    let template = `/**\n`;
    template += ` * ${request.name}\n`;
    template += ` * ${request.description}\n`;
    template += ` */\n\n`;

    template += `interface ${this.pascalCase(request.name)}Options {\n`;
    for (const req of request.requirements) {
      template += `  ${this.camelCase(req)}: string | number;\n`;
    }
    template += `}\n\n`;

    template += `class ${this.pascalCase(request.name)} {\n`;
    template += `  private enabled: boolean = true;\n\n`;

    template += `  async execute(options: ${this.pascalCase(request.name)}Options): Promise<string> {\n`;
    template += `    try {\n`;
    template += `      // TODO: 實現核心邏輯\n`;
    template += `      return '✅ ${request.name} 執行成功';\n`;
    template += `    } catch (error) {\n`;
    template += `      return \`❌ 執行失敗：\${error instanceof Error ? error.message : ''}\`;\n`;
    template += `    }\n`;
    template += `  }\n`;
    template += `}\n\n`;

    template += `export default new ${this.pascalCase(request.name)}();\n`;
    exports.push(this.pascalCase(request.name));

    return template;
  }

  /**
   * 生成 Service 模板
   */
  private generateServiceTemplate(
    request: FeatureRequest,
    imports: string[],
    exports: string[]
  ): string {
    imports.push('import Database from "better-sqlite3";');

    let template = `/**\n`;
    template += ` * ${request.name} Service\n`;
    template += ` * ${request.description}\n`;
    template += ` */\n\n`;

    template += `interface ${this.pascalCase(request.name)}Data {\n`;
    template += `  id: string;\n`;
    for (const req of request.requirements) {
      template += `  ${this.camelCase(req)}: any;\n`;
    }
    template += `  createdAt: number;\n`;
    template += `}\n\n`;

    template += `class ${this.pascalCase(request.name)}Service {\n`;
    template += `  private db: Database.Database | null = null;\n\n`;

    template += `  constructor() {\n`;
    template += `    this.initializeDB();\n`;
    template += `  }\n\n`;

    template += `  private initializeDB(): void {\n`;
    template += `    // TODO: 初始化數據庫\n`;
    template += `  }\n\n`;

    template += `  async create(data: ${this.pascalCase(request.name)}Data): Promise<string> {\n`;
    template += `    // TODO: 實現創建邏輯\n`;
    template += `    return '✅ 已創建';\n`;
    template += `  }\n\n`;

    template += `  async read(id: string): Promise<${this.pascalCase(request.name)}Data | null> {\n`;
    template += `    // TODO: 實現讀取邏輯\n`;
    template += `    return null;\n`;
    template += `  }\n\n`;

    template += `  async update(id: string, data: Partial<${this.pascalCase(request.name)}Data>): Promise<string> {\n`;
    template += `    // TODO: 實現更新邏輯\n`;
    template += `    return '✅ 已更新';\n`;
    template += `  }\n\n`;

    template += `  async delete(id: string): Promise<string> {\n`;
    template += `    // TODO: 實現刪除邏輯\n`;
    template += `    return '✅ 已刪除';\n`;
    template += `  }\n`;
    template += `}\n\n`;

    template += `export default new ${this.pascalCase(request.name)}Service();\n`;
    exports.push(`${this.pascalCase(request.name)}Service`);

    return template;
  }

  /**
   * 生成命令模板
   */
  private generateCommandTemplate(
    request: FeatureRequest,
    imports: string[],
    exports: string[]
  ): string {
    let template = `/**\n`;
    template += ` * 命令：/${this.camelCase(request.name)}\n`;
    template += ` * ${request.description}\n`;
    template += ` */\n\n`;

    template += `tgBot.onText(/\\/${this.camelCase(request.name)} (.*)/, async (msg, match) => {\n`;
    template += `  const chatId = msg.chat.id;\n`;
    template += `  const args = match[1].split(' ');\n\n`;

    template += `  try {\n`;
    template += `    // TODO: 實現命令邏輯\n`;
    template += `    const result = '✅ ${request.name} 命令執行成功';\n`;
    template += `    await tgBot.sendMessage(chatId, result);\n`;
    template += `  } catch (error) {\n`;
    template += `    await tgBot.sendMessage(chatId, \`❌ 執行失敗\`);\n`;
    template += `  }\n`;
    template += `});\n`;

    exports.push(`${this.camelCase(request.name)}_command`);

    return template;
  }

  /**
   * 生成測試用例
   */
  private generateTestCases(request: FeatureRequest): string[] {
    const testCases: string[] = [];

    testCases.push(`describe('${request.name}', () => {`);
    testCases.push(`  it('should execute successfully', () => {`);
    testCases.push(`    // TODO: 編寫測試`);
    testCases.push(`  });`);
    testCases.push(`});`);

    return testCases;
  }

  /**
   * 保存生成的代碼
   */
  async saveGeneratedCode(filename: string, code: GeneratedCode): Promise<string> {
    try {
      const filePath = `/root/nanoclaw/src/generated/${filename}.${code.fileType}`;
      
      // 檢查目錄是否存在
      const dir = require('path').dirname(filePath);
      await require('fs-extra').ensureDir(dir);

      // 添加導入語句
      let content = '';
      for (const imp of code.imports) {
        content += `${imp}\n`;
      }
      content += '\n' + code.content;

      await require('fs-extra').writeFile(filePath, content);

      return `✅ 代碼已生成：${filePath}`;
    } catch (error) {
      return `❌ 生成失敗：${error instanceof Error ? error.message : ''}`;
    }
  }

  /**
   * 命名轉換工具
   */
  private camelCase(str: string): string {
    return str.replace(/[-_]([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private pascalCase(str: string): string {
    const camel = this.camelCase(str);
    return camel.charAt(0).toUpperCase() + camel.slice(1);
  }

  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * 生成功能報告
   */
  generateReport(): string {
    let report = `🏭 **【自動生成功能報告】**\n\n`;
    report += `已生成的功能：${this.generatedFeatures.size} 個\n\n`;

    for (const [name, code] of this.generatedFeatures) {
      report += `📄 ${name}\n`;
      report += `   文件：${code.fileName}.${code.fileType}\n`;
      report += `   導出：${code.exports.join(', ')}\n`;
      report += `   測試用例：${code.testCases.length} 個\n\n`;
    }

    return report;
  }
}

export default new FeatureFactory();
```

---

## Part 4：整合到主應用

### Step 5：更新 src/index.ts

```bash
nano src/index.ts
```

**添加 Termux API & 自動修復命令：**

```typescript
import TelegramBot from 'node-telegram-bot-api';
import termuxAPI from './termux-api/termux-integration';
import codeDoctor from './auto-repair/code-doctor';
import featureFactory from './auto-generation/feature-factory';

const tgBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// ========== Termux:API 監控命令 ==========

tgBot.onText(/\/system_status/, async (msg) => {
  const chatId = msg.chat.id;
  try {
    const report = termuxAPI.formatSystemReport();
    await tgBot.sendMessage(chatId, report);
  } catch (error) {
    await tgBot.sendMessage(chatId, `❌ 獲取系統狀態失敗：${error}`);
  }
});

tgBot.onText(/\/monitor_start/, async (msg) => {
  const chatId = msg.chat.id;
  termuxAPI.startMonitoring(60000);
  await tgBot.sendMessage(chatId, `✅ 已啟動系統監控（每 60 秒更新一次）`);
});

tgBot.onText(/\/monitor_stop/, async (msg) => {
  const chatId = msg.chat.id;
  termuxAPI.stopMonitoring();
  await tgBot.sendMessage(chatId, `⏹️ 已停止系統監控`);
});

// ========== 代碼分析與修復 ==========

tgBot.onText(/\/analyze_code (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const filePath = match[1];

  try {
    const analysis = await codeDoctor.analyzeCode(filePath);
    let report = `📊 **代碼分析：${analysis.filePath}**\n\n`;
    report += `📈 評分：${analysis.score}/100\n\n`;

    if (analysis.issues.length === 0) {
      report += `✅ 沒有檢測到問題`;
    } else {
      report += `🔍 **檢測到 ${analysis.issues.length} 個問題：**\n`;
      for (const issue of analysis.issues.slice(0, 5)) {
        report += `• [${issue.type}] ${issue.message}（第 ${issue.line} 行）\n`;
      }
    }

    await tgBot.sendMessage(chatId, report);
  } catch (error) {
    await tgBot.sendMessage(chatId, `❌ 分析失敗：${error}`);
  }
});

tgBot.onText(/\/fix_code (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const filePath = match[1];

  try {
    const result = await codeDoctor.autoFix(filePath);
    await tgBot.sendMessage(chatId, result);
  } catch (error) {
    await tgBot.sendMessage(chatId, `❌ 修復失敗：${error}`);
  }
});

// ========== 功能自動生成 ==========

tgBot.onText(/\/generate_feature ([^ ]+) (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const [name, description] = [match[1], match[2]];

  try {
    const request = {
      name,
      description,
      type: 'skill' as const,
      requirements: ['input', 'output'],
      complexity: 'simple' as const
    };

    const code = await featureFactory.generateFeature(request);
    const result = await featureFactory.saveGeneratedCode(name, code);
    await tgBot.sendMessage(chatId, result);
  } catch (error) {
    await tgBot.sendMessage(chatId, `❌ 生成失敗：${error}`);
  }
});

tgBot.onText(/\/generated_list/, async (msg) => {
  const chatId = msg.chat.id;
  const report = featureFactory.generateReport();
  await tgBot.sendMessage(chatId, report);
});

console.log('🚀 NanoClaw Termux:API & 自動修復系統已啟動');
```

---

## 完整命令列表

```
========== 硬體監控（Termux:API）==========
/system_status             - 查看實時系統狀態
/monitor_start             - 啟動持續監控（每 60 秒）
/monitor_stop              - 停止系統監控

========== 代碼分析與修復 ==========
/analyze_code [文件路徑]   - 分析代碼質量
/fix_code [文件路徑]       - 自動修復（非核心文件）

========== 功能自動生成 ==========
/generate_feature [名稱] [描述]  - 自動生成新功能框架
/generated_list                  - 查看所有生成的功能
```

---

## 安全保護機制

```
🛡️ 核心保護（黑名單）
├─ src/index.ts         ❌ 不可修改
├─ src/models/*         ❌ 不可修改
├─ src/mcp/*            ❌ 不可修改
├─ package.json         ❌ 不可修改
└─ .env                 ❌ 不可修改

✅ 安全區域（可修改）
├─ src/skills/*         ✅ 可修改/生成
├─ src/services/*       ✅ 可修改/生成
├─ src/generated/*      ✅ 生成的代碼
└─ src/termux-api/*     ✅ 新功能模塊
```

---

## 完整檢查清單

- [ ] Termux:API 應用已安裝
- [ ] Termux 基本命令（top、ps、df）可用
- [ ] src/termux-api/termux-integration.ts 已創建
- [ ] src/auto-repair/code-doctor.ts 已創建
- [ ] src/auto-generation/feature-factory.ts 已創建
- [ ] src/index.ts 已更新命令
- [ ] npm start 成功運行
- [ ] /system_status 命令可正常執行
- [ ] /analyze_code 可掃描文件
- [ ] /generate_feature 可生成新功能
- [ ] 核心文件已正確保護（無法修改）

---

**NanoClaw 現在是「自我修復、自我進化的 AI 系統」！** 🤖⚡

```
✨ 硬體監控：實時掌握系統狀況
✨ 自動診斷：主動檢測代碼問題
✨ 自動修復：不動核心，安全優化
✨ 功能生成：遇到不會的自動創建
✨ 安全護航：永不觸及系統要害
```
