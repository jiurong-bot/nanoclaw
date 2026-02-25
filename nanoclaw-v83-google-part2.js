// ===== Token 監控系統 =====
class TokenMonitor {
  constructor() {
    this.usage = [];
    this.costs = {
      groq: 0.05,
      openai: 0.15,
      anthropic: 0.20
    };
    this.limits = {
      daily: 10.0,
      monthly: 200.0
    };
    this.currentDaily = 0;
    this.currentMonthly = 0;
  }

  recordUsage(model, inputTokens, outputTokens) {
    const totalTokens = inputTokens + outputTokens;
    const costPerToken = this.costs['groq'] || 0.0001;
    const cost = (totalTokens * costPerToken) / 1000000;

    const record = {
      timestamp: Date.now(),
      model,
      inputTokens,
      outputTokens,
      totalTokens,
      cost: parseFloat(cost.toFixed(6))
    };

    this.usage.push(record);
    this.currentDaily += cost;
    this.currentMonthly += cost;

    const tokenHistory = db.get('token_usage').value() || [];
    tokenHistory.push(record);
    db.set('token_usage', tokenHistory.slice(-10000)).write();

    return record;
  }

  getStats() {
    const today = new Date().toDateString();
    const thisMonth = new Date().getMonth();

    const todayUsage = this.usage.filter(u => new Date(u.timestamp).toDateString() === today);
    const monthUsage = this.usage.filter(u => new Date(u.timestamp).getMonth() === thisMonth);

    const totalToday = todayUsage.reduce((sum, u) => sum + u.cost, 0);
    const totalMonth = monthUsage.reduce((sum, u) => sum + u.cost, 0);

    return {
      today: parseFloat(totalToday.toFixed(4)),
      month: parseFloat(totalMonth.toFixed(4)),
      dailyLimit: this.limits.daily,
      monthlyLimit: this.limits.monthly,
      requestCount: this.usage.length,
      avgTokens: this.usage.length > 0 ? Math.round(this.usage.reduce((sum, u) => sum + u.totalTokens, 0) / this.usage.length) : 0
    };
  }

  checkLimits() {
    const stats = this.getStats();
    const alerts = [];

    if (stats.today > stats.dailyLimit * 0.8) {
      alerts.push(`⚠️ 日額度已用 ${(stats.today / stats.dailyLimit * 100).toFixed(1)}%`);
    }
    if (stats.month > stats.monthlyLimit * 0.8) {
      alerts.push(`⚠️ 月額度已用 ${(stats.month / stats.monthlyLimit * 100).toFixed(1)}%`);
    }

    return alerts;
  }

  generateReport() {
    const stats = this.getStats();
    return `💰 **Token 監控報告**
━━━━━━━━━━━━━━━
📊 今日成本：$${stats.today} / $${stats.dailyLimit}
📊 本月成本：$${stats.month} / $${stats.monthlyLimit}
📊 請求數：${stats.requestCount}
📊 平均 Token：${stats.avgTokens}
━━━━━━━━━━━━━━━`;
  }
}

const tokenMonitor = new TokenMonitor();

// ===== 靈魂系統 + Big 5 人格進化 =====
class PersonalitySystem {
  constructor() {
    this.personality = db.get('personality').value() || {
      big5: { openness: 50, conscientiousness: 50, extraversion: 50, agreeableness: 50, neuroticism: 50 },
      speaking_style: 'balanced',
      learned_responses: {}
    };
  }

  analyzeTone(userMessage) {
    const positive = ['好', '太棒', '感謝', '喜歡', '愛', '✨', '❤️'].some(w => userMessage.includes(w));
    const negative = ['不', '討厭', '生氣', '難過', '😢', '😤'].some(w => userMessage.includes(w));
    const casual = ['嘿', '欸', '啦', '啦', 'lol', '哈'].some(w => userMessage.includes(w));

    return { positive, negative, casual };
  }

  updatePersonality(userMessage, botResponse) {
    const tone = this.analyzeTone(userMessage);

    if (tone.positive) {
      this.personality.big5.agreeableness = Math.min(100, this.personality.big5.agreeableness + 2);
      this.personality.big5.extraversion = Math.min(100, this.personality.big5.extraversion + 1);
    }

    if (tone.casual) {
      this.personality.speaking_style = 'casual';
      this.personality.big5.extraversion = Math.min(100, this.personality.big5.extraversion + 1);
    }

    const key = userMessage.substring(0, 30);
    this.personality.learned_responses[key] = botResponse;

    db.set('personality', this.personality).write();
  }

