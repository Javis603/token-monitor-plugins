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
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (
    entry.isDirectory() ? listPluginFiles(path.join(dir, entry.name)) : [path.join(dir, entry.name)]
  ));
}

function tick(ms = 20) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      add: (...names) => names.forEach((n) => n && this._classes.add(n)),
      remove: (...names) => names.forEach((n) => this._classes.delete(n)),
      toggle: (name, force) => {
        const next = force === undefined ? !this._classes.has(name) : Boolean(force);
        if (next) this._classes.add(name); else this._classes.delete(name);
        return next;
      },
      contains: (name) => this._classes.has(name)
    };
  }
  get className() { return [...this._classes].join(' '); }
  set className(val) { this._classes = new Set(String(val || '').split(/\s+/).filter(Boolean)); }
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
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatch(type, event = {}) {
    const evt = { target: this, stopPropagation() {}, ...event };
    for (const fn of this.listeners.get(type) || []) fn(evt);
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
    getItem: (k) => (store.has(k) ? store.get(k) : null),
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

function makeMockHost({
  limitsRows = [],
  toolsRows = [],
  modelsRows = [],
  historyRows = [],
  settings = {}
} = {}) {
  return {
    async call(method, args = {}) {
      if (method === 'app.settings') return settings;
      if (method !== 'data.query') return null;
      if (args.resource === 'limits') {
        return { availability: 'available', rows: limitsRows, pageInfo: { hasMore: false, nextCursor: null } };
      }
      if (args.resource === 'tools') {
        return { availability: 'available', rows: toolsRows, pageInfo: { hasMore: false, nextCursor: null } };
      }
      if (args.resource === 'models') {
        return { availability: 'available', rows: modelsRows, pageInfo: { hasMore: false, nextCursor: null } };
      }
      if (args.resource === 'history') {
        const filtered = historyRows.filter((r) => {
          if (args.filter?.from && r.date < args.filter.from) return false;
          if (args.filter?.to && r.date > args.filter.to) return false;
          if (args.filter?.client && r.client !== args.filter.client) return false;
          return true;
        });
        return { availability: 'available', rows: filtered, pageInfo: { hasMore: false, nextCursor: null } };
      }
      return { availability: 'notCollected', rows: [], pageInfo: { hasMore: false, nextCursor: null } };
    }
  };
}

test('antigravity-account-ledger ships changelog summaries across all 6 locales and home-only manifest', () => {
  const root = new URL('../plugins/antigravity-account-ledger/', import.meta.url);
  const manifest = JSON.parse(fs.readFileSync(new URL('manifest.json', root), 'utf8'));
  const files = Object.fromEntries(Object.values(CHANGELOG_FILES).map((name) => [name, fs.readFileSync(new URL(name, root))]));
  assert.equal(Object.keys(packageChangelog(files, '0.1.0')).length, 6);
  assert.equal(Object.keys(packageChangelog(files, manifest.version)).length, 6);
  assert.deepEqual(manifest.views[0].surfaces, ['home']);
  assert.deepEqual(manifest.views[0].defaultSurfaces, ['home']);
  assert.equal(manifest.background, true);
  const uiSource = fs.readFileSync(new URL('ui.mjs', root), 'utf8');
  const cssSource = fs.readFileSync(new URL('styles.css', root), 'utf8');
  assert.equal(uiSource.includes('headerActions'), false);
  assert.equal(cssSource.includes('.surface-page'), false);
});

test('antigravity-account-ledger keeps sources free of machine paths, host DOM coupling, and forbidden docs terms', () => {
  const forbidden = ['G:' + '\\Temp', 'G:' + '/Temp'];
  for (const file of listPluginFiles(pluginDir)) {
    const source = fs.readFileSync(file, 'utf8');
    for (const needle of forbidden) {
      assert.equal(source.includes(needle), false, `${path.relative(pluginDir, file)} contains ${needle}`);
    }
  }
  const docTerms = ['attribution coverage', 'cobertura de atribuição', '归属覆盖率', '歸屬覆蓋率', '帰属カバレッジ', '귀속 커버리지'];
  for (const name of fs.readdirSync(pluginDir).filter((f) => f.endsWith('.md'))) {
    const text = fs.readFileSync(path.join(pluginDir, name), 'utf8').toLowerCase();
    for (const term of docTerms) {
      assert.equal(text.includes(term.toLowerCase()), false, `${name} should not advertise ${term}`);
    }
  }
});

test('antigravity-account-ledger normalizes dates by local day boundaries', () => {
  const local = new Date(2026, 0, 1, 0, 30);
  assert.equal(backend.localDayKey(local), '2026-01-01');
  assert.equal(backend.normalizeDate(local), '2026-01-01');
  assert.equal(backend.normalizeDate(local.getTime()), '2026-01-01');
  assert.equal(backend.normalizeDate(Math.floor(local.getTime() / 1000)), '2026-01-01');
  assert.equal(backend.normalizeDate(local.toISOString()), '2026-01-01');
  assert.equal(backend.normalizeDate('2026-01-01'), '2026-01-01');
  assert.equal(backend.normalizeDate(null), '');
  assert.equal(backend.localDayKey(new Date('invalid')), '');
});

test('antigravity-account-ledger detects Antigravity 2.0 app_storage.json, compares freshness, and prefers live host RPC', async (t) => {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-fresh-active-'));
  t.after(() => removeTestDir(tmpHome));

  const toolsDir = path.join(tmpHome, '.antigravity_tools');
  fs.mkdirSync(toolsDir, { recursive: true });
  const toolsFile = path.join(toolsDir, 'accounts.json');
  fs.writeFileSync(toolsFile, JSON.stringify({
    current_account_id: 'old-acc',
    accounts: [{ id: 'old-acc', email: 'stale-tools@example.com' }]
  }), 'utf8');

  const appDataDir = path.join(tmpHome, 'AppData', 'Roaming');
  const agDir = path.join(appDataDir, 'Antigravity');
  fs.mkdirSync(agDir, { recursive: true });
  const appStorageFile = path.join(agDir, 'app_storage.json');
  fs.writeFileSync(appStorageFile, JSON.stringify({
    'agy.onboarding.lastLoginUsername': 'live-desktop@example.com'
  }), 'utf8');

  const nowMs = Date.now();
  const tOld = new Date(nowMs - 3600_000);
  const tNew = new Date(nowMs - 1800_000);
  fs.utimesSync(toolsFile, tOld, tOld);
  fs.utimesSync(appStorageFile, tNew, tNew);

  const detectedDesktop = backend.discoverCurrentAccount({ homeDir: tmpHome, appDataDir, platform: 'win32' });
  assert.equal(detectedDesktop?.email, 'live-desktop@example.com');
  assert.equal(detectedDesktop?.source, 'antigravity_app_storage');

  const tNewerTools = new Date(nowMs - 600_000);
  fs.utimesSync(toolsFile, tNewerTools, tNewerTools);
  const detectedTools = backend.discoverCurrentAccount({ homeDir: tmpHome, appDataDir, platform: 'win32' });
  assert.equal(detectedTools?.email, 'stale-tools@example.com');
  assert.equal(detectedTools?.source, 'antigravity_tools');

  const hostDataDir = path.join(tmpHome, 'host-data');
  const pluginDataDir = path.join(hostDataDir, 'plugin-data', 'antigravity-account-ledger');
  fs.mkdirSync(pluginDataDir, { recursive: true });
  const host = makeMockHost({
    limitsRows: [
      { provider: 'antigravity', source: 'oauth', status: 'ok', accountEmail: 'managed@example.com', accountName: 'Managed', updatedAt: new Date(nowMs).toISOString() },
      { provider: 'antigravity', source: 'rpc', status: 'ok', accountEmail: 'rpc-live@example.com', accountName: 'RPC Live', updatedAt: new Date(nowMs).toISOString() }
    ]
  });
  const instance = await backend.activate({ dataDirectory: pluginDataDir, hostDataDir, homeDir: tmpHome, host });
  t.after(() => instance.dispose());

  const res = await instance.call('getSummary', {});
  assert.equal(res.activeAccount?.email, 'rpc-live@example.com');
  assert.equal(res.activeAccount?.source, 'host_limits_probe');
  const emails = res.discoveredAccounts.map((a) => a.email);
  assert.ok(emails.includes('rpc-live@example.com'));
  assert.ok(emails.includes('managed@example.com'));
});

test('antigravity-account-ledger attributes live daily deltas across account switches, restarts, offline gaps, and repricing', () => {
  const ledger = backend.createDefaultLedger('2026-11-20T02:00:00Z');
  const day = '2026-11-20';

  // 1. Pre-install baseline already exists on install day -> goes honestly to unattributed
  backend.syncTodaySnapshot(day, {
    totalTokens: 16_600_000,
    costUsd: 9.65,
    unpricedTokens: 0,
    inputTokens: 2_000_000,
    outputTokens: 100_000,
    cacheReadTokens: 14_500_000,
    models: { 'gemini-4-neon': { tokens: 16_600_000, costUsd: 9.65, unpricedTokens: 0 } }
  }, { email: 'alice@example.com' }, ledger, { now: '2026-11-20T02:00:00Z', save: false });
  assert.equal(ledger.daily[day].allocations.unattributed.totalTokens, 16_600_000);
  assert.equal(ledger.daily[day].allocations['alice@example.com'], undefined);

  // 2. Live growth under Alice -> attributed to Alice
  backend.syncTodaySnapshot(day, {
    totalTokens: 18_600_000,
    costUsd: 10.80,
    unpricedTokens: 0,
    inputTokens: 2_300_000,
    outputTokens: 120_000,
    cacheReadTokens: 16_180_000,
    models: { 'gemini-4-neon': { tokens: 18_600_000, costUsd: 10.80, unpricedTokens: 0 } }
  }, { email: 'alice@example.com' }, ledger, { now: '2026-11-20T02:05:00Z', save: false });
  assert.equal(ledger.daily[day].allocations['alice@example.com'].totalTokens, 2_000_000);
  assert.equal(Number(ledger.daily[day].allocations['alice@example.com'].costUsd.toFixed(2)), 1.15);

  // 3. Transient lower reading after restart -> does NOT regress high-water mark or double-count
  backend.syncTodaySnapshot(day, {
    totalTokens: 10_000_000,
    costUsd: 5.00,
    models: { 'gemini-4-neon': { tokens: 10_000_000, costUsd: 5.00, unpricedTokens: 0 } }
  }, { email: 'alice@example.com' }, ledger, { now: '2026-11-20T02:06:00Z', save: false });
  assert.equal(ledger.daily[day].lastSnapshot.totalTokens, 18_600_000);
  assert.equal(ledger.daily[day].allocations['alice@example.com'].totalTokens, 2_000_000);

  // 4. Switch to Bob + unpriced new model -> attributed to Bob with unpricedTokens
  backend.syncTodaySnapshot(day, {
    totalTokens: 20_600_000,
    costUsd: 10.80,
    unpricedTokens: 2_000_000,
    inputTokens: 2_800_000,
    outputTokens: 120_000,
    cacheReadTokens: 17_680_000,
    models: {
      'gemini-4-neon': { tokens: 18_600_000, costUsd: 10.80, unpricedTokens: 0 },
      'gemini-5-alpha': { tokens: 2_000_000, costUsd: 0, unpricedTokens: 2_000_000 }
    }
  }, { email: 'bob@example.com' }, ledger, { now: '2026-11-20T02:08:00Z', save: false });
  assert.equal(ledger.daily[day].allocations['bob@example.com'].totalTokens, 2_000_000);
  assert.equal(ledger.daily[day].allocations['bob@example.com'].unpricedTokens, 2_000_000);

  // 5. Host finishes pricing gemini-5-alpha -> Bob receives cost delta and stale unpricedTokens clears
  backend.syncTodaySnapshot(day, {
    totalTokens: 20_600_000,
    costUsd: 14.80,
    unpricedTokens: 0,
    inputTokens: 2_800_000,
    outputTokens: 120_000,
    cacheReadTokens: 17_680_000,
    models: {
      'gemini-4-neon': { tokens: 18_600_000, costUsd: 10.80, unpricedTokens: 0 },
      'gemini-5-alpha': { tokens: 2_000_000, costUsd: 4.00, unpricedTokens: 0 }
    }
  }, { email: 'bob@example.com' }, ledger, { now: '2026-11-20T02:09:00Z', save: false });
  assert.equal(Number(ledger.daily[day].allocations['bob@example.com'].costUsd.toFixed(2)), 4.00);
  assert.equal(ledger.daily[day].allocations['bob@example.com'].unpricedTokens, 0);
  assert.equal(ledger.daily[day].allocations['bob@example.com'].models['gemini-5-alpha'].unpricedTokens, 0);

  // 6. Token Monitor closed for 3 hours, reopened on Carol -> offline growth goes to unattributed
  backend.syncTodaySnapshot(day, {
    totalTokens: 25_600_000,
    costUsd: 17.80,
    unpricedTokens: 0,
    models: {
      'gemini-4-neon': { tokens: 23_600_000, costUsd: 13.80, unpricedTokens: 0 },
      'gemini-5-alpha': { tokens: 2_000_000, costUsd: 4.00, unpricedTokens: 0 }
    }
  }, { email: 'carol@example.com' }, ledger, { now: '2026-11-20T05:10:00Z', save: false });
  assert.equal(ledger.daily[day].allocations['carol@example.com'], undefined);
  assert.equal(ledger.daily[day].allocations.unattributed.totalTokens, 21_600_000);

  // 7. Continuous midnight rollover to next day -> attributed directly to Carol
  backend.syncTodaySnapshot('2026-11-21', {
    totalTokens: 500_000,
    costUsd: 0.40,
    models: { 'gemini-4-neon': { tokens: 500_000, costUsd: 0.40, unpricedTokens: 0 } }
  }, { email: 'carol@example.com' }, ledger, { now: '2026-11-20T05:14:00Z', save: false });
  assert.equal(ledger.daily['2026-11-21'].allocations['carol@example.com'].totalTokens, 500_000);
});

test('antigravity-account-ledger integrates host tools/models/history queries and merges pre-install history as unattributed', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-host-query-'));
  t.after(() => removeTestDir(tmpDir));

  const today = backend.localDayKey();
  const host = makeMockHost({
    limitsRows: [
      { provider: 'antigravity', source: 'rpc', status: 'ok', accountEmail: 'online@example.com', updatedAt: new Date().toISOString() }
    ],
    toolsRows: [
      {
        client: 'antigravity',
        totalTokens: 1_500_000,
        outputTokens: 100_000,
        cacheReadTokens: 1_000_000,
        cacheWriteTokens: 0,
        reasoningTokens: 20_000,
        cost: { knownUsd: 1.85, unpricedTokens: 500_000, completeness: 'partial' },
        models: [
          { model: 'gemini-4-neon', totalTokens: 1_000_000, knownUsd: 1.85 },
          { model: 'mystery-unpriced', totalTokens: 500_000, knownUsd: 0 }
        ]
      },
      {
        client: 'codex',
        totalTokens: 9_999_999,
        cost: { knownUsd: 50, unpricedTokens: 0 },
        models: [{ model: 'gpt-6.1-sol', totalTokens: 9_999_999, knownUsd: 50 }]
      }
    ],
    modelsRows: [
      { model: 'gemini-4-neon', cost: { knownUsd: 1.85, unpricedTokens: 0 } },
      { model: 'mystery-unpriced', cost: { knownUsd: 0, unpricedTokens: 500_000 } }
    ],
    historyRows: [
      {
        date: '2026-11-15',
        client: 'antigravity',
        totalTokens: 5_000_000,
        outputTokens: 200_000,
        cacheReadTokens: 4_000_000,
        cost: { knownUsd: 4.5, unpricedTokens: 0 }
      }
    ]
  });

  const instance = await backend.activate({
    dataDirectory: tmpDir,
    hostDataDir: tmpDir,
    homeDir: tmpDir,
    host
  });
  t.after(() => instance.dispose());

  const res = await instance.call('getSummary', { range: { start: '2026-11-10', end: today }, accountFilter: 'all' });
  assert.equal(res.scannerStats.source, 'host_business_data');
  assert.equal(res.summary.totalTokens, 6_500_000);
  assert.equal(Number(res.summary.costUsd.toFixed(2)), 6.35);
  assert.equal(res.summary.unpricedTokens, 500_000);
  assert.equal(res.summary.models['gemini-4-neon'].costUsd, 1.85);
  assert.equal(res.summary.models['mystery-unpriced'].unpricedTokens, 500_000);
  // Pre-install baseline + historical day are honestly unattributed, never falsely assigned
  assert.equal(res.summary.byAccount.unattributed.totalTokens, 6_500_000);
  assert.equal(res.summary.byAccount['online@example.com'].totalTokens, 0);
});

