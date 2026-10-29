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

function removeTestDir(dir) {
  if (!dir) return;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { removeTestDir(full); continue; }
      try { fs.unlinkSync(full); } catch (_) {}
    }
  } catch (_) {}
  try { fs.rmdirSync(dir); } catch (_) {}
  try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }); } catch (_) {}
}

function listPluginFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => (
    entry.isDirectory() ? listPluginFiles(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
  ));
}

function cssBlock(css, selector) {
  const index = css.indexOf(`${selector} {`);
  if (index === -1) return null;
  const open = css.indexOf('{', index);
  const close = css.indexOf('}', open);
  if (open === -1 || close === -1) return null;
  return css.slice(open + 1, close);
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
  get textContent() {
    if (this.children.length === 0) return this._text;
    return this.children.map((child) => child.textContent || '').join('');
  }
  set textContent(val) { this._text = String(val ?? ''); }
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
  querySelectorAll(selector) {
    const found = [];
    for (const child of this.children) {
      if (child.matches?.(selector)) found.push(child);
      found.push(...(child.querySelectorAll?.(selector) || []));
    }
    return found;
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
  t.after(() => removeTestDir(tmpDir));
  const instance = await backend.activate({ dataDirectory: tmpDir, hostDataDir: tmpDir, homeDir: tmpDir, conversationDirs: [] });
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
  const expectedEnd = '2026-10-29' === backend.localDayKey() ? null : '2026-10-29';
  assert.deepEqual(prefs, { accountFilter: 'all', startDate: '2026-10-01', endDate: expectedEnd, range: { start: '2026-10-01' } });
  assert.equal('end' in prefs.range, false);
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

function makeTimestampMsg(sec) {
  return Buffer.concat([pbVarintField(1, sec), pbVarintField(2, 0)]);
}

function makeUsageStats({ modelEnum = 1007, input = 100, output = 10, cacheWrite = 0, cacheRead = 0,
  provider = 0, thinking = 0, responseId = null } = {}) {
  const parts = [pbVarintField(1, modelEnum), pbVarintField(2, input), pbVarintField(3, output)];
  if (cacheWrite) parts.push(pbVarintField(4, cacheWrite));
  if (cacheRead) parts.push(pbVarintField(5, cacheRead));
  if (provider) parts.push(pbVarintField(6, provider));
  if (thinking) parts.push(pbVarintField(9, thinking));
  if (responseId) parts.push(pbBytesField(11, responseId));
  return Buffer.concat(parts);
}

function makeStepMetadata({ tsSec = null, usageBuf = null, modelEnum = 0, execId = null } = {}) {
  const parts = [];
  if (tsSec) parts.push(pbBytesField(1, makeTimestampMsg(tsSec)));
  if (usageBuf) parts.push(pbBytesField(9, usageBuf));
  if (modelEnum) parts.push(pbVarintField(11, modelEnum));
  if (execId) parts.push(pbBytesField(12, execId));
  return Buffer.concat(parts);
}

function makeGenData({ usageBuf = null, stepIndexes = [], execId = null, responseModel = null,
  displayName = null, modelEnum = 0 } = {}) {
  const cmParts = [];
  if (modelEnum) cmParts.push(pbVarintField(3, modelEnum));
  if (usageBuf) cmParts.push(pbBytesField(4, usageBuf));
  if (responseModel) cmParts.push(pbBytesField(19, responseModel));
  if (displayName) cmParts.push(pbBytesField(21, displayName));
  const parts = [pbBytesField(1, Buffer.concat(cmParts))];
  if (stepIndexes.length === 1) { parts.push(pbVarintField(2, stepIndexes[0])); }
  else if (stepIndexes.length > 1) {
    parts.push(pbBytesField(2, Buffer.concat(stepIndexes.map((idx) => encodeVarintBuf(idx)))));
  }
  if (execId) parts.push(pbBytesField(4, execId));
  return Buffer.concat(parts);
}

function createConversationDb(dir, name, { steps = [], gens = [] } = {}) {
  const { DatabaseSync } = require('node:sqlite');
  const dbPath = path.join(dir, name);
  const db = new DatabaseSync(dbPath);
  db.exec('CREATE TABLE steps (idx INTEGER PRIMARY KEY, step_type TEXT, status TEXT, metadata BLOB)');
  db.exec('CREATE TABLE gen_metadata (idx INTEGER PRIMARY KEY, data BLOB)');
  const insStep = db.prepare('INSERT INTO steps (idx, step_type, status, metadata) VALUES (?, ?, ?, ?)');
  for (const step of steps) insStep.run(step.idx, step.stepType || 'agent', step.status || 'done', step.metadata);
  const insGen = db.prepare('INSERT INTO gen_metadata (idx, data) VALUES (?, ?)');
  for (const gen of gens) insGen.run(gen.idx, gen.data);
  db.close();
  return dbPath;
}

const tick = (ms = 0) => new Promise(resolve => setTimeout(resolve, ms));
function dispatch(element, type) {
  for (const fn of element.listeners.get(type) || []) fn({ target: element });
}

test('antigravity-account-ledger decodes SQLite Protobuf generation records, step attributes, tiered pricing, and WAL fallback', (t) => {
  const { DatabaseSync } = require('node:sqlite');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-db-scan-test-'));
  t.after(() => removeTestDir(tmpDir));

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
  t.after(() => removeTestDir(tmpHome));

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
  t.after(() => removeTestDir(tmpHome));

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
  t.after(() => removeTestDir(tmpHome));

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
  t.after(() => removeTestDir(tmpHome));

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

test('antigravity-account-ledger resolves models by response/display/enum priority and falls back last', () => {
  const enumFirst = backend.resolveModelAndPrice({ modelEnum: 1007, fallbackModel: 'claude-sonnet-4-6' });
  assert.equal(enumFirst.model, 'gemini-2.5-pro');
  assert.equal(enumFirst.modelBasis, 'model_enum_map');

  const displayFirst = backend.resolveModelAndPrice({ displayName: 'Claude Opus 4.6 (Thinking)', fallbackModel: 'gemini-3.8-flash' });
  assert.equal(displayFirst.model, 'claude-opus-4-6-thinking');
  assert.equal(displayFirst.modelBasis, 'chat_model.model_display_name');

  const responseFirst = backend.resolveModelAndPrice({
    responseModel: 'gemini-3.8-flash-tiered',
    displayName: 'Claude Opus 4.6 (Thinking)',
    modelEnum: 1026
  });
  assert.equal(responseFirst.model, 'gemini-3.8-flash-tiered');
  assert.equal(responseFirst.modelBasis, 'chat_model.response_model');

  const fallbackLast = backend.resolveModelAndPrice({ fallbackModel: 'Claude Sonnet 4.6' });
  assert.equal(fallbackLast.model, 'claude-sonnet-4-6');
  assert.equal(fallbackLast.modelBasis, 'conversation_fallback');

  const placeholder = backend.resolveModelAndPrice({ modelEnum: 5000, fallbackModel: 'gemini-3.8-flash' });
  assert.equal(placeholder.model, 'MODEL_PLACEHOLDER_M4000');
  assert.equal(placeholder.modelBasis, 'model_enum_placeholder');
});

test('antigravity-account-ledger aligns generation usage with steps without double counting or stale models', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-align-test-'));
  t.after(() => removeTestDir(tmpDir));

  const baseSec = 1793000000;
  const usageShared = makeUsageStats({ modelEnum: 1007, input: 200, output: 20, responseId: 'resp-shared' });
  const usageNoRid = makeUsageStats({ modelEnum: 1007, input: 300, output: 30 });
  const usageCustom = makeUsageStats({ modelEnum: 0, input: 120, output: 12, responseId: 'resp-custom' });
  const usageRef = makeUsageStats({ modelEnum: 1318, input: 90, output: 9, responseId: 'resp-ref' });
  const usageStep7 = makeUsageStats({ modelEnum: 0, input: 50, output: 5 });
  const usageStep8 = makeUsageStats({ modelEnum: 0, input: 70, output: 7 });

  const dbPath = createConversationDb(tmpDir, 'conv-align.db', {
    steps: [
      { idx: 4, metadata: makeStepMetadata({ tsSec: baseSec + 4, usageBuf: usageNoRid }) },
      { idx: 5, metadata: makeStepMetadata({ tsSec: baseSec + 5, usageBuf: usageShared }) },
      { idx: 7, metadata: makeStepMetadata({ tsSec: baseSec + 7, usageBuf: usageStep7 }) },
      { idx: 8, metadata: Buffer.concat([
        makeStepMetadata({ tsSec: baseSec + 8, usageBuf: usageStep8 }),
        pbBytesField(20, pbVarintField(3, 2))
      ]) }
    ],
    gens: [
      { idx: 1, data: makeGenData({ usageBuf: usageShared, stepIndexes: [5] }) },
      { idx: 2, data: makeGenData({ usageBuf: usageCustom, stepIndexes: [2], displayName: 'Custom Model X' }) },
      { idx: 3, data: makeGenData({ usageBuf: usageRef, stepIndexes: [3] }) },
      { idx: 4, data: makeGenData({ usageBuf: usageNoRid, stepIndexes: [4] }) }
    ]
  });

  const calls = backend.scanConversationDb(dbPath);
  assert.equal(calls.length, 6);

  const shared = calls.filter((call) => call.responseId === 'resp-shared');
  assert.equal(shared.length, 1);
  assert.equal(shared[0].originTable, 'gen_metadata');
  assert.equal(shared[0].alignmentMode, 'both');

  assert.equal(calls.filter((call) => call.originTable === 'gen_metadata' && call.stepIdx === 4).length, 1);
  assert.equal(calls.some((call) => call.originTable === 'steps' && (call.stepIdx === 4 || call.stepIdx === 5)), false);

  const custom = calls.find((call) => call.responseId === 'resp-custom');
  assert.equal(custom.model, 'custom-model-x');

  const step7 = calls.find((call) => call.originTable === 'steps' && call.stepIdx === 7);
  assert.equal(step7.model, 'gemini-2.5-pro');
  const step8 = calls.find((call) => call.originTable === 'steps' && call.stepIdx === 8);
  assert.equal(step8.model, 'custom-model-x');
});

test('antigravity-account-ledger rejects stale and malformed DB scan caches', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-cache-test-'));
  t.after(() => removeTestDir(tmpDir));

  const usage = makeUsageStats({ modelEnum: 1007, input: 40, output: 4, responseId: 'resp-cache' });
  const dbPath = createConversationDb(tmpDir, 'conv-cache.db', {
    gens: [{ idx: 1, data: makeGenData({ usageBuf: usage, stepIndexes: [1] }) }]
  });
  const cacheFile = path.join(tmpDir, 'cache.json');
  backend.GLOBAL_DB_SCAN_CACHE.clear();
  const first = backend.scanAllConversationDbs({ conversationDirs: [tmpDir], cacheFile });
  assert.equal(first.length, 1);

  const written = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  assert.equal(backend.DB_CACHE_VERSION, 2);
  assert.equal(written.version, 2);
  assert.ok(Array.isArray(written.entries[dbPath].calls));

  written.version = 1;
  written.entries[dbPath].calls.push({ responseId: 'cached-only', model: 'poisoned-model', totalTokens: 999 });
  fs.writeFileSync(cacheFile, JSON.stringify(written));
  backend.GLOBAL_DB_SCAN_CACHE.clear();
  const second = backend.scanAllConversationDbs({ conversationDirs: [tmpDir], cacheFile });
  assert.deepEqual(second.map((call) => call.responseId), ['resp-cache']);
  assert.equal(JSON.parse(fs.readFileSync(cacheFile, 'utf8')).version, 2);

  const malformed = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  malformed.entries[dbPath].calls = 'not-an-array';
  fs.writeFileSync(cacheFile, JSON.stringify(malformed));
  backend.GLOBAL_DB_SCAN_CACHE.clear();
  const third = backend.scanAllConversationDbs({ conversationDirs: [tmpDir], cacheFile });
  assert.deepEqual(third.map((call) => call.responseId), ['resp-cache']);
  assert.ok(Array.isArray(JSON.parse(fs.readFileSync(cacheFile, 'utf8')).entries[dbPath].calls));
});

test('antigravity-account-ledger snapshots WAL databases without copying invalid WAL frames', (t) => {
  const { DatabaseSync } = require('node:sqlite');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-wal-test-'));
  const tempRoot = path.join(tmpDir, 'temp');
  fs.mkdirSync(tempRoot, { recursive: true });
  const prevTemp = process.env.TEMP;
  const prevTmp = process.env.TMP;
  process.env.TEMP = tempRoot;
  process.env.TMP = tempRoot;
  t.after(() => {
    process.env.TEMP = prevTemp;
    process.env.TMP = prevTmp;
    removeTestDir(tmpDir);
  });

  const dbPath = createConversationDb(tmpDir, 'conv-wal.db', {
    gens: [{ idx: 1, data: makeGenData({ usageBuf: makeUsageStats({ responseId: 'resp-wal' }), stepIndexes: [1] }) }]
  });
  const wdb = new DatabaseSync(dbPath);
  wdb.exec('PRAGMA journal_mode=WAL');
  wdb.close();
  fs.writeFileSync(`${dbPath}-wal`, Buffer.from('corrupt-or-locked-wal-header'));
  fs.mkdirSync(`${dbPath}-shm`);

  const handle = backend.openConversationDbWithFallback(dbPath);
  assert.ok(handle);
  const snapDirs = fs.readdirSync(tempRoot).filter((name) => name.startsWith('ag-db-snap-'));
  assert.equal(snapDirs.length, 1);
  const snapFiles = fs.readdirSync(path.join(tempRoot, snapDirs[0]));
  assert.equal(snapFiles.some((name) => name.endsWith('-wal')), false);
  assert.equal(handle.db.prepare('SELECT idx FROM gen_metadata').all().length, 1);
  handle.close();
});

test('antigravity-account-ledger reads camelCase quota buckets, keeps the newest quota, and prefers the later reset on ties', (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-quota-home-'));
  t.after(() => removeTestDir(tmpHome));

  const resetEarly = '2026-10-30T00:00:00Z';
  const resetLate = '2026-11-05T00:00:00Z';
  const windows = backend.buildQuotaAttributionWindows([
    {
      email: 'argon@example.com',
      created_at: 1790000000,
      last_used: 1793000000,
      quota: {
        last_updated: 1793000000,
        groups: [{
          displayName: 'Gemini 4 Argon',
          buckets: [
            { bucketId: 'gemini-argon-wtu-weekly', window: 'wtu', remainingFraction: 0.4, resetTime: resetEarly },
            { bucketId: 'gemini-argon-wtu-weekly', window: 'wtu', remainingFraction: 0.4, resetTime: resetLate }
          ]
        }]
      }
    },
    {
      email: 'quota@example.com',
      created_at: 1790000000,
      last_used: 1791000000,
      quota: {
        last_updated: 1791000000,
        groups: [{
          displayName: 'Gemini',
          buckets: [
            { bucketId: 'gemini-weekly', window: 'weekly', remainingFraction: 0.6, resetTime: resetLate },
            { bucketId: 'gemini-weekly', window: 'weekly', remainingFraction: 0.6, resetTime: resetEarly }
          ]
        }]
      }
    },
    {
      email: 'quota@example.com',
      created_at: 1790000000,
      last_used: 1793200000,
      quota: {
        last_updated: 1793200000,
        groups: [{
          displayName: 'Gemini',
          buckets: [{ bucketId: 'gemini-weekly', window: 'weekly', remainingFraction: 0.4, resetTime: resetEarly }]
        }]
      }
    }
  ], { homeDir: tmpHome });

  const argon = windows['argon-weekly'];
  assert.equal(argon.length, 1);
  assert.equal(argon[0].remainingFraction, 0.4);
  assert.equal(argon[0].endMs, Date.parse(resetLate));

  const gemini = windows['gemini-weekly'];
  assert.equal(gemini.length, 1);
  assert.equal(gemini[0].remainingFraction, 0.4);
  assert.equal(gemini[0].endMs, Date.parse(resetEarly));
  assert.equal(windows['3p-weekly'].length, 0);
});

test('antigravity-account-ledger merges accounts across sources, tolerates old token_stats schemas, and skips disabled accounts', (t) => {
  const { DatabaseSync } = require('node:sqlite');
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-discover-home-'));
  const tmpHomeModern = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-discover-modern-'));
  const prevCliHome = process.env.GEMINI_CLI_HOME;
  const cliHome = path.join(tmpHome, 'cli-home');
  process.env.GEMINI_CLI_HOME = cliHome;
  t.after(() => {
    if (prevCliHome === undefined) delete process.env.GEMINI_CLI_HOME;
    else process.env.GEMINI_CLI_HOME = prevCliHome;
    removeTestDir(tmpHome);
    removeTestDir(tmpHomeModern);
  });

  const toolsDir = path.join(tmpHome, '.antigravity_tools');
  const accountsDir = path.join(toolsDir, 'accounts');
  fs.mkdirSync(accountsDir, { recursive: true });
  fs.writeFileSync(path.join(toolsDir, 'accounts.json'), JSON.stringify({
    current_account_id: 'acc-disabled',
    accounts: [
      { id: 'acc-disabled', email: 'disabled@example.com', name: 'Disabled User', disabled: true },
      { id: 'acc-old', email: 'merge@example.com', name: 'Merge User', created_at: 1790000000 }
    ]
  }), 'utf8');
  fs.writeFileSync(path.join(accountsDir, 'acc-merge.json'), JSON.stringify({
    id: 'acc-merge',
    email: 'merge@example.com',
    name: 'Merge User',
    created_at: '2026-09-25T00:00:00Z',
    last_used: 1793200000,
    quota: {
      quota_groups: [{
        display_name: 'Claude / GPT',
        buckets: [{ bucket_id: '3p-weekly', window: 'weekly', remaining_fraction: 0.5, reset_time: '2026-10-31T00:00:00Z' }]
      }]
    }
  }), 'utf8');

  const statsDb = new DatabaseSync(path.join(toolsDir, 'token_stats.db'));
  statsDb.exec('CREATE TABLE token_usage (id INTEGER PRIMARY KEY, timestamp INTEGER, account_email TEXT, total_tokens INTEGER)');
  const insertOld = statsDb.prepare('INSERT INTO token_usage (timestamp, account_email, total_tokens) VALUES (?, ?, ?)');
  insertOld.run(1790000000, 'stats@example.com', 500);
  insertOld.run(1790000001, 'unattributed', 700);
  statsDb.close();

  const discovered = backend.discoverAccounts({ homeDir: tmpHome, platform: 'linux' });
  const byEmail = Object.fromEntries(discovered.map((account) => [account.email, account]));
  assert.ok(byEmail['stats@example.com']);
  assert.ok(byEmail['stats@example.com'].sources.includes('tools_token_stats'));
  assert.equal(byEmail.unattributed, undefined);
  assert.equal(byEmail['merge@example.com'].createdAt, 1790000000);

  const quotaWindows = backend.buildQuotaAttributionWindows(discovered, { homeDir: tmpHome });
  assert.equal(quotaWindows['3p-weekly'].length, 1);

  const current = backend.discoverCurrentAccount({ homeDir: tmpHome, platform: 'linux' });
  assert.equal(current, null);

  const modernToolsDir = path.join(tmpHomeModern, '.antigravity_tools');
  fs.mkdirSync(modernToolsDir, { recursive: true });
  const modernDb = new DatabaseSync(path.join(modernToolsDir, 'token_stats.db'));
  modernDb.exec('CREATE TABLE token_usage (id INTEGER PRIMARY KEY, timestamp INTEGER, account_email TEXT, model TEXT, input_tokens INTEGER, output_tokens INTEGER, total_tokens INTEGER)');
  const insertModern = modernDb.prepare('INSERT INTO token_usage (timestamp, account_email, model, input_tokens, output_tokens, total_tokens) VALUES (?, ?, ?, ?, ?, ?)');
  insertModern.run(1790100000, 'input-only@example.com', 'gemini-3.8-flash', 60, 0, 0);
  insertModern.run(1790100001, 'empty@example.com', 'gemini-3.8-flash', 0, 0, 0);
  modernDb.close();
  const modernWindows = backend.discoverToolsTokenStatsWindows({ homeDir: tmpHomeModern });
  assert.equal(modernWindows.length, 1);
  assert.equal(modernWindows[0].email, 'input-only@example.com');
});

test('antigravity-account-ledger preserves manual session bindings and migrates legacy allocations per day', () => {
  const ledger = backend.createDefaultLedger('2026-10-01T00:00:00Z');
  ledger.sessionAccounts.sessManual = {
    email: 'manual@example.com',
    source: 'manual',
    allocations: { 'manual@example.com': { totalTokens: 10, costUsd: 0, models: {} } }
  };
  const manualSession = {
    sessionId: 'sessManual',
    client: 'antigravity',
    day: '2026-10-29',
    periods: { today: { totalTokens: 500, costUsd: 0.5 } }
  };
  const sync = backend.syncActiveAccountSessions([manualSession], { email: 'other@example.com' }, ledger, { save: false });
  assert.equal(sync.changed, false);
  assert.equal(ledger.sessionAccounts.sessManual.email, 'manual@example.com');
  assert.equal(ledger.sessionAccounts.sessManual.allocations['manual@example.com'].totalTokens, 10);
  const attribution = backend.attributeSession(manualSession, ledger, { activeAccount: { email: 'other@example.com' } });
  assert.equal(attribution.email, 'manual@example.com');
  assert.equal(attribution.source, 'manual');

  const legacyMetrics = {
    totalTokens: 1000,
    costUsd: 1,
    inputTokens: 900,
    outputTokens: 100,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    models: { 'claude-sonnet-4-6': { tokens: 1000, costUsd: 1, inputTokens: 900, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0 } }
  };
  const legacyLedger = backend.createDefaultLedger('2026-10-01T00:00:00Z');
  legacyLedger.sessionAccounts.sessLegacy = {
    email: 'a@example.com',
    source: 'active_account',
    lastDay: '2026-10-28',
    allocations: { 'a@example.com': legacyMetrics },
    lastSnapshot: backend.cloneMetrics(legacyMetrics)
  };
  const legacySession = {
    sessionId: 'sessLegacy',
    client: 'antigravity',
    day: '2026-10-29',
    periods: { today: { totalTokens: 200, costUsd: 0.2 }, allTime: { totalTokens: 1200, costUsd: 1.2 } }
  };
  backend.syncActiveAccountSessions([legacySession], { email: 'b@example.com' }, legacyLedger, { save: false });
  const binding = legacyLedger.sessionAccounts.sessLegacy;
  assert.equal(binding.allocations['a@example.com'].totalTokens, 1000);
  assert.equal(binding.allocations['b@example.com'].totalTokens, 200);
  assert.equal(backend.allocationsForDay(binding, '2026-10-28')['a@example.com'].totalTokens, 1000);
  assert.equal(backend.allocationsForDay(binding, '2026-10-29')['b@example.com'].totalTokens, 200);
  assert.equal(backend.allocationsForDay(binding, '2026-10-30'), null);
});

test('antigravity-account-ledger reads per-day allocations for cross-midnight sessions and daily history', () => {
  const ledger = backend.createDefaultLedger('2026-10-01T00:00:00Z');
  const sessionDay1 = {
    sessionId: 'sess-cross-midnight',
    client: 'antigravity',
    day: '2026-10-28',
    startedAt: '2026-10-28T23:00:00Z',
    periods: {
      today: { totalTokens: 1000, costUsd: 1 },
      allTime: { totalTokens: 1000, costUsd: 1 }
    }
  };
  backend.syncActiveAccountSessions([sessionDay1], { email: 'active@example.com' }, ledger, { save: false });
  const sessionDay2 = {
    sessionId: 'sess-cross-midnight',
    client: 'antigravity',
    day: '2026-10-29',
    startedAt: '2026-10-28T23:00:00Z',
    periods: {
      today: { totalTokens: 600, costUsd: 0.6 },
      allTime: { totalTokens: 1600, costUsd: 1.6 }
    }
  };
  backend.syncActiveAccountSessions([sessionDay2], { email: 'quota@example.com' }, ledger, { save: false });
  const binding = ledger.sessionAccounts['sess-cross-midnight'];
  assert.equal(backend.allocationsForDay(binding, '2026-10-28')['active@example.com'].totalTokens, 1000);
  assert.equal(backend.allocationsForDay(binding, '2026-10-29')['quota@example.com'].totalTokens, 600);

  const dailyHistory = {
    days: {
      '2026-10-28': { observations: { a: { client: 'antigravity', tokens: 1000, cost: 1, model: 'claude-sonnet-4-6' } } },
      '2026-10-29': { observations: { b: { client: 'antigravity', tokens: 600, cost: 0.6, model: 'claude-sonnet-4-6' } } }
    }
  };
  const aggregated = backend.aggregateAccountUsage({
    sessions: [sessionDay2],
    dailyHistory,
    ledger,
    quotaWindows: {},
    range: { start: '2026-10-28', end: '2026-10-29' }
  });
  assert.equal(aggregated.byAccount['quota@example.com'].totalTokens, 600);
  assert.equal(aggregated.byAccount['active@example.com'].totalTokens, 1000,
    'the earlier day of a cross-midnight session must stay attributed to its account');
  assert.equal(aggregated.byAccount.unattributed?.totalTokens || 0, 0,
    'a cross-midnight session must not fall back into unattributed');
  assert.equal(aggregated.overallTotalTokens, 1600);

  const fallback = backend.aggregateAccountUsage({
    sessions: [sessionDay2],
    dailyHistory: [],
    ledger,
    quotaWindows: {},
    range: { start: '2026-10-28', end: '2026-10-29' }
  });
  assert.equal(fallback.byAccount['quota@example.com'].totalTokens, 600);
  assert.equal(fallback.byAccount['active@example.com'].totalTokens, 1000,
    'without daily history every recorded day of the session must be summed');
  assert.equal(fallback.overallTotalTokens, 1600);
});

test('antigravity-account-ledger attributes sessions with the supplied active account and merges live daily history', () => {
  const ledger = backend.createDefaultLedger('2026-10-01T00:00:00Z');
  ledger.lastActiveAccount = 'stale@example.com';
  const session = {
    sessionId: 'sess-fresh',
    client: 'antigravity',
    day: '2026-10-29',
    periods: { today: { totalTokens: 400, costUsd: 0.4 }, allTime: { totalTokens: 400, costUsd: 0.4 } }
  };
  const res = backend.aggregateAccountUsage({
    sessions: [session],
    dailyHistory: [],
    ledger,
    quotaWindows: {},
    range: { start: '2026-10-28', end: '2026-10-29' },
    activeAccount: { email: 'fresh@example.com' }
  });
  assert.equal(res.byAccount['fresh@example.com'].totalTokens, 400);
  assert.equal(res.byAccount['stale@example.com'], undefined);

  const merged = backend.aggregateAccountUsage({
    calls: null,
    sessions: [],
    ledger,
    quotaWindows: {},
    range: { start: '2026-10-28', end: '2026-10-29' },
    dailyHistory: {
      days: {
        '2026-10-28': { observations: { o: { client: 'antigravity', tokens: 100, model: 'day-model' } } },
        '2026-10-29': { observations: { o: { client: 'antigravity', tokens: 300, model: 'day-model' } } }
      },
      liveDays: {
        '2026-10-28': { observations: { o: { client: 'antigravity', tokens: 200, model: 'live-model' } } },
        '2026-10-29': { observations: { o: { client: 'antigravity', tokens: 300, quality: 2, model: 'live-model' } } }
      }
    }
  });
  assert.equal(merged.overallTotalTokens, 500);
  assert.equal(merged.models['live-model'].tokens, 500);
  assert.equal(merged.models['day-model'], undefined);
});

test('antigravity-account-ledger compares timeline and session timestamps as epochs', () => {
  const ledger = backend.createDefaultLedger('2026-10-01T00:00:00Z');
  backend.recordAccountHeartbeat({ email: 'a@example.com', source: 'antigravity_tools' }, '2026-10-28T10:00:00+08:00', ledger);
  assert.equal(ledger.timeline.length, 1);
  assert.equal(ledger.timeline[0].startedAt, '2026-10-28T02:00:00.000Z');
  ledger.timeline[0].endedAt = '2026-10-28T09:00:00Z';
  backend.recordAccountHeartbeat({ email: 'a@example.com' }, '2026-10-28T10:30:00+08:00', ledger);
  assert.equal(ledger.timeline.length, 1);
  assert.equal(ledger.timeline[0].endedAt, '2026-10-28T09:00:00Z');

  const attribution = backend.attributeCallRecord({
    timestampMs: Date.parse('2026-10-28T03:00:00Z'),
    day: '2026-10-28',
    model: 'gemini-3.8-flash'
  }, { ledger, quotaWindows: {} });
  assert.equal(attribution.email, 'a@example.com');
  assert.equal(attribution.source, 'antigravity_tools');

  const earlyLedger = backend.createDefaultLedger('2026-10-28T00:00:00Z');
  const earlySession = {
    sessionId: 'sess-early-offset',
    client: 'antigravity',
    startedAt: '2026-10-28T07:00:00+08:00',
    periods: { allTime: { totalTokens: 500 }, month: { totalTokens: 500 } }
  };
  const sync = backend.syncActiveAccountSessions([earlySession], { email: 'a@example.com' }, earlyLedger, { save: false });
  assert.equal(sync.changed, false);
  assert.equal(earlyLedger.sessionAccounts['sess-early-offset'], undefined);
});

test('antigravity-account-ledger derives measured input tokens and caps CLI log windows at 24 hours', (t) => {
  const derived = backend.extractObsMetrics({ tokens: 100, outputTokens: 20, cacheReadTokens: 15, cacheWriteTokens: 10 });
  assert.equal(derived.inputTokens, 55);
  const explicit = backend.extractObsMetrics({ tokens: 100, inputTokens: 20, outputTokens: 20, cacheReadTokens: 15, cacheWriteTokens: 10 });
  assert.equal(explicit.inputTokens, 20);

  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-cli-cap-home-'));
  t.after(() => removeTestDir(tmpHome));
  const cliLogDir = path.join(tmpHome, 'cli-log');
  fs.mkdirSync(cliLogDir);
  const logFile = path.join(cliLogDir, 'cli-20261006_214817.log');
  fs.writeFileSync(logFile, 'I1006 21:48:19.297368 12345 server_oauth.go:322] applyAuthResult: email=cli-cap@example.com\n', 'utf8');
  const startMs = new Date(2026, 9, 6, 21, 48, 19, 297).getTime();
  const lateMtime = (startMs + 30 * 86400_000) / 1000;
  fs.utimesSync(logFile, lateMtime, lateMtime);

  const windows = backend.discoverCliLogWindows({ cliLogDir });
  assert.equal(windows.length, 1);
  assert.equal(windows[0].email, 'cli-cap@example.com');
  assert.equal(windows[0].startMs, startMs - 5_000);
  assert.equal(windows[0].endMs, startMs + 24 * 60 * 60 * 1000);
});

test('antigravity-account-ledger deduplicates archived sessions and reads legacy JSON archives', (t) => {
  const { DatabaseSync } = require('node:sqlite');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-archive-root-'));
  const rootLegacy = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-archive-legacy-'));
  t.after(() => {
    removeTestDir(root);
    removeTestDir(rootLegacy);
  });

  const archiveDir = path.join(root, 'tokscale-cache', 'antigravity-archive');
  fs.mkdirSync(archiveDir, { recursive: true });
  const db = new DatabaseSync(path.join(root, 'session-usage-archive.sqlite'));
  db.exec('CREATE TABLE sessions (entry_json TEXT)');
  const insert = db.prepare('INSERT INTO sessions (entry_json) VALUES (?)');
  insert.run(JSON.stringify({ sessionId: 's1', client: 'antigravity', totalTokens: 100 }));
  insert.run(JSON.stringify({ sessionId: 's2', client: 'antigravity', totalTokens: 50 }));
  db.close();
  fs.writeFileSync(path.join(root, 'session-usage-archive.json'), JSON.stringify({
    version: 1,
    sessions: {
      'antigravity:s1': { totalTokens: 900 },
      'antigravity:s3': { totalTokens: 30 }
    }
  }), 'utf8');
  fs.writeFileSync(path.join(archiveDir, 'a.json'), JSON.stringify({ sessions: [{ sessionId: 's4', totalTokens: 40 }] }), 'utf8');
  fs.writeFileSync(path.join(archiveDir, 'b.json'), JSON.stringify({ sessionId: 's5', totalTokens: 60 }), 'utf8');

  const entries = backend.loadArchivedSessions(root);
  assert.deepEqual(entries.map((entry) => entry.sessionId).sort(), ['s1', 's2', 's3', 's4', 's5']);
  const byId = Object.fromEntries(entries.map((entry) => [entry.sessionId, entry]));
  assert.equal(byId.s1.totalTokens, 100);
  assert.equal(byId.s3.totalTokens, 30);
  assert.equal(byId.s4.totalTokens, 40);
  assert.equal(byId.s5.totalTokens, 60);

  const legacyDir = path.join(rootLegacy, 'tokscale-cache', 'antigravity-archive');
  fs.mkdirSync(legacyDir, { recursive: true });
  fs.writeFileSync(path.join(legacyDir, 'x.json'), JSON.stringify({ sessionId: 's1', totalTokens: 100 }), 'utf8');
  fs.writeFileSync(path.join(legacyDir, 'y.json'), JSON.stringify({ sessionId: 's1', totalTokens: 900 }), 'utf8');
  const legacyEntries = backend.loadArchivedSessions(rootLegacy);
  assert.equal(legacyEntries.length, 1);
  assert.equal(legacyEntries[0].totalTokens, 900);
});

test('antigravity-account-ledger backs up corrupt ledgers and rejects impossible timestamps', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-ledger-corrupt-'));
  t.after(() => removeTestDir(tmpDir));
  const ledgerFile = path.join(tmpDir, backend.DEFAULT_LEDGER_FILENAME);
  fs.writeFileSync(ledgerFile, '{not valid json', 'utf8');
  const ledger = backend.loadLedger(ledgerFile);
  assert.equal(ledger.timeline.length, 0);
  const backups = fs.readdirSync(tmpDir).filter((name) => name.startsWith(`${backend.DEFAULT_LEDGER_FILENAME}.corrupt-`));
  assert.equal(backups.length, 1);
  const rewritten = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  assert.equal(rewritten.version, 1);

  assert.equal(backend.decodeTimestamp(pbVarintField(1, 0)), null);
  assert.equal(backend.decodeTimestamp(pbVarintField(1, 2 ** 60)), null);
  assert.equal(backend.decodeTimestamp(Buffer.concat([pbVarintField(1, 1793000000), pbVarintField(2, 1_000_000_000)])), null);
  assert.equal(backend.localDayKey('not-a-date'), '');
  assert.equal(backend.localDayKey(new Date('invalid')), '');
  assert.ok(backend.decodeTimestamp(pbVarintField(1, 1793000000)) > 0);
});

test('antigravity-account-ledger auto refresh publishes on a timer, respects visibility, and never publishes explicit reads', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-refresh-test-'));
  t.after(() => removeTestDir(tmpDir));
  const published = [];
  const instance = await backend.activate({
    dataDirectory: tmpDir,
    hostDataDir: tmpDir,
    homeDir: tmpDir,
    conversationDirs: [],
    autoRefreshIntervalMs: 30,
    publish: (value) => published.push(value)
  });
  t.after(() => instance.dispose());

  const today = backend.localDayKey();
  const initial = await instance.call('getSummary', {});
  assert.equal(published.length, 0);
  assert.equal(initial.accountFilter, 'all');
  assert.equal(initial.summary.accountFilter, 'all');
  assert.deepEqual(initial.range, { start: `${today.slice(0, 7)}-01`, end: today });
  assert.equal(fs.existsSync(path.join(tmpDir, 'preferences.json')), false);

  await instance.call('getSummary', { range: { start: '2026-10-01', end: '2026-10-29' }, accountFilter: 'all', auto: true });
  assert.equal(fs.existsSync(path.join(tmpDir, 'preferences.json')), false);

  await instance.call('getSummary', { range: { start: '2026-10-01', end: '2026-10-29' }, accountFilter: 'all' });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmpDir, 'preferences.json'), 'utf8')), {
    accountFilter: 'all',
    startDate: '2026-10-01',
    endDate: '2026-10-29' === backend.localDayKey() ? null : '2026-10-29',
    range: { start: '2026-10-01' }
  });

  await tick(150);
  assert.ok(published.length >= 1);
  instance.update({ visible: false });
  const hiddenCount = published.length;
  await tick(150);
  assert.equal(published.length, hiddenCount);

  instance.update({ visible: true });
  await tick(60);
  assert.ok(published.length > hiddenCount);
  instance.dispose();
  const disposedCount = published.length;
  await tick(120);
  assert.equal(published.length, disposedCount);
});

