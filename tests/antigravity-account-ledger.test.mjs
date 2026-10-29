import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { packageChangelog, CHANGELOG_FILES } from '../scripts/changelog.mjs';

const require = createRequire(import.meta.url);
const backend = require('../plugins/antigravity-account-ledger/backend.cjs');

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

test('antigravity-account-ledger backend activates and computes range summaries with isolated storage', async (t) => {
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

  const assigned = await instance.call('assignDateRange', {
    startDate: '2026-10-10',
    endDate: '2026-10-12',
    email: 'manual@example.com'
  });
  assert.equal(assigned.attributionRules.length, 1);
  assert.equal(assigned.attributionRules[0].email, 'manual@example.com');

  const removed = await instance.call('removeDateRangeRule', {
    id: assigned.attributionRules[0].id
  });
  assert.equal(removed.attributionRules.length, 0);
  instance.dispose?.();
});

test('antigravity-account-ledger UI mounts into Home module header, toggles collapse, assigns date ranges, and cleans up on dispose', async () => {
  const { activate } = await import('../plugins/antigravity-account-ledger/ui.mjs');
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

  const prevDoc = globalThis.document;
  const prevStorage = globalThis.localStorage;
  const store = new Map();
  globalThis.document = { createElement: (tag) => new FakeElement(tag) };
  globalThis.localStorage = {
    getItem: (k) => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v))
  };

  try {
    const hostModule = new FakeElement('section');
    hostModule.className = 'home-module home-module-plugin';
    const hostHead = new FakeElement('div');
    hostHead.className = 'home-module-head';
    const hostHeadEnd = new FakeElement('div');
    hostHeadEnd.className = 'home-module-head-end';
    const hostMeta = new FakeElement('span');
    hostMeta.className = 'home-module-meta';
    hostHeadEnd.append(hostMeta);
    hostHead.append(hostHeadEnd);
    const container = new FakeElement('div');
    container.className = 'home-plugin-body';
    hostModule.append(hostHead, container);

    const callsMade = [];
    const ui = activate({
      backend: {
        async call(method, payload) {
          callsMade.push({ method, payload });
          return {
            summary: { totalTokens: 1500, costUsd: 0.25, inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, reasoningTokens: 0, models: {}, accounts: [] },
            discoveredAccounts: ['user@example.com'],
            activeAccount: { email: 'user@example.com' },
            attributionRules: method === 'assignDateRange'
              ? [{ id: 'rule-1', startDate: payload.startDate, endDate: payload.endDate, email: payload.email }]
              : []
          };
        },
        subscribe() { return () => {}; }
      }
    });

    const mounted = ui.mount(container, {});
    await new Promise(r => setTimeout(r, 10));
    const root = container.querySelector('.ag-ledger-root');
    assert.ok(root);
    assert.equal(root.classList.contains('surface-home'), true);
    assert.equal(hostMeta.style.display, 'none');
    const injectedHeader = hostHeadEnd.querySelector('.ag-ledger-header-right');
    assert.ok(injectedHeader);

    const assignBtn = root.querySelector('.ag-ledger-assign-btn');
    assert.ok(assignBtn);
    for (const fn of assignBtn.listeners.get('click') || []) {
      await fn();
    }
    assert.equal(callsMade.some(c => c.method === 'assignDateRange' && c.payload.email === 'user@example.com'), true);

    const collapseBtn = injectedHeader.querySelector('.ag-ledger-collapse-btn');
    assert.ok(collapseBtn);
    for (const fn of collapseBtn.listeners.get('click') || []) {
      fn({ stopPropagation() {}, target: collapseBtn });
    }
    assert.equal(root.classList.contains('is-collapsed'), true);
    assert.equal(hostModule.classList.contains('ag-ledger-module-collapsed'), true);

    mounted.update({ surface: 'home' });
    assert.equal(root.classList.contains('surface-home'), true);
    assert.equal(root.classList.contains('is-collapsed'), true);

    mounted.dispose();
    assert.equal(hostHeadEnd.querySelector('.ag-ledger-header-right'), null);
    assert.equal(hostMeta.style.display, '');
    assert.equal(hostModule.classList.contains('ag-ledger-module-collapsed'), false);
    assert.equal(container.children.length, 0);
  } finally {
    globalThis.document = prevDoc;
    globalThis.localStorage = prevStorage;
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
});

test('antigravity-account-ledger discovers active account priority and applies 4-layer attribution + cross-midnight deltas', (t) => {
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
  backend.assignDateRange({ startDate: '2026-10-15', endDate: '2026-10-16', email: 'rule@example.com' }, ledger);
  const quotaWindows = backend.buildQuotaAttributionWindows(discovered, { homeDir: tmpHome });

  const l1 = backend.attributeCallRecord({
    timestampMs: Date.parse('2026-10-28T12:00:00Z'),
    day: '2026-10-28',
    model: 'claude-opus-4-6-thinking'
  }, { ledger, quotaWindows });
  assert.equal(l1.layer, 1);
  assert.equal(l1.email, 'active@example.com');

  const l2 = backend.attributeCallRecord({
    timestampMs: Date.parse('2026-10-15T12:00:00Z'),
    day: '2026-10-15',
    model: 'claude-opus-4-6-thinking'
  }, { ledger, quotaWindows });
  assert.equal(l2.layer, 2);
  assert.equal(l2.email, 'rule@example.com');

  const l3 = backend.attributeCallRecord({
    timestampMs: Date.parse('2026-10-25T15:00:00Z'),
    day: '2026-10-25',
    model: 'claude-opus-4-6-thinking'
  }, { ledger, quotaWindows });
  assert.equal(l3.layer, 3);
  assert.equal(l3.email, 'quota@example.com');

  const l4 = backend.attributeCallRecord({
    timestampMs: Date.parse('2026-09-01T12:00:00Z'),
    day: '2026-09-01',
    model: 'claude-opus-4-6-thinking'
  }, { ledger, quotaWindows });
  assert.equal(l4.layer, 4);
  assert.equal(l4.email, 'unattributed');

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