test('antigravity-account-ledger migrates v1 ledgers safely, backs up corrupt files, and splits heartbeat gaps', (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-ledger-mig-'));
  t.after(() => removeTestDir(tmpDir));

  const corruptFile = path.join(tmpDir, 'corrupt.json');
  fs.writeFileSync(corruptFile, '{"unrelated":true}', 'utf8');
  const rebuilt = backend.loadLedger(corruptFile);
  assert.equal(rebuilt.version, 2);
  assert.equal(fs.readdirSync(tmpDir).filter((n) => n.startsWith('corrupt.json.corrupt-')).length, 1);

  const v1File = path.join(tmpDir, 'v1.json');
  fs.writeFileSync(v1File, JSON.stringify({
    version: 1,
    featureActivatedAt: '2026-11-10T00:00:00Z',
    lastActiveAccount: 'old@example.com',
    timeline: [{ email: 'old@example.com', startedAt: '2026-11-10T00:00:00Z', endedAt: null, source: 'antigravity_tools' }],
    sessionAccounts: {}
  }), 'utf8');
  const migrated = backend.loadLedger(v1File);
  assert.equal(migrated.version, 2);
  assert.equal(migrated.timeline[0].endedAt, '2026-11-10T00:00:00Z');

  backend.recordAccountHeartbeat({ email: 'a@example.com', source: 'host_limits_probe' }, '2026-11-20T10:00:00Z', migrated);
  backend.recordAccountHeartbeat({ email: 'a@example.com', source: 'host_limits_probe' }, '2026-11-20T10:05:00Z', migrated);
  backend.recordAccountHeartbeat({ email: 'b@example.com', source: 'host_limits_probe' }, '2026-11-20T15:00:00Z', migrated);
  assert.equal(migrated.timeline[1].endedAt, '2026-11-20T10:05:00.000Z');
  assert.equal(migrated.timeline[2].email, 'b@example.com');
});