test('antigravity-account-ledger migrates host ledgers when the data directory lives under plugin-data', async (t) => {
  const hostRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-hostdata-test-'));
  t.after(() => removeTestDir(hostRoot));
  const dataDirectory = path.join(hostRoot, 'plugin-data', 'antigravity-account-ledger');
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.writeFileSync(path.join(hostRoot, backend.DEFAULT_LEDGER_FILENAME), JSON.stringify({
    version: 1,
    featureActivatedAt: '2026-10-01T00:00:00Z',
    timeline: [],
    sessionAccounts: {}
  }), 'utf8');

  const instance = await backend.activate({
    dataDirectory,
    homeDir: path.join(hostRoot, 'home'),
    conversationDirs: []
  });
  t.after(() => instance.dispose());
  await instance.call('getSummary', { range: { start: '2026-10-01', end: '2026-10-29' } });
  const migratedFile = path.join(dataDirectory, backend.DEFAULT_LEDGER_FILENAME);
  assert.ok(fs.existsSync(migratedFile));
  assert.equal(JSON.parse(fs.readFileSync(migratedFile, 'utf8')).featureActivatedAt, '2026-10-01T00:00:00Z');
});

test('antigravity-account-ledger UI adopts persisted filters and refreshes silently when visible again', async () => {
  const { activate } = await import('../plugins/antigravity-account-ledger/ui.mjs');
  const dom = installFakeDom();
  try {
    const calls = [];
    const persisted = {
      summary: { ...summaryFixture().summary, accountFilter: 'persisted@example.com' },
      discoveredAccounts: [{ email: 'persisted@example.com', displayName: 'Persisted' }],
      activeAccount: null,
      accountFilter: 'persisted@example.com',
      range: { start: '2026-09-01', end: '2026-09-30' }
    };
    const ui = activate({
      backend: {
        async call(method, payload) {
          calls.push({ method, payload });
          if (calls.length > 1) throw new Error('silent scan failed');
          return persisted;
        },
        subscribe() { return () => {}; }
      }
    });
    const container = new FakeElement('div');
    const mounted = ui.mount(container, { visible: false });
    const root = container.querySelector('.ag-ledger-root');
    assert.equal(root.classList.contains('hidden'), true);
    await tick(20);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0].payload, {});

    const dateInputs = root.querySelectorAll('.ag-ledger-date');
    assert.equal(dateInputs.length, 2);
    assert.equal(dateInputs[0].value, '2026-09-01');
    assert.equal(dateInputs[1].value, '2026-09-30');
    const select = root.querySelector('.ag-ledger-select');
    assert.equal(select.value, 'persisted@example.com');
    const banner = root.querySelector('.ag-ledger-status-banner');
    assert.equal(banner.classList.contains('hidden'), true);

    mounted.update({ visible: true });
    await tick(20);
    assert.equal(root.classList.contains('hidden'), false);
    assert.equal(calls.length, 2);
    assert.deepEqual(calls[1].payload, {
      range: { start: '2026-09-01', end: backend.localDayKey() },
      accountFilter: 'persisted@example.com',
      auto: true
    });
    assert.equal(dateInputs[1].value, backend.localDayKey());
    assert.equal(banner.classList.contains('hidden'), true);
    assert.equal(banner.textContent, '');
    assert.equal(root.querySelectorAll('.ag-ledger-kpi-card').length, 3);
    assert.equal(root.querySelector('.ag-ledger-status-text'), null);
    mounted.dispose();
  } finally {
    dom.restore();
  }
});

