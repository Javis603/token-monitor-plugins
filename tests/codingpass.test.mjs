import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
// Host-normalizer checks run when TOKEN_MONITOR_HOST points at a Token Monitor checkout.
const require = createRequire(import.meta.url);
const PLUGIN = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'plugins', 'codingpass');
const REPO = process.env.TOKEN_MONITOR_HOST;
const { createBackend } = require(path.join(PLUGIN, 'backend.cjs'));
const { parseUsage, normalizeCookie, unwrapRpc } = require(path.join(PLUGIN, 'usage.cjs'));

// Synthetic console payload using the field names from the codingpass.ai bundle.
const USAGE = {
  asOf: '2026-11-23T06:00:00.000Z',
  subscription: { status: 'active', planCode: 'pro', planName: 'Pro', billingPeriod: 'month', periodEnd: '2026-12-10T00:00:00.000Z', quotaResetCredits: 1, quotaResetWeekCredits: 2 },
  quota: { used5hMicro: 1000000, limit5hMicro: 10000000, usedWeekMicro: 12500000, limitWeekMicro: 50000000,
    usedMicro: 80000000, limitMicro: 200000000, monthStart: '2026-11-10T00:00:00.000Z', monthEnd: '2026-12-10T00:00:00.000Z' },
  live: { window5hStartAt: '2026-11-23T04:00:00.000Z', global: [
    { layer: 'global_5h', usedMicro: 2500000, limitMicro: 10000000, resetAt: '2026-11-23T09:00:00.000Z' },
    { layer: 'global_week', usedMicro: 12500000, limitMicro: 50000000, resetAt: '2026-11-30T00:00:00.000Z' },
    { layer: 'global_month', usedMicro: '80000000', limitMicro: 200000000, resetAt: '2026-12-10T00:00:00.000Z' }
  ] },
  payg: { requests: 0, billedMicro: 0 }, models: []
};
const WALLET = { balanceMicro: 12340000, monthSpentMicro: 1000000, rateBps: 10000, paygEnabled: false };
const rpc = value => JSON.stringify(value === undefined ? {} : { json: value });

function fakeHost({ configured = true, cookie = 'session=abc; other=1', responses = {}, calls = [] } = {}) {
  return { calls, async call(method, args) {
    calls.push([method, args]);
    if (method === 'credentials.status') return { configured, revision: 3 };
    if (method === 'credentials.read') return { cookie };
    if (method === 'app.settings') return { locale: 'zh-CN' };
    if (method === 'network.request') {
      const key = args.url.replace('https://codingpass.ai', '');
      const r = responses[key];
      if (r instanceof Error) throw r;
      if (!r) throw Error('network-request-failed');
      return { status: r.status, headers: {}, body: r.body };
    }
    throw Error(`unexpected ${method}`);
  } };
}

test('collect maps usage + wallet into three windows and notes', async () => {
  const calls = [];
  const host = fakeHost({ calls, responses: {
    '/api/app/usage': { status: 200, body: rpc(USAGE) }, '/api/app/wallet': { status: 200, body: rpc(WALLET) } } });
  const reading = await createBackend({ host }).call('limits.collect', { moduleId: 'plan' });
  assert.equal(reading.status, 'ok');
  assert.equal(reading.plan, 'Pro');
  assert.deepEqual(reading.windows.map(w => [w.kind, w.label, w.used, w.limit, w.span]), [
    ['session', '5-hour', 2.5, 10, 1], ['weekly', 'Weekly', 12.5, 50, 1], ['billing', 'Monthly', 80, 200, 2]]);
  assert.equal(reading.windows[0].resetsAt, '2026-11-23T09:00:00.000Z');
  assert.equal(reading.windows[2].resetsAt, '2026-12-10T00:00:00.000Z');
  const wallet = reading.notes.find(n => n.label === '按量钱包余额');
  assert.deepEqual(wallet.value, { amount: 12.34, currency: 'USD' });
  assert.ok(reading.notes.some(n => n.label === '本期结束' && n.value === '2026-12-10'));
  // Request shape matches the console's oRPC client.
  const usageCall = calls.find(([m, a]) => m === 'network.request' && a.requestId === 'usage')[1];
  assert.equal(usageCall.method, 'POST');
  assert.equal(usageCall.body, '{"json":{}}');
  assert.equal(usageCall.headers.Cookie, 'session=abc; other=1');
  assert.equal(usageCall.moduleId, 'plan');
  const walletCall = calls.find(([m, a]) => m === 'network.request' && a.requestId === 'wallet')[1];
  assert.equal(walletCall.body, '{}');
});

