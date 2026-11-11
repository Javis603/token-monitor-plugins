import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createRequire } from 'node:module';
import { stagedRoutes, maskName } from '../plugins/magpie-routes/model.mjs';
const require = createRequire(import.meta.url), gateway = require('../plugins/magpie-routes/gateway.cjs');
test('agent colours follow the upstream palette and keep visible agents distinct',async()=>{
  const {createAgentColors}=await import('../plugins/magpie-routes/model.mjs');
  const colours=createAgentColors(),ids=['claude','codex','gemini','t3code'];colours.hues(ids);
  assert.deepEqual(ids.map(id=>colours.hueOf(id)),['#d97757','#858ad7','#2e9fc9','#5e95d7']);
  const clash=createAgentColors();clash.hues(['gemini','deveco']);assert.notEqual(clash.hueOf('gemini'),clash.hueOf('deveco'));
  const before=clash.hueOf('deveco');clash.hues(['deveco','gemini']);assert.equal(clash.hueOf('deveco'),before);
  const crowded=createAgentColors(),many=Array.from({length:13},(_,i)=>'fixture-agent-'+i);crowded.hues(many);
  const seen=new Map();let pair;
  for(const id of many){const hue=crowded.hueOf(id);if(seen.has(hue)){pair=[seen.get(hue),id];break;}seen.set(hue,id);}
  assert.ok(pair);crowded.hues(pair);assert.notEqual(crowded.hueOf(pair[0]),crowded.hueOf(pair[1]));
  assert.equal(createAgentColors().hueOf('t3code'),'#5e95d7');
});
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

test('routing explanations preserve reserve, account restrictions, credits and price facts', async () => {
  const { storyItems } = await import('../plugins/magpie-routes/story.mjs');
  const first = {id:'a',provider:'deepseek',name:'First',model:'deepseek-flash',kind:'key',routing:'order',rank:1};
  const raw = {id:1,time:'2026-11-10T00:00:00Z',agent:'dsh',model:'deepseek-flash',provider:'deepseek',order:[first],tries:[],left:[]};
  const project = changes => gateway.trace({object:'trace',seq:1,pid:1,ids:[1],routes:[{...raw,...changes}],totals:{}}).routes[0];
  const words = row => storyItems(row,false).map(([s])=>s).join('\n');
  const reserved = project({order:[first,{...first,id:'b',name:'Reserved',rank:2,aside:true,reserve:2}]});
  assert.match(words(reserved),/Reserved is in reserve: 2/);
  assert.doesNotMatch(words(reserved),/Reserved is made for/);
  for (const heldOwn of [false,true]) {
    const held = project({left:[{...first,id:'b',name:'Restricted',held:true,heldBy:'Team group',heldOwn}]});
    assert.match(words(held),heldOwn ? /Team group names another account/ : /routing group Team group is held to other accounts/);
    assert.doesNotMatch(words(held),/gateway key asking may not use/);
  }
  const credits = project({order:[{...first,creditsLast:true},{...first,id:'b',creditsLast:true}]});
  assert.match(words(credits),/set to spend them only after everything else/);
  const expiry = project({order:[{...first,routing:'expiring',free:true,expires:'2026-11-11T00:00:00Z'},{...first,id:'b'}]});
  assert.equal(expiry.order[0].expires,'2026-11-11T00:00:00Z');
  assert.match(words(expiry),/free quota is lost soonest/);
  const peak = project({order:[{...first,routing:'cheap',price:{input:1,output:2,peak:true}},{...first,id:'b'}]});
  assert.match(words(peak),/even at its peak price/);
});