test('antigravity-account-ledger auto refresh respects visibility while background sync records hidden deltas', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-bg-sync-'));
  t.after(() => removeTestDir(tmpDir));

  let currentTokens = 1000;
  let currentEmail = 'first@example.com';
  const host = {
    async call(method, args = {}) {
      if (method === 'app.settings') return {};
      if (method !== 'data.query') return null;
      if (args.resource === 'limits') {
        return {
          availability: 'available',
          rows: [{ provider: 'antigravity', source: 'rpc', status: 'ok', accountEmail: currentEmail, updatedAt: new Date().toISOString() }],
          pageInfo: { hasMore: false, nextCursor: null }
        };
      }
      if (args.resource === 'tools') {
        return {
          availability: 'available',
          rows: [{
            client: 'antigravity',
            totalTokens: currentTokens,
            cost: { knownUsd: currentTokens / 1000, unpricedTokens: 0 },
            models: [{ model: 'gemini-4-neon', totalTokens: currentTokens, knownUsd: currentTokens / 1000 }]
          }],
          pageInfo: { hasMore: false, nextCursor: null }
        };
      }
      return { availability: 'available', rows: [], pageInfo: { hasMore: false, nextCursor: null } };
    }
  };

  const published = [];
  const instance = await backend.activate({
    dataDirectory: tmpDir,
    hostDataDir: tmpDir,
    homeDir: tmpDir,
    host,
    autoRefreshIntervalMs: 35,
    backgroundHeartbeatIntervalMs: 25,
    publish: (val) => published.push(val)
  });
  t.after(() => instance.dispose());

  await instance.call('getSummary', {});
  assert.equal(published.length, 0);
  await tick(90);
  assert.ok(published.length >= 1);

  // Hide panel -> publishing stops, but hidden background sync captures account switch + new tokens!
  instance.update({ visible: false });
  const countWhenHidden = published.length;
  currentEmail = 'second@example.com';
  currentTokens = 2500;
  await tick(90);
  assert.equal(published.length, countWhenHidden);

  const ledgerFile = path.join(tmpDir, backend.DEFAULT_LEDGER_FILENAME);
  const persisted = JSON.parse(fs.readFileSync(ledgerFile, 'utf8'));
  const today = backend.localDayKey();
  assert.equal(persisted.lastActiveAccount, 'second@example.com');
  assert.equal(persisted.daily[today].allocations['second@example.com'].totalTokens, 1500);

  // Becoming visible resumes publishing
  instance.update({ visible: true });
  await tick(60);
  assert.ok(published.length > countWhenHidden);
});

