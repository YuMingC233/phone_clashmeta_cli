import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env from project root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const PORT = process.env.WEB_PORT || 3000;
const SCRIPT = path.join(__dirname, '..', 'clash_ctl.sh');

// Helper: run clash_ctl.sh with arguments, return parsed stdout
async function runScript(args, { timeout = 30000, json = false } = {}) {
  const { stdout, stderr } = await execFileP('bash', [SCRIPT, ...args], {
    timeout,
    env: { ...process.env },
  });
  if (stderr) console.warn('[stderr]', stderr.trim());
  return json ? JSON.parse(stdout.trim()) : stdout.trim();
}

// Helper: run a raw shell command (not through clash_ctl.sh)
async function runRaw(cmd, { timeout = 10000 } = {}) {
  const { stdout } = await execFileP('bash', ['-c', cmd], {
    timeout,
    env: { ...process.env },
  });
  return stdout.trim();
}

const app = express();
app.use(cors());
app.use(express.json());

// ─── Status ────────────────────────────────────────────────
app.get('/api/status', async (_req, res) => {
  try {
    const data = await runScript(['status', '--json'], { json: true, timeout: 15000 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Root check ────────────────────────────────────────────
app.get('/api/root-check', async (_req, res) => {
  try {
    const out = await runRaw('adb shell "su -c \'echo root\'" 2>/dev/null');
    res.json({ root: out.includes('root') });
  } catch {
    res.json({ root: false });
  }
});

// ─── Clash control ─────────────────────────────────────────
app.post('/api/clash/on', async (_req, res) => {
  try {
    await runScript(['clashon']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clash/off', async (_req, res) => {
  try {
    await runScript(['clashoff']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Node ──────────────────────────────────────────────────
app.put('/api/node', async (req, res) => {
  try {
    const { name, group } = req.body;
    if (!name) return res.status(400).json({ error: 'node name required' });
    const args = ['node', name];
    if (group) args.push(group);
    await runScript(args);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/nodes', async (_req, res) => {
  try {
    const data = await runScript(['nodes'], { json: true, timeout: 10000 });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Mode ──────────────────────────────────────────────────
app.put('/api/mode', async (req, res) => {
  try {
    const { mode } = req.body;
    if (!['global', 'rule', 'direct'].includes(mode)) {
      return res.status(400).json({ error: 'mode must be global, rule, or direct' });
    }
    await runScript(['clashmode', mode], { timeout: 60000 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Phone settings ────────────────────────────────────────
app.post('/api/mobile-data/on', async (_req, res) => {
  try {
    await runScript(['mbdopen']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mobile-data/off', async (_req, res) => {
  try {
    await runScript(['mbdoff']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hotspot/open', async (_req, res) => {
  try {
    await runScript(['hspopen'], { timeout: 15000 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/hotspot/close', async (_req, res) => {
  try {
    await runScript(['hspclose'], { timeout: 15000 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/usb/on', async (_req, res) => {
  try {
    await runScript(['usbon']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/usb/off', async (_req, res) => {
  try {
    await runScript(['usboff']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mute', async (_req, res) => {
  try {
    await runScript(['mute']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── System proxy ──────────────────────────────────────────
app.post('/api/proxy/on', async (_req, res) => {
  try {
    await runScript(['gsyson']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/proxy/off', async (_req, res) => {
  try {
    await runScript(['gsysoff']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Composite commands ────────────────────────────────────
app.post('/api/booton', async (_req, res) => {
  try {
    await runScript(['booton'], { timeout: 30000 });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tempon', async (_req, res) => {
  try {
    await runScript(['tempon']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/tempoff', async (_req, res) => {
  try {
    await runScript(['tempoff']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Serve React build & SPA fallback ──────────────────────
const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientDist, 'index.html'));
  }
});

app.listen(PORT, () => {
  console.log(`Clash Meta Controller server running on http://localhost:${PORT}`);
});