test('antigravity-account-ledger UI queues filter changes, unions account options, and renders cache-write columns', async () => {
  const { activate } = await import('../plugins/antigravity-account-ledger/ui.mjs');
  const dom = installFakeDom();
  try {
    const pending = [];
    const ui = activate({
      backend: {
        call(method, payload) {
          return new Promise((resolve) => pending.push({ payload, resolve }));
        },
        subscribe() { return () => {}; }
      }
    });
    const container = new FakeElement('div');
    const mounted = ui.mount(container, {});
    const root = container.querySelector('.ag-ledger-root');
    const dateInputs = root.querySelectorAll('.ag-ledger-date');
    const select = root.querySelector('.ag-ledger-select');
    assert.equal(pending.length, 1);

    dateInputs[0].value = '2026-10-05';
    dispatch(dateInputs[0], 'change');
    dateInputs[1].value = '2026-10-20';
    dispatch(dateInputs[1], 'change');
    select.value = 'z@example.com';
    dispatch(select, 'change');
    assert.equal(pending.length, 1);

    const accountRows = [{ email: 'summary@example.com', displayName: 'Summary', totalTokens: 10, costUsd: 0, percentageOfTotal: 100 }];
    pending[0].resolve({
      summary: { ...summaryFixture().summary, accounts: accountRows },
      discoveredAccounts: [{ email: 'a@example.com', displayName: 'A' }, { email: 'b@example.com', displayName: 'B' }],
      ledger: { timeline: [{ email: 'c@example.com' }], sessionAccounts: { s: { email: 'd@example.com' } } },
      accountFilter: 'all',
      range: { start: '2026-10-01', end: '2026-10-31' }
    });
    await tick(20);
    assert.equal(pending.length, 2);
    assert.deepEqual(pending[1].payload, {
      range: { start: '2026-10-05', end: '2026-10-20' },
      accountFilter: 'z@example.com'
    });
    assert.equal(pending[1].payload.auto, undefined);

    pending[1].resolve({
      summary: {
        ...summaryFixture().summary,
        cacheWriteTokens: 12,
        accounts: [],
        models: {
          'claude-opus-4-6': { tokens: 12, costUsd: 0.01, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 12, reasoningTokens: 0 }
        }
      },
      discoveredAccounts: [{ email: 'a@example.com', displayName: 'A' }, { email: 'b@example.com', displayName: 'B' }],
      ledger: { timeline: [{ email: 'c@example.com' }], sessionAccounts: { s: { email: 'd@example.com' } } },
      accountFilter: 'all',
      range: { start: '2026-10-05', end: '2026-10-20' }
    });
    await tick(20);

    const optionValues = select.children.filter((child) => child.tagName === 'OPTION').map((option) => option.value);
    for (const email of ['all', 'unattributed', 'a@example.com', 'b@example.com', 'c@example.com', 'd@example.com', 'z@example.com']) {
      assert.ok(optionValues.includes(email), `missing account option ${email}`);
    }
    assert.equal(optionValues.includes(''), false);
    assert.equal(select.value, 'z@example.com');

    assert.match(root.querySelector('.ag-ledger-kpi-sub').textContent, /缓存写入/);
    const modelTable = root.querySelector('.ag-ledger-table-wrap');
    const headers = modelTable.querySelectorAll('.ag-ledger-th').map((th) => th.textContent);
    assert.deepEqual(headers, ['模型', '总 Token', '输入', '输出', '缓存读取', '缓存写入', '思考/推理', '折算费用']);
    const rows = modelTable.querySelectorAll('.ag-ledger-row');
    assert.equal(rows.length, 1);
    assert.equal(rows[0].children.length, 8);
    mounted.dispose();
  } finally {
    dom.restore();
  }
});

