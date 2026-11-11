import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import zlib from 'node:zlib';import {createRequire} from 'node:module';
import {requestMetrics,promptTotals,groupRequests,sessionSummaries,decodeOf,requestPurpose} from '../plugins/magpie-routes/requests.mjs';
import {replayPlan,replayAt} from '../plugins/magpie-routes/replay.mjs';
const require=createRequire(import.meta.url),gateway=require('../plugins/magpie-routes/gateway.cjs'),{createHistory,validDay}=require('../plugins/magpie-routes/history.cjs');
const raw=(id,change={})=>({id,time:`2026-11-10T10:00:${String(id%60).padStart(2,'0')}.000Z`,agent:'codex',session:'private-session',callerKey:'private-key-id',callerKeyName:'Office',model:'gpt',done:true,status:200,ms:1000,order:[],tries:[],...change});
test('corrupt gzip is isolated, reported and retried after repair',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'magpie-corrupt-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const bad=path.join(dir,'2026-11-09.jsonl.gz');fs.writeFileSync(bad,'broken gzip');fs.writeFileSync(path.join(dir,'2026-11-10.jsonl'),JSON.stringify(raw(1))+'\n');
  const history=createHistory(dir),got=await history('2026-11-10');assert.equal(got.routes[0].id,1);assert.deepEqual(got.unavailableDays,['2026-11-09']);assert.equal(got.days.find(d=>d.day==='2026-11-09').requests,null);
  assert.deepEqual((await history('2026-11-09')).routes,[]);fs.writeFileSync(bad,zlib.gzipSync(JSON.stringify(raw(2))+'\n'));
  const fixed=await history('2026-11-09');assert.deepEqual(fixed.unavailableDays,[]);assert.equal(fixed.routes[0].id,2);
});
test('explicit portable data directory supplies both settings and history',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'magpie-portable-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const data=path.join(dir,'data');fs.mkdirSync(path.join(data,'routing'),{recursive:true});fs.writeFileSync(path.join(dir,'.portable'),'');fs.writeFileSync(path.join(data,'settings.json'),JSON.stringify({port:54321}));fs.writeFileSync(path.join(data,'routing','2026-11-10.jsonl'),JSON.stringify(raw(8))+'\n');
  assert.equal(gateway.configDirectory(data),data);assert.equal(gateway.detectPort(0,data),54321);assert.throws(()=>gateway.configDirectory('relative/data'),/absolute/);
  const oldRead=gateway.readJSON;t.after(()=>gateway.readJSON=oldRead);gateway.readJSON=async(_p,endpoint,signal)=>endpoint==='/'?{name:'magpie'}:endpoint.includes('concurrency')?{active:[]}:new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  let published;const settings={revision:1,values:{port:0,dataDirectory:data,maskAccounts:true}};
  const backend=await require('../plugins/magpie-routes/backend.cjs').activate({host:{call:async()=>settings},publish:s=>published=s});t.after(()=>backend.dispose());
  assert.equal((await backend.call('history',{day:'2026-11-10'})).routes[0].id,8);
  const other=path.join(dir,'other');fs.mkdirSync(path.join(other,'routing'),{recursive:true});fs.writeFileSync(path.join(other,'routing','2026-11-10.jsonl'),JSON.stringify(raw(9))+'\n');
  backend.update({settings:{revision:2,values:{...settings.values,dataDirectory:other,port:54321}}});assert.equal(published.historyRevision,1);assert.equal((await backend.call('history',{day:'2026-11-10'})).routes[0].id,9);
});
test('readonly JSONL/gzip history combines late files, tracks appended lines and projects metadata only',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'magpie-history-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const history=createHistory(dir);
  fs.writeFileSync(path.join(dir,'2026-11-09.jsonl.gz'),zlib.gzipSync(JSON.stringify(raw(1,{body:'secret-body'}))+'\n'));
  fs.writeFileSync(path.join(dir,'2026-11-09.jsonl'),JSON.stringify(raw(2))+'\n');fs.writeFileSync(path.join(dir,'2026-11-10.jsonl'),JSON.stringify(raw(3))+'\n'+JSON.stringify(raw(4)).slice(0,20));
  const days=await history();assert.deepEqual(days.days.map(d=>[d.day,d.requests]),[['2026-11-10',1],['2026-11-09',2]]);
  const past=await history('2026-11-09');assert.deepEqual(past.routes.map(r=>r.id),[1,2]);assert.equal(JSON.stringify(past).includes('private-session'),false);assert.equal(JSON.stringify(past).includes('private-key-id'),false);assert.equal(JSON.stringify(past).includes('secret-body'),false);assert.equal(past.routes[0].callerKeyName,'Office');assert.equal(past.routes[0].callerKey.length,64);
  fs.appendFileSync(path.join(dir,'2026-11-10.jsonl'),JSON.stringify(raw(4)).slice(20)+'\n');assert.deepEqual((await history('2026-11-10')).routes.map(r=>r.id),[3,4]);
  fs.writeFileSync(path.join(dir,'2026-11-10.jsonl'),JSON.stringify(raw(5))+'\n');assert.deepEqual((await history('2026-11-10')).routes.map(r=>r.id),[5]);
  await assert.rejects(history('../settings'),/Invalid/);assert.equal(validDay('2026-99-99'),false);assert.equal(validDay('2026-02-30'),false);
});
test('history caps a day at latest 2000 and ignores symlink entries',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'magpie-history-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const rows=Array.from({length:2005},(_,i)=>raw(i,{time:new Date(Date.UTC(2026,10,10,0,0,i)).toISOString()}));fs.writeFileSync(path.join(dir,'2026-11-10.jsonl'),rows.map(r=>JSON.stringify(r)).join('\n')+'\n');
  fs.symlinkSync(path.join(dir,'2026-11-10.jsonl'),path.join(dir,'2026-11-09.jsonl'));
  const got=await createHistory(dir)('2026-11-10');assert.equal(got.cut,true);assert.equal(got.routes.length,2000);assert.equal(got.routes[0].id,5);assert.equal(got.days.length,1);
});
test('history retains the newest recorded times across late writes and incremental appends',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'magpie-late-history-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const newer=Array.from({length:2200},(_,i)=>raw(1000+i,{time:new Date(Date.UTC(2026,10,10,0,0,1000+i)).toISOString()}));
  const older=Array.from({length:201},(_,i)=>raw(i,{time:new Date(Date.UTC(2026,10,10,0,0,i)).toISOString()}));
  const text=[...newer,...older].map(r=>JSON.stringify(r)).join('\n')+'\n',file=path.join(dir,'2026-11-10.jsonl'),history=createHistory(dir);
  fs.writeFileSync(file,text);fs.writeFileSync(path.join(dir,'2026-11-09.jsonl.gz'),zlib.gzipSync(text));
  const expected=newer.slice(-2000).map(r=>r.id);
  assert.deepEqual((await history('2026-11-10')).routes.map(r=>r.id),expected);
  assert.deepEqual((await history('2026-11-09')).routes.map(r=>r.id),expected);
  // Re-read the plain day, then append late old records before one new record.
  await history('2026-11-10');fs.appendFileSync(file,older.map(r=>JSON.stringify(r)).join('\n')+'\n');
  assert.deepEqual((await history('2026-11-10')).routes.map(r=>r.id),expected);
  fs.appendFileSync(file,JSON.stringify(raw(9999,{time:'2026-11-10T23:00:00.000Z'}))+'\n');
  assert.deepEqual((await history('2026-11-10')).routes.map(r=>r.id),[...expected.slice(1),9999]);
});
test('quota-card allowlist excludes credentials, private extensions and URL actions',()=>{
  const got=gateway.cards({data:[{provider:'codex',user:'account@example.test',accessToken:'secret',refreshToken:'secret',seeAt:'https://secret.test',windows:[{name:'Weekly',used:54,resetsAt:'2026-11-12T00:00:00Z',balance:12,runsOut:3,runsOutAt:'2026-11-11T00:00:00Z',key:'secret',body:'secret'}]}]});
  assert.equal(got[0].windows[0].balance,12);assert.equal(got[0].windows[0].runsOut,3);assert.equal(JSON.stringify(got).includes('secret'),false);
});
test('request metrics use disjoint cache tiers, exclude hidden reasoning speed and preserve reported credits',()=>{
  const r=gateway.route(raw(1,{tokens:1500,out:1000,ms:6000,ttft:1000,flow:5000,usage:[{in:20,out:1000,cache_read:60,cache_write:20,credits:2.5},{in:99,cache_unknown:true}]}));
  assert.deepEqual(promptTotals([r]),{prompt:100,read:60});assert.equal(requestMetrics(r).cache.value,'60%');assert.match(requestMetrics(r).speed.value,/200 tok\/s/);assert.match(requestMetrics(r).cost.value,/2.5 credits/);assert.equal(decodeOf({...r,reasoningHidden:true,firstText:0}),null);
  assert.deepEqual(groupRequests([r,{...r,id:2}],'session').map(g=>g.rows.length),[2]);assert.equal(groupRequests([r,{...r,id:2,callerKey:'other'}],'key').length,2);assert.equal(requestPurpose({...r,kind:'thread_title_reconsideration'}),'kind:thread_title');
});
test('concurrent context summaries retain main tool-bearing requests, excluding auxiliary and subagent prompts',()=>{
  const now=Date.now(),p=tokens=>({tokens,window:1000,parts:[{kind:'tools',tokens:100}]}),r=(id,sessionKey,change={})=>({id,time:new Date(now-id*1000).toISOString(),agent:'codex',sessionKey,done:false,kind:'',prompt:p(id*100),...change});
  const groups=sessionSummaries([r(5,'a',{sub:true}),r(4,'a',{kind:'compact'}),r(3,'a'),r(2,'b'),r(1,'old',{done:true,time:new Date(now-3600000).toISOString()})]);
  assert.equal(groups.length,2);assert.equal(groups.find(g=>g.key==='codex a').route.id,3);
});
test('replay compresses gaps, reconstructs recorded tries and never reveals future output',()=>{
  const a=raw(1,{time:'2026-11-10T00:00:00Z',ms:10000,tokens:1000,out:900,tries:[{id:'a',start:'2026-11-10T00:00:00Z',ms:1000,status:429,done:true,fail:'rate'},{id:'b',start:'2026-11-10T00:00:02Z',ms:8000,status:200,done:true}]}),b=raw(2,{time:'2026-11-10T01:00:00Z'});
  const p=replayPlan([a,b]);assert.ok(p.total<10000);const initial=replayAt(p,500).rows[0];assert.equal(initial.done,false);assert.equal(initial.tries.length,1);assert.equal(initial.tries[0].done,false);assert.equal(initial.tokens,0);
  const later=replayAt(p,2200).rows[0];assert.equal(later.tries.length,2);assert.equal(later.tries[0].done,true);assert.equal(later.tries[1].done,false);assert.equal(replayAt(p,p.total).rows.every(r=>r.done),true);assert.equal(replayPlan([raw(1,{done:false})]),null);
});

