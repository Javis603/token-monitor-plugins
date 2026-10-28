'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');

function detectPort(override) {
  if (override) return override;
  const file = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'magpie', 'settings.json');
  let config;
  try { config = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return 3425; throw new Error('無法讀取 Magpie 設定，請在插件設定指定連接埠。'); }
  const port = config.port || 3425;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Magpie 連接埠設定無效。');
  return port;
}

function readJSON(port, endpoint, signal, timeout = 30000) {
  return new Promise((resolve, reject) => {
    // The routing trace is loopback-only. Do not use proxies or follow redirects.
    const request = http.get({ hostname: '127.0.0.1', port, path: endpoint, signal, headers: { Accept: 'application/json' } }, response => {
      if (response.statusCode !== 200) {
        response.resume();
        const error = new Error(response.statusCode === 404 ? '此 Magpie 版本未提供路由接口，請更新 Magpie。' : `Magpie 接口回傳 HTTP ${response.statusCode}。`);
        error.status = response.statusCode; reject(error); return;
      }
      const chunks = []; let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > 8 * 1024 * 1024) { response.destroy(new Error('Magpie 路由資料超出大小限制。')); return; }
        chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
        catch { reject(new Error('Magpie 回傳了無效資料。')); }
      });
    });
    request.setTimeout(timeout, () => request.destroy(new Error('Magpie 連線逾時，稍後會自動重連。')));
    request.on('error', reject);
  });
}

