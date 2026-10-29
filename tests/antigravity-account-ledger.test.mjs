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

test('antigravity-account-ledger backend activates and computes range summaries with isolated storage', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-ledger-test-'));
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));
  const instance = await backend.activate({ dataDirectory: tmpDir });
  assert.ok(instance);
  const res = await instance.call('getSummary', {
    range: { start: '2026-10-01', end: '2026-10-29' },
    accountFilter: 'all'
  });
  assert.ok(res.summary);
  assert.equal(typeof res.summary.totalTokens, 'number');
  instance.dispose?.();
});
