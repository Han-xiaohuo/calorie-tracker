const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Parse JSON bodies (limit 5MB for data)
app.use(express.json({ limit: '5mb' }));

// Serve static files (index.html)
app.use(express.static(__dirname));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Pull data for a given key
app.get('/api/data/:key', (req, res) => {
  const key = sanitizeKey(req.params.key);
  if (!key) return res.status(400).json({ error: '无效的密钥格式' });

  const filePath = path.join(DATA_DIR, `${key}.json`);
  if (!fs.existsSync(filePath)) {
    return res.json({ exists: false, data: {} });
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    res.json({ exists: true, data });
  } catch (err) {
    res.status(500).json({ error: '读取数据失败' });
  }
});

// Push data for a given key
app.put('/api/data/:key', (req, res) => {
  const key = sanitizeKey(req.params.key);
  if (!key) return res.status(400).json({ error: '无效的密钥格式' });
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: '请求体必须为 JSON 对象' });
  }

  const filePath = path.join(DATA_DIR, `${key}.json`);

  try {
    // Read existing data and merge with timestamp conflict resolution
    let existing = {};
    if (fs.existsSync(filePath)) {
      existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }

    // Merge: for each top-level key, keep the one with newer _updatedAt
    const merged = {};
    const allKeys = new Set([...Object.keys(existing), ...Object.keys(req.body)]);
    for (const k of allKeys) {
      const oldTime = (existing[k] && existing[k]._updatedAt) || 0;
      const newTime = (req.body[k] && req.body[k]._updatedAt) || 0;
      merged[k] = newTime >= oldTime ? req.body[k] : existing[k];
    }

    merged._lastSync = new Date().toISOString();
    fs.writeFileSync(filePath, JSON.stringify(merged, null, 2), 'utf-8');
    res.json({ ok: true, merged: Object.keys(merged).length });
  } catch (err) {
    res.status(500).json({ error: '写入数据失败' });
  }
});

function sanitizeKey(key) {
  // Allow alphanumeric, hyphens, underscores, dots. Max 64 chars.
  if (!key || typeof key !== 'string') return '';
  const sanitized = key.replace(/[^a-zA-Z0-9\-_\.]/g, '').slice(0, 64);
  return sanitized || '';
}

app.listen(PORT, () => {
  console.log(`热量记录站运行在 http://localhost:${PORT}`);
});