test('antigravity-account-ledger UI sizes the empty model row to the cache-write column set and spans KPI breakdowns', async () => {
  const { activate } = await import('../plugins/antigravity-account-ledger/ui.mjs');
  const dom = installFakeDom();
  try {
    const ui = activate({
      backend: {
        async call() {
          return {
            summary: { ...summaryFixture().summary, cacheWriteTokens: 5, models: {} },
            discoveredAccounts: [],
            activeAccount: null,
            accountFilter: 'all',
            range: { start: '2026-10-01', end: '2026-10-29' }
          };
        },
        subscribe() { return () => {}; }
      }
    });
    const container = new FakeElement('div');
    const mounted = ui.mount(container, {});
    await tick(20);
    const root = container.querySelector('.ag-ledger-root');
    const modelTable = root.querySelector('.ag-ledger-table-wrap');
    assert.equal(modelTable.querySelectorAll('.ag-ledger-th').length, 8);
    const emptyCell = root.querySelector('.ag-ledger-empty');
    assert.ok(emptyCell);
    assert.equal(emptyCell.colSpan, 8);
    mounted.dispose();
  } finally {
    dom.restore();
  }

  const styles = fs.readFileSync(new URL('../plugins/antigravity-account-ledger/styles.css', import.meta.url), 'utf8');
  assert.match(styles, /\.surface-home \.ag-ledger-kpi-breakdown\s*\{[^}]*grid-column:\s*1 \/ -1;/);
});