test('classifier explanations retain the answer, prior turn and inherited reasoning', async () => {
  const { storyItems } = await import('../plugins/magpie-routes/story.mjs');
  const raw = {id:1,agent:'dsh',model:'m',provider:'p',order:[{id:'a',name:'Provider',model:'m',kind:'key'}],tries:[]};
  const cases = [
    [{intents:['Code'],said:'Unmatched',after:'Code'}, /answered “Unmatched”, which is no rule's intent/, /turn 1 was “Code”/],
    [{intents:[],above:'high'}, /group above picked high reasoning/],
    [{intents:[],effort:'high',score:2,afterEffort:'low'}, /turn 1 reasoned at low/],
    [{intents:['Code'],said:'0'}, /said none/]
  ];
  for (const nested of [false,true]) for (const [classified,...expected] of cases) {
    const rule = {turn:2,tokens:100,classified:{by:'Classifier',...classified,body:'secret-classifier-body'}};
    const row = gateway.trace({object:'trace',seq:1,pid:1,ids:[1],routes:[{...raw,
      ...(nested ? {nested:[{group:'inner',rule}]} : {rule})}],totals:{}}).routes[0];
    const words = storyItems(row,false).map(([s])=>s).join('\n');
    for (const match of expected) assert.match(words,match);
    assert.equal(JSON.stringify(row).includes('secret-classifier-body'),false);
  }
});

test('strict fallback and held-report hints use display metadata without exposing account names', async t => {
  const { storyItems, maskText } = await import('../plugins/magpie-routes/story.mjs');
  const main = {id:'main',kind:'account',name:'Provider',who:'main-private@example.test'};
  const raw = {id:1,agent:'dsh',model:'m',provider:'p',done:true,held:'held-report-123.json',report:{body:'secret-report-body'},
    order:[{id:'fallback',kind:'account',name:'Fallback provider',who:'fallback-private@example.test',model:'m',fallback:true}],tries:[],
    affinity:{why:'strict',last:'fallback',main:{...main,body:'secret-main-body',credential:'secret-main-key'}}};
  const row = gateway.trace({object:'trace',seq:1,pid:1,ids:[1],routes:[raw],totals:{}}).routes[0];
  assert.deepEqual(row.affinity.main,main);
  const words = storyItems(row,false).map(([s])=>s).join('\n');
  assert.match(words,/Stays is Strict/);
  assert.match(words,/main-private@example.test/);
  assert.equal(row.held,'held-report-123.json');
  assert.ok(storyItems(row,false).some(([s,cls])=>cls==='aside held'&&s.includes('saved a report')));
  assert.equal(storyItems({...row,done:false},false).some(([,cls])=>cls==='aside held'),false);
  assert.equal(JSON.stringify(row).includes('secret-'),false);
  const masked = storyItems(row,true).map(([s])=>s).join('\n');
  assert.doesNotMatch(masked,/main-private@example.test|fallback-private@example.test/);
  const previous = globalThis.document;
  globalThis.document = {createElement:()=>({})};
  t.after(()=>{globalThis.document=previous;});
  const names = maskText(masked,row).filter(part=>typeof part!=='string');
  assert.ok(names.some(part=>part.className==='rr-pii'&&part.textContent===main.who));
});

test('stage follows upstream member order, latest account sets and nested fold defaults', async () => {
  const {stageSeats,stageTree}=await import('../plugins/magpie-routes/model.mjs');
  const make=(id,provider,model,extra={})=>({id,provider,model,name:provider,kind:'account',rank:1,...extra});
  const a=make('a','z-provider','first'),b=make('b','a-provider','second');
  const group={id:'g',name:'Auto',members:['z-provider/first','a-provider/second'],subs:[{id:'nested',name:'Nested',routing:'order'}]};
  const route={id:1,group,provider:'group',model:'group/g',order:[b,a],tries:[],left:[]};
  assert.deepEqual(stageSeats([route]).map(e=>e.key),[a,b].map(w=>w.id+'\0'+w.model));
  assert.ok(stageSeats([route,{...route,id:2}]).every(e=>e.route.id===2));
  const pool=Array.from({length:3},(_,i)=>make('p'+i,'codex','gpt',{via:['nested'],rank:i+1}));
  const entries=stageSeats([{...route,order:pool}]);
  const tree=stageTree(entries);
  assert.equal(tree[0].name,'Nested');assert.equal(tree[0].open,true);
  assert.equal(tree[1].type,'header');assert.equal(tree[1].open,true);
  assert.equal(tree[2].depth,2);assert.equal(tree[2].parent,tree[1].key);
  const folded=stageTree(entries,new Map([[tree[0].persistKey,false]]));
  assert.equal(folded.length,1);assert.equal(folded[0].seats.length,3);
  const keys=stageTree(stageSeats([{...route,group:null,order:pool.map(w=>({...w,via:[],kind:'key'}))}]));
  assert.equal(keys.length,1);assert.equal(keys[0].open,false);
  const long=stageTree(stageSeats([{...route,group:null,order:Array.from({length:6},(_,i)=>make('p'+i,'codex','gpt'))}]));
  assert.equal(long.length,1);assert.equal(long[0].open,false);
});

test('simultaneous routes retain separate route headings and only held-out seats join the stage', async () => {
  const {stageSeats,stageTree}=await import('../plugins/magpie-routes/model.mjs');
  const a={id:'a',kind:'account',provider:'codex',name:'Codex',model:'review',rank:1};
  const b={id:'b',kind:'account',provider:'deepseek',name:'DeepSeek',model:'chat',routing:'order',rank:1};
  const direct={id:1,provider:'codex',model:'codex/review',order:[a],tries:[],left:[]};
  const group={id:2,provider:'group',model:'group/auto',group:{id:'auto',name:'Auto',routing:'',members:['deepseek/chat']},order:[b],tries:[],left:[{...b,id:'c',capped:1},{...b,id:'d',held:true,capped:1}]};
  const entries=stageSeats([direct,group]),tree=stageTree(entries);
  assert.deepEqual(tree.filter(n=>n.type==='header').map(n=>n.name),['Codex','Auto']);
  assert.equal(entries.length,3);assert.equal(tree.find(n=>n.key==='b\0chat').depth,1);
  assert.equal(tree[0].seats[0].candidate.id,'a');
  assert.equal(tree.find(n=>n.name==='Auto').seats.length,2);
  assert.equal(tree.find(n=>n.name==='Auto').mode,'');
});

test('stage row words consume safe live counters, intent, wallet and restriction metadata', async () => {
  const {seatNote}=await import('../plugins/magpie-routes/story.mjs');
  const {candidateState}=await import('../plugins/magpie-routes/model.mjs');
  const base={id:1,agent:'dsh',time:new Date().toISOString(),bytes:63400,estTok:1000,contentAt:Date.now()-1000,
    body:'secret',order:[{id:'a',kind:'account',provider:'codex',model:'m',known:true,used:100,usedRenews:new Date(Date.now()+86400000).toISOString()}],tries:[{id:'a',model:'m',done:false}],rule:{use:'codex/m',when:['intent "quick task"']}};
  function note(change={},candidate={},currentId=1){
    const raw={...base,...change,order:[{...base.order[0],...candidate}]};
    const r=gateway.trace({object:'trace',pid:1,seq:1,ids:[1],routes:[raw],totals:{}}).routes[0];
    assert.equal(JSON.stringify(r).includes('secret'),false);
    return seatNote(r.order[0],r,candidateState(r.order[0],r),currentId);
  }
  assert.match(note(),/61.9 KiB/);assert.match(note(),/≈ 1.0k tokens/);assert.match(note(),/quick task/);assert.match(note(),/renews in/);
  assert.match(note({}, {}, 2),/answering another request/);assert.doesNotMatch(note({}, {}, 2),/KiB/);
  assert.doesNotMatch(note({contentAt:Date.now()-20000}),/answering…/);
  assert.match(note({tries:[],rule:null},{reserve:2}),/in reserve/);
  assert.match(note({tries:[],rule:null},{free:true}),/free · costs nothing/);
  assert.match(note({tries:[],rule:null},{balance:25,unit:'USD'}),/25 USD left/);
  assert.match(note({tries:[],rule:null},{unlisted:true,heldBy:'Only group'}),/not an account Only group may use/);
  assert.match(note({tries:[],rule:null},{noURL:'responses'}),/no OpenAI Responses URL/);
  assert.match(note({tries:[],rule:null}),/all but used up/);
});
