import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { packageChangelog, CHANGELOG_FILES } from '../scripts/changelog.mjs';

const require = createRequire(import.meta.url);
const backend = require('../plugins/antigravity-account-ledger/backend.cjs');
const pluginDir = fileURLToPath(new URL('../plugins/antigravity-account-ledger/', import.meta.url));

function listPluginFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => (
    entry.isDirectory() ? listPluginFiles(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
  ));
}

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.textContent = '';
    this.value = '';
    this._classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(n => n && this._classes.add(n)),
      remove: (...names) => names.forEach(n => this._classes.delete(n)),
      toggle: (name, force) => {
        const next = force === undefined ? !this._classes.has(name) : Boolean(force);
        if (next) this._classes.add(name); else this._classes.delete(name);
        return next;
      },
      contains: (name) => this._classes.has(name)
    };
  }
  get className() { return [...this._classes].join(' '); }
  set className(val) {
    this._classes = new Set(String(val || '').split(/\s+/).filter(Boolean));
  }
  setAttribute(k, v) { this.attributes.set(k, String(v)); }
  getAttribute(k) { return this.attributes.get(k) ?? null; }
  append(...nodes) {
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      if (node.parentNode) node.remove();
      node.parentNode = this;
      this.children.push(node);
    }
  }
  replaceChildren(...nodes) {
    this.textContent = '';
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }
  remove() {
    if (!this.parentNode) return;
    const idx = this.parentNode.children.indexOf(this);
    if (idx >= 0) this.parentNode.children.splice(idx, 1);
    this.parentNode = null;
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) {
    this.listeners.get(type)?.delete(fn);
  }
  matches(selector) {
    if (!selector.startsWith('.')) return false;
    return this._classes.has(selector.slice(1));
  }
  closest(selector) {
    let cur = this;
    while (cur) {
      if (cur.matches?.(selector)) return cur;
      cur = cur.parentNode;
    }
    return null;
  }
  querySelector(selector) {
    for (const child of this.children) {
      if (child.matches?.(selector)) return child;
      const found = child.querySelector?.(selector);
      if (found) return found;
    }
    return null;
  }
}

function installFakeDom() {
  const prevDoc = globalThis.document;
  const prevStorage = globalThis.localStorage;
  const store = new Map();
  globalThis.document = { createElement: (tag) => new FakeElement(tag) };
  globalThis.localStorage = {
    getItem: (k) => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v))
  };
  return {
    store,
    restore() {
      globalThis.document = prevDoc;
      globalThis.localStorage = prevStorage;
    }
  };
}

function summaryFixture() {
  return {
    summary: {
      totalTokens: 1500,
      costUsd: 0.25,
      overallTotalTokens: 2000,
      overallCostUsd: 0.5,
      coverage: {
        attributedTokens: 1500,
        unattributedTokens: 500,
        attributedCostUsd: 0.25,
        unattributedCostUsd: 0.25,
        tokenCoveragePercent: 75,
        costCoveragePercent: 50
      },
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadTokens: 0,
      reasoningTokens: 0,
      models: {},
      accounts: []
    },
    discoveredAccounts: ['user@example.com'],
    activeAccount: { email: 'user@example.com' }
  };
}

test('antigravity-account-ledger ships 0.1.0 changelog summaries across all 6 locales', () => {
  const root = new URL('../plugins/antigravity-account-ledger/', import.meta.url);
  const files = Object.fromEntries(Object.values(CHANGELOG_FILES).map(name => [name, fs.readFileSync(new URL(name, root))]));
  const notes = packageChangelog(files, '0.1.0');
  assert.equal(Object.keys(notes).length, 6);
});

test('antigravity-account-ledger restricts view surfaces and defaultSurfaces to home only', () => {
  const root = new URL('../plugins/antigravity-account-ledger/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', root), 'utf8'));
  assert.deepEqual(manifest.views[0].surfaces, ['home']);
  assert.deepEqual(manifest.views[0].defaultSurfaces, ['home']);
  const uiSource = fs.readFileSync(new URL('ui.mjs', root), 'utf8');
  const cssSource = fs.readFileSync(new URL('styles.css', root), 'utf8');
  assert.equal(uiSource.includes('headerActions'), false);
  assert.equal(cssSource.includes('.surface-page'), false);
});