test('wallet failure does not fail the reading', async () => {
  const host = fakeHost({ responses: { '/api/app/usage': { status: 200, body: rpc(USAGE) }, '/api/app/wallet': new Error('network-request-failed') } });
  const reading = await createBackend({ host }).call('limits.collect', { moduleId: 'plan' });
  assert.equal(reading.status, 'ok');
  assert.equal(reading.windows.length, 3);
  assert.ok(!reading.notes.some(n => n.label === '按量钱包余额'));
});

test('status mapping: not configured, 401, 429, 500, network, bad JSON', async () => {
  const collect = async opts => (await createBackend({ host: fakeHost(opts) }).call('limits.collect', { moduleId: 'plan' })).status;
  assert.equal(await collect({ configured: false }), 'notConfigured');
  assert.equal(await collect({ cookie: '   ' }), 'unauthorized');
  assert.equal(await collect({ responses: { '/api/app/usage': { status: 401, body: '{"code":"AUTH.UNAUTHORIZED"}' } } }), 'unauthorized');
  assert.equal(await collect({ responses: { '/api/app/usage': { status: 429, body: '' } } }), 'rateLimited');
  assert.equal(await collect({ responses: { '/api/app/usage': { status: 500, body: '' } } }), 'unavailable');
  assert.equal(await collect({ responses: {} }), 'unavailable');
  assert.equal(await collect({ responses: { '/api/app/usage': { status: 200, body: '<html>' } } }), 'error');
});

test('uncapped windows become notes; idle 5h window has no reset time', () => {
  const usage = { ...USAGE, quota: { ...USAGE.quota, limit5hMicro: null }, live: { window5hStartAt: null, global: [] } };
  const reading = parseUsage(usage, null, { locale: 'en' });
  assert.deepEqual(reading.windows.map(w => [w.kind, w.span]), [['weekly', 1], ['billing', 2]]);
  assert.ok(reading.notes.some(n => n.label === '5-hour' && n.value === 'No cap'));
  assert.equal(reading.windows[1].resetsAt, '2026-12-10T00:00:00.000Z'); // falls back to monthEnd
  const idle = parseUsage({ ...USAGE, live: { window5hStartAt: null, global: USAGE.live.global } }, null);
  assert.equal(idle.windows[0].resetsAt, undefined);
});

test('a zero allowance is an exhausted window, not an uncapped one', () => {
  const quota = { ...USAGE.quota, limit5hMicro: 0, limitWeekMicro: 0, limitMicro: 0, used5hMicro: 0, usedWeekMicro: 0, usedMicro: 0 };
  const global = USAGE.live.global.map(entry => ({ ...entry, usedMicro: 0, limitMicro: 0 }));
  const reading = parseUsage({ ...USAGE, quota, live: { ...USAGE.live, global } }, null, { locale: 'en' });
  assert.deepEqual(reading.windows.map(w => [w.kind, w.used, w.limit, w.usedPercent]),
    [['session', 0, 0, 100], ['weekly', 0, 0, 100], ['billing', 0, 0, 100]]);
  assert.ok(!(reading.notes || []).some(n => n.value === 'No cap'));
  const left = reading.windows[0].infoRows.find(row => row.label === 'Left');
  assert.deepEqual(left.value, { amount: 0, currency: 'USD' });
  // A capped window keeps the host-derived percentage.
  assert.equal(parseUsage(USAGE, null).windows[0].usedPercent, undefined);
});