test('live daily tallies are complete beyond the displayed history limit and append exactly once',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'magpie-history-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const history=createHistory(dir,undefined,()=>new Date('2026-11-10T12:00:00'));
  const row=i=>raw(i,{order:[{id:'a',provider:'codex',kind:'account',who:'account@example.test',model:'m'}],tries:[{id:'a',model:'m',done:true,status:200}]});
  const file=path.join(dir,'2026-11-10.jsonl');fs.writeFileSync(file,Array.from({length:2005},(_,i)=>JSON.stringify(row(i))).join('\n')+'\n');
  const a=await history();assert.equal(a.tallies[0].tried,2005);assert.equal(a.tallies[0].ok,2005);
  fs.appendFileSync(file,JSON.stringify(row(2006))+'\n');assert.equal((await history()).tallies[0].tried,2006);assert.equal((await history()).tallies[0].tried,2006);
  await assert.rejects(history(0),/Invalid/);
});
test('folded quota uses distinct accounts on one plan and leaves mismatched readings separate',async()=>{
  const {foldQuota}=await import('../plugins/magpie-routes/requests.mjs');
  const candidates=['one','two'].map(who=>({kind:'account',provider:'codex',who}));
  const cards=['one','two'].map((user,i)=>({kind:'subscription',provider:'codex',user,plan:'Plus',windows:[{name:'Weekly',used:i?80:20},{name:'Wallet',unit:'USD',balance:i?30:10}]}));
  const got=foldQuota(candidates,cards);assert.equal(got.used,50);assert.match(got.tip,/40 USD/);assert.equal(foldQuota(candidates,[cards[0],{...cards[1],plan:'Pro'}]),null);assert.equal(foldQuota(candidates,cards.slice(0,1)),null);
});
test('per-model rest is honored until lifted, including the replay clock',async()=>{
  const {candidateState}=await import('../plugins/magpie-routes/model.mjs');const now=Date.now(),until=new Date(now+60000).toISOString();
  const w={id:'a',model:'m'},r={time:new Date(now-1000).toISOString(),order:[w],tries:[{id:'a',model:'m',done:true,status:429,fail:'rate',rest:{key:'rest',until,why:'rate'}}]};
  const {seatNote}=await import('../plugins/magpie-routes/story.mjs');assert.match(seatNote(w,r,candidateState(w,r,{},now),r.id),/rate limited/);
  assert.equal(candidateState(w,r,{},now).tone,'resting');assert.equal(candidateState(w,r,{rest:new Date(now).toISOString()},now).tone,'failed');assert.equal(candidateState(w,r,{rest:new Date(now+1000).toISOString()},now).tone,'resting');
});
test('backend history and allowance operations remain readonly and stop after disposal',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'magpie-backend-')),oldHome=process.env.XDG_CONFIG_HOME,oldRead=gateway.readJSON;process.env.XDG_CONFIG_HOME=dir;
  t.after(()=>{gateway.readJSON=oldRead;if(oldHome===undefined)delete process.env.XDG_CONFIG_HOME;else process.env.XDG_CONFIG_HOME=oldHome;fs.rmSync(dir,{recursive:true,force:true});});
  const calls=[];gateway.readJSON=async(_port,endpoint,signal)=>{
    calls.push(endpoint);if(endpoint==='/')return {name:'magpie',version:'fixture'};
    if(endpoint==='/v1/magpie/quotas/cards')return {data:[{provider:'codex',token:'secret',windows:[]}]};
    if(endpoint==='/v1/magpie/concurrency')return {active:[]};
    return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  };
  const backend=await require('../plugins/magpie-routes/backend.cjs').activate({host:{call:async()=>({revision:1,values:{port:12345,maskAccounts:true}})},publish(){}});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(JSON.stringify(await backend.call('cards')).includes('secret'),false);assert.deepEqual((await backend.call('history',{day:''})).days,[]);
  backend.dispose();const before=calls.length;assert.deepEqual(await backend.call('cards'),[]);assert.equal(calls.length,before);await assert.rejects(backend.call('history',{day:''}),/abort/i);
  assert.ok(calls.every(endpoint=>['/','/v1/magpie/quotas/cards','/v1/magpie/concurrency'].includes(endpoint)||endpoint.startsWith('/v1/magpie/trace?')));
});