test('antigravity-account-ledger backend computes range summaries, coverage, and preferences', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-ledger-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const instance = await backend.activate({ dataDirectory: tmpDir, conversationDirs: [] });
  assert.ok(instance);
  const res = await instance.call('getSummary', {
    range: { start: '2026-10-01', end: '2026-10-29' },
    accountFilter: 'all'
  });
  assert.ok(res.summary);
  assert.equal(typeof res.summary.totalTokens, 'number');
  assert.equal(res.attributionRules, undefined);
  assert.ok(res.summary.coverage);
  for (const key of ['attributedTokens', 'unattributedTokens', 'tokenCoveragePercent', 'costCoveragePercent']) {
    assert.equal(typeof res.summary.coverage[key], 'number');
  }
  assert.equal(typeof res.summary.overallCostUsd, 'number');
  const prefs = JSON.parse(fs.readFileSync(path.join(tmpDir, 'preferences.json'), 'utf8'));
  assert.deepEqual(prefs, { accountFilter: 'all', range: { start: '2026-10-01', end: '2026-10-29' } });
  await assert.rejects(instance.call('assignDateRange', {}), /Unknown method/);
  instance.dispose?.();
});

test('antigravity-account-ledger normalizes dates by local day boundaries', () => {
  assert.equal(typeof backend.localDayKey, 'function');
  const local = new Date(2026, 0, 1, 0, 30);
  assert.equal(backend.localDayKey(local), '2026-01-01');
  assert.equal(backend.normalizeDate(local), '2026-01-01');
  assert.equal(backend.normalizeDate(local.getTime()), '2026-01-01');
  assert.equal(backend.normalizeDate(Math.floor(local.getTime() / 1000)), '2026-01-01');
  assert.equal(backend.normalizeDate(local.toISOString()), '2026-01-01');
  const offsetDate = new Date('2026-01-01T00:30:00+08:00');
  assert.equal(backend.normalizeDate('2026-01-01T00:30:00+08:00'), backend.localDayKey(offsetDate));
  assert.equal(backend.normalizeDate('2026-01-01'), '2026-01-01');
  assert.equal(backend.normalizeDate('not-a-date-value'), 'not-a-date');
  assert.equal(backend.normalizeDate(null), '');
});

test('antigravity-account-ledger reports token, cost and call coverage', () => {
  const ledger = backend.createDefaultLedger('2026-10-01T00:00:00Z');
  assert.equal(ledger.attributionRules, undefined);
  backend.recordAccountHeartbeat({ email: 'a@example.com', source: 'antigravity_tools' }, '2026-10-10T00:00:00Z', ledger);
  ledger.timeline[0].endedAt = '2026-10-10T13:00:00Z';
  const calls = [
    { day: '2026-10-10', timestampMs: Date.parse('2026-10-10T12:00:00Z'), model: 'gemini-3.8-flash', inputTokens: 600, outputTokens: 0, costUsd: 0.6 },
    { day: '2026-10-20', timestampMs: Date.parse('2026-10-20T12:00:00Z'), model: 'gemini-3.8-flash', inputTokens: 300, outputTokens: 100, costUsd: 0.4 }
  ];
  const res = backend.aggregateAccountUsage({
    calls,
    ledger,
    quotaWindows: {},
    range: { start: '2026-10-01', end: '2026-10-31' },
    accountFilter: 'all',
    discoveredAccounts: []
  });
  assert.equal(res.overallTotalTokens, 1000);
  assert.equal(res.overallCostUsd, 1);
  assert.deepEqual(res.coverage, {
    attributedTokens: 600,
    unattributedTokens: 400,
    attributedCostUsd: 0.6,
    unattributedCostUsd: 0.4,
    tokenCoveragePercent: 60,
    costCoveragePercent: 60,
    totalCalls: 2,
    attributedCalls: 1,
    unattributedCalls: 1
  });
});

