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
export function accountSummary(rows){
  const accounts=new Map();
  for(const r of [...rows].reverse()){
    for(const w of r.order){const key=w.kind==='account'&&w.who?JSON.stringify([w.provider,w.who.trim().toLowerCase()]):w.id;
      if(!accounts.has(key))accounts.set(key,{key,candidate:w,at:r.time,tried:0,ok:0,failed:0,models:new Set()});accounts.get(key).candidate=w;accounts.get(key).at=r.time;
    }
    for(const tr of r.tries){if(!tr.done||tr.fail==='canceled')continue;const w=tried(r,tr),key=w.kind==='account'&&w.who?JSON.stringify([w.provider,w.who.trim().toLowerCase()]):w.id,a=accounts.get(key);if(!a)continue;a.tried++;if(tr.status<400&&!tr.fail){a.ok++;a.models.add(tr.model||w.model);}else a.failed++;}
  }
  return [...accounts.values()];
}
export function cardFor(w,cards){
  if(w.kind!=='account')return null;
  const mine=cards.filter(q=>!q.from&&q.kind==='subscription'&&(q.provider===w.agent||q.provider===w.provider));
  const q=mine.find(q=>(q.user||'').trim().toLowerCase()===(w.who||'').trim().toLowerCase())||(mine.length===1&&!mine[0].user?mine[0]:null);
  return q&&!q.error?q:null;
}
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
export function createRequests(ctx,actions,sessionNumbers){
  const node=el('section','rr-requests'),head=el('div','rr-history-head'),days=el('div','rr-history-days'),tools=el('div','rr-history-tools'),body=el('div','rr-history-columns'),list=el('div','rr-history-list'),accounts=el('div','rr-account-list');
  head.append(el('h3','',t('Requests')));body.append(list,accounts);node.append(head,days,tools,body);
  let value,by='request',sort='newest',allAccounts=false,metrics=['duration','ttft','tokens','cache','speed','cost'];const folded=new Set(),rows=new Map(),groupRows=new Map(),dayRows=new Map();
  try{by=localStorage.getItem('magpie-routes.groupBy')||by;const saved=JSON.parse(localStorage.getItem('magpie-routes.metrics')||'null');if(Array.isArray(saved))metrics=metrics.filter(k=>saved.includes(k));}catch{}
  if(!['request','session','key'].includes(by))by='request';
  let lastRows=[],lastKey='',lastCards,lastTallies,page=0,pageScope='',lastScope='',lastSelection='';
  const pageSize=100,paging=el('nav','rr-history-paging'),previous=el('button','rr-text',t('Previous page')),pageLabel=el('span'),next=el('button','rr-text',t('Next page'));
  paging.setAttribute('aria-label',t('Request pages'));pageLabel.setAttribute('aria-live','polite');
  previous.type=next.type='button';previous.dataset.action='previous-page';next.dataset.action='next-page';
  previous.onclick=()=>{page--;render();};next.onclick=()=>{page++;render();};paging.append(previous,pageLabel,next);node.insertBefore(paging,body);
  const buttons=new Map();
  for(const [id,label]of [['request','By request'],['session','By session'],['key','By key']]){const b=el('button','rr-text',t(label));b.type='button';b.dataset.groupBy=id;b.onclick=()=>{by=id;try{localStorage.setItem('magpie-routes.groupBy',by);}catch{}render();};buttons.set(id,b);tools.append(b);}
  const purposes=el('details','rr-metric-pick rr-purpose-pick'),purposeLabel=el('summary','',t('Purpose filter')),purposeItems=el('div');purposes.append(purposeLabel,purposeItems);
  const clearPurpose=el('button','rr-text',t('Clear filter'));clearPurpose.type='button';clearPurpose.onclick=()=>actions.purpose([]);
  const sorting=el('select');sorting.setAttribute('aria-label',t('Sort requests'));
  for(const [id,label]of [['newest','Newest first'],['oldest','Oldest first'],['duration','Duration'],['ttft','First token'],['tokens','Tokens'],['cache','Cache hit rate'],['speed','Output speed'],['cost','Cost']]){const o=el('option','',t(label));o.value=id;sorting.append(o);}sorting.onchange=()=>{sort=sorting.value;render();};
  const metricPick=el('details','rr-metric-pick');metricPick.append(el('summary','',t('Metrics')));
  for(const [id,{label}]of Object.entries(requestMetrics({usage:[]}))){const item=el('label'),input=el('input');input.type='checkbox';input.dataset.metric=id;input.checked=metrics.includes(id);input.onchange=()=>{metrics=input.checked?[...metrics,id]:metrics.filter(k=>k!==id);try{localStorage.setItem('magpie-routes.metrics',JSON.stringify(metrics));}catch{}render();};item.append(input,t(label));metricPick.append(item);}
  const foldAll=el('button','rr-text',t('Fold all')),replay=el('button','rr-text',t('Replay'));
  foldAll.type=replay.type='button';replay.dataset.action='replay';foldAll.onclick=()=>{const groups=groupRequests(value.filtered,by),open=groups.some(g=>!folded.has(g.key));for(const g of groups)if(open)folded.add(g.key);else folded.delete(g.key);render();};replay.onclick=()=>actions.replay(value.filtered);
  const reload=el('button','rr-text',t('Reload allowances'));reload.type='button';reload.onclick=()=>actions.cards();
  tools.append(purposes,clearPurpose,sorting,metricPick,foldAll,replay);
  function metricNode({label,value}){const n=el('span','rr-request-metric');n.append(el('span','k',t(label)),el('span','v',value));return n;}
  function render(){
    if(!value?.visible)return;
    const priced=value.filtered.some(r=>r.priced&&Number.isFinite(r.cost)),costAvailable=priced||value.filtered.some(r=>r.usage?.some(u=>u.credits!=null));
    const costOption=sorting.querySelector('option[value="cost"]');costOption.hidden=costOption.disabled=!priced;
    const costToggle=metricPick.querySelector('input[data-metric="cost"]');costToggle.parentElement.hidden=!costAvailable;costToggle.disabled=!costAvailable;
    if(sort==='cost'&&!priced)sort='newest';sorting.value=sort;
    // A kept day is immutable while unrelated live requests arrive. Preserve
    // its DOM and scroll/focus, instead of repainting up to 2000 rows per tick.
    const scope=JSON.stringify([by,sort,value.historyDay,value.filter,value.purpose]);if(scope!==pageScope){page=0;pageScope=scope;}
    const key=JSON.stringify([page,by,sort,metrics,[...folded],allAccounts,value.route?.id,value.route?.time,value.masked,value.historyDay,value.historyDays,value.historyLoading,value.historyCut,value.cardsLoading,value.cardsError,value.filter,value.purpose,[...new Set(value.allRoutes.map(requestPurpose))],value.filtered.some(r=>!r.done)?Math.floor(Date.now()/1000):0]);
    if(key===lastKey&&lastCards===value.cards&&lastTallies===value.tallies&&lastRows.length===value.filtered.length&&lastRows.every((r,i)=>r===value.filtered[i]))return;
    lastKey=key;lastCards=value.cards;lastTallies=value.tallies;lastRows=value.filtered;

    for(const [id,b]of buttons){b.setAttribute('aria-pressed',String(by===id));b.hidden=id==='key'&&!value.allRoutes.some(r=>r.callerKey)&&by!=='key';}
    foldAll.hidden=by==='request';
    const choices=[['','All purposes'],...[...new Set(value.allRoutes.map(requestPurpose))].map(p=>[p,purposeName(p)])];
    const choiceKey=JSON.stringify(choices);if(purposes.dataset.key!==choiceKey){purposeItems.replaceChildren(...choices.filter(([id])=>id).map(([id,label])=>{const wrap=el('label'),input=el('input');input.type='checkbox';input.dataset.purpose=id;input.onchange=()=>actions.purpose(input.checked?[...value.purpose,id]:value.purpose.filter(k=>k!==id));wrap.append(input,t(label));return wrap;}));purposes.dataset.key=choiceKey;}
    for(const input of purposeItems.querySelectorAll('input'))input.checked=value.purpose.includes(input.dataset.purpose);clearPurpose.hidden=!value.purpose.length;
    const dayNodes=[{day:'',requests:null},...value.historyDays].map(({day,requests})=>{
      let b=dayRows.get(day);if(!b){b=el('button','rr-text');b.type='button';b.onclick=()=>actions.day(day);dayRows.set(day,b);}
      const text=day?day+(requests==null?'':' · '+requests):t('Live');if(b.textContent!==text)b.textContent=text;b.setAttribute('aria-pressed',String(day===value.historyDay));b.disabled=value.historyLoading;return b;
    });
    const daySet=new Set(dayNodes);for(const b of [...days.children])if(!daySet.has(b))b.remove();dayNodes.forEach((b,i)=>{if(days.children[i]!==b)days.insertBefore(b,days.children[i]||null);});
    replay.disabled=!value.filtered.some(r=>r.done&&Number.isFinite(Date.parse(r.time)));
    const groups=groupRequests(value.filtered,by),label=t(groups.some(g=>!folded.has(g.key))?'Fold all':'Unfold all');if(foldAll.textContent!==label)foldAll.textContent=label;
    const note=el('span','',t('{n} requests',{n:value.filtered.length}));if(value.historyCut)note.append(' · ',t('Latest {n} requests',{n:2000}));head.replaceChildren(el('h3','',t('Requests')),note);
    if(value.historyLoading)head.append(el('span','',t('Loading…')));
    const metricCache=new Map(),metricsFor=r=>{if(!metricCache.has(r))metricCache.set(r,requestMetrics(r));return metricCache.get(r);};
    const sorted=sortRequests(value.filtered,sort,metricsFor),pages=Math.max(1,Math.ceil(sorted.length/pageSize));
    const selection=value.route?requestKey(value.route):'';
    if(selection!==lastSelection&&!value.follow&&scope===lastScope){const at=sorted.findIndex(r=>requestKey(r)===selection);if(at>=0)page=Math.floor(at/pageSize);}
    lastSelection=selection;lastScope=scope;page=Math.max(0,Math.min(page,pages-1));
    paging.hidden=pages===1;previous.disabled=page===0;next.disabled=page===pages-1;
    pageLabel.textContent=t('Page {page} of {pages} · {from}–{to} of {total}',{page:page+1,pages,from:sorted.length?page*pageSize+1:0,to:Math.min((page+1)*pageSize,sorted.length),total:sorted.length});
    const completeGroups=new Map(groupRequests(sorted,by).map(g=>[g.key,g]));
    const groupKeys=new Set(completeGroups.keys());for(const key of groupRows.keys())if(!groupKeys.has(key)){groupRows.delete(key);folded.delete(key);}
    const visible=[];
    for(const g of groupRequests(sorted.slice(page*pageSize,(page+1)*pageSize),by)){
      if(by!=='request'){
        let b=groupRows.get(g.key);if(!b){b=el('button','rr-request-group');b.type='button';b.onclick=()=>{if(folded.has(g.key))folded.delete(g.key);else folded.add(g.key);render();};groupRows.set(g.key,b);}b.replaceChildren();b.setAttribute('aria-expanded',String(!folded.has(g.key)));
        const all=completeGroups.get(g.key).rows,count=all.length,{prompt,read}=promptTotals(all.filter(r=>r.done));let totalN=0,totalW=0;for(const r of all)if(routeSucceeded(r)){const d=decodeOf(r);if(d){totalN+=d.n;totalW+=d.w;}}
        b.append(el('strong','',by==='key'?(g.route.callerKeyName||(g.route.callerKey?t('Gateway key'):t('No gateway key'))):g.route.sessionKey?agentName(g.route.agent)+' · '+t('Session {n}',{n:sessionNumbers.get(g.route.agent+' '+g.route.sessionKey)}):t('No session ID')),el('span','',t('{n} requests',{n:count})+' · '+short(all.reduce((sum,r)=>sum+(r.tokens||0),0))+' '+t('tokens')));
        if((by==='key'||g.route.sessionKey)&&prompt&&metrics.includes('cache'))b.append(metricNode({label:'Avg. cache',value:hitPct(read/prompt)}));if((by==='key'||g.route.sessionKey)&&totalW&&metrics.includes('speed'))b.append(metricNode({label:'Avg. speed',value:t('{n} tok/s',{n:Math.round(totalN*1000/totalW)})}));
        if(metrics.includes('cost')){const priced=all.filter(r=>r.priced&&Number.isFinite(r.cost)),credited=all.flatMap(r=>(r.usage||[]).filter(u=>u.credits!=null));const cost=[priced.length?'≈'+fmtCost({cost:priced.reduce((n,r)=>n+(r.cost||0),0),unpriced:all.some(r=>!r.priced||r.unpriced)?1:0}):'',credited.length?t('{n} credits',{n:countFormat.format(credited.reduce((n,u)=>n+u.credits,0))}):''].filter(Boolean).join(' · ');if(cost)b.append(metricNode({label:'Cost',value:cost}));}
        visible.push(b);
      }
      if(by!=='request'&&folded.has(g.key))continue;
      for(const r of g.rows){
        const key=requestKey(r);let row=rows.get(key);if(!row){row=el('button','rr-request-detail');row.type='button';row.onclick=()=>actions.pick(r);rows.set(key,row);}
        const title=el('span','rr-request-title');title.append(brand(ctx,r.agent),el('strong','',agentName(r.agent)),el('code','',r.served||r.model),el('time','',new Date(r.time).toLocaleTimeString(locale(),{hour12:false})),el('span','',routeStatus(r).label));
        const detail=el('span','rr-request-details');
        for(const key of metrics){const metric=metricsFor(r)[key];if(metric.value){const n=metricNode(metric);n.dataset.metric=key;detail.append(n);}}
        const live=liveLabel(r);if(live)detail.append(el('span','rr-request-live',live));
        row.replaceChildren(title,detail);row.dataset.requestId=r.id;row.dataset.tone=routeStatus(r).tone;row.setAttribute('aria-pressed',String(Boolean(value.route)&&requestKey(value.route)===key));visible.push(row);
      }
    }
    const kept=new Set(visible);for(const [key,row]of rows)if(!kept.has(row))rows.delete(key);
    const wanted=new Set(visible);for(const row of [...list.children])if(!wanted.has(row))row.remove();visible.forEach((row,i)=>{if(list.children[i]!==row)list.insertBefore(row,list.children[i]||null);});
    if(!visible.length)list.replaceChildren(el('p','rr-empty',t('No requests match this filter.')));
    const shown=!value.historyDay&&!value.purpose.length&&!value.filter&&value.tallies?.length?value.tallies:accountSummary(value.filtered),title=el('div','rr-history-head');title.append(el('h3','',t('Accounts and keys')));
    reload.disabled=value.cardsLoading;title.append(reload);accounts.replaceChildren(title);
    if(value.cardsError)accounts.append(el('p','rr-notice',value.cardsError));
    for(const a of allAccounts?shown:shown.slice(0,8)){
      const w=a.candidate,row=el('article','rr-account-summary'),head=el('strong');head.append(brand(ctx,w.provider,w.icon),value.masked&&w.who?el('span','rr-pii',w.who):w.who||w.name||w.provider);row.append(head,el('span','',t('tried {n}',{n:a.tried})+' · '+t('answered {n}',{n:a.ok})+' · '+t('{n} failed',{n:a.failed})));
      const card=!value.historyDay?cardFor(w,value.cards||[]):null;
      if(card){if(card.balance)row.append(el('span','',card.balance));for(const x of card.windows){let text=x.text?x.display:x.balance!=null?t('{n} left',{n:countFormat.format(x.balance)+' '+t(x.unit||'')}):x.unlimited?t('Unlimited'):t('{n} used',{n:Math.round(x.used)+'%'});if(x.limit)text=countFormat.format(x.amount)+' / '+countFormat.format(x.limit)+' '+t(x.unit||'')+' · '+text;if(x.resetsAt)text+=' · '+t('Renews at {time}',{time:new Date(x.resetsAt).toLocaleString(locale())});if(x.runsOutAt)text+=' · '+t('{n} expires at {time}',{n:countFormat.format(x.runsOut||0)+' '+t(x.unit||''),time:new Date(x.runsOutAt).toLocaleString(locale())});row.append(el('span','',t(x.name)+': '+text));}if(card.readAt||card.asOf)row.append(el('small','',t('Last read: {time}',{time:new Date(card.readAt||card.asOf).toLocaleString(locale())})));}
      else if(w.known)row.append(el('span','',w.balance!=null?t('{n} left',{n:countFormat.format(w.balance)+' '+t(w.unit||'')}):t('{n} used',{n:Math.round(w.usedPercent)+'%'})));
      if(!card&&a.at)row.append(el('small','',t('as of {time}',{time:new Date(a.at).toLocaleString(locale())})));
      accounts.append(row);
    }
    if(shown.length>8){const b=el('button','rr-text',allAccounts?t('Show fewer'):t('Show {n} more',{n:shown.length-8}));b.type='button';b.onclick=()=>{allAccounts=!allAccounts;render();};accounts.append(b);}
  }
  return {node,update(next){value=next;render();},dispose(){rows.clear();groupRows.clear();dayRows.clear();node.remove();}};
}

