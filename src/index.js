import express from 'express';
import { config } from './config.js';
import { createScanner } from './logic.js';
import { errorLog, log } from './logger.js';
import { JsonStore } from './store.js';

const app = express();
app.use(express.json());

const store = new JsonStore(config.dataDir);
await store.init(config.stravaRefreshToken);
const scanner = createScanner({ store, config });

function unauthorized(res) {
  return res.status(401).json({ error: 'unauthorized' });
}

function checkAdmin(req, res, next) {
  if (!config.adminToken) return unauthorized(res);
  const token = req.header('x-admin-token') || req.query.token;
  if (token !== config.adminToken) return unauthorized(res);
  next();
}

app.get('/', async (_req, res) => {
  const state = await store.readState();
  res.type('text/plain').send([
    'AntiKOM Bot is running.',
    '',
    `lastSuccessfulScanAt=${state.scanner.lastSuccessfulScanAt || 'never'}`,
    `processedActivityCount=${Object.keys(state.scanner.processedActivityIds || {}).length}`,
    '',
    'Endpoints:',
    'GET /health',
    'POST /admin/scan',
    'POST /admin/scan/:activityId'
  ].join('\n'));
});

app.get('/health', async (_req, res) => {
  const state = await store.readState();
  res.json({
    ok: true,
    now: new Date().toISOString(),
    dataDir: config.dataDir,
    pollIntervalMs: config.pollIntervalMs,
    lastSuccessfulScanAt: state.scanner.lastSuccessfulScanAt || null,
    processedActivityCount: Object.keys(state.scanner.processedActivityIds || {}).length,
    antiKomEnabled: config.enableAntiKom,
    antiPrEnabled: config.enableAntiPr,
    dryRun: config.dryRun
  });
});

app.post('/admin/scan', checkAdmin, async (_req, res) => {
  try {
    const result = await scanner.scan();
    res.json(result);
  } catch (err) {
    errorLog('Manual scan failed', err?.response?.data || err.stack || err.message);
    res.status(500).json({ error: 'scan_failed', detail: err?.response?.data || err.message || 'unknown_error' });
  }
});

app.post('/admin/scan/:activityId', checkAdmin, async (req, res) => {
  try {
    const activityId = Number.parseInt(req.params.activityId, 10);
    if (!Number.isFinite(activityId)) {
      return res.status(400).json({ error: 'invalid_activity_id' });
    }
    const result = await scanner.scan({ forceActivityId: activityId });
    return res.json(result);
  } catch (err) {
    errorLog('Manual activity scan failed', err?.response?.data || err.stack || err.message);
    return res.status(500).json({ error: 'activity_scan_failed', detail: err?.response?.data || err.message || 'unknown_error' });
  }
});

const server = app.listen(config.port, () => {
  log(`AntiKOM Bot listening on port ${config.port}`);
});

let timer = null;

async function runScheduledScan() {
  try {
    const result = await scanner.scan();
    if (result?.count) {
      log(`Scheduled scan processed ${result.count} new activities`);
    }
  } catch (err) {
    errorLog('Scheduled scan failed', err?.response?.data || err.stack || err.message);
  }
}

await runScheduledScan();
timer = setInterval(runScheduledScan, config.pollIntervalMs);

function shutdown(signal) {
  log(`Received ${signal}, shutting down`);
  if (timer) clearInterval(timer);
  server.close(() => process.exit(0));
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