test('antigravity-account-ledger UI mounts a self-contained header, toggles collapse, and honors visibility', async () => {
  const { activate } = await import('../plugins/antigravity-account-ledger/ui.mjs');
  const dom = installFakeDom();
  try {
    const container = new FakeElement('div');
    container.className = 'home-plugin-body';
    const callsMade = [];
    const ui = activate({
      backend: {
        async call(method, payload) {
          callsMade.push({ method, payload });
          return summaryFixture();
        },
        subscribe() { return () => {}; }
      }
    });

    const mounted = ui.mount(container, {});
    const root = container.querySelector('.ag-ledger-root');
    assert.ok(root);
    assert.equal(root.classList.contains('surface-home'), true);
    const statusBanner = root.querySelector('.ag-ledger-status-banner');
    assert.equal(statusBanner.textContent, '正在扫描本地 Antigravity 用量记录...');
    await new Promise(r => setTimeout(r, 10));
    assert.equal(callsMade[0].method, 'getSummary');
    const header = root.querySelector('.ag-ledger-header');
    assert.ok(header);
    assert.equal(header.parentNode, root);
    assert.equal(root.querySelector('.ag-ledger-title').textContent, 'Antigravity 多账号账本');
    assert.equal(root.querySelector('.ag-ledger-assign-btn'), null);
    assert.equal(statusBanner.getAttribute('role'), 'status');
    assert.equal(statusBanner.classList.contains('hidden'), true);
    assert.equal(statusBanner.textContent, '');

    const collapseBtn = root.querySelector('.ag-ledger-collapse-btn');
    for (const fn of collapseBtn.listeners.get('click') || []) {
      fn({ stopPropagation() {}, target: collapseBtn });
    }
    assert.equal(root.classList.contains('is-collapsed'), true);
    for (const fn of header.listeners.get('click') || []) {
      fn({ target: header });
    }
    assert.equal(root.classList.contains('is-collapsed'), false);

    mounted.update({ surface: 'home', visible: false });
    assert.equal(root.classList.contains('hidden'), true);
    mounted.update({ visible: true });
    assert.equal(root.classList.contains('hidden'), false);

    mounted.dispose();
    assert.equal(container.children.length, 0);
  } finally {
    dom.restore();
  }
});

test('antigravity-account-ledger UI shows errors, retries, and recovers', async () => {
  const { activate } = await import('../plugins/antigravity-account-ledger/ui.mjs');
  const dom = installFakeDom();
  try {
    const container = new FakeElement('div');
    let attempts = 0;
    const ui = activate({
      backend: {
        async call() {
          attempts += 1;
          if (attempts === 1) throw new Error('scan failed');
          return summaryFixture();
        },
        subscribe() { return () => {}; }
      }
    });
    const mounted = ui.mount(container, {});
    await new Promise(r => setTimeout(r, 10));
    const root = container.querySelector('.ag-ledger-root');
    const message = root.querySelector('.ag-ledger-status-text');
    assert.ok(message);
    assert.match(message.textContent, /读取用量数据失败：scan failed/);
    const retryBtn = root.querySelector('.ag-ledger-retry-btn');
    assert.ok(retryBtn);
    for (const fn of retryBtn.listeners.get('click') || []) {
      await fn();
    }
    await new Promise(r => setTimeout(r, 10));
    assert.equal(attempts, 2);
    assert.equal(root.querySelector('.ag-ledger-retry-btn'), null);
    assert.ok(root.querySelector('.ag-ledger-kpi-grid'));
    const statusBanner = root.querySelector('.ag-ledger-status-banner');
    assert.equal(statusBanner.classList.contains('hidden'), true);
    assert.equal(statusBanner.textContent, '');
    mounted.dispose();
  } finally {
    dom.restore();
  }
});

function encodeVarintBuf(value) {
  let v = BigInt(value);
  const bytes = [];
  while (v >= 0x80n) {
    bytes.push(Number((v & 0x7fn) | 0x80n));
    v >>= 7n;
  }
  bytes.push(Number(v));
  return Buffer.from(bytes);
}

