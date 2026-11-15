import {t,locale} from './i18n.mjs';
import {el,brand} from './graphics.mjs';
import {agentName,routeStatus,routeSucceeded,tried,requestKey} from './model.mjs';
import {hitPct,fmtCost,countFormat} from './formats.mjs';
import {took} from './timing.mjs';

// Magpie client.js decodeOf/floorOf/promptOf/requestMetrics, 9c39edb9 (MIT).
const short=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':String(Math.round(n));
const reasoningOf=r=>r.reasoning??(r.usage?.at(-1)?.reasoning||0);
export function decodeOf(r) {
  if(r.reasoningHidden&&!(r.firstText>0))return null;
  const think=reasoningOf(r),visible=think>0&&!(r.firstText>0)&&r.firstReasoning>=r.ttft&&r.flow>0&&think<=r.out;
  const n=think>0&&!visible?r.out-think:r.out,from=visible?r.firstReasoning:think>0?r.firstText:r.ttft,w=r.ms-from;
  if(!(n>0&&r.ttft>0&&from>0&&w>=100&&n*1000<=10000*w))return null;
  if(r.flow>0&&r.flow*4<w)return null;
  if(w<1000&&from>4*w)return null;
  if(think>0&&r.firstText>0&&n*(r.firstText-r.ttft)>20*think*w)return null;
  return {n,w};
}
function floorOf(r){
  const out=r.out||0,ms=r.ms||0,ttft=r.ttft||0,think=reasoningOf(r),n=out-think,w=ms-ttft;
  if(ttft>0&&think>0&&!(r.firstText>0)&&n>=100&&w>=1000&&n*1000<=10000*w&&!(r.flow>0&&r.flow*4<w))return {n,w};
  return out>=1000&&ms>=1000&&out*1000<=10000*ms?{n:out,w:ms}:null;
}
export function promptTotals(rows){
  let prompt=0,read=0;for(const r of rows)for(const u of r.usage||[])if(!u.cache_unknown){read+=u.cache_read||0;prompt+=(u.in||0)+(u.cache_read||0)+(u.cache_write||0);}
  return {prompt,read};
}
export function liveLabel(r,now=Date.now()){
  if(r.done||!r.bytes)return '';
  const n=r.bytes,parts=[n>=1048576?(n/1048576).toFixed(1)+' MiB':n>=1024?(n/1024).toFixed(1)+' KiB':Math.round(n)+' B'];
  if(r.estTok)parts.push(t('≈ {n} tokens',{n:short(r.estTok)}));
  if(r.contentAt){const s=Math.max(1,Math.round((now-r.contentAt)/1000));parts.push(t('{d} ago',{d:s<60?t('{n} s',{n:s}):t('{n} min',{n:Math.round(s/60)})}));}
  return parts.join(' · ');
}
export function requestMetrics(r){
  const priced=r.priced&&Number.isFinite(r.cost);
  const cache=r.done?promptTotals([r]):{prompt:0,read:0},good=routeSucceeded(r);
  const decode=good?decodeOf(r):null,floor=good&&!decode?floorOf(r):null;
  const credited=(r.usage||[]).filter(u=>u.credits!=null),credits=credited.length?t('{n} credits',{n:countFormat.format(credited.reduce((n,u)=>n+u.credits,0))}):'';
  return {
    duration:{label:'Duration',value:r.done&&r.ms?took(r.ms):'',number:r.done?r.ms:NaN},
    ttft:{label:'First token',value:r.done&&r.ttft?took(r.ttft):'',number:r.done?r.ttft:NaN},
    tokens:{label:'Tokens',value:r.tokens?short(r.tokens):'',number:r.tokens||0},
    cache:{label:'Cache hit rate',value:cache.prompt?hitPct(cache.read/cache.prompt):'',number:cache.prompt?cache.read/cache.prompt:NaN},
    speed:{label:'Output speed',value:decode||floor?(floor?'≥':'')+t('{n} tok/s',{n:Math.round((decode||floor).n*1000/(decode||floor).w)}):'',number:decode?decode.n*1000/decode.w:floor?floor.n*1000/floor.w:NaN},
    cost:{label:'Cost',value:[priced?'≈'+fmtCost({cost:r.cost,unpriced:r.unpriced||0}):'',credits].filter(Boolean).join(' · '),number:priced?r.cost:NaN}
  };
}
export function sortRequests(rows,by,metricsFor=requestMetrics){
  const timed=by==='newest'||by==='oldest';
  return rows.map(row=>{const n=timed?Date.parse(row.time):metricsFor(row)[by]?.number;return {row,n:Number.isFinite(n)?n:-Infinity};})
    .sort((a,b)=>timed?(by==='oldest'?a.n-b.n:b.n-a.n)|| (by==='oldest'?a.row.id-b.row.id:b.row.id-a.row.id):b.n-a.n).map(item=>item.row);
}
export function groupRequests(rows,by){
  if(by==='request')return rows.map(r=>({key:requestKey(r),rows:[r],route:r}));
  const groups=new Map();
  for(const r of rows){const key=by==='key'?(r.callerKey||'no-key'):(r.sessionKey?r.agent+' '+r.sessionKey:'no-session');if(!groups.has(key))groups.set(key,{key,rows:[],route:r});groups.get(key).rows.push(r);}
  return [...groups.values()];
}
export function sessionSummaries(rows){
  const at=Math.max(0,...rows.map(r=>Date.parse(r.time)||0)),groups=new Map();
  for(const r of [...rows].sort((a,b)=>b.id-a.id))if(r.prompt&&!r.kind&&r.sessionKey){const key=r.agent+' '+r.sessionKey;if(!groups.has(key))groups.set(key,{key,rows:[],first:r});const g=groups.get(key);g.rows.push(r);g.first=r;}
  return [...groups.values()].filter(g=>g.rows.some(r=>!r.done)||at-(Date.parse(g.rows[0].time)||0)<=15*60000).sort((a,b)=>b.first.id-a.first.id).slice(0,6).map(g=>{
    const withTools=r=>r.prompt.parts.some(p=>p.kind==='tools'&&p.tokens>0),tools=g.rows.some(r=>!r.sub&&withTools(r));
    return {...g,route:g.rows.find(r=>!r.sub&&(!tools||withTools(r)))||g.rows[0]};
  });
}
export function cardMatch(w,cards){
  if(w.kind!=='account')return null;
  const mine=cards.filter(q=>!q.from&&q.kind==='subscription'&&(q.provider===w.agent||q.provider===w.provider));
  return mine.find(q=>(q.user||'').trim().toLowerCase()===(w.who||'').trim().toLowerCase())||(mine.length===1&&!mine[0].user?mine[0]:null);
}
export function cardFor(w,cards){const q=cardMatch(w,cards);return q&&!q.error?q:null;}
export function foldQuota(candidates,cards){
  if(candidates.length<2||candidates.some(w=>w.free))return null;
  const readings=candidates.map(w=>cardFor(w,cards));
  if(readings.some(q=>!q)||new Set(readings).size!==readings.length||new Set(readings.map(q=>q.plan||'')).size!==1)return null;
  const windows=[];
  for(const first of readings[0].windows){
    const peers=readings.map(q=>q.windows.find(w=>w.name===first.name&&(w.unit||'')===(first.unit||'')));
    if(peers.some(w=>!w)||peers.some(w=>w.text))continue;
    const wallet=peers.every(w=>w.balance!=null),unlimited=peers.every(w=>w.unlimited),used=peers.reduce((n,w)=>n+(w.used||0),0)/peers.length;
    const text=wallet?t('{n} left',{n:countFormat.format(peers.reduce((n,w)=>n+w.balance,0))+' '+t(first.unit||'')}):unlimited?t('Unlimited'):t('{n} used',{n:Math.round(used)+'%'});
    windows.push({used:wallet||unlimited?null:used,text:t(first.name)+' '+text});
  }
  if(!windows.length)return null;const shares=windows.filter(w=>w.used!=null),top=shares.length?shares.reduce((a,b)=>b.used>a.used?b:a):windows[0];
  return {...top,tip:windows.map(w=>w.text).join(' · ')+' · '+t('The mean of {n} accounts on one plan',{n:candidates.length})};
}
const kinds={"agent_job":{"purpose":"kind:collab_spawn","name":"Subagent"},"ambient_suggestion_safety":{"purpose":"kind:ambient_suggestions","name":"Suggestions"},"ambient_suggestions":{"purpose":"kind:ambient_suggestions","name":"Suggestions"},"api_detect":{"purpose":"kind:api_detect","name":"Detect APIs"},"auto_review":{"purpose":"kind:guardian","name":"Approval check"},"cache_keepalive":{"purpose":"kind:cache_keepalive","name":"Cache keep-alive"},"collab_spawn":{"purpose":"kind:collab_spawn","name":"Subagent"},"compact":{"purpose":"kind:compact","name":"Compaction"},"composer_predictions":{"purpose":"kind:composer_predictions","name":"Prediction"},"connection_check":{"purpose":"kind:connection_check","name":"Connection check"},"guardian":{"purpose":"kind:guardian","name":"Approval check"},"guardian_review":{"purpose":"kind:guardian","name":"Approval check"},"luna_reserve":{"purpose":"kind:luna_reserve","name":"Luna Reserve"},"mcp":{"purpose":"kind:mcp","name":"MCP tool"},"memgen":{"purpose":"kind:memory_consolidation","name":"Memory"},"memory":{"purpose":"kind:memory_consolidation","name":"Memory"},"memory_consolidation":{"purpose":"kind:memory_consolidation","name":"Memory"},"model_list":{"purpose":"kind:model_list","name":"Model list"},"provider_test":{"purpose":"kind:provider_test","name":"Test"},"review":{"purpose":"kind:review","name":"Review"},"routing":{"purpose":"kind:routing","name":"Routing classifier"},"thread_description":{"purpose":"kind:thread_description","name":"Description"},"thread_spawn":{"purpose":"kind:collab_spawn","name":"Subagent"},"thread_title":{"purpose":"kind:thread_title","name":"Title"},"thread_title_reconsideration":{"purpose":"kind:thread_title","name":"Title"},"title":{"purpose":"kind:thread_title","name":"Title"},"title_generation":{"purpose":"kind:thread_title","name":"Title"},"vision":{"purpose":"kind:vision","name":"Image description"},"web_search":{"purpose":"kind:web_search","name":"Web search"}};
export const purposeOf=kind=>kinds[kind]?.purpose|| (kind?'kind:'+kind:'conversation');
export const purposeName=purpose=>Object.values(kinds).find(k=>k.purpose===purpose)?.name|| (purpose==='conversation'?'Conversation':purpose.replace(/^kind:/,''));
export const requestPurpose=r=>r.kind?purposeOf(r.kind):r.sub||r.subagentId?'kind:collab_spawn':'conversation';