test('a live zero does not override an explicitly uncapped quota; a live cap still fills in', () => {
  const live = { ...USAGE.live, global: USAGE.live.global.map(e => e.layer === 'global_5h' ? { ...e, limitMicro: 0 } : e) };
  const uncapped = parseUsage({ ...USAGE, quota: { ...USAGE.quota, limit5hMicro: null }, live }, null, { locale: 'en' });
  assert.deepEqual(uncapped.windows.map(w => w.kind), ['weekly', 'billing']);
  assert.ok(uncapped.notes.some(n => n.label === '5-hour' && n.value === 'No cap'));
  const filled = parseUsage({ ...USAGE, quota: { ...USAGE.quota, limit5hMicro: null } }, null);
  assert.deepEqual(filled.windows[0].limit, 10);
});

test('no subscription yields an informative note', () => {
  const reading = parseUsage({ subscription: null, quota: null, live: null }, null, { locale: 'en' });
  assert.deepEqual(reading.windows, []);
  assert.equal(reading.notes[0].label, 'No active CodingPass plan');
});

test('credential validation via /api/auth/state', async () => {
  const validate = async (opts) => createBackend({ host: fakeHost(opts) }).call('credentials.validate', { moduleId: 'plan', revision: 3 });
  assert.deepEqual(await validate({ responses: { '/api/auth/state': { status: 200, body: '{"userId":"user_1","email":"x"}' } } }), { status: 'valid' });
  assert.deepEqual(await validate({ responses: { '/api/auth/state': { status: 200, body: '{"userId":null}' } } }), { status: 'expired' });
  assert.deepEqual(await validate({ cookie: 'garbage-without-equals' }), { status: 'rejected' });
  assert.deepEqual(await validate({ responses: {} }), { status: 'unavailable' });
  await assert.rejects(createBackend({ host: fakeHost() }).call('credentials.validate', { moduleId: 'plan', revision: -1 }));
  await assert.rejects(createBackend({ host: fakeHost() }).call('limits.collect', { moduleId: 'other' }));
});

test('cookie normalization accepts DevTools copies', () => {
  assert.equal(normalizeCookie('Cookie: a=1; b=2'), 'a=1; b=2');
  assert.equal(normalizeCookie('a=1\r\nb=2\n'), 'a=1; b=2');
  assert.equal(normalizeCookie(''), null);
  assert.equal(normalizeCookie('no equals sign'), null);
  assert.deepEqual(unwrapRpc('{"json":{"x":1},"meta":[]}'), { x: 1 });
});

test('readings pass the Token Monitor host normalizers', { skip: !REPO && 'TOKEN_MONITOR_HOST not set' }, async () => {
  const { normalizeLimitWindow } = require(path.join(REPO, 'src/shared/limits/core'));
  const { windowDetails, normalizeNotes } = require(path.join(REPO, 'src/electron/plugins/quotaDetails'));
  for (const locale of ['en', 'zh-CN', 'zh-TW']) {
    const reading = parseUsage(USAGE, WALLET, { locale });
    assert.ok(reading.windows.length <= 16);
    for (const window of reading.windows) {
      const normalized = normalizeLimitWindow(window);
      assert.ok(normalized, `window ${window.kind} rejected`);
      assert.equal(normalized.label, window.label);
      assert.ok(normalized.usedPercent > 0 && normalized.usedPercent < 100);
      windowDetails(window);
    }
    normalizeNotes(reading.notes);
  }
  const p = parseUsage(USAGE, WALLET).windows.map(w => normalizeLimitWindow(w).usedPercent);
  assert.deepEqual(p, [25, 25, 40]);
  const empty = parseUsage({ ...USAGE, quota: { ...USAGE.quota, limit5hMicro: 0 }, live: null }, null);
  assert.equal(normalizeLimitWindow(empty.windows[0]).usedPercent, 100);
  assert.equal(normalizeLimitWindow(empty.windows[0]).remainingPercent, 0);
});

test('manifest and package pass the host validator', { skip: !REPO && 'TOKEN_MONITOR_HOST not set' }, () => {
  const { packageDirectory } = require(path.join(REPO, 'src/electron/plugins/package'));
  const pkg = packageDirectory(PLUGIN, { checkCompatibility: false });
  assert.equal(pkg.manifest.id, 'codingpass');
  assert.equal(pkg.manifest.limits[0].id, 'plan');
  assert.ok(pkg.manifest.limits[0].credentials);
});