function pbVarintField(fieldNo, value) {
  return Buffer.concat([encodeVarintBuf((BigInt(fieldNo) << 3n) | 0n), encodeVarintBuf(value)]);
}

function pbBytesField(fieldNo, buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'utf8');
  return Buffer.concat([encodeVarintBuf((BigInt(fieldNo) << 3n) | 2n), encodeVarintBuf(b.length), b]);
}

test('antigravity-account-ledger decodes SQLite Protobuf generation records, step attributes, tiered pricing, and WAL fallback', (t) => {
  const { DatabaseSync } = require('node:sqlite');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-db-scan-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const tsMsg1 = Buffer.concat([pbVarintField(1, 1793000000), pbVarintField(2, 0)]);
  const tsMsg2 = Buffer.concat([pbVarintField(1, 1793000600), pbVarintField(2, 0)]);

  const usageStats1 = Buffer.concat([
    pbVarintField(1, 1026),
    pbVarintField(2, 250000),
    pbVarintField(3, 10000),
    pbVarintField(4, 0),
    pbVarintField(5, 50000),
    pbVarintField(6, 1),
    pbVarintField(9, 2000),
    pbBytesField(11, 'resp-1')
  ]);
  const usageStats2 = Buffer.concat([
    pbVarintField(1, 1322),
    pbVarintField(2, 250000),
    pbVarintField(3, 10000),
    pbVarintField(4, 0),
    pbVarintField(5, 0),
    pbVarintField(6, 1),
    pbVarintField(9, 500),
    pbBytesField(11, 'resp-2')
  ]);
  const usageStats3 = Buffer.concat([
    pbVarintField(1, 1035),
    pbVarintField(2, 10000),
    pbVarintField(3, 1000),
    pbVarintField(6, 1),
    pbBytesField(11, 'resp-3')
  ]);

  const stepMeta5 = Buffer.concat([
    pbBytesField(1, tsMsg1),
    pbBytesField(9, usageStats1),
    pbVarintField(11, 1026),
    pbBytesField(12, 'exec-1')
  ]);
  const stepMeta10 = Buffer.concat([
    pbBytesField(1, tsMsg2),
    pbBytesField(9, usageStats3),
    pbVarintField(11, 1035),
    pbBytesField(12, 'exec-3')
  ]);

  const cm1 = Buffer.concat([
    pbVarintField(3, 1026),
    pbBytesField(4, usageStats1),
    pbBytesField(19, 'claude-opus-4-6-thinking'),
    pbBytesField(21, 'Claude Opus 4.6 (Thinking)')
  ]);
  const genData1 = Buffer.concat([pbBytesField(1, cm1), pbVarintField(2, 5), pbBytesField(4, 'exec-1')]);

  const cm2 = Buffer.concat([
    pbVarintField(3, 1322),
    pbBytesField(4, usageStats2),
    pbBytesField(19, 'gemini-3.8-flash-tiered'),
    pbBytesField(21, 'Gemini 3.8 Flash (High)')
  ]);
  const genData2 = Buffer.concat([pbBytesField(1, cm2), pbVarintField(2, 7), pbBytesField(4, 'exec-2')]);

  const dbPath = path.join(tmpDir, 'conv-test-1.db');
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE steps (idx INTEGER PRIMARY KEY, step_type TEXT, status TEXT, metadata BLOB)');
  db.exec('CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB)');
  const insStep = db.prepare('INSERT INTO steps (idx, step_type, status, metadata) VALUES (?, ?, ?, ?)');
  insStep.run(5, 'agent', 'done', stepMeta5);
  insStep.run(10, 'agent', 'done', stepMeta10);
  const insGen = db.prepare('INSERT INTO gen_metadata (idx, data) VALUES (?, ?)');
  insGen.run(1, genData1);
  insGen.run(2, genData2);
  db.close();

  fs.writeFileSync(`${dbPath}-wal`, Buffer.from('corrupt-or-locked-wal-header'));

  const calls = backend.scanAllConversationDbs({
    conversationDirs: [tmpDir],
    cacheFile: path.join(tmpDir, 'cache.json')
  });

  assert.equal(calls.length, 3);

  const callBoth = calls.find(c => c.responseId === 'resp-1');
  assert.ok(callBoth);
  assert.equal(callBoth.alignmentMode, 'both');
  assert.equal(callBoth.model, 'claude-opus-4-6-thinking');
  assert.equal(callBoth.inputTokens, 250000);
  assert.equal(callBoth.outputTokens, 10000);
  assert.equal(callBoth.cacheReadTokens, 50000);
  assert.equal(callBoth.reasoningTokens, 2000);

  const callGenOnly = calls.find(c => c.responseId === 'resp-2');
  assert.ok(callGenOnly);
  assert.equal(callGenOnly.alignmentMode, 'gen_only');
  assert.equal(Math.round(callGenOnly.callTimestamp), 1793000240);

  const callStepOnly = calls.find(c => c.responseId === 'resp-3');
  assert.ok(callStepOnly);
  assert.equal(callStepOnly.alignmentMode, 'step_only');
  assert.equal(callStepOnly.model, 'claude-sonnet-4-6');

  assert.equal(backend.resolveModelAndPrice({ modelEnum: 1072, inputTokens: 1000, outputTokens: 100 }).model, 'gemini-3.7-flash');
  assert.equal(backend.resolveModelAndPrice({ modelEnum: 1299, inputTokens: 1000, outputTokens: 100 }).model, 'gemini-3.7-flash');
});

