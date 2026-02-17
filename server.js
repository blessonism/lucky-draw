const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 奖品池 — 8 扇区，大小 & 概率均可独立调整
// visualWeight : 转盘扇区视觉大小（越大扇区越宽，纯展示）
// prob         : 实际中奖概率权重（越大越容易被抽到）← 改这里调概率！
const PRIZES = [
  { id: 1, tier: 0, tierName: '超级大奖', name: '请你喝一杯 ☕', desc: '星巴克任选一杯',       color: '#E53935', count: 1, visualWeight: 2,   prob: 2  },
  { id: 2, tier: 3, tierName: '二等奖',   name: '会员周卡 📺',   desc: '视频平台会员周卡',     color: '#6A1B9A', count: 1, visualWeight: 4,   prob: 15 },
  { id: 3, tier: 2, tierName: '一等奖',   name: '视频月卡 🎬',   desc: '爱奇艺/B站大会员月卡', color: '#EF6C00', count: 1, visualWeight: 3,   prob: 10 },
  { id: 4, tier: 3, tierName: '二等奖',   name: '盲盒零食 🎁',   desc: '惊喜零食大礼包',       color: '#1565C0', count: 1, visualWeight: 4,   prob: 15 },
  { id: 5, tier: 1, tierName: '特等奖',   name: '咖啡挂耳包 ☕', desc: '精选手冲挂耳一盒',     color: '#C2185B', count: 1, visualWeight: 2.5, prob: 5  },
  { id: 6, tier: 3, tierName: '二等奖',   name: '音乐月卡 🎵',   desc: '网易云/QQ音乐月卡',     color: '#00695C', count: 1, visualWeight: 4,   prob: 15 },
  { id: 7, tier: 2, tierName: '一等奖',   name: '帮你一件事 🤝', desc: '免费帮你搞定一件小事', color: '#D81B60', count: 1, visualWeight: 3,   prob: 10 },
  { id: 8, tier: 3, tierName: '二等奖',   name: 'AI 工具额度 🤖', desc: 'ChatGPT/Claude 额度', color: '#283593', count: 1, visualWeight: 4,   prob: 15 },
];

function genCode() {
  return 'LK-' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

function loadData() {
  if (fs.existsSync(DATA_FILE)) {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8').trim();
    if (raw) {
      try {
        const data = JSON.parse(raw);
        // 兼容旧数据：补齐 prob / visualWeight
        for (const r of data.remaining) {
          const ref = PRIZES.find(p => p.id === r.id);
          if (ref) {
            if (r.prob == null) r.prob = ref.prob;
            if (r.visualWeight == null) r.visualWeight = ref.visualWeight;
          }
        }
        return data;
      } catch (e) { /* corrupted, reset */ }
    }
  }
  return { draws: [], remaining: PRIZES.map(p => ({ ...p })) };
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 获取奖品列表（前端转盘用）
app.get('/api/prizes', (req, res) => {
  res.json(PRIZES.map(p => ({ id: p.id, name: p.name, color: p.color, tier: p.tier, tierName: p.tierName, visualWeight: p.visualWeight })));
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

  // 加权随机抽取（按 prob 权重）
  const totalProb = data.remaining.reduce((sum, p) => sum + p.prob, 0);
  let rand = Math.random() * totalProb;
  let idx = 0;
  for (let i = 0; i < data.remaining.length; i++) {
    rand -= data.remaining[i].prob;
    if (rand <= 0) { idx = i; break; }
  }
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

// 获取奖品概率配置
app.get('/api/admin/config', (req, res) => {
  const key = req.query.key;
  if (key !== 'edom2025') return res.status(403).json({ error: '无权限' });
  const data = loadData();
  const remaining = data.remaining.map(p => p.id);
  res.json(PRIZES.map(p => ({
    id: p.id, tier: p.tier, tierName: p.tierName, name: p.name, desc: p.desc,
    color: p.color, visualWeight: p.visualWeight, prob: p.prob,
    drawn: !remaining.includes(p.id)
  })));
});

// 更新概率配置
app.post('/api/admin/config', (req, res) => {
  const key = req.query.key;
  if (key !== 'edom2025') return res.status(403).json({ error: '无权限' });
  const updates = req.body; // [{ id, prob, visualWeight }]
  if (!Array.isArray(updates)) return res.status(400).json({ error: '格式错误' });
  for (const u of updates) {
    const p = PRIZES.find(x => x.id === u.id);
    if (!p) continue;
    if (typeof u.prob === 'number' && u.prob >= 0) p.prob = u.prob;
    if (typeof u.visualWeight === 'number' && u.visualWeight > 0) p.visualWeight = u.visualWeight;
    if (typeof u.name === 'string' && u.name.trim()) p.name = u.name.trim();
    if (typeof u.desc === 'string' && u.desc.trim()) p.desc = u.desc.trim();
    if (typeof u.tierName === 'string' && u.tierName.trim()) p.tierName = u.tierName.trim();
    if (typeof u.tier === 'number' && u.tier >= 0) p.tier = u.tier;
    if (typeof u.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(u.color)) p.color = u.color;
  }
  // 同步更新 remaining 中的所有可变字段
  const data = loadData();
  for (const r of data.remaining) {
    const p = PRIZES.find(x => x.id === r.id);
    if (p) {
      r.prob = p.prob; r.visualWeight = p.visualWeight;
      r.name = p.name; r.desc = p.desc;
      r.tierName = p.tierName; r.tier = p.tier; r.color = p.color;
    }
  }
  saveData(data);
  res.json({ ok: true, prizes: PRIZES.map(p => ({ id: p.id, prob: p.prob, visualWeight: p.visualWeight })) });
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