test('upstream outcome distinguishes informational notes, broken 200 replies and cancellation',async()=>{
  const {routeStatus}=await import('../plugins/magpie-routes/model.mjs');
  const note={...gateway.route(raw(1,{error:'titles disabled',tries:[{id:'a',done:true,status:200}]}))};
  assert.equal(routeStatus(note).tone,'done');assert.ok(requestMetrics({...note,out:1000,ttft:1000,ms:6000,flow:5000}).speed.value);
  assert.equal(routeStatus({...note,tries:[{id:'a',done:true,status:200,fail:'other'}]}).tone,'failed');
  assert.equal(routeStatus({...note,status:499,canceled:true}).label,'Canceled');
});

test('request sorting computes each metric once and preserves unknowns, zeros and ties',async()=>{
  const {sortRequests}=await import('../plugins/magpie-routes/requests.mjs');
  const rows=[{id:1,time:'2026-11-09T01:00:00Z',score:0},{id:2,time:'2026-11-09T02:00:00Z',score:undefined},{id:3,time:'2026-11-09T02:00:00Z',score:9},{id:4,time:'2026-11-09T02:00:00Z',score:9}];
  const calls=new Map(),metricsFor=r=>{calls.set(r.id,(calls.get(r.id)||0)+1);return {tokens:{number:r.score}};};
  assert.deepEqual(sortRequests(rows,'tokens',metricsFor).map(r=>r.id),[3,4,1,2]);assert.deepEqual([...calls.values()],[1,1,1,1]);
  assert.deepEqual(rows.map(r=>r.id),[1,2,3,4]);
  assert.deepEqual(sortRequests(rows,'newest').map(r=>r.id),[4,3,2,1]);assert.deepEqual(sortRequests(rows,'oldest').map(r=>r.id),[1,2,3,4]);
});