test('antigravity-account-ledger UI renders honest unpriced indicators, 4-column model table, and handles errors', async () => {
  const { activate } = await import('../plugins/antigravity-account-ledger/ui.mjs');
  const dom = installFakeDom();
  try {
    const container = new FakeElement('div');
    let shouldFail = true;
    const ui = activate({
      backend: {
        async call() {
          if (shouldFail) throw new Error('host unavailable');
          return {
            summary: {
              totalTokens: 2000,
              costUsd: 1.25,
              unpricedTokens: 500,
              inputTokens: 1200,
              outputTokens: 300,
              cacheReadTokens: 500,
              cacheWriteTokens: 0,
              reasoningTokens: 50,
              models: {
                'gemini-4-neon': { tokens: 1500, costUsd: 1.25, unpricedTokens: 0 },
                'mystery-model': { tokens: 500, costUsd: 0, unpricedTokens: 500 }
              },
              accounts: [
                { email: 'a@example.com', displayName: 'Alice', totalTokens: 2000, costUsd: 1.25, unpricedTokens: 500, percentageOfTotal: 100 }
              ]
            },
            discoveredAccounts: [{ email: 'a@example.com', displayName: 'Alice' }],
            activeAccount: { email: 'a@example.com' },
            accountFilter: 'all',
            range: { start: '2026-11-01', end: '2026-11-20' }
          };
        },
        subscribe() { return () => {}; }
      }
    });

    const mounted = ui.mount(container, {});
    await tick(20);
    const root = container.querySelector('.ag-ledger-root');
    const banner = root.querySelector('.ag-ledger-status-banner');
    assert.equal(banner.classList.contains('is-error'), true);

    shouldFail = false;
    banner.querySelector('.ag-ledger-retry-btn').dispatch('click');
    await tick(20);
    assert.equal(banner.classList.contains('hidden'), true);

    const kpiValues = root.querySelectorAll('.ag-ledger-kpi-value');
    assert.equal(kpiValues[1].textContent, '$1.25 + ?');
    assert.match(kpiValues[1].title, /500 Tokens 未配置费率/);

    const modelTableWrap = root.querySelector('.ag-ledger-table-wrap');
    const headers = modelTableWrap.querySelectorAll('.ag-ledger-th').map((el) => el.textContent);
    assert.deepEqual(headers, ['模型', '总 Token', '占比 (%)', '折算费用']);

    const rows = modelTableWrap.querySelectorAll('.ag-ledger-row');
    assert.equal(rows.length, 2);
    const mysteryRow = rows.find((r) => r.children[0].textContent === 'mystery-model');
    assert.ok(mysteryRow);
    assert.equal(mysteryRow.children[2].textContent, '25.0%');
    assert.equal(mysteryRow.children[3].textContent, '—');

    mounted.dispose();
  } finally {
    dom.restore();
  }
});