test('antigravity-account-ledger deduplicates no-response conversations across backup roots', (t) => {
  const { DatabaseSync } = require('node:sqlite');
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-dedup-home-'));
  t.after(() => fs.rmSync(tmpHome, { recursive: true, force: true }));

  const primaryDir = path.join(tmpHome, '.gemini', 'antigravity', 'conversations');
  const backupDir = path.join(tmpHome, '.gemini', 'antigravity-backup', 'conversations');
  fs.mkdirSync(primaryDir, { recursive: true });
  fs.mkdirSync(backupDir, { recursive: true });

  const tsMsg = Buffer.concat([pbVarintField(1, 1793000000)]);
  const usage = Buffer.concat([
    pbVarintField(1, 1007),
    pbVarintField(2, 120),
    pbVarintField(3, 30)
  ]);
  const stepMeta = Buffer.concat([pbBytesField(1, tsMsg), pbBytesField(9, usage), pbVarintField(11, 1007)]);
  for (const dir of [primaryDir, backupDir]) {
    const db = new DatabaseSync(path.join(dir, 'conv-shared.db'));
    db.exec('CREATE TABLE steps (idx INTEGER PRIMARY KEY, step_type TEXT, status TEXT, metadata BLOB)');
    db.exec('CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB)');
    db.prepare('INSERT INTO steps (idx, step_type, status, metadata) VALUES (?, ?, ?, ?)').run(3, 'agent', 'done', stepMeta);
    db.close();
  }

  const calls = backend.scanAllConversationDbs({
    homeDir: tmpHome,
    conversationSources: [
      { source: 'antigravity', dir: primaryDir },
      { source: 'antigravity-backup', dir: backupDir }
    ]
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].conversationId, 'conv-shared');
});