test('background polling waits for host visibility, aborts when hidden and catches up on resume',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const original=gateway.readJSON,calls=[],signals=[];let latest;
  t.after(()=>gateway.readJSON=original);
  const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
  let round=0;
  gateway.readJSON=async(port,endpoint,signal)=>{
    calls.push([port,endpoint]);signals.push(signal);
    if(endpoint==='/')return {name:'magpie'};
    if(endpoint==='/v1/magpie/concurrency')return {active:[]};
    if(endpoint.endsWith('after=0'))return {object:'trace',pid:1,seq:++round,ids:[round],routes:[raw(round)],totals:{requests:round}};
    return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
  };
  const backend=await require('../plugins/magpie-routes/backend.cjs').activate({host:{call:async()=>({revision:1,values:{port:54321,maskAccounts:true}})},publish:s=>latest=s});t.after(()=>backend.dispose());
  await flush();assert.equal(calls.length,0);backend.call('reconnect');await flush();assert.equal(calls.length,0);
  backend.update({visible:true});await flush();assert.equal(latest.routes[0].id,1);assert.ok(calls.some(([,p])=>p.includes('wait=1')));
  const running=calls.length;backend.update({visible:true});await flush();assert.equal(calls.length,running);
  t.mock.timers.tick(1500);await flush();assert.equal(calls.filter(([,p])=>p.includes('concurrency')).length,2);
  backend.update({visible:false});assert.ok(signals.every(s=>s.aborted));const paused=calls.length;
  backend.update({settings:{revision:2,values:{port:54322,maskAccounts:true}}});t.mock.timers.tick(30000);await flush();assert.equal(calls.length,paused);assert.equal(latest.routes[0].id,1);
  backend.update({visible:true});await flush();assert.equal(latest.routes[0].id,2);assert.equal(calls.findLast(([,p])=>p.endsWith('after=0'))[0],54322);
  backend.dispose();const stopped=calls.length;t.mock.timers.tick(30000);await flush();assert.equal(calls.length,stopped);
});

