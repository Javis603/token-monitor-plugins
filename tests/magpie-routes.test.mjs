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

test('DeepSeek Harness resolves its bundled whale and unknown agents never request missing assets', async t => {
  const { brand } = await import('../plugins/magpie-routes/graphics.mjs');
  const { agentName } = await import('../plugins/magpie-routes/model.mjs');
  const fs = await import('node:fs');
  const previous = globalThis.document;
  const node = tag => ({ tag, dataset: {}, style: {}, children: [], classList: { add() {} }, setAttribute() {}, append(...children) { this.children.push(...children); } });
  globalThis.document = { documentElement: { lang: 'en' }, createElement: node, createElementNS: (_, tag) => node(tag) };
  t.after(() => { globalThis.document = previous; });
  const requests = [], ctx = { asset(name) { requests.push(name); assert.ok(fs.existsSync(new URL('../plugins/magpie-routes/'+name, import.meta.url)), name); return name; } };
  const whale = brand(ctx, 'dsh');
  assert.equal(whale.children[0].tag, 'img');
  assert.equal(whale.children[0].src, 'assets/deepseek-color.svg');
  assert.equal(agentName('dsh'), 'DeepSeek Harness');
  assert.equal(brand(ctx, 'avibe').children[0].src, 'assets/avibe.png');
  assert.equal(brand(ctx, 'future-agent').children[0].tag, 'svg');
  assert.equal(brand(ctx, 'future-agent', 'file:/private/avatar.png').children[0].tag, 'svg');
  assert.equal(brand(ctx, 'future-agent', '../../outside').children[0].tag, 'svg');
  assert.equal(requests.length, 2);
});

test('current upstream routing facts survive projection and produce moved-model explanations', async () => {
  const { storyItems } = await import('../plugins/magpie-routes/story.mjs');
  const { routeStatus } = await import('../plugins/magpie-routes/model.mjs');
  const raw = {id: 2, agent: 'dsh', model: 'deepseek-flash', moved: {to:'group/compact',why:'dsh-compact',body:'secret-body'},
    order:[{id:'a',provider:'deepseek',name:'DeepSeek',model:'deepseek-flash',known:true,used:10,balance:0,unit:'USD',weekLow:true,useFirst:true,soon:['2026-12-01T00:00:00Z'],unreached:0,price:{input:1,output:2,key:'secret-key'}}],
    tries:[{id:'a',model:'deepseek-flash',done:true,status:200,sentBy:'plugin',kept:true}],done:true,status:200,usage:[]};
  const row = gateway.trace({object:'trace',seq:1,pid:1,ids:[2],routes:[raw],totals:{}}).routes[0];
  assert.deepEqual(row.moved,{to:'group/compact',why:'dsh-compact'});
  assert.deepEqual(row.order[0].price,{input:1,output:2});
  assert.equal(row.order[0].balance,0);
  assert.equal(row.tries[0].sentBy,'plugin');
  assert.equal(JSON.stringify(row).includes('secret-'),false);
  const english = storyItems(row,false).map(([s])=>s).join('\n');
  assert.match(english,/compact its conversation/);
  assert.match(english,/plugin sent this request itself/);
  assert.equal(routeStatus({...row,canceled:true,status:499,error:'canceled'}).tone,'done');
  assert.equal(routeStatus({...row,tries:[{fail:'canceled'}],status:499,error:'canceled'}).label,'Canceled');
});

test('upstream routing modes and retry failures render from the projected DTO', async () => {
  const { storyItems, routingDescription } = await import('../plugins/magpie-routes/story.mjs');
  const modes = ['', 'order','drain','rotate','usage','pace','manual','weight','free','cheap','expiring','fast'];
  const failures = ['quota','rate','canceled','auth','foreign','floor','update','verify','refused','prompt','sight','shape','effort','slow','offline','proxy','other'];
  for (const mode of modes) for (const fail of ['', ...failures]) {
    const candidate = {id:'first',provider:'deepseek',name:'DeepSeek',model:'deepseek-flash',routing:mode,rank:1,known:true,used:10,
      renews:['2026-12-01T00:00:00Z'],soon:['2026-12-01T00:00:00Z'],unit:'credits',amount:10,limit:100,price:{input:1,output:2}};
    const rest = {why:fail,status:429,by:'backoff',failures:2,until:'2026-12-01T00:00:00Z',rate:true};
    const raw = {id:1,time:'2026-11-10T00:00:00Z',agent:'dsh',model:'deepseek-flash',provider:'deepseek',done:true,status:fail?429:200,
      group:{id:'g',name:'Group',routing:mode,members:['deepseek-flash']},
      order:[candidate,{...candidate,id:'second',rank:2,used:30}],tries:[{id:'first',model:'deepseek-flash',done:true,status:fail?429:200,fail,rest,start:'2026-11-10T00:00:00Z',ms:100}],usage:[]};
    const row = gateway.trace({object:'trace',seq:1,pid:1,ids:[1],routes:[raw],totals:{}}).routes[0];
    const words=storyItems(row,true).map(([s])=>s).join('\n');
    assert.ok(words.length>0,mode+':'+fail);
    assert.doesNotMatch(words,/undefined|NaN/,mode+':'+fail);
    assert.ok(routingDescription(mode).length>0);
  }
});