test('antigravity-account-ledger persists only the start date and follows the current day for the end date', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-startdate-test-'));
  t.after(() => removeTestDir(tmpDir));
  const today = backend.localDayKey();

  fs.writeFileSync(path.join(tmpDir, 'preferences.json'), JSON.stringify({
    accountFilter: 'persisted@example.com',
    range: { start: '2026-09-01', end: '2026-09-15' }
  }), 'utf8');

  const published = [];
  const instance = await backend.activate({
    dataDirectory: tmpDir,
    hostDataDir: tmpDir,
    homeDir: tmpDir,
    conversationDirs: [],
    autoRefreshIntervalMs: 30,
    publish: (value) => published.push(value)
  });
  t.after(() => instance.dispose());

  const res = await instance.call('getSummary', {});
  assert.equal(res.range.start, '2026-09-01');
  assert.equal(res.range.end, today);
  assert.equal(res.accountFilter, 'persisted@example.com');

  const locked = await instance.call('getSummary', {
    range: { start: '2026-10-01', end: '2026-10-20' },
    accountFilter: 'all'
  });
  assert.equal(locked.range.start, '2026-10-01');
  assert.equal(locked.range.end, '2026-10-20');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tmpDir, 'preferences.json'), 'utf8')), {
    accountFilter: 'all',
    startDate: '2026-10-01',
    endDate: '2026-10-20',
    range: { start: '2026-10-01' }
  });

  await tick(200);
  assert.ok(published.length >= 1);
  assert.equal(published[published.length - 1].range.end, '2026-10-20');

  const reopened = await instance.call('getSummary', {});
  assert.equal(reopened.range.start, '2026-10-01');
  assert.equal(reopened.range.end, today);
});

test('antigravity-account-ledger UI keeps the end date on today unless the user locks it', async () => {
  const { activate } = await import('../plugins/antigravity-account-ledger/ui.mjs');
  const dom = installFakeDom();
  try {
    const calls = [];
    const ui = activate({
      backend: {
        async call(method, payload) {
          calls.push({ method, payload });
          return {
            summary: { ...summaryFixture().summary },
            discoveredAccounts: [],
            activeAccount: null,
            accountFilter: 'all',
            range: { start: '2026-09-01', end: '2026-09-30' }
          };
        },
        subscribe() { return () => {}; }
      }
    });
    const container = new FakeElement('div');
    const mounted = ui.mount(container, {});
    const root = container.querySelector('.ag-ledger-root');
    const dateInputs = root.querySelectorAll('.ag-ledger-date');
    await tick(20);
    assert.equal(dateInputs[1].value, '2026-09-30');

    mounted.update({ visible: false });
    mounted.update({ visible: true });
    await tick(20);
    assert.equal(calls[calls.length - 1].payload.range.end, backend.localDayKey());
    assert.equal(dateInputs[1].value, backend.localDayKey());

    dateInputs[1].value = '2026-10-20';
    dispatch(dateInputs[1], 'change');
    await tick(20);
    assert.equal(calls[calls.length - 1].payload.range.end, '2026-10-20');

    mounted.update({ visible: false });
    mounted.update({ visible: true });
    await tick(20);
    assert.equal(calls[calls.length - 1].payload.range.end, '2026-10-20');
    assert.equal(calls[calls.length - 1].payload.auto, true);
    mounted.dispose();
  } finally {
    dom.restore();
  }
});