test('hidden backend cancels offline retry timers',async t=>{
  t.mock.timers.enable({apis:['setTimeout']});const original=gateway.readJSON;let calls=0;
  t.after(()=>gateway.readJSON=original);gateway.readJSON=async()=>{calls++;throw Object.assign(new Error('offline'),{code:'ECONNREFUSED'});};
  const backend=await require('../plugins/magpie-routes/backend.cjs').activate({host:{call:async()=>({revision:1,values:{port:54321,maskAccounts:true}})},publish(){}});t.after(()=>backend.dispose());
  const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
  backend.update({visible:true});await flush();assert.equal(calls,1);
  backend.update({visible:false});t.mock.timers.tick(30000);await flush();assert.equal(calls,1);
  backend.update({visible:true});await flush();assert.equal(calls,2);
});

test('pending allowance reads are canceled on endpoint change and hide, including before first visible context',async t=>{
  const original=gateway.readJSON;t.after(()=>gateway.readJSON=original);let signal;
  gateway.readJSON=async(_port,endpoint,abort)=>{
    if(endpoint.includes('quotas/cards')){signal=abort;return new Promise((_,reject)=>abort.addEventListener('abort',()=>reject(abort.reason),{once:true}));}
    return new Promise((_,reject)=>abort.addEventListener('abort',()=>reject(abort.reason),{once:true}));
  };
  const backend=await require('../plugins/magpie-routes/backend.cjs').activate({host:{call:async()=>({revision:1,values:{port:54321,maskAccounts:true}})},publish(){}});t.after(()=>backend.dispose());
  const first=backend.call('cards'),rejected=assert.rejects(first,/abort/i);backend.update({settings:{revision:2,values:{port:54322,maskAccounts:true}}});assert.equal(signal.aborted,true);await rejected;
  backend.update({visible:true});const second=backend.call('cards'),hidden=assert.rejects(second,/abort/i);backend.update({visible:false});assert.equal(signal.aborted,true);await hidden;
  const third=backend.call('cards'),disposed=assert.rejects(third,/abort/i);backend.dispose();assert.equal(signal.aborted,true);await disposed;
});

