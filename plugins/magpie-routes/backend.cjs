'use strict';
const gateway = require('./gateway.cjs');

exports.activate = async ({ host, publish }) => {
  let settings = await host.call('settings.get'), values = settings.values;
  let maskWrites = Promise.resolve();
  let disposed = false, generation = 0, controller, retryTimer, laneTimer;
  let routes = new Map(), seq = 0, pid = null;
  let state = { connection: 'connecting', error: '', endpoint: '', version: '', updatedAt: null,
    totals: { requests: 0, rerouted: 0, errors: 0 }, active: [], activityAvailable: false, routes: [], maskAccounts: values.maskAccounts, lifted: {} };
  const snapshot = () => ({ ...state, routes: [...routes.values()].sort((a, b) => b.id - a.id) });
  const emit = () => { if (!disposed) publish(snapshot()); };
  const current = run => !disposed && run === generation;
  function stop() {
    generation++; controller?.abort(); clearTimeout(retryTimer); clearTimeout(laneTimer);
  }
  async function start() {
    stop(); if (disposed) return;
    const run = generation; controller = new AbortController();
    const signal = controller.signal;
    seq = 0; pid = null;
    state = { ...state, connection: 'connecting', error: '', maskAccounts: values.maskAccounts, activityAvailable: false };
    emit();
    try {
      const port = gateway.detectPort(values.port);
      state.endpoint = `127.0.0.1:${port}`;
      const hello = await gateway.readJSON(port, '/', signal, 5000);
      if (hello.name !== 'magpie') throw new Error('此連接埠不是 Magpie gateway，請檢查插件設定。');
      if (!current(run)) return;
      state.version = typeof hello.version === 'string' ? hello.version : '';
      void lanes(port, run, signal);
      let first = true;
      while (current(run)) {
        const next = gateway.trace(await gateway.readJSON(port, `/v1/magpie/trace?after=${seq}${first ? '' : '&wait=1'}`, signal));
        first = false;
        if (!current(run)) return;
        if (pid !== next.pid || next.seq < seq) {
          routes = new Map();
          // On first connect the concurrent activity read may already have
          // arrived. Keep it; invalidate activity only on a known restart.
          if (pid !== null) { state.active = []; state.activityAvailable = false; }
        }
        pid = next.pid; seq = next.seq;
        const ids = new Set(next.ids);
        for (const id of routes.keys()) if (!ids.has(id)) routes.delete(id);
        for (const row of next.routes) if (ids.has(row.id)) routes.set(row.id, row);
        state = { ...state, connection: 'online', error: '', processId: pid, updatedAt: Date.now(), totals: next.totals, lifted: next.lifted };
        emit();
      }
    } catch (error) {
      if (!current(run)) return;
      generation++;
      controller.abort(); clearTimeout(laneTimer);
      state = { ...state, connection: 'offline', activityAvailable: false, error: ['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH'].includes(error.code)
        ? '連不到 Magpie。請確認 menu bar 的 Magpie 仍在運行；會自動重連。' : error.message };
      emit(); retryTimer = setTimeout(start, 3000);
    }
  }
  async function lanes(port, run, signal) {
    try {
      const active = gateway.concurrency(await gateway.readJSON(port, '/v1/magpie/concurrency', signal, 5000));
      if (!current(run)) return;
      state = { ...state, active, activityAvailable: true }; emit();
    } catch {
      if (!current(run)) return;
      state = { ...state, activityAvailable: false }; emit();
    }
    if (current(run)) laneTimer = setTimeout(() => lanes(port, run, signal), 1500);
  }
  function applySettings(next) {
    if (next.revision < settings.revision) return;
    const previous = values; settings = next; values = next.values;
    state.maskAccounts = values.maskAccounts;
    if (previous.port !== values.port) void start(); else emit();
  }
  function toggleMask() {
    // All renderer windows share this queue and the host's persisted setting.
    const pending = maskWrites.then(async () => {
      const latest = await host.call('settings.get');
      const saved = await host.call('settings.update', {
        schemaVersion: latest.schemaVersion, expectedRevision: latest.revision,
        patch: { maskAccounts: !latest.values.maskAccounts }
      });
      applySettings(saved);
      return snapshot();
    });
    maskWrites = pending.catch(() => {});
    return pending;
  }
  emit(); void start();
  return {
    call(method) {
      if (method === 'toggleMask') return toggleMask();
      if (method === 'snapshot') return snapshot();
      if (method === 'reconnect') { void start(); return snapshot(); }
      throw new Error('Unknown Magpie Routes operation');
    },
    update(context) {
      if (context.settings) applySettings(context.settings);
    },
    dispose() { disposed = true; stop(); routes.clear(); }
  };
};