test('antigravity-account-ledger documentation does not advertise attribution coverage', () => {
  const dir = fileURLToPath(new URL('../plugins/antigravity-account-ledger/', import.meta.url));
  const docs = fs.readdirSync(dir).filter((name) => /^(README|CHANGELOG).*\.md$/i.test(name));
  assert.equal(docs.length, 12);
  const terms = ['attribution coverage', 'cobertura de atribuição', '归属覆盖率', '歸因覆蓋率', '帰属カバレッジ', '귀속 커버리지'];
  for (const name of docs) {
    const text = fs.readFileSync(path.join(dir, name), 'utf8').toLowerCase();
    for (const term of terms) {
      assert.equal(text.includes(term.toLowerCase()), false, `${name} still mentions ${term}`);
    }
  }
});

test('antigravity-account-ledger falls back to consumed Gemini windows when the Argon quota is unconsumed', (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-argon-fallback-'));
  t.after(() => removeTestDir(tmpHome));

  const resetTime = '2026-10-31T11:13:09Z';
  const callTs = Date.parse(resetTime) - 2 * 86400_000;
  const windows = backend.buildQuotaAttributionWindows([
    {
      email: 'argon@example.com',
      created_at: 1790000000,
      last_used: 1793000000,
      quota: {
        quota_groups: [{
          display_name: 'Gemini 4 Argon',
          buckets: [{ bucket_id: 'argon-weekly', window: 'weekly', remaining_fraction: 1.0, reset_time: resetTime }]
        }]
      }
    },
    {
      email: 'gemini@example.com',
      created_at: 1790000000,
      last_used: 1793000000,
      quota: {
        quota_groups: [{
          display_name: 'Gemini',
          buckets: [{ bucket_id: 'gemini-weekly', window: 'weekly', remaining_fraction: 0.4, reset_time: resetTime }]
        }]
      }
    }
  ], { homeDir: tmpHome });

  assert.equal(windows['argon-weekly'].length, 1);
  assert.equal(windows['argon-weekly'][0].consumed, false);
  assert.equal(windows['gemini-weekly'][0].consumed, true);

  const attribution = backend.attributeCallRecord({
    timestampMs: callTs,
    model: 'gemini-4-argon'
  }, { ledger: backend.createDefaultLedger('2026-10-01T00:00:00Z'), quotaWindows: windows });
  assert.equal(attribution.email, 'gemini@example.com');
  assert.equal(attribution.source, 'quota_anchor');
});

test('antigravity-account-ledger compares session activation times as epochs before reusing day allocations', () => {
  const ledger = backend.createDefaultLedger('2026-10-27T00:00:00+08:00');
  const metrics = {
    totalTokens: 300,
    costUsd: 0.3,
    inputTokens: 300,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    reasoningTokens: 0,
    models: {
      'claude-sonnet-4-6': {
        tokens: 300,
        costUsd: 0.3,
        inputTokens: 300,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        reasoningTokens: 0
      }
    }
  };
  ledger.sessionAccounts['sess-epoch'] = {
    email: 'bound@example.com',
    source: 'active_account',
    lastDay: null,
    allocations: { 'bound@example.com': metrics },
    lastSnapshot: backend.cloneMetrics(metrics)
  };
  const session = {
    sessionId: 'sess-epoch',
    client: 'antigravity',
    day: '2026-10-27',
    startedAt: '2026-10-26T20:00:00Z',
    periods: { allTime: { totalTokens: 500, costUsd: 0.5 } }
  };
  const res = backend.aggregateAccountUsage({
    sessions: [session],
    dailyHistory: [],
    ledger,
    quotaWindows: {},
    range: { start: '2026-10-01', end: '2026-12-31' },
    activeAccount: { email: 'active@example.com' }
  });
  assert.equal(res.byAccount['bound@example.com'].totalTokens, 300);
  assert.equal(res.byAccount['active@example.com'], undefined);
});

test('antigravity-account-ledger backs up structurally invalid ledgers instead of overwriting them', (t) => {
  const invalidPayloads = [
    '"a string, not a ledger"',
    '123',
    'null',
    'true',
    '[]',
    JSON.stringify({ version: 0, featureActivatedAt: '2026-10-01T00:00:00Z' }),
    JSON.stringify({ version: 1, featureActivatedAt: '2026-10-01T00:00:00Z', timeline: {} }),
    JSON.stringify({ version: 1, featureActivatedAt: '2026-10-01T00:00:00Z', sessionAccounts: [] }),
    JSON.stringify({ unrelated: true })
  ];
  for (const [index, payload] of invalidPayloads.entries()) {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-ledger-shape-'));
    t.after(() => removeTestDir(tmpDir));
    const ledgerFile = path.join(tmpDir, backend.DEFAULT_LEDGER_FILENAME);
    fs.writeFileSync(ledgerFile, payload, 'utf8');
    const ledger = backend.loadLedger(ledgerFile);
    assert.equal(ledger.version, 1, `payload #${index} must rebuild a default ledger`);
    assert.deepEqual(ledger.timeline, []);
    assert.equal(Array.isArray(ledger.sessionAccounts), false);
    const backups = fs.readdirSync(tmpDir).filter((name) => name.startsWith(`${backend.DEFAULT_LEDGER_FILENAME}.corrupt-`));
    assert.equal(backups.length, 1, `payload #${index} must be backed up exactly once`);
    assert.equal(fs.readFileSync(path.join(tmpDir, backups[0]), 'utf8'), payload,
      `payload #${index} must be preserved verbatim in the backup`);
    const rebuilt = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
    assert.equal(rebuilt.version, 1);
    assert.deepEqual(rebuilt.timeline, []);
    assert.deepEqual(rebuilt.sessionAccounts, {});
  }
});

test('antigravity-account-ledger keeps a valid ledger untouched and normalizes array session accounts', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-ledger-keep-'));
  t.after(() => removeTestDir(tmpDir));
  const ledgerFile = path.join(tmpDir, backend.DEFAULT_LEDGER_FILENAME);
  const valid = {
    version: 1,
    featureActivatedAt: '2026-10-01T00:00:00Z',
    lastActiveAccount: 'a@example.com',
    timeline: [{ email: 'a@example.com', startedAt: '2026-10-10T00:00:00Z', endedAt: null, source: 'antigravity_tools' }],
    sessionAccounts: { 'sess-1': { email: 'a@example.com', source: 'active_account', allocations: {}, lastSnapshot: null } }
  };
  fs.writeFileSync(ledgerFile, JSON.stringify(valid), 'utf8');
  const ledger = backend.loadLedger(ledgerFile);
  assert.equal(ledger.timeline.length, 1);
  assert.equal(ledger.sessionAccounts['sess-1'].email, 'a@example.com');
  assert.equal(fs.readdirSync(tmpDir).filter((name) => name.includes('.corrupt-')).length, 0);

  fs.writeFileSync(ledgerFile, JSON.stringify({ ...valid, sessionAccounts: [] }), 'utf8');
  const rebuilt = backend.loadLedger(ledgerFile);
  assert.equal(Array.isArray(rebuilt.sessionAccounts), false);
  rebuilt.sessionAccounts.sessX = { email: 'x@example.com', allocations: {}, lastSnapshot: null };
  backend.saveLedger(rebuilt, ledgerFile);
  const saved = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  assert.equal(saved.sessionAccounts.sessX.email, 'x@example.com');
});

test('antigravity-account-ledger re-anchors a regressed all-time session without counting it twice', () => {
  const ledger = backend.createDefaultLedger('2026-10-01T00:00:00Z');
  const session = (day, tokens) => ({
    sessionId: 'sess-regress',
    client: 'antigravity',
    day,
    startedAt: '2026-10-28T10:00:00Z',
    periods: {
      today: { totalTokens: tokens, costUsd: tokens / 10000 },
      allTime: { totalTokens: tokens, costUsd: tokens / 10000 }
    }
  });
  backend.syncActiveAccountSessions([session('2026-10-28', 1000)], { email: 'a@example.com' }, ledger, { save: false });
  assert.equal(ledger.sessionAccounts['sess-regress'].allocations['a@example.com'].totalTokens, 1000);

  backend.syncActiveAccountSessions([session('2026-10-29', 500)], { email: 'a@example.com' }, ledger, { save: false });
  const regressed = ledger.sessionAccounts['sess-regress'];
  assert.equal(regressed.allocations['a@example.com'].totalTokens, 1000, 'the regressed remainder must not be counted again');
  assert.equal(regressed.lastSnapshot.totalTokens, 500, 'the high-water mark must be re-anchored to the regressed value');

  backend.syncActiveAccountSessions([session('2026-10-29', 700)], { email: 'b@example.com' }, ledger, { save: false });
  const grown = ledger.sessionAccounts['sess-regress'];
  assert.equal(grown.allocations['a@example.com'].totalTokens, 1000);
  assert.equal(grown.allocations['b@example.com'].totalTokens, 200, 'only the growth after the regression is new usage');
  assert.equal(backend.allocationsForDay(grown, '2026-10-29')['b@example.com'].totalTokens, 200);
});

test('antigravity-account-ledger leaves the scan cache on disk untouched while the memory cache is warm', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-cache-warm-'));
  t.after(() => removeTestDir(tmpDir));
  const dbPath = createConversationDb(tmpDir, 'conv-warm.db', {
    gens: [{ idx: 1, data: makeGenData({ usageBuf: makeUsageStats({ responseId: 'resp-warm' }), stepIndexes: [1] }) }]
  });
  const cacheFile = path.join(tmpDir, 'cache.json');
  backend.GLOBAL_DB_SCAN_CACHE.clear();
  const first = backend.scanAllConversationDbs({ conversationDirs: [tmpDir], cacheFile });
  assert.equal(first.length, 1);
  const written = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  assert.equal(written.version, 2);
  assert.ok(Array.isArray(written.entries[dbPath].calls));
  const body = fs.readFileSync(cacheFile, 'utf8');
  assert.equal(body.includes('\n'), false, 'the scan cache must be written compactly');
  const mtimeBefore = fs.statSync(cacheFile).mtimeMs;

  const second = backend.scanAllConversationDbs({ conversationDirs: [tmpDir], cacheFile });
  assert.equal(second.length, 1);
  assert.equal(fs.statSync(cacheFile).mtimeMs, mtimeBefore, 'a warm memory cache must not rewrite the cache file');
  assert.equal(fs.readFileSync(cacheFile, 'utf8'), body);
});