test('gateway process changes cancel old pending allowances without changing history scope',async t=>{
  const original=gateway.readJSON;t.after(()=>gateway.readJSON=original);
  let pendingTrace,cardSignal,latest,seq=0,pid=100;
  const trace=()=>({object:'trace',seq:++seq,pid,ids:[],routes:[],totals:{}});
  gateway.readJSON=async(_port,endpoint,signal)=>{
    if(endpoint==='/')return {name:'magpie'};
    if(endpoint.includes('concurrency'))return {active:[]};
    if(endpoint.includes('quotas/cards')){cardSignal=signal;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}
    if(endpoint.endsWith('after=0'))return trace();
    return new Promise((resolve,reject)=>{pendingTrace=resolve;signal.addEventListener('abort',()=>reject(signal.reason),{once:true});});
  };
  const backend=await require('../plugins/magpie-routes/backend.cjs').activate({host:{call:async()=>({revision:1,values:{port:54321}})},publish:s=>latest=s});t.after(()=>backend.dispose());
  const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
  backend.update({visible:true});await flush();assert.equal(latest.processId,100);
  const pending=backend.call('cards'),rejected=assert.rejects(pending,/abort/i);
  pid=101;pendingTrace(trace());await flush();assert.equal(cardSignal.aborted,true);await rejected;
  assert.equal(latest.processId,101);assert.equal(latest.historyRevision,0);
});

for(const compressed of [false,true])test('history accepts complete EOF rows without double counting: '+(compressed?'gzip':'plain'),async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'magpie-eof-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const file=path.join(dir,'2026-11-10.jsonl'+(compressed?'.gz':'')),record=id=>raw(id,{order:[{id:'a',kind:'account',provider:'codex',who:'測試@example.test',model:'gpt'}],tries:[{id:'a',model:'gpt',done:true,status:200}]}),text=id=>JSON.stringify(record(id));
  const write=s=>fs.writeFileSync(file,compressed?zlib.gzipSync(s):s),history=createHistory(dir,undefined,()=>new Date('2026-11-10T12:00:00Z'));
  async function check(ids){const got=await history('2026-11-10');assert.deepEqual(got.routes.map(r=>r.id),ids);assert.equal(got.days[0].requests,ids.length);assert.equal(got.tallies[0].tried,ids.length);assert.equal(got.tallies[0].ok,ids.length);}
  write(text(1)+'\n'+text(2));await check([1,2]);await check([1,2]);
  if(compressed){
    write(text(1)+'\n'+text(2)+'\n'+text(3));await check([1,2,3]);
    write(text(1)+'\n'+text(2)+'\n'+text(3)+'\n'+text(4).slice(0,20));await check([1,2,3]);
  }else{
    fs.appendFileSync(file,'\n'+text(3).slice(0,20));await check([1,2]);
    fs.appendFileSync(file,text(3).slice(20));await check([1,2,3]);
    fs.appendFileSync(file,'\n'+text(4)+'\n');await check([1,2,3,4]);
    fs.appendFileSync(file,text(5)+'\n');await check([1,2,3,4,5]);
    fs.appendFileSync(file,text(6).slice(0,20));await check([1,2,3,4,5]);
    fs.appendFileSync(file,text(6).slice(20)+'\n');await check([1,2,3,4,5,6]);
  }
});

test('only historical agent-canceled 499s regain legacy cancellation metadata',async t=>{
  const {routeStatus}=await import('../plugins/magpie-routes/model.mjs');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'magpie-legacy-cancel-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
  const canceled=raw(1,{status:499,error:'the agent canceled the request',tries:[{id:'a',done:true,status:499}]}),ordinary=raw(2,{status:499,error:'upstream closed'}),timeout=raw(3,{status:499,error:'magpie stopped waiting'}),other=raw(4,{status:500,error:'the agent canceled the request'});
  for(const compressed of [false,true]){
    const file=path.join(dir,'2026-11-10.jsonl'+(compressed?'.gz':'')),text=[canceled,ordinary,timeout,other].map(r=>JSON.stringify(r)).join('\n')+'\n';fs.writeFileSync(file,compressed?zlib.gzipSync(text):text);
    const got=await createHistory(dir)('2026-11-10');assert.equal(got.routes[0].canceled,true);assert.equal(routeStatus(got.routes[0]).label,'Canceled');assert.deepEqual(got.routes.slice(1).map(r=>routeStatus(r).tone),['failed','failed','failed']);assert.equal(got.routes.filter(r=>routeStatus(r).tone==='failed').length,3);fs.unlinkSync(file);
  }
  assert.notEqual(gateway.route(canceled).canceled,true);
});
