import identities from './agents.mjs';
import {l, locale} from './i18n.mjs';
export const agents = Object.fromEntries(Object.entries(identities).map(([id,agent])=>[id,agent.name]));
// Magpie client.js PALETTE/HUES/hueOf/hues, scoped to one mounted stage.
// Keep assigned colours, separating agents currently shown together even
// after more agents than colours have appeared. Red remains a failure.
const PALETTE = ['#d97757','#bd8638','#a59234','#849e4a','#5aa66c','#25a98f','#00a6b0','#2e9fc9','#5e95d7','#858ad7','#a47fca','#bb77b1'];
const HUES = {claude:0,codex:9,gemini:7,copilot:10,cursor:5,opencode:2,crush:11,goose:3,pi:4,omp:11,omo:10,dsh:6,commandcode:1,mimocode:8,deveco:7};
export function createAgentColors() {
  const given=new Map();
  function hueOf(id,near){
    let c=given.get(id);if(c&&!near?.has(c))return c;
    let h=HUES[id];if(h==null){h=0;for(const ch of String(id||''))h=(h*31+ch.charCodeAt(0))>>>0;}
    const had=new Set(given.values()),from=k=>PALETTE[(h+k)%PALETTE.length],ks=[...PALETTE.keys()];
    c=from(ks.find(k=>!had.has(from(k))&&!near?.has(from(k)))??ks.find(k=>!near?.has(from(k)))??0);given.set(id,c);return c;
  }
  function hues(ids){const near=new Set();for(const id of ids)near.add(hueOf(id,near));}
  return {hueOf,hues};
}
export const agentName = id => id==='scripts'?l('Scripts'):agents[id] || id || l("未辨識 Agent");
// Retained days may contain IDs reused after a gateway restart.
export const requestKey = route => JSON.stringify([route.id,route.time]);
export const routingName = value => ({ rotate: l("輪流"), order: l("依序"), usage: l("較少用量優先"), pace: l("按剩餘配額"), weight: l("按權重"), free: l("免費優先"), drain: l("Until used up"), manual: l("Manual"), cheap: l("Cheapest first"), expiring: l("Free quota by expiry"), fast: l("Speed first") }[value] || l("智慧路由"));
export const phaseName = value => ({ slot: l("等待空位"), rpm: l("等待速率限制"), upstream: l("等待上游"), redact: l("遮蔽敏感資料"), routing: l("路由中") }[value] || l("處理中"));
export const reasonName = value => ({ quota: l("額度用盡"), rate: l("速率限制"), 'rate-limit': l("速率限制"), credit: l("餘額不足"), credits: l("餘額不足"), restricted: l("帳號受限制"), auth: l("驗證失敗"), busy: l("上游繁忙") }[value] || value);
// Magpie outcome(): a 200's error may be an informational note. A broken
// reply is failed when no recorded try completed successfully.
export const routeSucceeded = route => route.done && route.status < 400 && (!route.tries.length || route.tries.some(tr=>tr.done&&tr.status<400&&!tr.fail));
export function routeStatus(route) {
  if (!route.done) return {tone:'working',label:route.tries.length?l("回應中"):l(route.phase==='redact'?'masking…':'routing…')};
  if(routeSucceeded(route))return {tone:'done',label:route.tries.length>1?l('Rerouted'):l("已完成")};
  if(route.canceled||route.fail==='canceled'||route.tries.at(-1)?.fail==='canceled')return {tone:'done',label:l('Canceled')};
  return {tone:'failed',label:l("失敗")};
}
export function candidateState(candidate, route, lifted = {}, now = Date.now()) {
  const attempts = route.tries.filter(item => seatKey(tried(route,item)) === seatKey(candidate));
  const last = attempts.at(-1);
  const liveRest = value => value && Date.parse(value.until) > now && !(value.key && Date.parse(lifted[value.key]) >= Date.parse(route.time) && Date.parse(lifted[value.key])<=now);
  if (last) {
    if (!last.done) return { tone: 'working', label: l("回應中"), selected: true, attempts };
    if(liveRest(last.rest))return {tone:'resting',label:reasonName(last.rest.why||last.rest.kind),until:last.rest.until,rest:last.rest,attempts};
    if (last.fail === 'canceled') return { tone: 'done', label: l('Canceled'), selected: false, attempts };
    if (last.status >= 400 || last.fail) return { tone: 'failed', label: reasonName(last.fail) || `HTTP ${last.status || route.status}`, selected: false, attempts };
    return { tone: 'done', label: l("回答了這個請求"), selected: true, attempts };
  }
  if (candidate.held || candidate.barred) return { tone: 'resting', label: candidate.held ? l("此請求不可使用") : l("未開放此模型"), attempts };
  if (candidate.capped) return { tone: 'resting', label: l("達到使用上限"), attempts };
  if (candidate.window) return { tone: 'resting', label: l("請求超出 {p0} context window",{p0:(candidate.window.toLocaleString(locale()))}), attempts };
  if (candidate.noCredits) return { tone: 'resting', label: l("額度用盡，未啟用 credits"), attempts };
  if (liveRest(candidate.rest)) return { tone: 'resting', label: reasonName(candidate.rest.why || candidate.rest.kind) || l("暫時休息"), until: candidate.rest.until, rest:candidate.rest, attempts };
  return { tone: 'ready', label: candidate.turn ? l("輪到這個帳號") : l("候選"), attempts };
}
// Matches Magpie's seat/tried identity: the same account at two models or
// member-fixed efforts occupies separate places on the routing stage.
export const seatKey = value => `${value.id}\u0000${value.model || ''}${value.fixed ? ':'+value.fixed : ''}`;
export function tried(route, attempt) {
  return route.order.find(item => seatKey(item) === seatKey(attempt))
    || route.order.find(item => item.id === attempt.id && (item.model === attempt.model || `${item.provider}/${item.model}` === attempt.model))
    || route.order.find(item => item.id === attempt.id) || attempt;
}
export function stagedRoutes(routes, current, follow, now = Date.now(), playing = new Set()) {
  if (!current) return [];
  if (!follow) return [current];
  const sorted = [...routes].sort((a,b) => Date.parse(a.time)-Date.parse(b.time)||a.id-b.id), last = new Map();
  for (const route of sorted) last.set(route.agent,route);
  const out = sorted.filter(route => !route.done || playing.has(requestKey(route))
    || last.get(route.agent) === route && Date.parse(route.time)+(route.ms||0)>now-12000);
  if (!out.includes(current)) out.push(current);
  const agents = [...new Set(out.map(route => route.agent))].slice(-4);
  return out.filter(route => agents.includes(route.agent));
}
// Upstream seated/setOf/wayOf: the latest of each account set, grouped by
// route, then member order and rank. Alphabetical provider order loses the
// group's configured failover order.
export const routeWay = route => JSON.stringify([route.group ? 'group' : 'provider', route.group?.id || route.provider]);
export function stageSeats(routes) {
  const latest = new Map();
  for (const route of routes) latest.set(route.order.map(seatKey).sort().join('\n'), route);
  const ways = new Map();
  for (const route of latest.values()) {
    const way = routeWay(route);
    if (!ways.has(way)) ways.set(way, []);
    ways.get(way).push(route);
  }
  const seats = new Map();
  for (const group of ways.values()) for (const route of group) {
    const members = route.group?.members || [], on = new Set(route.order.map(seatKey));
    const key = candidate => {
      let member = members.indexOf(candidate.provider + '/' + candidate.model + (candidate.fixed ? ':' + candidate.fixed : ''));
      if (member < 0) member = members.findIndex(id => id.startsWith(candidate.provider + '/'));
      return [candidate.fallback ? 1 : 0, member < 0 ? members.length : member, candidate.name || candidate.provider || '', candidate.aside ? 1 : 0, candidate.rank || 0, candidate.who || '', candidate.id];
    };
    const entries = [...route.order, ...(route.left || []).filter(row => !on.has(seatKey(row)) && !row.held && (row.capped || row.noCredits || row.window))];
    entries.sort((a,b) => {
      const x = key(a), y = key(b);
      for (let i=0;i<x.length;i++) if (x[i] !== y[i]) return typeof x[i] === 'number' ? x[i]-y[i] : x[i].localeCompare(y[i]);
      return 0;
    });
    for (const candidate of entries) seats.set(seatKey(candidate), {key:seatKey(candidate), candidate, route});
  }
  return [...seats.values()];
}
// The same tree supplies DOM indentation, accessible fold controls and wire
// parents. A folded branch remains a target for every seat hidden under it.
export function stageTree(entries, expanded = new Map()) {
  const root = {children:[]}, headers = new Map(), ways = new Map();
  for (const entry of entries) ways.set(routeWay(entry.route), entry.route);
  function header(parent, id, info) {
    const path = [...(parent.path || []), id], key = JSON.stringify(path);
    if (!headers.has(key)) {
      const node = {type:'header',key,path,...info,children:[]};
      headers.set(key,node); parent.children.push(node);
    }
    return headers.get(key);
  }
  for (const entry of entries) {
    const {candidate:w,route:r} = entry;
    let parent = root;
    if (ways.size > 1) {
      const way = routeWay(r), route = ways.get(way), g = route.group, first = route.order.find(w=>!w.fallback)||route.order[0];
      parent = header(parent,way,{name:g?.name||first?.name||route.provider,ref:g?.ref||(g?'group/'+g.id:route.model),mode:g?(g.routing||''):(first?.routing||''),icon:g?'':first?.icon||first?.preset||first?.provider,lone:!g&&route.order.filter(w=>!w.fallback).length<=1,persistKey:'route/'+way,defaultOpen:true});
    }
    for (const id of w.via || []) {
      const info = r.group?.subs?.find(s=>s.id===id);
      parent = header(parent,id,{name:info?.name||id,ref:info?.ref||'group/'+id,mode:info?.routing||'',persistKey:'group/'+id});
    }
    parent.children.push({type:'seat',...entry});
  }
  const collect = node => node.type==='seat' ? [node] : node.children.flatMap(collect);
  function fold(parent) {
    for (const node of parent.children) if (node.type==='header') fold(node);
    const children=[];
    for(let i=0;i<parent.children.length;) {
      const first=parent.children[i], w=first.candidate;
      const foldKey = c => JSON.stringify([c.kind,c.provider,c.model||'',c.fixed||'',!!c.fallback,!!c.aside]);
      let end=i+1;
      if(w && ['account','key'].includes(w.kind)) while(end<parent.children.length && parent.children[end].type==='seat' && foldKey(parent.children[end].candidate)===foldKey(w)) end++;
      if(end-i>=3) children.push({type:'header',key:JSON.stringify([...(parent.path||[]),['pool',foldKey(w)]]),poolKind:w.kind,name:w.name||w.provider,ref:w.model+(w.fixed?':'+w.fixed:''),icon:w.icon||w.preset||w.provider,mode:w.routing||'',persistKey:'pool/'+JSON.stringify([...(parent.path||[]),foldKey(w)]),defaultOpen:w.kind==='account'&&end-i<6,children:parent.children.slice(i,end)});
      else children.push(...parent.children.slice(i,end));
      i=end;
    }
    parent.children=children;
  }
  fold(root);
  const out=[];
  function visit(node,parent='',depth=0) {
    const seats=collect(node), open=node.type==='header' ? expanded.get(node.persistKey) ?? node.defaultOpen ?? seats.length<6 : true;
    out.push({...node,parent,depth,seats,open});
    if(open && node.children) for(const child of node.children) visit(child,node.key,depth+1);
  }
  for(const node of root.children) visit(node);
  return out;
}
export function maskName(name, index) {
  if (!name) return l("帳號 {p0}",{p0:(index + 1)});
  const at = name.indexOf('@');
  return at > 0 ? `${name.slice(0, Math.min(2, at))}•••${name.slice(at)}` : `${name.slice(0, 2)}•••`;
}
export function affinityText(value) {
  if (!value) return '';
  const reasons = { first: l("此會話第一個請求"), 'new-turn': l("新一輪對話"), cache: l("保留提示詞快取"), turn: l("保持同一輪對話"), strict: l("固定使用原帳號"), session: l("保持會話帳號"), 'no-cache': l("沒有可保留的快取") };
  return value.why ? l("帳號保留原因：{p0}",{p0:(reasons[value.why] || value.why)}) : value.mode ? l("會話策略：{p0}",{p0:(value.mode)}) : '';
}