test('antigravity-account-ledger re-tags cached scan records with the source that consumes them', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-cache-source-'));
  t.after(() => removeTestDir(tmpDir));
  const convDir = path.join(tmpDir, 'conv');
  fs.mkdirSync(convDir);
  createConversationDb(convDir, 'conv-src.db', {
    gens: [{ idx: 1, data: makeGenData({ usageBuf: makeUsageStats({ responseId: 'resp-src' }), stepIndexes: [1] }) }]
  });
  const cacheFile = path.join(tmpDir, 'cache.json');
  const sources = [{ source: 'antigravity', dir: convDir }, { source: 'antigravity-cli', dir: convDir }];
  backend.GLOBAL_DB_SCAN_CACHE.clear();
  const first = backend.scanAllConversationDbs({ conversationSources: sources, cacheFile });
  assert.ok(first.length > 0);
  assert.deepEqual([...new Set(first.map((call) => call.source))], ['antigravity']);

  backend.GLOBAL_DB_SCAN_CACHE.clear();
  const second = backend.scanAllConversationDbs({ conversationSources: sources, cacheFile });
  assert.ok(second.length > 0);
  assert.deepEqual([...new Set(second.map((call) => call.source))], ['antigravity']);

  const cliOnly = backend.scanAllConversationDbs({ conversationSources: [{ source: 'antigravity-cli', dir: convDir }], cacheFile });
  assert.ok(cliOnly.length > 0);
  assert.deepEqual([...new Set(cliOnly.map((call) => call.source))], ['antigravity-cli']);
});

test('antigravity-account-ledger skips quota windows for disabled accounts', (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-disabled-quota-'));
  t.after(() => removeTestDir(tmpHome));
  const accountsDir = path.join(tmpHome, '.antigravity_tools', 'accounts');
  fs.mkdirSync(accountsDir, { recursive: true });
  const quota = (fraction) => ({
    quota_groups: [{
      display_name: 'Gemini',
      buckets: [{ bucket_id: 'gemini-weekly', window: 'weekly', remaining_fraction: fraction, reset_time: '2026-10-31T00:00:00Z' }]
    }]
  });
  fs.writeFileSync(path.join(accountsDir, 'acc-off.json'), JSON.stringify({
    id: 'acc-off', email: 'off@example.com', name: 'Off', disabled: true, quota: quota(0.2)
  }), 'utf8');
  fs.writeFileSync(path.join(accountsDir, 'acc-on.json'), JSON.stringify({
    id: 'acc-on', email: 'on@example.com', name: 'On', quota: quota(0.3)
  }), 'utf8');
  const discovered = backend.discoverAccounts({ homeDir: tmpHome });
  const byEmail = Object.fromEntries(discovered.map((account) => [account.email, account]));
  assert.equal(byEmail['off@example.com'].disabled, true);
  assert.equal(byEmail['on@example.com'].disabled, false);
  const windows = backend.buildQuotaAttributionWindows(discovered, { homeDir: tmpHome });
  assert.deepEqual(windows['gemini-weekly'].map((window) => window.email), ['on@example.com']);
});

test('antigravity-account-ledger falls back to the call day when the timestamp is empty', () => {
  const ledger = backend.createDefaultLedger('2026-10-01T00:00:00Z');
  const quotaWindows = {
    'gemini-weekly': [{
      email: 'quota@example.com', consumed: true,
      startMs: Date.parse('2026-10-01T00:00:00Z'), endMs: Date.parse('2026-10-31T00:00:00Z')
    }]
  };
  const attributed = backend.attributeCallRecord(
    { timestamp: '', day: '2026-10-15', model: 'gemini-3.8-flash' },
    { ledger, quotaWindows }
  );
  assert.equal(attributed.email, 'quota@example.com');
  assert.equal(attributed.source, 'quota_anchor');
  assert.equal(attributed.layer, 2);
});

test('antigravity-account-ledger rejects truncated and unsafe usage payloads', () => {
  const full = makeUsageStats({ modelEnum: 1007, input: 250000, output: 10000 });
  assert.equal(backend.parseUsageStats(full).outputTokens, 10000);
  assert.equal(backend.parseUsageStats(full.subarray(0, full.length - 2)), null,
    'a truncated usage payload must not be counted as a complete record');
  const oversized = Buffer.concat([
    pbVarintField(1, 1007),
    Buffer.from([0x10, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01])
  ]);
  assert.equal(backend.parseUsageStats(oversized), null,
    'a negative 10-byte varint must not become a token count');
});

test('antigravity-account-ledger drops packed step-index lists that are truncated or oversized', () => {
  assert.deepEqual(backend.unpackVarints(Buffer.concat([encodeVarintBuf(1), encodeVarintBuf(2)])), [1, 2]);
  assert.deepEqual(backend.unpackVarints(Buffer.concat([encodeVarintBuf(1), Buffer.from([0x80])])), [],
    'a truncated packed list must not be consumed as a short list');
  assert.deepEqual(backend.unpackVarints(Buffer.from([0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0x01])), [],
    'an oversized packed varint must be rejected');
});

test('antigravity-account-ledger finds CLI auth lines past 32 KB and corrects cross-year timestamps', (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-cli-large-'));
  t.after(() => removeTestDir(tmpHome));
  const cliLogDir = path.join(tmpHome, 'log');
  fs.mkdirSync(cliLogDir);

  const bigLog = path.join(cliLogDir, 'cli-20261006_214817.log');
  fs.writeFileSync(bigLog, 'x'.repeat(40000)
    + 'I1006 21:48:19.297368 12345 server_oauth.go:322] applyAuthResult: email=big@example.com, authMethod=consumer\n', 'utf8');
  const bigStartMs = new Date(2026, 9, 6, 21, 48, 19, 297).getTime();
  fs.utimesSync(bigLog, bigStartMs / 1000, bigStartMs / 1000);

  const crossYearLog = path.join(cliLogDir, 'cli-20270101_003000.log');
  fs.writeFileSync(crossYearLog,
    'I1231 23:59:00.500000 1 server_oauth.go:198] applyAuthResult: email=newyear@example.com, authMethod=consumer\n', 'utf8');
  const newYearMs = new Date(2026, 11, 31, 23, 59, 0, 500).getTime();
  fs.utimesSync(crossYearLog, newYearMs / 1000, newYearMs / 1000);

  const windows = backend.discoverCliLogWindows({ cliLogDir });
  assert.equal(windows.length, 2);
  const big = windows.find((window) => window.email === 'big@example.com');
  assert.ok(big, 'an auth line past the first 32 KB must still be discovered');
  assert.equal(big.startMs, bigStartMs - 5000);
  const newYear = windows.find((window) => window.email === 'newyear@example.com');
  assert.ok(newYear);
  assert.equal(newYear.startMs, newYearMs - 5000, 'a log spanning new year must use the previous year');
});

test('antigravity-account-ledger binds sessions that carry a numeric start timestamp', () => {
  const ledger = backend.createDefaultLedger('2026-10-01T00:00:00Z');
  const startedAt = Date.parse('2026-10-28T10:00:00Z');
  const session = {
    sessionId: 'sess-numeric', client: 'antigravity', day: '2026-10-28', startedAt,
    periods: { allTime: { totalTokens: 500, costUsd: 0.5 } }
  };
  assert.equal(backend.extractSessionTimestamp(session), startedAt);
  const sync = backend.syncActiveAccountSessions([session], { email: 'a@example.com' }, ledger, { save: false });
  assert.equal(sync.changed, true);
  const binding = ledger.sessionAccounts['sess-numeric'];
  assert.ok(binding);
  assert.equal(binding.allocations['a@example.com'].totalTokens, 500);
});

test('antigravity-account-ledger keeps the local day for small epoch-scale timestamps', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-epoch-day-'));
  t.after(() => removeTestDir(tmpDir));
  const seconds = 100000;
  const dbPath = createConversationDb(tmpDir, 'conv-epoch.db', {
    steps: [{ idx: 1, metadata: makeStepMetadata({ tsSec: seconds, usageBuf: makeUsageStats({ input: 10, output: 1 }) }) }]
  });
  const calls = backend.scanConversationDb(dbPath);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].timestampMs, seconds * 1000);
  assert.equal(calls[0].day, backend.localDayKey(new Date(seconds * 1000)));
});

test('antigravity-account-ledger removes the atomic write temp file when the write fails', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-atomic-write-'));
  t.after(() => removeTestDir(tmpDir));
  const target = path.join(tmpDir, 'target.json');
  fs.mkdirSync(target);
  assert.throws(() => backend.writeJsonAtomic(target, { a: 1 }));
  const leftovers = fs.readdirSync(tmpDir).filter((name) => name.includes('.tmp.'));
  assert.deepEqual(leftovers, [], 'a failed atomic write must not leave a temp file behind');
});

test('antigravity-account-ledger writes the compact cache without leaving temp files behind', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-atomic-ok-'));
  t.after(() => removeTestDir(tmpDir));
  const target = path.join(tmpDir, 'nested', 'cache.json');
  backend.writeJsonAtomic(target, { version: 2, entries: {} }, { compact: true });
  const body = fs.readFileSync(target, 'utf8');
  assert.equal(body.includes('\n'), false);
  assert.deepEqual(fs.readdirSync(path.dirname(target)).filter((name) => name.includes('.tmp.')), []);
});