  getSystemPrompt() {
    const p = this.personality.big5;
    const style = p.extraversion > 60 ? '活潑熱情' : p.extraversion < 40 ? '冷靜內省' : '平衡友善';

    return `你是雅典娜，AI 助手。
根據用户互動，你逐漸發展人格：
- 開放性：${p.openness} (喜歡探索新想法)
- 盡責性：${p.conscientiousness} (做事認真程度)
- 外向性：${p.extraversion} (社交活躍度) - 當前風格: ${style}
- 親和性：${p.agreeableness} (友善程度)
- 神經質：${Math.max(0, 100 - p.neuroticism)} (穩定程度)

用這個人格調整你的回應方式。`;
  }

  generatePersonalityReport() {
    const p = this.personality.big5;
    return `🧠 **人格進化報告**
━━━━━━━━━━━━━━━
🔷 開放性: ${p.openness}% (探索新想法)
🔷 盡責性: ${p.conscientiousness}% (認真程度)
🔷 外向性: ${p.extraversion}% (社交活躍度)
🔷 親和性: ${p.agreeableness}% (友善程度)
🔷 穩定性: ${100 - p.neuroticism}% (情緒穩定)
🔷 說話風格: ${this.personality.speaking_style}
🔷 學習回應數: ${Object.keys(this.personality.learned_responses).length}
━━━━━━━━━━━━━━━`;
  }
}

const personality = new PersonalitySystem();

// ===== MCP 集成系統 =====
class MCPSystem {
  constructor() {
    this.models = [
      { name: 'groq', model: 'llama-3.3-70b-versatile', status: '✅', latency: 1200 },
      { name: 'local', model: 'ollama:mistral', status: '⚠️', latency: 3000 }
    ];
    this.activeModel = 'groq';
  }

  listModels() {
    let list = `🤖 **可用模型**\n━━━━━━━━━━━━━━━\n`;
    this.models.forEach(m => {
      const active = m.name === this.activeModel ? '★' : ' ';
      list += `${active} ${m.status} ${m.name}: ${m.model} (${m.latency}ms)\n`;
    });
    list += `━━━━━━━━━━━━━━━`;
    return list;
  }

  switchModel(modelName) {
    const model = this.models.find(m => m.name === modelName);
    if (model) {
      this.activeModel = modelName;
      return `✅ 已切換到 ${modelName}`;
    }
    return `❌ 模型不存在`;
  }

  getModelInfo() {
    const active = this.models.find(m => m.name === this.activeModel);
    return `📍 當前模型: ${active.name}\n🔹 ${active.model}\n🔹 延遲: ${active.latency}ms\n🔹 狀態: ${active.status}`;
  }
}

const mcp = new MCPSystem();

// ===== 摸魚技能 =====
const SlackerSkills = {
  flashRead: async (text) => {
    const prompt = `請幫我摘要以下內容，僅輸出 3 個精簡重點：\n${text}`;
    const res = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 300
    });
    
    const usage = res.usage || { prompt_tokens: 0, completion_tokens: 0 };
    tokenMonitor.recordUsage('groq', usage.prompt_tokens, usage.completion_tokens);
    
    return res.choices[0].message.content;
  },
  deepDive: (minutes, ctx) => {
    ctx.reply(`🚀 進入深度工作模式：${minutes} 分鐘。雅典娜將在結束時震動提醒。`);
    setTimeout(() => {
      try {
        execSync('termux-vibrate -d 1000');
        ctx.reply("⏰ 深度工作結束！該摸魚休息一下了。");
      } catch(e) {}
    }, minutes * 60000);
  }
};