const kinds={"agent_job":{"purpose":"kind:collab_spawn","name":"Subagent"},"ambient_suggestion_safety":{"purpose":"kind:ambient_suggestions","name":"Suggestions"},"ambient_suggestions":{"purpose":"kind:ambient_suggestions","name":"Suggestions"},"api_detect":{"purpose":"kind:api_detect","name":"Detect APIs"},"auto_review":{"purpose":"kind:guardian","name":"Approval check"},"cache_keepalive":{"purpose":"kind:cache_keepalive","name":"Cache keep-alive"},"collab_spawn":{"purpose":"kind:collab_spawn","name":"Subagent"},"compact":{"purpose":"kind:compact","name":"Compaction"},"composer_predictions":{"purpose":"kind:composer_predictions","name":"Prediction"},"connection_check":{"purpose":"kind:connection_check","name":"Connection check"},"guardian":{"purpose":"kind:guardian","name":"Approval check"},"guardian_review":{"purpose":"kind:guardian","name":"Approval check"},"luna_reserve":{"purpose":"kind:luna_reserve","name":"Luna Reserve"},"mcp":{"purpose":"kind:mcp","name":"MCP tool"},"memgen":{"purpose":"kind:memory_consolidation","name":"Memory"},"memory":{"purpose":"kind:memory_consolidation","name":"Memory"},"memory_consolidation":{"purpose":"kind:memory_consolidation","name":"Memory"},"model_list":{"purpose":"kind:model_list","name":"Model list"},"provider_test":{"purpose":"kind:provider_test","name":"Test"},"review":{"purpose":"kind:review","name":"Review"},"routing":{"purpose":"kind:routing","name":"Routing classifier"},"thread_description":{"purpose":"kind:thread_description","name":"Description"},"thread_spawn":{"purpose":"kind:collab_spawn","name":"Subagent"},"thread_title":{"purpose":"kind:thread_title","name":"Title"},"thread_title_reconsideration":{"purpose":"kind:thread_title","name":"Title"},"title":{"purpose":"kind:thread_title","name":"Title"},"title_generation":{"purpose":"kind:thread_title","name":"Title"},"vision":{"purpose":"kind:vision","name":"Image description"},"web_search":{"purpose":"kind:web_search","name":"Web search"}};
export const purposeOf=kind=>kinds[kind]?.purpose|| (kind?'kind:'+kind:'conversation');
export const purposeName=purpose=>Object.values(kinds).find(k=>k.purpose===purpose)?.name|| (purpose==='conversation'?'Conversation':purpose.replace(/^kind:/,''));
export const requestPurpose=r=>r.kind?purposeOf(r.kind):r.sub||r.subagentId?'kind:collab_spawn':'conversation';
