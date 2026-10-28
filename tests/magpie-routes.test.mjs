import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { stagedRoutes, maskName } from '../plugins/magpie-routes/model.mjs';
const require = createRequire(import.meta.url), gateway = require('../plugins/magpie-routes/gateway.cjs');
test('trace projection retains display metadata but excludes raw session and body data', () => {
  const row = { id: 1, agent: 'codex', session: 'private-session-fixture', body: 'private-body-fixture', request: { body: 'private-body-fixture' },
    order: [], tries: [], prompt: { tokens: 100, parts: [{ kind: 'files', tokens: 40, items: [{ name: 'fixture.txt', tokens: 40, body: 'private-body-fixture' }] }] } };
  const result = gateway.trace({ object: 'trace', seq: 1, pid: 1, ids: [1], routes: [row], totals: { requests: 1 } });
  assert.equal(result.routes[0].prompt.tokens, 100);
  assert.equal(result.routes[0].prompt.parts[0].items[0].name, 'fixture.txt');
  assert.equal(JSON.stringify(result).includes('private-body-fixture'), false);
  assert.equal(JSON.stringify(result).includes('private-session-fixture'), false);
  assert.match(result.routes[0].sessionKey, /^[a-f0-9]{64}$/);
});
test('historical selection shows only its selected route; live mode excludes expired completed work', () => {
  const now = Date.now(), old = { id: 1, agent: 'codex', done: true, time: new Date(now - 60000).toISOString() };
  const live = { id: 2, agent: 'codex', done: false, time: new Date(now).toISOString() };
  assert.deepEqual(stagedRoutes([old, live], old, false, now), [old]);
  assert.deepEqual(stagedRoutes([old, live], live, true, now), [live]);
  assert.notEqual(maskName('fixture@example.test', 0), 'fixture@example.test');
});
test('loopback transport rejects redirects and cancels an outstanding request', async t => {
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    if (request.url === '/redirect') { response.writeHead(302, { location: 'https://example.test/' }); response.end(); }
    else if (request.url === '/ok') response.end(JSON.stringify({ name: 'magpie' }));
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { for (const socket of sockets) socket.destroy(); await new Promise(resolve => server.close(resolve)); });
  const port = server.address().port;
  assert.equal((await gateway.readJSON(port, '/ok')).name, 'magpie');
  await assert.rejects(gateway.readJSON(port, '/redirect'), /302/);
  const controller = new AbortController(), pending = gateway.readJSON(port, '/pending', controller.signal);
  controller.abort(); await assert.rejects(pending, /abort/i);
});