const text = (value, max = 500) => typeof value === 'string' ? value.slice(0, max) : '';
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : 0;
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function rest(raw) {
  if (!object(raw)) return null;
  return fields(raw, ['key','kind','why','until','by','model'], ['status','failures']);
}
// Routing explanations are derived from structured trace facts, not a ready-made
// sentence. Keep explicit display fields; prompt metadata is projected separately.
function fields(raw, strings = [], numbers = [], booleans = [], lists = []) {
  if (!object(raw)) return null;
  return Object.fromEntries([
    ...strings.filter(key => typeof raw[key] === 'string').map(key => [key, text(raw[key])]),
    ...numbers.filter(key => typeof raw[key] === 'number').map(key => [key, number(raw[key])]),
    ...booleans.filter(key => typeof raw[key] === 'boolean').map(key => [key, raw[key]]),
    ...lists.filter(key => Array.isArray(raw[key])).map(key => [key, raw[key].slice(0,128).map(value => text(value))])
  ]);
}
function rule(raw) {
  const result = fields(raw, ['use','effort','instead','pick','wanted','useEffort','folder'], ['n','turn','tokens'],
    ['held','waits','grown','images','unready','compact','bare'], ['more','when','then','small']);
  if (result && object(raw.classified)) result.classified = fields(raw.classified, ['by','intent','effort','error','fallback'], ['score','sure','ms'], ['cached'], ['intents']);
  return result;
}
function candidate(item) {
  return {
    ...fields(item, ['id','provider','name','who','model','plan','routing','kind','fixed','icon','usedRenews','due','dueBy','sunk','speaks','restarts','agent'],
      ['rank','pace','fit','tokens','lateTtft','lateTps','window','capped'], ['turn','held','barred','fallback','aside','known','free','learns','noCredits','credits','unlisted','fast'], ['renews','via']),
    usedPercent: number(item.used), rest: rest(item.rest)
  };
}
function prompt(raw) {
  if (!object(raw) || !Number.isSafeInteger(raw.tokens) || raw.tokens < 0 || !Array.isArray(raw.parts)) return null;
  const kinds = new Set(['system','tools','skills','memory','files','results','chat']);
  const amount = n => Number.isSafeInteger(n) && n >= 0 ? n : 0;
  return {tokens:raw.tokens,window:amount(raw.window),turns:amount(raw.turns),
    ...fields(raw, [], [], ['counted','held']),
    parts:raw.parts.filter(x=>object(x)&&kinds.has(x.kind)).slice(0,7).map(part=>({kind:part.kind,tokens:amount(part.tokens),
      items:Array.isArray(part.items)?part.items.filter(object).slice(0,2048).map(it=>({name:text(it.name,1000),tag:text(it.tag,80),n:amount(it.n),tokens:amount(it.tokens)})):[]}))};
}
function sessionKey(raw) {
  const key = [raw.parentSession,raw.session,raw.conv].find(value=>typeof value==='string'&&value);
  return key ? createHash('sha256').update(raw.agent + '\0' + key).digest('hex') : '';
}
function route(raw) {
  if (!object(raw) || !Number.isSafeInteger(raw.id) || !Array.isArray(raw.order) || !Array.isArray(raw.tries)) throw new Error('Magpie 路由格式無效。');
  // Publish only display metadata. Prompt bodies, raw sessions and credentials
  // never enter the renderer or this plugin's storage.
  return {
    id: raw.id, prompt: prompt(raw.prompt), sessionKey: sessionKey(raw), time: text(raw.time), agent: text(raw.agent, 100), model: text(raw.model), provider: text(raw.provider),
    effort: text(raw.effort), kind: text(raw.kind), done: raw.done === true, status: number(raw.status), error: text(raw.error),
    phase: text(raw.phase), served: text(raw.served), ms: number(raw.ms), tokens: number(raw.tokens), out: number(raw.out),
    ...fields(raw, [], ['masking','ttft','firstText','flow','firstReasoning','reasoning'], ['reasoningHidden']),
    usage: Array.isArray(raw.usage) ? raw.usage.slice(0,128).map(item=>fields(item, ['provider','model'], ['in','out','cache_read','cache_write','reasoning'], ['cache_unknown'])) : [],
    affinity: fields(raw.affinity, ['mode','why','last','at'], ['turn','lastTurn','cacheRead','cacheWrite'], ['within','kept']),
    group: raw.group ? {...fields(raw.group, ['name','routing','affinity','id','ref'], [], ['auto','sink'], ['members','via','fast']),
      subs: Array.isArray(raw.group.subs) ? raw.group.subs.filter(object).slice(0,128).map(s=>fields(s,['id','ref','name','routing','in'],['rules'])) : [],
      paused: Array.isArray(raw.group.paused) ? raw.group.paused.filter(object).slice(0,128).map(p=>fields(p,['member','group','folder'],['rule'],['byFolder'],['when'])) : []} : null,
    for: fields(raw.for,['agent','model','instead','why','missing'],[],['mcp','picked','notSearched','nothingFound','unknown']),
    subagent: fields(raw.subagent,['asked','to','kept']),subagentId:text(raw.subagentId),subagentEffort:text(raw.subagentEffort),
    rule: rule(raw.rule), nested: Array.isArray(raw.nested) ? raw.nested.slice(0,32).map(item => ({ group: text(item.group), name: text(item.name), rule: rule(item.rule) })) : [],
    sealedTask: raw.sealedTask === true, leadAccount: text(raw.leadAccount), compaction: text(raw.compaction),
    left: Array.isArray(raw.left) ? raw.left.slice(0,128).map(candidate) : [],
    order: raw.order.slice(0, 128).map(candidate),
    tries: raw.tries.slice(0, 128).map(item => ({
      id: text(item.id), model: text(item.model), effort: text(item.effort), done: item.done === true,
      status: number(item.status), ms: number(item.ms), fail: text(item.fail), error: text(item.error), served: text(item.served), rest: rest(item.rest),
      ...fields(item, ['start','fixed','ruleEffort','upstream','pin'], ['again','replan','patience','ttft','firstText','flow','firstReasoning','queued'], ['picked','gone','earlier','credits','reasoningHidden','swapped','routed']),
      reset: fields(item.reset,['who','text','agent']),
      auto: Array.isArray(item.auto) ? item.auto.filter(object).slice(0,128).map(p=>fields(p,['model','via','skipped','api','refused'],[],['session'])) : [],
      net: fields(item.net, [], ['own','before','pool','dns','connect','tls','send','wait','head'])
    }))
  };
}

function trace(raw) {
  if (!object(raw) || raw.object !== 'trace' || !Number.isSafeInteger(raw.seq) || !Number.isSafeInteger(raw.pid)
      || !Array.isArray(raw.routes) || !Array.isArray(raw.ids) || !object(raw.totals)) throw new Error('Magpie 路由格式無效。');
  return { seq: raw.seq, pid: raw.pid, ids: raw.ids.filter(Number.isSafeInteger), routes: raw.routes.map(route),
    totals: { requests: number(raw.totals.requests), rerouted: number(raw.totals.rerouted), errors: number(raw.totals.errors) },
    lifted: object(raw.lifted) ? Object.fromEntries(Object.entries(raw.lifted).filter(([, value]) => typeof value === 'string')) : {} };
}
function concurrency(raw) {
  if (!object(raw) || !Array.isArray(raw.active)) throw new Error('Magpie 即時請求格式無效。');
  return raw.active.slice(0, 256).map(item => ({ id: number(item.id), route: number(item.route), agent: text(item.agent),
    model: text(item.model), phase: text(item.phase), ms: number(item.ms) }));
}
module.exports = { detectPort, readJSON, trace, concurrency };