test('antigravity-account-ledger bounds CLI log attribution and ignores 0-token carpool warmup rows in token_stats.db', (t) => {
  const { DatabaseSync } = require('node:sqlite');
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-cli-warmup-home-'));
  t.after(() => fs.rmSync(tmpHome, { recursive: true, force: true }));

  const toolsDir = path.join(tmpHome, '.antigravity_tools');
  const cliLogDir = path.join(tmpHome, '.gemini', 'antigravity-cli', 'log');
  fs.mkdirSync(toolsDir, { recursive: true });
  fs.mkdirSync(cliLogDir, { recursive: true });

  const logFile = path.join(cliLogDir, 'cli-20261006_214817.log');
  fs.writeFileSync(
    logFile,
    'I1006 21:48:19.297368 12345 server_oauth.go:322] applyAuthResult: email=cli-carpool@example.com\n',
    'utf8'
  );
  const logStartSec = new Date(2026, 9, 6, 21, 48, 19).getTime() / 1000;
  fs.utimesSync(logFile, logStartSec + 120, logStartSec + 120);

  const statsDb = new DatabaseSync(path.join(toolsDir, 'token_stats.db'));
  statsDb.exec('CREATE TABLE token_usage (id INTEGER PRIMARY KEY, timestamp INTEGER, account_email TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, total_tokens INTEGER)');
  const ins = statsDb.prepare('INSERT INTO token_usage (timestamp, account_email, model, input_tokens, output_tokens, total_tokens) VALUES (?, ?, ?, ?, ?, ?)');
  ins.run(1789383999, 'warmup-carpool@example.com', 'gemini-3.8-flash', 0, 0, 0);
  ins.run(1790000000, 'real-proxy@example.com', 'gemini-3.8-flash', 1200, 300, 1500);
  statsDb.close();

  const ledger = backend.createDefaultLedger('2026-10-28T00:00:00Z');
  const quotaWindows = backend.buildQuotaAttributionWindows([], { homeDir: tmpHome });

  const cliInWindow = backend.attributeCallRecord({
    source: 'antigravity-cli',
    timestampMs: (logStartSec + 30) * 1000,
    model: 'gemini-3.8-flash'
  }, { ledger, quotaWindows });
  assert.equal(cliInWindow.email, 'cli-carpool@example.com');
  assert.equal(cliInWindow.source, 'cli_log');
  assert.equal(cliInWindow.layer, 2);

  const desktopLater = backend.attributeCallRecord({
    source: 'antigravity',
    timestampMs: (logStartSec + 10 * 86400) * 1000,
    model: 'gemini-4-argon'
  }, { ledger, quotaWindows });
  assert.equal(desktopLater.email, 'unattributed');

  const atWarmup = backend.attributeCallRecord({
    source: 'antigravity',
    timestampMs: (1789383999 + 10) * 1000,
    model: 'gemini-3.8-flash'
  }, { ledger, quotaWindows });
  assert.equal(atWarmup.email, 'unattributed');

  const atRealStats = backend.attributeCallRecord({
    source: 'antigravity',
    timestampMs: (1790000000 + 30) * 1000,
    model: 'gemini-3.8-flash'
  }, { ledger, quotaWindows });
  assert.equal(atRealStats.email, 'real-proxy@example.com');
  assert.equal(atRealStats.source, 'tools_token_stats');
});

