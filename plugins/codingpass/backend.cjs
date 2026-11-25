'use strict';
const { parseUsage, unwrapRpc, normalizeCookie, resolveLocale } = require('./usage.cjs');

// The codingpass.ai console talks to an oRPC router mounted at /api with
// cookie (session) authentication: POST /api/app/<procedure>, body { json: input }.
const ORIGIN = 'https://codingpass.ai';
const MODULE_ID = 'plan';

function createBackend({ host }) {
  function request(requestId, path, { method = 'POST', input, cookie }) {
    const headers = { Accept: 'application/json', Cookie: cookie, Origin: ORIGIN, Referer: `${ORIGIN}/app` };
    const init = { moduleId: MODULE_ID, requestId, url: `${ORIGIN}${path}`, method, headers, timeoutMs: 15000 };
    if (method === 'POST') {
      headers['Content-Type'] = 'application/json';
      // Matches the console client: no input serializes to "{}".
      init.body = JSON.stringify(input === undefined ? {} : { json: input });
    }
    return host.call('network.request', init);
  }

  async function readCookie(expectedRevision) {
    const saved = await host.call('credentials.read', { moduleId: MODULE_ID, ...(expectedRevision === undefined ? {} : { expectedRevision }) });
    return normalizeCookie(saved.cookie);
  }

  async function locale() {
    try {
      const settings = await host.call('app.settings');
      const tag = settings?.locale || (settings?.language && settings.language !== 'auto' ? settings.language : Intl.DateTimeFormat().resolvedOptions().locale);
      return resolveLocale(tag);
    } catch (_) { return 'en'; }
  }

  // Explicit "verify credentials": /api/auth/state answers 200 either way and
  // reports userId only for a live console session.
  async function validate(revision) {
    let response;
    try {
      const cookie = await readCookie(revision);
      if (!cookie) return { status: 'rejected' };
      response = await request('credential-check', '/api/auth/state', { method: 'GET', cookie });
    } catch (_) { return { status: 'unavailable' }; }
    if ([401, 403].includes(response.status)) return { status: 'rejected' };
    if (response.status !== 200) return { status: 'unavailable' };
    try {
      const state = JSON.parse(response.body);
      return { status: state && typeof state.userId === 'string' && state.userId ? 'valid' : 'expired' };
    } catch (_) { return { status: 'unavailable' }; }
  }

  async function collect() {
    const failure = status => ({ status, windows: [] });
    let usageResponse, walletResponse, cookie;
    try {
      const saved = await host.call('credentials.status', { moduleId: MODULE_ID });
      if (!saved.configured) return failure('notConfigured');
      cookie = await readCookie();
      if (!cookie) return failure('unauthorized');
      [usageResponse, walletResponse] = await Promise.all([
        request('usage', '/api/app/usage', { input: {}, cookie }),
        // The wallet is optional detail; never fail the reading because of it.
        request('wallet', '/api/app/wallet', { cookie }).catch(() => null)
      ]);
    } catch (_) { return failure('unavailable'); }
    if ([401, 403].includes(usageResponse.status)) return failure('unauthorized');
    if (usageResponse.status === 429) return failure('rateLimited');
    if (usageResponse.status !== 200) return failure('unavailable');
    let usage, wallet = null;
    try { usage = unwrapRpc(usageResponse.body); } catch (_) { return failure('error'); }
    if (walletResponse?.status === 200) { try { wallet = unwrapRpc(walletResponse.body); } catch (_) { wallet = null; } }
    try { return parseUsage(usage, wallet, { locale: await locale() }); } catch (_) { return failure('error'); }
  }

  return {
    async call(method, args) {
      if (args?.moduleId !== MODULE_ID) throw Error('Unknown CodingPass module');
      if (method === 'limits.collect') return collect();
      if (method === 'credentials.validate') {
        if (!Number.isSafeInteger(args.revision) || args.revision < 0) throw Error('Invalid credential revision');
        return validate(args.revision);
      }
      throw Error('Unknown CodingPass operation');
    }
  };
}

exports.createBackend = createBackend;
exports.activate = async context => createBackend(context);
