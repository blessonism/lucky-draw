const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 奖品池 - 带兑换码前缀
const PRIZES = [
  { id: 1, name: '请你喝一杯 ☕', desc: '星巴克任选一杯', tier: 1, tierName: '一等奖', color: '#FFD700', count: 1 },
  { id: 2, name: '视频月卡 🎬', desc: '爱奇艺/B站大会员月卡', tier: 1, tierName: '一等奖', color: '#FF6B6B', count: 1 },
  { id: 3, name: '咖啡挂耳包 ☕', desc: '精选手冲挂耳一盒', tier: 2, tierName: '二等奖', color: '#FF8E53', count: 1 },
  { id: 4, name: '盲盒零食 🎁', desc: '惊喜零食大礼包', tier: 2, tierName: '二等奖', color: '#FFA07A', count: 1 },
  { id: 5, name: '音乐月卡 🎵', desc: '网易云/QQ音乐月卡', tier: 2, tierName: '二等奖', color: '#FF7043', count: 1 },
  { id: 6, name: '会员周卡 📺', desc: '视频平台会员周卡', tier: 3, tierName: '三等奖', color: '#FF5252', count: 1 },
  { id: 7, name: '帮你一件事 🤝', desc: '免费帮你搞定一件小事', tier: 3, tierName: '三等奖', color: '#E91E63', count: 1 },
  { id: 8, name: 'AI 工具额度 🤖', desc: 'ChatGPT/Claude 额度', tier: 3, tierName: '三等奖', color: '#F44336', count: 1 },
];

function genCode() {
  return 'LK-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8').trim();
    if (raw) {
      try { return JSON.parse(raw); } catch (e) { /* corrupted, reset */ }
    }
  }
  return { draws: [], remaining: PRIZES.map(p => ({ ...p })) };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 获取奖品列表（前端转盘用）
app.get('/api/prizes', (req, res) => {
  res.json(PRIZES.map(p => ({ id: p.id, name: p.name, color: p.color, tier: p.tier, tierName: p.tierName })));
});

// 获取中奖记录（侧边栏滚动用）
app.get('/api/draws', (req, res) => {
  const data = loadData();
  res.json(data.draws.map(d => ({
    nickname: d.nickname,
    tierName: d.tierName,
    prizeName: d.prizeName,
    time: d.time
  })));
});

// 抽奖
app.post('/api/draw', (req, res) => {
  const { nickname } = req.body;
  if (!nickname || !nickname.trim()) {
    return res.status(400).json({ error: '请输入昵称' });
  }

  const name = nickname.trim();
  const data = loadData();

  // 检查是否已抽过
  const existing = data.draws.find(d => d.nickname.toLowerCase() === name.toLowerCase());
  if (existing) {
    const prize = PRIZES.find(p => p.id === existing.prizeId);
    return res.json({
      already: true,
      prize: { ...prize, code: existing.code },
      tierName: existing.tierName
    });
  }

  // 检查奖品是否还有
  if (data.remaining.length === 0) {
    return res.status(410).json({ error: '奖品已全部抽完啦！' });
  }

  // 随机抽取
  const idx = Math.floor(Math.random() * data.remaining.length);
  const prize = data.remaining.splice(idx, 1)[0];
  const code = genCode();

  data.draws.push({
    nickname: name,
    prizeId: prize.id,
    prizeName: prize.name,
    tierName: prize.tierName,
    tier: prize.tier,
    code,
    time: new Date().toISOString()
  });

  saveData(data);

  res.json({
    prize: { ...prize, code },
    tierName: prize.tierName,
    tier: prize.tier,
    message: getWish()
  });
});

// 管理接口
app.get('/api/admin/draws', (req, res) => {
  const key = req.query.key;
  if (key !== 'edom2025') return res.status(403).json({ error: '无权限' });
  const data = loadData();
  res.json(data);
});

app.post('/api/admin/reset', (req, res) => {
  const key = req.query.key;
  if (key !== 'edom2025') return res.status(403).json({ error: '无权限' });
  if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
  res.json({ ok: true });
});

function getWish() {
  const wishes = [
    '新年快乐！愿你 2025 一切顺利 🎉',
    '蛇年大吉！好运连连 🐍',
    '新的一年，万事如意！✨',
    '2025，一起加油！💪',
    '祝你新年心想事成 🧧',
    '愿新的一年充满惊喜 🎊',
    '蛇年行大运，事事都顺心 🍀',
    '新年新气象，好事自然来 🌟',
  ];
  return wishes[Math.floor(Math.random() * wishes.length)];
}

app.listen(PORT, () => {
  console.log(`🧧 抽奖服务已启动: http://localhost:${PORT}`);
});