test('antigravity-account-ledger discovers active account priority and applies layered attribution + cross-midnight deltas', (t) => {
  const { DatabaseSync } = require('node:sqlite');
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-attr-home-'));
  t.after(() => fs.rmSync(tmpHome, { recursive: true, force: true }));

  const toolsDir = path.join(tmpHome, '.antigravity_tools');
  const accountsSubDir = path.join(toolsDir, 'accounts');
  fs.mkdirSync(accountsSubDir, { recursive: true });

  fs.writeFileSync(path.join(toolsDir, 'accounts.json'), JSON.stringify({
    current_account_id: 'acc-active',
    accounts: [
      { id: 'acc-active', email: 'active@example.com', name: 'Active User' },
      { id: 'acc-quota', email: 'quota@example.com', name: 'Quota User' }
    ]
  }), 'utf8');

  fs.writeFileSync(path.join(accountsSubDir, 'acc-quota.json'), JSON.stringify({
    id: 'acc-quota',
    email: 'quota@example.com',
    name: 'Quota User',
    created_at: 1791000000,
    last_used: 1793249000,
    quota: {
      quota_groups: [
        {
          display_name: 'Claude / GPT',
          buckets: [
            {
              bucket_id: '3p-weekly',
              window: 'weekly',
              remaining_fraction: 0.45,
              reset_time: '2026-10-31T11:13:09Z'
            }
          ]
        }
      ]
    }
  }), 'utf8');

  const discovered = backend.discoverKnownAntigravityAccounts({ homeDir: tmpHome });
  const active = backend.discoverActiveAntigravityAccount({ homeDir: tmpHome, discoveredAccounts: discovered });
  assert.equal(active?.email, 'active@example.com');
  assert.equal(active?.source, 'antigravity_tools');

  const innerUserProto = Buffer.concat([pbBytesField(3, '孙悟空'), pbBytesField(7, 'proto@example.com')]).toString('base64');
  const outerUserProto = pbBytesField(1, innerUserProto).toString('base64');
  const parsedProtoUser = backend.extractEmailFromUserStatusValue(outerUserProto);
  assert.equal(parsedProtoUser?.email, 'proto@example.com');
  assert.equal(parsedProtoUser?.displayName, '孙悟空');

  const vscdbPath = path.join(tmpHome, 'state.vscdb');
  const vdb = new DatabaseSync(vscdbPath);
  vdb.exec('CREATE TABLE ItemTable (key TEXT PRIMARY KEY, value TEXT)');
  vdb.prepare('INSERT INTO ItemTable (key, value) VALUES (?, ?)').run('antigravityUnifiedStateSync.userStatus', outerUserProto);
  vdb.close();
  const activeFromVscdb = backend.discoverActiveAntigravityAccount({
    homeDir: path.join(tmpHome, 'empty-home'),
    vscdbPaths: [vscdbPath]
  });
  assert.equal(activeFromVscdb?.email, 'proto@example.com');

  const ledger = backend.createDefaultLedger('2026-10-28T00:00:00Z');
  backend.recordAccountHeartbeat({ email: 'active@example.com', source: 'antigravity_tools' }, '2026-10-28T10:00:00Z', ledger);
  const quotaWindows = backend.buildQuotaAttributionWindows(discovered, { homeDir: tmpHome });

  const l1 = backend.attributeCallRecord({
    timestampMs: Date.parse('2026-10-28T12:00:00Z'),
    day: '2026-10-28',
    model: 'claude-opus-4-6-thinking'
  }, { ledger, quotaWindows });
  assert.equal(l1.layer, 1);
  assert.equal(l1.email, 'active@example.com');

  const l2 = backend.attributeCallRecord({
    timestampMs: Date.parse('2026-10-25T15:00:00Z'),
    day: '2026-10-25',
    model: 'claude-opus-4-6-thinking'
  }, { ledger, quotaWindows });
  assert.equal(l2.layer, 2);
  assert.equal(l2.email, 'quota@example.com');

  const l3 = backend.attributeCallRecord({
    timestampMs: Date.parse('2026-09-01T12:00:00Z'),
    day: '2026-09-01',
    model: 'claude-opus-4-6-thinking'
  }, { ledger, quotaWindows });
  assert.equal(l3.layer, 3);
  assert.equal(l3.email, 'unattributed');

  const sessionDay1 = {
    sessionId: 'sess-cross-midnight',
    client: 'antigravity',
    day: '2026-10-28',
    startedAt: '2026-10-28T23:00:00Z',
    periods: {
      today: { totalTokens: 1000, costUsd: 0.1, models: { 'claude-sonnet-4-6': 1000 }, modelCosts: { 'claude-sonnet-4-6': 0.1 } },
      allTime: { totalTokens: 1000, costUsd: 0.1, models: { 'claude-sonnet-4-6': 1000 }, modelCosts: { 'claude-sonnet-4-6': 0.1 } }
    }
  };
  backend.syncActiveAccountSessions([sessionDay1], { email: 'active@example.com' }, ledger, { save: false });

  const sessionDay2 = {
    sessionId: 'sess-cross-midnight',
    client: 'antigravity',
    day: '2026-10-29',
    startedAt: '2026-10-28T23:00:00Z',
    periods: {
      today: { totalTokens: 600, costUsd: 0.06, models: { 'claude-sonnet-4-6': 600 }, modelCosts: { 'claude-sonnet-4-6': 0.06 } },
      allTime: { totalTokens: 1600, costUsd: 0.16, models: { 'claude-sonnet-4-6': 1600 }, modelCosts: { 'claude-sonnet-4-6': 0.16 } }
    }
  };
  backend.syncActiveAccountSessions([sessionDay2], { email: 'quota@example.com' }, ledger, { save: false });
  assert.equal(ledger.sessionAccounts['sess-cross-midnight'].allocations['active@example.com'].totalTokens, 1000);
  assert.equal(ledger.sessionAccounts['sess-cross-midnight'].allocations['quota@example.com'].totalTokens, 600);
});