const HELP = `🛡️ **雅典娜治理官 ${VERSION}**
━━━━━━━━━━━━━━━━━━━━━━━

📊 **完整監控系統**
🔹 /monitor - 完整監控面板
🔹 /status - 系統狀態概覽
🔹 /alerts - 查看告警歷史
🔹 /backup - 數據備份

💰 **Token 監控系統**
🔹 /tokens - 查看 Token 使用
🔹 /costs - 成本統計報告

🧠 **人格進化系統**
🔹 /personality - 查看 AI 人格進度

🤖 **MCP 模型集成**
🔹 /models - 列出可用模型
🔹 /model [名稱] - 切換模型

📅 **Google 日曆與郵件**
🔹 /gcal - 查看本週日程
🔹 /emails - 查看未讀郵件
🔹 /gauth - Google 授權連接

✨ **6 大摸魚技能**
🔹 /sum [文字] - 文本摘要
🔹 /focus [分] - 深度工作計時器
🔹 /note [內容] - 靈魂筆記
🔹 /vibe - 今日運勢
🔹 /slacker - 摸魚建議
🔹 /search [詞] - 聯網搜尋

💬 直接聊天 - 與雅典娜對話

━━━━━━━━━━━━━━━━━━━━━━━`;

bot.command('help', (ctx) => ctx.replyWithMarkdown(HELP));

bot.command('monitor', async (ctx) => {
  try {
    await monitor.getHardwareMetrics();
    await monitor.detectAnomalies();
    ctx.reply(monitor.generateFullDashboard());
  } catch (e) {
    ctx.reply('❌ 監控面板加載失敗');
  }
});

bot.command('status', async (ctx) => {
  try {
    const b = JSON.parse(execSync('termux-battery-status').toString().trim());
    const h = Math.floor((Date.now() - startTime) / 1000 / 3600);
    const m = (db.get('soul_memory').value() || []).length;
    const score = monitor.calculateHealthScore();
    ctx.replyWithMarkdown(`🛡️ **雅典娜狀態**\n━━━━━━━━━━\n⏱️ 運行: ${h}h\n🔋 電池: ${b.percentage}%\n📝 記憶: ${m} 筆\n✨ 版本: ${VERSION}\n💚 評分: ${score}/100\n${googleService.getStatus()}`);
  } catch (e) {
    ctx.reply('❌ 錯誤');
  }
});

bot.command('alerts', (ctx) => {
  const alerts = db.get('alerts').value() || [];
  if (alerts.length === 0) {
    return ctx.reply('✅ 沒有告警歷史');
  }
  const recent = alerts.slice(-10);
  let msg = `🚨 **最近 10 條告警**\n\n`;
  recent.forEach((a, i) => {
    const time = new Date(a.timestamp).toLocaleTimeString('zh-TW');
    msg += `${i+1}. [${a.severity.toUpperCase()}] ${a.type}\n   ${a.message}\n   ${time}\n\n`;
  });
  ctx.reply(msg);
});

bot.command('tokens', (ctx) => {
  ctx.replyWithMarkdown(tokenMonitor.generateReport());
});

bot.command('costs', (ctx) => {
  const alerts = tokenMonitor.checkLimits();
  let msg = tokenMonitor.generateReport() + '\n\n';
  if (alerts.length > 0) {
    msg += '⚠️ **警告**\n' + alerts.join('\n');
  }
  ctx.reply(msg);
});

bot.command('personality', (ctx) => {
  ctx.replyWithMarkdown(personality.generatePersonalityReport());
});

bot.command('models', (ctx) => {
  ctx.replyWithMarkdown(mcp.listModels());
});

bot.command('model', (ctx) => {
  const args = ctx.message.text.split(' ');
  if (args.length < 2) {
    ctx.reply(mcp.getModelInfo());
  } else {
    const modelName = args[1];
    const result = mcp.switchModel(modelName);
    ctx.reply(result);
  }
});

bot.command('gauth', async (ctx) => {
  const authUrl = googleService.getAuthUrl();
  ctx.reply(`🔐 請點擊下方連結授權 Google 賬戶：\n${authUrl}`);
});

bot.command('gcal', async (ctx) => {
  ctx.reply('⏳ 查詢日程中...');
  const result = await googleService.getUpcomingEvents(7);
  ctx.reply(result);
});

bot.command('emails', async (ctx) => {
  ctx.reply('⏳ 查詢郵件中...');
  const result = await googleService.getUnreadEmails(5);
  ctx.reply(result);
});

bot.command('sum', async (ctx) => {
  const text = ctx.message.text.split(' ').slice(1).join(' ');
  if (!text) return ctx.reply("用法: /sum [文字]");
  ctx.reply("⚡ 摘要中...");
  try {
    const result = await SlackerSkills.flashRead(text);
    ctx.reply(`📝 ${result}`);
  } catch (e) {
    ctx.reply("❌ 失敗");
  }
});