test('antigravity-account-ledger preserves same-account continuity across short window pauses and warns when background mode is off', async () => {
  const ledger = backend.createDefaultLedger('2026-11-20T02:00:00Z');
  const day = '2026-11-20';
  backend.syncTodaySnapshot(day, {
    totalTokens: 1_000_000,
    costUsd: 1.0,
    models: { 'gemini-4-neon': { tokens: 1_000_000, costUsd: 1.0, unpricedTokens: 0 } }
  }, { email: 'alice@example.com' }, ledger, { now: '2026-11-20T03:00:00Z', save: false });

  // 66-minute window pause, still Alice, no other account activity -> attributed to Alice
  backend.syncTodaySnapshot(day, {
    totalTokens: 3_000_000,
    costUsd: 3.0,
    models: { 'gemini-4-neon': { tokens: 3_000_000, costUsd: 3.0, unpricedTokens: 0 } }
  }, { email: 'alice@example.com' }, ledger, {
    now: '2026-11-20T04:06:00Z',
    save: false,
    previousActiveAccount: 'alice@example.com',
    discoveredAccounts: [
      { email: 'alice@example.com', lastUsed: Math.floor(Date.parse('2026-11-20T04:05:00Z') / 1000) },
      { email: 'bob@example.com', lastUsed: Math.floor(Date.parse('2026-11-19T12:00:00Z') / 1000) }
    ]
  });
  assert.equal(ledger.daily[day].allocations['alice@example.com'].totalTokens, 2_000_000);

  // Another 40-minute pause, but Bob WAS active during the gap -> must go to unattributed
  backend.syncTodaySnapshot(day, {
    totalTokens: 4_500_000,
    costUsd: 4.5,
    models: { 'gemini-4-neon': { tokens: 4_500_000, costUsd: 4.5, unpricedTokens: 0 } }
  }, { email: 'alice@example.com' }, ledger, {
    now: '2026-11-20T04:46:00Z',
    save: false,
    previousActiveAccount: 'alice@example.com',
    discoveredAccounts: [
      { email: 'alice@example.com', lastUsed: Math.floor(Date.parse('2026-11-20T04:45:00Z') / 1000) },
      { email: 'bob@example.com', lastUsed: Math.floor(Date.parse('2026-11-20T04:20:00Z') / 1000) }
    ]
  });
  assert.equal(ledger.daily[day].allocations['alice@example.com'].totalTokens, 2_000_000);
  assert.equal(ledger.daily[day].allocations.unattributed.totalTokens, 2_500_000);

  // UI shows reminder when host reports backgroundEnabled === false
  const { activate } = await import('../plugins/antigravity-account-ledger/ui.mjs');
  const dom = installFakeDom();
  try {
    const container = new FakeElement('div');
    const ui = activate({
      backend: {
        async call() {
          return {
            summary: { totalTokens: 0, costUsd: 0, unpricedTokens: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, reasoningTokens: 0, models: {}, accounts: [] },
            discoveredAccounts: [],
            activeAccount: null,
            backgroundEnabled: false,
            accountFilter: 'all',
            range: { start: '2026-11-01', end: '2026-11-20' }
          };
        },
        subscribe() { return () => {}; }
      }
    });
    const mounted = ui.mount(container, {});
    await tick(20);
    const banner = container.querySelector('.ag-ledger-status-banner');
    assert.equal(banner.classList.contains('hidden'), false);
    assert.match(banner.textContent, /后台运行/);
    mounted.dispose();
  } finally {
    dom.restore();
  }
});