test('antigravity-account-ledger groups Argon quotas separately and falls back to Gemini windows', (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-argon-home-'));
  t.after(() => fs.rmSync(tmpHome, { recursive: true, force: true }));

  assert.equal(backend.quotaGroupForModel('gemini-4-argon'), 'argon-weekly');
  assert.equal(backend.quotaGroupForModel('claude-opus-4-6-thinking'), '3p-weekly');
  assert.equal(backend.quotaGroupForModel('gemini-3.8-flash'), 'gemini-weekly');

  const resetTime = '2026-10-31T11:13:09Z';
  const callTs = Date.parse(resetTime) - 2 * 86400_000;
  const argonAccounts = [{
    email: 'argon@example.com',
    quota: {
      quota_groups: [
        {
          display_name: 'Gemini 4 Argon',
          buckets: [{ window: 'weekly', remaining_fraction: 0.4, reset_time: resetTime }]
        }
      ]
    }
  }];
  const argonWindows = backend.buildQuotaAttributionWindows(argonAccounts, { homeDir: tmpHome });
  assert.equal(argonWindows['argon-weekly'].length, 1);
  assert.equal(argonWindows['gemini-weekly'].length, 0);

  const ledger = backend.createDefaultLedger('2026-10-01T00:00:00Z');
  const argonCall = backend.attributeCallRecord({
    timestampMs: callTs,
    model: 'gemini-4-argon'
  }, { ledger, quotaWindows: argonWindows });
  assert.equal(argonCall.email, 'argon@example.com');
  assert.equal(argonCall.source, 'quota_anchor');

  const geminiAccounts = [{
    email: 'gemini@example.com',
    quota: {
      quota_groups: [
        {
          display_name: 'Gemini',
          buckets: [{ bucket_id: 'gemini-weekly', window: 'weekly', remaining_fraction: 0.3, reset_time: resetTime }]
        }
      ]
    }
  }];
  const geminiWindows = backend.buildQuotaAttributionWindows(geminiAccounts, { homeDir: tmpHome });
  assert.equal(geminiWindows['argon-weekly'].length, 0);
  const fallbackCall = backend.attributeCallRecord({
    timestampMs: callTs,
    model: 'gemini-4-argon'
  }, { ledger, quotaWindows: geminiWindows });
  assert.equal(fallbackCall.email, 'gemini@example.com');
  assert.equal(fallbackCall.source, 'quota_anchor');
});

test('antigravity-account-ledger keeps sources free of machine paths and host DOM coupling', () => {
  const forbidden = ['G:' + '\\Temp', 'G:' + '/Temp'];
  for (const file of listPluginFiles(pluginDir)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const needle of forbidden) {
      assert.equal(source.includes(needle), false, `${path.relative(pluginDir, file)} contains ${needle}`);
    }
  }
  const styles = fs.readFileSync(path.join(pluginDir, 'styles.css'), 'utf8');
  assert.equal(styles.includes('.home-module-plugin'), false);
  assert.equal(styles.includes('!important'), false);
  const uiSource = fs.readFileSync(path.join(pluginDir, 'ui.mjs'), 'utf8');
  assert.equal(uiSource.includes('home-module'), false);
  assert.equal(uiSource.includes('assignDateRange'), false);
  assert.equal(uiSource.includes('removeDateRangeRule'), false);
  const backendSource = fs.readFileSync(path.join(pluginDir, 'backend.cjs'), 'utf8');
  const attributionSource = fs.readFileSync(path.join(pluginDir, 'attribution.cjs'), 'utf8');
  for (const name of ['assignDateRange', 'removeDateRangeRule', 'attributionRules']) {
    assert.equal(backendSource.includes(name), false, `backend.cjs still references ${name}`);
    assert.equal(attributionSource.includes(name), false, `attribution.cjs still references ${name}`);
  }
});