bot.command('focus', (ctx) => {
  const min = parseInt(ctx.message.text.split(' ')[1]) || 25;
  SlackerSkills.deepDive(min, ctx);
});

bot.command('note', (ctx) => {
  const c = ctx.message.text.split(' ').slice(1).join(' ');
  if (!c) return ctx.reply("用法: /note [內容]");
  const m = db.get('soul_memory').value() || [];
  m.push({ c, date: new Date().toLocaleString('zh-TW') });
  db.set('soul_memory', m).write();
  ctx.reply("✍️ 已記!");
});

bot.command('vibe', async (ctx) => {
  try {
    const res = await groq.chat.completions.create({
      messages: [{ role: 'system', content: '給一句溫暖的運勢建議。' }],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 100
    });
    
    const usage = res.usage || { prompt_tokens: 0, completion_tokens: 0 };
    tokenMonitor.recordUsage('groq', usage.prompt_tokens, usage.completion_tokens);
    
    ctx.reply(`✨ ${res.choices[0].message.content}`);
  } catch (e) {
    ctx.reply("❌ 失敗");
  }
});

bot.command('slacker', (ctx) => {
  const tips = ["站起來喝杯咖啡！", "看窗外 20 秒。", "企鵝有膝蓋。", "聽一首 Lo-fi。", "深呼吸！"];
  ctx.reply(`🐟 ${tips[Math.floor(Math.random()*tips.length)]}`);
});

bot.command('search', async (ctx) => {
  const q = ctx.message.text.split(' ').slice(1).join(' ');
  if (!q) return ctx.reply("用法: /search [詞]");
  ctx.reply("🔍 搜尋中...");
  try {
    const res = await axios.post('https://api.tavily.com/search', {
      api_key: process.env.TAVILY_API_KEY,
      query: q,
      max_results: 3
    });
    const r = res.data.results || [];
    if (!r.length) return ctx.reply("❌ 無結果");
    let msg = "🌐 結果:\n";
    r.forEach((x, i) => { msg += `${i+1}. ${x.title}\n${x.url}\n`; });
    ctx.reply(msg);
  } catch (e) {
    ctx.reply("❌ 失敗");
  }
});

bot.command('backup', (ctx) => {
  try {
    const t = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const p = path.join(ROOT_DIR, `backup_${t}.json`);
    fs.writeFileSync(p, JSON.stringify(db.getState(), null, 2));
    ctx.reply(`✅ 備份: ${t}`);
  } catch (e) {
    ctx.reply("❌ 失敗");
  }
});

bot.on('text', async (ctx) => {
  try {
    const systemPrompt = personality.getSystemPrompt();
    const res = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: ctx.message.text }
      ],
      model: 'llama-3.3-70b-versatile',
      max_tokens: 500
    });
    
    const usage = res.usage || { prompt_tokens: 0, completion_tokens: 0 };
    tokenMonitor.recordUsage('groq', usage.prompt_tokens, usage.completion_tokens);
    
    const r = res.choices[0].message.content;
    personality.updatePersonality(ctx.message.text, r);
    
    const h = db.get('history').value() || [];
    h.push({ user: ctx.message.text, bot: r, time: new Date().toISOString() });
    db.set('history', h).write();
    ctx.reply(r);
  } catch (e) {
    ctx.reply("❌ 對話失敗");
  }
});

const init = async () => {
  console.log(`🚀 雅典娜 ${VERSION} 啟動...`);
  try {
    await bot.telegram.sendMessage(MY_CHAT_ID, `🛡️ **${VERSION} 已就緒**\n✅ 監控 + Token + 人格 + MCP + Google 整合\n🔐 Google 授權狀態：${googleService.getStatus()}\n\n輸入 /help 查看指令`);
    await bot.launch({ dropPendingUpdates: true });
    console.log("✅ Bot 已啟動");
    await monitor.start();
  } catch (err) {
    console.error(`❌ 失敗: ${err.message}`);
    setTimeout(init, 10000);
  }
};

process.on('SIGINT', () => {
  console.log("\n✅ 已關閉");
  bot.stop();
  process.exit(0);
});

init();