test('antigravity-account-ledger removes the database snapshot directory when the handle closes', (t) => {
  const { DatabaseSync } = require('node:sqlite');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-snap-close-'));
  const tempRoot = path.join(tmpDir, 'temp');
  fs.mkdirSync(tempRoot);
  const prevTemp = process.env.TEMP;
  const prevTmp = process.env.TMP;
  process.env.TEMP = tempRoot;
  process.env.TMP = tempRoot;
  t.after(() => {
    if (prevTemp === undefined) delete process.env.TEMP; else process.env.TEMP = prevTemp;
    if (prevTmp === undefined) delete process.env.TMP; else process.env.TMP = prevTmp;
    removeTestDir(tmpDir);
  });
  const dbPath = createConversationDb(tmpDir, 'conv-snap.db', {
    gens: [{ idx: 1, data: makeGenData({ usageBuf: makeUsageStats({ responseId: 'resp-snap' }), stepIndexes: [1] }) }]
  });
  fs.writeFileSync(`${dbPath}-wal`, Buffer.from('corrupt-or-locked-wal-header'));
  fs.mkdirSync(`${dbPath}-shm`);
  const handle = backend.openConversationDbWithFallback(dbPath);
  assert.ok(handle);
  assert.equal(fs.readdirSync(tempRoot).filter((name) => name.startsWith('ag-db-snap-')).length, 1);
  handle.close();
  assert.deepEqual(fs.readdirSync(tempRoot).filter((name) => name.startsWith('ag-db-snap-')), [],
    'the snapshot directory must be removed when the handle is closed');
});

test('antigravity-account-ledger removes the database snapshot directory when the fallback fails', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-snap-fail-'));
  const tempRoot = path.join(tmpDir, 'temp');
  fs.mkdirSync(tempRoot);
  const prevTemp = process.env.TEMP;
  const prevTmp = process.env.TMP;
  process.env.TEMP = tempRoot;
  process.env.TMP = tempRoot;
  t.after(() => {
    if (prevTemp === undefined) delete process.env.TEMP; else process.env.TEMP = prevTemp;
    if (prevTmp === undefined) delete process.env.TMP; else process.env.TMP = prevTmp;
    removeTestDir(tmpDir);
  });
  const dbPath = path.join(tmpDir, 'broken.db');
  fs.mkdirSync(dbPath);
  assert.equal(backend.openConversationDbWithFallback(dbPath), null);
  assert.deepEqual(fs.readdirSync(tempRoot).filter((name) => name.startsWith('ag-db-snap-')), [],
    'a failed snapshot must not leave its directory behind');
});

test('antigravity-account-ledger reclaims orphaned database snapshots older than ten minutes', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-snap-orphan-'));
  const tempRoot = path.join(tmpDir, 'temp');
  fs.mkdirSync(tempRoot);
  const prevTemp = process.env.TEMP;
  const prevTmp = process.env.TMP;
  process.env.TEMP = tempRoot;
  process.env.TMP = tempRoot;
  t.after(() => {
    if (prevTemp === undefined) delete process.env.TEMP; else process.env.TEMP = prevTemp;
    if (prevTmp === undefined) delete process.env.TMP; else process.env.TMP = prevTmp;
    removeTestDir(tmpDir);
  });
  const orphan = path.join(tempRoot, 'ag-db-snap-orphan');
  const fresh = path.join(tempRoot, 'ag-db-snap-fresh');
  const unrelated = path.join(tempRoot, 'ag-db-scan-keep');
  for (const dir of [orphan, fresh, unrelated]) { fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'payload.bin'), 'x'); }
  const oldSec = (Date.now() - 15 * 60 * 1000) / 1000;
  fs.utimesSync(orphan, oldSec, oldSec);

  backend.scanAllConversationDbs({ conversationDirs: [], cacheFile: null });
  assert.equal(fs.existsSync(orphan), false, 'a stale snapshot directory must be reclaimed');
  assert.equal(fs.existsSync(fresh), true, 'a snapshot younger than ten minutes must be kept');
  assert.equal(fs.existsSync(unrelated), true, 'unrelated temp directories must be left alone');
});

test('antigravity-account-ledger drops invalid persisted and requested date ranges', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-ledger-test-'));
  t.after(() => removeTestDir(tmpDir));
  const today = backend.localDayKey();
  const monthStart = `${today.slice(0, 7)}-01`;
  fs.writeFileSync(path.join(tmpDir, 'preferences.json'), JSON.stringify({
    accountFilter: 'all', startDate: 'not-a-date', endDate: 'also-bad'
  }));

  const instance = await backend.activate({ dataDirectory: tmpDir, hostDataDir: tmpDir, homeDir: tmpDir, conversationDirs: [] });
  const res = await instance.call('getSummary', {});
  assert.equal(res.range.start, monthStart, 'an invalid persisted start must fall back to the first day of the month');
  assert.equal(res.range.end, today, 'an invalid persisted end must fall back to today');

  const requested = await instance.call('getSummary', { range: { start: 'not-a-date', end: '2026-10-20' } });
  assert.equal(requested.range.start, monthStart, 'an invalid requested start must never become the range start');
  assert.equal(requested.range.end, '2026-10-20', 'an invalid start must not flip the range end');
  assert.notEqual(requested.range.start, 'not-a-date');
  assert.notEqual(requested.range.end, 'not-a-date');

  const prefsText = fs.readFileSync(path.join(tmpDir, 'preferences.json'), 'utf8');
  assert.equal(prefsText.includes('not-a-date'), false, 'an invalid date must never be persisted');
  const prefs = JSON.parse(prefsText);
  assert.equal(String(prefs.startDate || ''), '');
  assert.equal(String(prefs.range?.start || ''), '');
  assert.equal(prefs.endDate, '2026-10-20');
  instance.dispose?.();

  const ignored = backend.aggregateAccountUsage({
    calls: [{ day: '2026-01-05', timestampMs: Date.parse('2026-01-05T00:00:00Z'), model: 'm', inputTokens: 100, outputTokens: 0, costUsd: 0.1 }],
    ledger: backend.createDefaultLedger('2026-01-01T00:00:00Z'),
    quotaWindows: {},
    range: { start: 'not-a-date', end: 'also-bad' },
    accountFilter: 'all',
    discoveredAccounts: []
  });
  assert.equal(ignored.overallTotalTokens, 100, 'an invalid range endpoint must be ignored instead of filtering everything out');
});

test('antigravity-account-ledger logs auto refresh failures without publishing dirty data', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-ledger-test-'));
  t.after(() => removeTestDir(tmpDir));
  const blockedParent = path.join(tmpDir, 'blocked');
  fs.writeFileSync(blockedParent, 'not a directory');
  fs.writeFileSync(path.join(tmpDir, backend.DEFAULT_LEDGER_FILENAME),
    JSON.stringify(backend.createDefaultLedger('2026-01-01T00:00:00Z')));

  const logs = [];
  const published = [];
  const instance = await backend.activate({
    dataDirectory: path.join(blockedParent, 'plugin-data'),
    hostDataDir: tmpDir,
    homeDir: tmpDir,
    conversationDirs: [],
    publish: (value) => { published.push(value); },
    log: (...args) => { logs.push(args); },
    autoRefreshIntervalMs: 10
  });
  await new Promise((resolve) => setTimeout(resolve, 120));
  instance.dispose?.();

  assert.ok(logs.length > 0, 'a failing auto refresh must reach the log callback');
  assert.match(String(logs[0][0] || ''), /Auto refresh failed/);
  assert.equal(published.length, 0, 'a failed auto refresh must not publish over the visible state');
});

test('antigravity-account-ledger shows the active account as a full width header row', async () => {
  const { activate } = await import('../plugins/antigravity-account-ledger/ui.mjs');
  const dom = installFakeDom();
  try {
    const container = new FakeElement('div');
    const ui = activate({
      backend: {
        async call() { return summaryFixture(); },
        subscribe() { return () => {}; }
      }
    });
    const mounted = ui.mount(container, {});
    await new Promise((resolve) => setTimeout(resolve, 10));
    const root = container.querySelector('.ag-ledger-root');
    const header = root.querySelector('.ag-ledger-header');
    const badge = root.querySelector('.ag-ledger-badge');
    assert.ok(badge);
    assert.equal(badge.parentNode, header, 'the badge must be a direct child of the header');
    assert.equal(badge.textContent, 'user@example.com', 'the badge must show the full account address');
    assert.equal(badge.textContent.includes('Active:'), false);
    assert.equal(badge.title, 'user@example.com');
    mounted.dispose();

    const emptyContainer = new FakeElement('div');
    const emptyUi = activate({
      backend: {
        async call() { return { ...summaryFixture(), activeAccount: null }; },
        subscribe() { return () => {}; }
      }
    });
    const emptyMounted = emptyUi.mount(emptyContainer, {});
    await new Promise((resolve) => setTimeout(resolve, 10));
    const emptyBadge = emptyContainer.querySelector('.ag-ledger-badge');
    assert.ok(emptyBadge);
    assert.equal(emptyBadge.textContent, '未检测到活跃账号');
    assert.equal(emptyBadge.title, '');
    emptyMounted.dispose();
  } finally {
    dom.restore();
  }
});

test('antigravity-account-ledger keeps the collapsed card frame and the badge grid rules', () => {
  const css = fs.readFileSync(path.join(pluginDir, 'styles.css'), 'utf8');
  assert.equal(css.includes('max-width: 150px'), false, 'the badge must not be capped at 150px any more');
  const collapsed = cssBlock(css, '.ag-ledger-root.surface-home.is-collapsed');
  assert.ok(collapsed, 'the collapsed home surface rule must exist');
  assert.equal(collapsed.includes('border: none'), false, 'the collapsed card must keep its border');
  assert.equal(collapsed.includes('background: transparent'), false, 'the collapsed card must keep its background');
  assert.match(collapsed, /padding:\s*8px 12px;/);
  const badgeGrid = cssBlock(css, '.ag-ledger-header > .ag-ledger-badge');
  assert.ok(badgeGrid, 'the header badge grid rule must exist');
  assert.match(badgeGrid, /grid-column:\s*1 \/ -1;/);
  const header = cssBlock(css, '.ag-ledger-header');
  assert.match(header, /grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
  assert.equal(css.includes('.surface-page'), false);
  assert.equal(css.includes('.home-module-plugin'), false);
  assert.equal(css.includes('!important'), false);
});
