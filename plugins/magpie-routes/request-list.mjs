import {t,locale} from './i18n.mjs';
import {el,svg,brand} from './graphics.mjs';
import {agentName,routeSucceeded,tried,requestKey,seatKey} from './model.mjs';
import {hitPct,fmtCost,countFormat,fmtN} from './formats.mjs';
import {took} from './timing.mjs';
import {sourceWords} from './routing-words.mjs';
import {requestMetrics,groupRequests,promptTotals,decodeOf,liveLabel,cardFor,cardMatch,purposeOf,purposeName,requestPurpose,sortRequests} from './requests.mjs';

// The Requests and Accounts-and-keys blocks of Magpie's routing page
// (internal/gui/assets/plugins/routing/client.js renderHist/renderActs/reqRow,
// 9c39edb9, MIT): same DOM and class names, styled by request-list.css. Only the
// data plumbing differs: rows come from the gateway trace the plugin backend
// sanitises, and nothing here writes to Magpie.
// A request keeps its time, model and result on one line from this column width up (Magpie stacks them at 760px, in a page it keeps wider).
const STACK=520;
const CHEV='m5.5 6.5 2.5 2.5 2.5-2.5',CROSS='M4.5 4.5l7 7M11.5 4.5l-7 7',FOLD_AT=3,LONG=6,ACTS_SHOWN=8,CHUNK=100;
const words=()=>sourceWords(null,name=>name);
const icon=(path,size=12,width=1.6)=>{const s=svg('svg',{viewBox:'0 0 16 16',width:size,height:size,fill:'none',stroke:'currentColor','stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'});s.append(svg('path',{d:path}));return s;};
const setText=(e,s)=>{if(e.textContent!==s)e.textContent=s;};
const setAttr=(e,k,v)=>{if(e.getAttribute(k)!==v)e.setAttribute(k,v);};
const short=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'k':String(Math.round(n));
const exactN=n=>fmtN(n)===String(n)?'':countFormat.format(n);
const count=n=>Object.assign(el('small','',fmtN(n)),{title:exactN(n)});
function dur(ms){
  const s=Math.max(1,Math.round(ms/1000));
  if(s<60)return t('{n} s',{n:s});
  const m=Math.round(s/60);if(m<60)return t('{n} min',{n:m});
  const h=Math.floor(m/60),mm=m%60;
  if(h<10&&mm)return t('{h} h {m} min',{h,m:mm});
  if(h<48)return t('{n} h',{n:Math.round(m/60)});
  return t('{n} d',{n:Math.round(m/1440)});
}
function clock(value){
  const d=new Date(value),n=new Date(),hm=new Intl.DateTimeFormat(locale(),{hour:'2-digit',minute:'2-digit'}).format(d);
  return d.toDateString()===n.toDateString()?hm:new Intl.DateTimeFormat(locale(),{weekday:'short'}).format(d)+' '+hm;
}
const rowClock=time=>{const d=new Date(time);return isNaN(d)?'':new Intl.DateTimeFormat(locale(),{hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(d);};
function dayName(day){
  const x=new Date(day+'T12:00:00'),n=new Date(),y=new Date(n.getTime()-864e5);
  return x.toDateString()===n.toDateString()?t('today'):x.toDateString()===y.toDateString()?t('yesterday')
    :x.toLocaleDateString(locale(),{month:'short',day:'numeric',weekday:'short'});
}
const shortWindow=name=>{const m=/^(\d+)\s*(minute|hour|day|week|month)s?$/i.exec(name||'');return m?m[1]+{minute:'m',hour:'h',day:'d',week:'w',month:'mo'}[m[2].toLowerCase()]:t(name);};
const chw=s=>[...String(s)].reduce((n,c)=>n+(c.charCodeAt(0)>0x2e7f?2:1),0);
const accountKey=w=>w.kind==='account'&&w.who?JSON.stringify(w.plan&&String(w.plan).trim()?[w.provider,w.who.trim().toLowerCase(),String(w.plan).trim().toLowerCase()]:[w.provider,w.who.trim().toLowerCase()]):w.id;
const tryOk=tr=>tr.status<400&&!tr.fail;
const at=s=>typeof s==='string'?new Date(s).getTime():Number(s)||0;
const known0=s=>s&&!String(s).startsWith('0001-');
const failWord=(why,rest)=>words().failure(why,rest);
const restSay=(rest,n)=>{const w=words(),why=rest.why||rest.kind,kindless=!why||why==='other'||!w.failure(why,rest)||w.failure(why,rest)===why;
  return (kindless&&rest.status?rest.status+' · ':'')+w.failure(why,rest)+' · '+w.rest(rest,n);};

function outcome(r,masked){
  const who=w=>w.kind==='provider'?w.name:(w.who||w.name||w.provider),named=w=>{
    if(w.kind==='provider'||!w.who||!masked)return [who(w)+' · '+w.model,null];
    return [w.who,' · '+w.model];
  };
  if(!r.done){
    const tr=r.tries.at(-1),w=tr&&tried(r,tr);
    return [w?t('{who} is answering…',{who:(masked&&w.kind==='account'&&w.who?'\u0000':who(w))+' · '+w.model}):t(r.phase==='redact'?'masking…':r.phase==='queue'?'queued…':'routing…'),'wait',tr,w];
  }
  const ok=r.tries.find(tr=>tr.done&&tryOk(tr)),w=ok&&tried(r,ok);
  if(r.status<400&&(ok||!r.tries.length))return [w?who(w)+' · '+w.model:r.provider,r.tries.length>1?'moved':'ok',ok,w];
  const last=r.tries.at(-1),end=last?`${r.status} · ${failWord(last.gone?'canceled':r.fail||last.fail,(!r.fail||r.fail===last.fail)&&last.rest)}`:'';
  if(r.canceled||r.fail==='canceled'||last?.fail==='canceled')return [end||`${r.status} · ${failWord('canceled')}`,'gone',null,null];
  return [last?end:`${r.status||''} ${r.error||''}`.trim(),'bad',null,null];
}
const TIER_TAG={priority:'fast',fast:'fast',ultrafast:'ultrafast',flex:'flex'};
const rowTier=(r,tr)=>TIER_TAG[String((tr?.tier||(tr?.done?'':r.tier))||'').toLowerCase()]||'';
function tierNote(r,tr,tier){
  const word=tr?.tier||r.tier,said=tr?.fast?t("Sent in its vendor's fast mode, as the group says"):tier==='flex'?t("Sent at its vendor's flex tier (service tier {tier}): slower, at a lower price",{tier:word}):t("Sent in its vendor's fast mode (service tier {tier}): quicker, at a higher price",{tier:word});
  return tr?.tierServed&&tr.tierServed!==tr.tier?said+'\n'+t('Its reply said it ran at {tier}.',{tier:tr.tierServed}):said;
}
const noAnswer=how=>how==='bad'||how==='gone';
const kindOf=r=>r.kind||(r.sub||r.subagentId?'collab_spawn':'');
function titleOf(r,how,tr,w,masked){
  const head=`${agentName(r.agent)} · ${r.model} → `,folder=(r.callerKey?'\n'+t('Gateway key')+': '+(r.callerKeyName||t('Gateway key')):'');
  const target=!noAnswer(how)&&r.tries.length>1&&tr&&w;
  if(!target)return head+r.provider+folder;
  const first=r.tries[0],f=tried(r,first),where=x=>x.kind==='provider'||!x.who||masked?x.name||x.provider:`${x.name||x.provider} · ${x.who}`;
  const from=f&&seatKey(f)!==seatKey(w)?'\n'+t('rerouted from {from}',{from:`${where(f)} · ${first.model||f.model}`}):'';
  return head+`${where(w)} · ${tr.model||w.model}`+from+folder;
}
function metricElement([cls,label,value,help],compact=false){
  const metric=el('span','rt-metric '+(cls==='cost'?'cost-metric':cls));
  if(!compact||cls==='ttft'||cls==='cache-hit')metric.append(el('span','k',t(label)));
  metric.append(el('span','v'+(cls==='cost'?' cost':''),value));
  if(compact&&cls==='tokens')metric.append(el('span','k',t('{n} tokens',{n:''}).trim()));
  metric.title=help||t(label);
  return metric;
}
const METRIC_CLASS={duration:'duration',ttft:'ttft',tokens:'tokens',cache:'cache-hit',speed:'speed',cost:'cost'};
const METRIC_LABEL={duration:'Duration',ttft:'First token',tokens:'Tokens',cache:'Cache',speed:'Speed',cost:'Cost'};

export function createRequests(ctx,actions,sessionNumbers,hueOf=()=>'currentColor'){
  const node=el('section','rr-requests rt-more'),hist=el('div','rt-cols'),colA=el('div','rt-col'),colB=el('div','rt-col');
  const reqHead=el('div','row-head rt-req-head'),reqLabel=el('span','label'),reqNote=el('span','note'),replayAll=el('button','text');
  replayAll.type='button';replayAll.dataset.action='replay';
  const purposeTools=el('div','rt-purpose-tools'),purposePick=el('button','text rt-purpose'),purposeLabel=el('span'),purposeClear=el('button','text rt-purpose-clear');
  purposePick.type=purposeClear.type='button';purposePick.setAttribute('aria-haspopup','menu');purposePick.setAttribute('aria-expanded','false');
  purposePick.append(purposeLabel,icon(CHEV,11));purposeClear.append(icon(CROSS,11));purposeTools.append(purposePick,purposeClear);
  const metricOptions=[['duration','Duration'],['ttft','First token'],['tokens','Tokens'],['cache','Cache hit rate'],['speed','Output speed'],['cost','Cost']];
  let visibleMetrics=metricOptions.map(([key])=>key);
  try{const saved=JSON.parse(localStorage.getItem('magpie-routes.metrics')||'null');if(Array.isArray(saved))visibleMetrics=visibleMetrics.filter(k=>saved.includes(k));}catch{}
  const metricPick=el('button','text rt-metric-pick'),metricLabel=el('span');metricPick.type='button';metricPick.setAttribute('aria-haspopup','menu');metricPick.setAttribute('aria-expanded','false');
  metricPick.append(metricLabel,icon(CHEV,11));
  const foldAll=el('button','text rt-fold-all');foldAll.type='button';
  reqHead.append(reqLabel,el('span','grow'),reqNote,purposeTools,metricPick,foldAll,replayAll);
  const filters=el('div','rt-filters'),dayBar=el('div','rt-days'),groupBar=el('div','rt-group-by'),reqs=el('div','list rt-reqs');
  let groupBy='request';
  try{const saved=localStorage.getItem('magpie-routes.groupBy');if(['request','session','key'].includes(saved))groupBy=saved;}catch{}
  const groupButtons=[['request','By request'],['session','By session'],['key','By key']].map(([id,label])=>{
    const b=el('button','rt-day');b.type='button';b.dataset.groupBy=id;b.dataset.label=label;
    b.onclick=()=>{groupBy=id;try{localStorage.setItem('magpie-routes.groupBy',id);}catch{}render(true);};groupBar.append(b);return b;
  });
  filters.append(dayBar,groupBar);colA.append(reqHead,filters,reqs);
  const actHead=el('div','row-head'),actLabel=el('span','label'),actNote=el('span','note'),acts=el('div','list rt-acts');
  const actRead=el('button','rt-read');actRead.type='button';actRead.append(icon('M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3h-3',12,1.7));
  actRead.onclick=()=>{if(!actRead.classList.contains('busy'))actions.cards();};
  actHead.append(actLabel,actRead,el('span','grow'),actNote);
  const actError=el('p','rr-notice rt-acts-error');actError.hidden=true;
  const actFoot=el('div','rt-acts-foot'),actMore=el('button','text rt-acts-more');actMore.type='button';
  let actsAll=false;try{actsAll=localStorage.getItem('magpie-routes.actsAll')==='1';}catch{}
  actMore.onclick=()=>{actsAll=!actsAll;try{localStorage.setItem('magpie-routes.actsAll',actsAll?'1':'0');}catch{}render(true);};
  actFoot.append(actMore,el('span','grow'));colB.append(actHead,actError,acts,actFoot);hist.append(colA,colB);node.append(hist);

  // The wide and narrow layouts go by each box's own width, as Magpie sets
  // them (byWidth), so the list lays out by its column and not the page.
  const byWidth=(target,marks)=>{const o=new ResizeObserver(([e])=>{const w=e.contentRect.width;if(!w)return;requestAnimationFrame(()=>{for(const[cls,fits]of Object.entries(marks))target.classList.toggle(cls,fits(w));});});o.observe(target);return o;};
  const observers=[byWidth(node,{max520:w=>w<=520}),byWidth(colA,{max440:w=>w<=440,max760:w=>w<=STACK}),byWidth(colB,{max440:w=>w<=440,max760:w=>w<=STACK})];

  observers.push(new ResizeObserver(()=>{const first=acts.querySelector('.rt-act');if(first&&first.clientWidth)requestAnimationFrame(()=>acts.classList.toggle('slim',first.clientWidth<215));}));observers[observers.length-1].observe(acts);
  // Accounts beside the requests (min1150) only where the requests still keep their numbers on one line there (Magpie sideFit)
  let sideSoon=0;
  const metaWraps=()=>[...reqs.querySelectorAll('.rt-req .meta:not([hidden])')].some(m=>{const k=m.children;return k.length>1&&k[k.length-1].getBoundingClientRect().top-k[0].getBoundingClientRect().top>2;});
  const sideFit=()=>{if(sideSoon)return;sideSoon=requestAnimationFrame(()=>{sideSoon=0;
    const w=node.clientWidth;if(!w)return;let side=w>=1150;
    if(side&&reqs.offsetParent&&!hist.classList.contains('solo')&&reqs.querySelector('.rt-req')){
      const narrow=colA.classList.contains('max760'),under=colA.classList.contains('meta-under'),top=reqs.scrollTop;
      node.classList.add('min1150');colA.classList.toggle('max760',colA.clientWidth<=STACK);colA.classList.remove('meta-under');
      side=!colA.classList.contains('max760')&&!metaWraps();
      colA.classList.toggle('max760',narrow);colA.classList.toggle('meta-under',under);reqs.scrollTop=top;
    }
    node.classList.toggle('min1150',side);
  });};
  let menu=null,menuOwner=null;
  const closeMenu=()=>{if(!menu)return;menu.remove();menuOwner?.classList.remove('open');menuOwner?.setAttribute('aria-expanded','false');menu=menuOwner=null;document.removeEventListener('pointerdown',outside,true);document.removeEventListener('keydown',escape,true);};
  const outside=e=>{if(menu&&!menu.contains(e.target)&&!menuOwner?.contains(e.target))closeMenu();};
  const escape=e=>{if(e.key==='Escape'){const owner=menuOwner;closeMenu();owner?.focus({preventScroll:true});}};
  function openMenu(owner,items,picked,choose,cls,multi=false,head=''){
    if(menuOwner===owner)return closeMenu();closeMenu();
    const m=el('div','rt-popmenu '+cls);m.setAttribute('role','menu');if(head)m.append(el('div','pm-head',head));
    let on=[...picked];
    const draw=()=>{for(const b of m.querySelectorAll('.pm-item'))b.classList.toggle('on',on.includes(b.dataset.v));};
    for(const item of items){
      const b=el('button','pm-item');b.type='button';b.dataset.v=item.v;if(item.v&&multi){b.dataset[cls.includes('purpose')?'purpose':'metric']=item.v;}
      const tick=el('span','pm-tick');b.append(tick,el('span','pm-words'));b.lastChild.append(el('span','pm-name',item.name));
      if(item.note){const n=el('span','pm-note',item.note);b.lastChild.append(n);}
      b.onclick=e=>{e.stopPropagation();
        if(multi){on=item.v===''?[]:on.includes(item.v)?on.filter(v=>v!==item.v):[...on,item.v];draw();choose(on);}
        else{closeMenu();choose(item.v);}
      };m.append(b);
    }
    draw();node.append(m);menu=m;menuOwner=owner;owner.classList.add('open');owner.setAttribute('aria-expanded','true');
    const a=owner.getBoundingClientRect(),n=node.getBoundingClientRect(),width=m.offsetWidth;
    const left=Math.max(4,Math.min(a.left-n.left,n.width-width-4)),right=a.right-n.left-width;
    m.style.top=a.bottom-n.top+4+'px';m.style.left=(cls.includes('right')?Math.max(4,right):left)+'px';
    document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);
    m.querySelector('.pm-item')?.focus({preventScroll:true});
  }
  purposePick.onclick=e=>{e.stopPropagation();
    const choices=[...new Set([...(value?.allRoutes||[]).map(requestPurpose),...(value?.purpose||[])])].sort((a,b)=>(a==='conversation'?-1:b==='conversation'?1:0)||purposeName(a).localeCompare(purposeName(b)));
    openMenu(purposePick,[{v:'',name:t('All purposes')},...choices.map(v=>({v,name:t(purposeName(v))}))],value.purpose,keys=>actions.purpose(keys),'rt-purpose-menu right',true);};
  purposeClear.onclick=()=>{closeMenu();actions.purpose([]);purposePick.focus({preventScroll:true});};
  metricPick.onclick=e=>{e.stopPropagation();
    openMenu(metricPick,metricOptions.filter(([key])=>key!=='cost'||costAvailable).map(([v,name])=>({v,name:t(name)})),visibleMetrics,keys=>{visibleMetrics=metricOptions.map(([key])=>key).filter(k=>keys.includes(k));try{localStorage.setItem('magpie-routes.metrics',JSON.stringify(visibleMetrics));}catch{}render(true);},'rt-metric-menu right',true,t('Metrics to show'));};

  // A request's numbers go on a line of their own, under where it went, when they
  // no longer fit their column on one line (Magpie metaFit). Measured on one line
  // each time, with the mark taken off first.
  let metaSoon=0;
  const metaFit=()=>{if(metaSoon)return;metaSoon=requestAnimationFrame(()=>{
    metaSoon=0;if(colA.classList.contains('max760')||!reqs.offsetParent)return;
    const top=reqs.scrollTop,under=colA.classList.contains('meta-under');colA.classList.remove('meta-under');
    const wraps=[...reqs.querySelectorAll('.rt-req .meta:not([hidden])')].some(m=>{const k=m.children;return k.length>1&&k[k.length-1].getBoundingClientRect().top-k[0].getBoundingClientRect().top>2;});
    colA.classList.toggle('meta-under',wraps);if(reqs.scrollTop!==top)reqs.scrollTop=top;
  });};
  let metaWidth=-1;const metaObserver=new ResizeObserver(()=>{const w=colA.clientWidth;if(w&&w!==metaWidth){metaWidth=w;metaFit();sideFit();}});metaObserver.observe(colA);observers.push(metaObserver);
  // The list is as tall as the window leaves it, between 216px and 420px (Magpie fitReqs), so a short window
  // does not show a page of rows at once. "Above" is how far down the page the list begins.
  const scroller=()=>{for(let p=node.parentElement;p;p=p.parentElement){if(/(auto|scroll)/.test(getComputedStyle(p).overflowY))return p;}return null;};
  let fitSoon=0;
  const fitReqs=()=>{fitSoon=0;
    if(!reqs.offsetParent)return;
    const view=scroller(),room=(view?view.clientHeight:window.innerHeight)-(reqs.getBoundingClientRect().top-(node.closest('.rr-root')||node.parentElement||node).getBoundingClientRect().top)-28;
    const h=Math.round(Math.max(216,Math.min(420,room)))+'px';if(reqs.style.maxHeight!==h)reqs.style.maxHeight=h;
  };
  const askFit=()=>{if(!fitSoon)fitSoon=requestAnimationFrame(fitReqs);};
  const fitObserver=new ResizeObserver(()=>{askFit();sideFit();});fitObserver.observe(node);observers.push(fitObserver);
  let value,costAvailable=false,days=[],unseenDays=[];
  const closedGroups=new Set(),keysOpen=new Set(),keysShut=new Set();
  let restTimer=0,shownRows=CHUNK,scopeKey='',lastKey='',lastRows=[],lastCards,lastTallies,lastSelection='';
  const reqRows=new Map(),groupRows=new Map(),dayButtons=new Map(),keyRows=new Map(),provHeads=new Map(),provBoxes=new Map();
  const moreDays=el('button','rt-day rt-day-more');moreDays.type='button';moreDays.setAttribute('aria-haspopup','menu');moreDays.setAttribute('aria-expanded','false');
  moreDays.onclick=e=>{e.stopPropagation();openMenu(moreDays,unseenDays.map(d=>({v:d.day,name:dayName(d.day),note:fmtN(d.requests)})),[value.historyDay],([v]=[])=>{},'rt-days-menu');
    if(menu){for(const b of menu.querySelectorAll('.pm-item'))b.onclick=ev=>{ev.stopPropagation();closeMenu();if(b.dataset.v!==value.historyDay)actions.day(b.dataset.v);};}};
  function nameMoreDays(){
    const picked=unseenDays.find(d=>d.day===value.historyDay);
    moreDays.classList.toggle('on',!!picked);moreDays.setAttribute('aria-pressed',String(!!picked));
    moreDays.replaceChildren(el('span','',picked?dayName(picked.day):t('Earlier days')),...(picked?[count(picked.requests)]:[]),icon(CHEV,10));
  }
  function fitDays(){
    if(!dayBar.clientWidth)return;
    const pills=[...dayBar.children].filter(x=>x!==moreDays);for(const x of pills)x.hidden=false;unseenDays=[];
    if(dayBar.scrollWidth<=dayBar.clientWidth+1){moreDays.remove();return;}
    dayBar.append(moreDays);
    for(let i=pills.length-1;i>=1;i--){pills[i].hidden=true;unseenDays.unshift(days[i-1]);nameMoreDays();if(dayBar.scrollWidth<=dayBar.clientWidth+1)break;}
  }
  observers.push(new ResizeObserver(()=>fitDays()));observers[observers.length-1].observe(dayBar);

  const accountText=w=>value.masked&&w.who&&w.kind==='account'?Object.assign(el('span','rr-pii',w.who)):document.createTextNode(w.kind==='provider'?w.name:(w.who||w.name||w.provider));
  function reqRow(r,{said,how,tr,w,meta,metrics,title}){
    const b=el('button','rt-req '+how),when=el('span','at',rowClock(r.time)),asked=el('span','asked'),sw=el('i','ag');
    sw.style.setProperty('--agent',hueOf(r.callerKey?r.agent+'\u0001'+r.callerKey:r.agent));
    asked.append(sw,brand(ctx,r.agent),el('span','m',r.model));
    const kind=kindOf(r);if(kind){asked.classList.add('kinded');const k=el('span','kind',t(purposeName(purposeOf(kind))));asked.append(k);}
    const to=el('span','to'),sd=el('span','said'),cut=how==='ok'||how==='moved'?said.lastIndexOf(' · '):-1;
    if(cut>0){sd.classList.add('split');const who=el('span','who');if(value.masked&&w?.kind==='account'&&w.who)who.append(el('span','rr-pii',w.who));else who.textContent=said.slice(0,cut);sd.append(who,el('span','mdl',said.slice(cut)));}
    else if(said.includes('\u0000')){const [before,after]=said.split('\u0000');sd.append(before,el('span','rr-pii',w.who),after);}
    else sd.textContent=said;
    to.append(el('i'),...(w&&tr?[brand(ctx,w.provider,w.icon||w.preset)]:[]),sd);
    if(tr?.effort){const ef=el('span','ef'+(tr.picked?' picked':'')),was=r.effort&&r.effort!==tr.effort;if(was)ef.append(el('span','was',r.effort));ef.append(el('span','now',(was?' → ':'')+tr.effort));to.append(ef);}
    const tier=rowTier(r,tr);
    if(tr?.fast||tier){const ft=el('span','ef tier',tier==='ultrafast'?t('Ultrafast'):tier==='flex'?t('flex'):t('fast'));ft.title=tierNote(r,tr,tier);to.append(ft);}
    if(tr?.entry){const en=el('span','ef',tr.entry==='tui'?'TUI':'-p');en.title=tr.entry==='tui'?t('Claude Code ran this request in its interactive mode (TUI)'):t('Claude Code ran this request as claude -p');to.append(en);}
    if(tr?.swapped&&tr.done&&tryOk(tr))to.append(el('span','swap',t('served {served}',{served:tr.served})));
    if(tr?.upstream&&tr.done&&tryOk(tr)){to.append(el('span','upstream',tr.upstream));to.classList.add('upstreamed');}
    const info=el('span','meta');if(meta.length)info.append(el('span','retry-count',meta.join(' · ')));
    info.append(...metrics.map(m=>metricElement(m,true)));
    const live=liveLabel(r);if(live)info.append(el('span','rr-request-live recv',live));
    info.hidden=!info.children.length;b.append(when,asked,to,info);b.title=title;b.dataset.requestId=r.id;return b;
  }
  function rowOf(r,selected){
    const [said,how,tr,w]=outcome(r,value.masked),meta=r.tries.length>1?[t('{n} tries',{n:r.tries.length})]:[];
    const all=requestMetrics(r),metrics=visibleMetrics.map(key=>{const m=all[key];return m?.value?[METRIC_CLASS[key],METRIC_LABEL[key],m.value,t(m.label)]:null;}).filter(Boolean);
    const live=liveLabel(r),title=titleOf(r,how,tr,w,value.masked);
    const sig=JSON.stringify([locale(),value.masked,said,how,title,r.time,r.agent,r.model,r.provider,kindOf(r),r.effort,tr?.effort,tr?.picked,tr?.fast,r.tier,tr?.tier,tr?.tierServed,tr?.entry,tr?.swapped&&tr?.served,tr?.upstream,meta,metrics,live]);
    const key=requestKey(r);let x=reqRows.get(key);
    if(!x||x.sig!==sig){x={sig,b:reqRow(r,{said,how,tr,w,meta,metrics,title})};x.b.onclick=()=>actions.pick(x.r);reqRows.set(key,x);}
    x.r=r;if(x.b.getAttribute('aria-pressed')!==String(selected))x.b.setAttribute('aria-pressed',String(selected));
    return x.b;
  }
  function routeCost(rows){
    const priced=rows.filter(r=>r.priced&&Number.isFinite(r.cost)),credited=rows.flatMap(r=>(r.usage||[]).filter(u=>u.credits!=null));
    return [priced.length?'≈'+fmtCost({cost:priced.reduce((n,r)=>n+(r.cost||0),0),unpriced:rows.some(r=>!r.priced||r.unpriced)?1:0}):'',credited.length?t('{n} credits',{n:countFormat.format(credited.reduce((n,u)=>n+u.credits,0))}):''].filter(Boolean).join(' · ');
  }
  function groupHead(g,all,by,open){
    let x=groupRows.get(g.key);
    if(!x){const b=el('button','rt-session'),name=el('span','nm'),dir=el('span','dir'),meta=el('span','summary'),cost=el('span','cost'),arrow=el('span','arrow');b.type='button';b.append(arrow,name,dir,meta,cost);
      b.onclick=()=>{if(closedGroups.has(g.key))closedGroups.delete(g.key);else closedGroups.add(g.key);render(true);};x={b,name,dir,meta,cost,arrow};groupRows.set(g.key,x);}
    const total=all.reduce((s,r)=>{s.tokens+=r.tokens||0;if(!r.done)s.running++;return s;},{tokens:0,running:0}),{prompt,read}=promptTotals(all.filter(r=>r.done));
    let totalN=0,totalW=0,wholeMs=0,wholeOut=0;for(const r of all)if(routeSucceeded(r)){const d=decodeOf(r);if(d){totalN+=d.n;totalW+=d.w;wholeMs+=r.ms||0;wholeOut+=r.out||0;}}
    setText(x.arrow,open?'▾':'▸');
    const first=g.route,label=by==='key'?(first.callerKeyName||(first.callerKey?t('Gateway key'):t('No gateway key'))):first.sessionKey?agentName(first.agent)+' · '+t('Session {n}',{n:sessionNumbers.get(first.agent+' '+first.sessionKey)}):t('No session ID');
    setText(x.name,label);x.name.title=label;
    const ags=by==='key'?[...new Set(all.map(r=>agentName(r.agent)))].join(', '):'';setText(x.dir,ags);x.dir.hidden=!ags;
    const bits=[el('span','session-count',t(all.length===1?'{n} request':'{n} requests',{n:all.length}))];
    if(visibleMetrics.includes('tokens')&&total.tokens){const amount=el('span','rt-token-total',t('{n} tokens',{n:short(total.tokens)}));bits[0].append(' · ',amount);}
    if(total.running)bits[0].append(' · '+t('{n} in progress',{n:total.running}));
    if((by==='key'||first.sessionKey)&&visibleMetrics.includes('cache')&&prompt)bits.push(metricElement(['cache-hit','Avg. cache',hitPct(read/prompt),t('Total cache reads divided by total prompt tokens; larger prompts carry more weight')]));
    if((by==='key'||first.sessionKey)&&visibleMetrics.includes('speed')&&totalW)bits.push(metricElement(['speed','Avg. speed',t('{n} tok/s',{n:Math.round(totalN*1000/totalW)}),[t("Total output tokens divided by the time from each reply's first token to its end; the wait for the first token, and replies without usable timing, are left out"),wholeMs?t("Over each request's whole time, the wait for the first token and the reasoning counted: {n} tok/s",{n:Math.round(wholeOut*1000/wholeMs)}):''].filter(Boolean).join('\n')]));
    const sig=JSON.stringify(bits.map(e=>[e.textContent,e.title]));if(x.meta.dataset.sig!==sig){x.meta.replaceChildren(...bits);x.meta.dataset.sig=sig;}
    const cost=routeCost(all);setText(x.cost,cost);x.cost.hidden=!visibleMetrics.includes('cost')||!cost;
    x.b.setAttribute('aria-expanded',String(open));x.b.dataset.session=g.key;return x.b;
  }
  function placeRows(target,els){
    const kids=target.children;if(kids.length===els.length&&els.every((e,i)=>kids[i]===e))return;
    const top=target.scrollTop,want=new Set(els);
    for(const e of [...kids])if(!want.has(e))e.remove();
    let cursor=target.firstElementChild;for(const e of els){if(e===cursor){cursor=cursor.nextElementSibling;continue;}target.insertBefore(e,cursor);}
    while(cursor){const n=cursor.nextElementSibling;cursor.remove();cursor=n;}
    if(target.scrollTop!==top)target.scrollTop=top;
  }
  function renderDays(){
    days=value.historyDays;
    const key=value.historyDay+'|'+value.historyLoading+'|'+days.map(d=>d.day+':'+d.requests).join(',');
    if(dayBar.dataset.key===key)return;dayBar.dataset.key=key;
    const pill=(day,label,n)=>{let b=dayButtons.get(day);if(!b){b=el('button','rt-day');b.type='button';b.onclick=()=>actions.day(day);dayButtons.set(day,b);}
      b.replaceChildren(el('span','',label),...(n!=null?[count(n)]:[]));b.classList.toggle('on',day===value.historyDay);b.setAttribute('aria-pressed',String(day===value.historyDay));b.disabled=value.historyLoading;b.hidden=false;return b;};
    const els=[pill('',t('Live')),...days.map(d=>pill(d.day,dayName(d.day),d.requests))];
    for(const [day,b]of dayButtons)if(day&&!days.some(d=>d.day===day)){b.remove();dayButtons.delete(day);}
    dayBar.replaceChildren(...els);dayBar.hidden=!days.length&&!value.historyDay;fitDays();
  }

  // ---- accounts and keys ----
  // A rest is the account's, or one model's alone (Magpie restModel): a model resting does not rest its account.
  const restModel=(rest,m)=>rest.model||(m&&rest.key?.endsWith('/'+m)?m:'');
  const modelRest=(a,m,rest,when)=>{if((a.mrests.get(m)?.at||0)<=when)a.mrests.set(m,{rest,at:when});};
  function foldActs(rows){
    const by=new Map(),seed=!value.historyDay&&!value.purpose.length&&value.tallies?.length?value.tallies:null;
    if(seed)for(const x of seed)by.set(accountKey(x.candidate),{w:x.candidate,tried:x.tried,ok:x.ok,fails:x.fails?{...x.fails}:x.failed?{other:x.failed}:{},last:x.last||0,authAt:x.authAt||0,rest:null,restAt:0,seen:0,pos:0,at:x.at,models:new Set(x.models||[]),mrests:new Map()});
    const seeded=x=>{const rest=x.candidate.rest;if(!rest)return;const a=by.get(accountKey(x.candidate)),rm=restModel(rest,x.candidate.model);if(rm)modelRest(a,rm,rest,x.at||0);else{a.rest=rest;a.restAt=x.at||0;}};
    if(seed)for(const x of seed)seeded(x);
    for(const r of [...rows].reverse()){
      const candidates=new Map(),T=at(r.time);
      r.order.forEach((w,i)=>{
        const key=accountKey(w),a=by.get(key)||{w,tried:0,ok:0,fails:{},last:0,authAt:0,rest:null,restAt:0,seen:0,pos:0,models:new Set(),mrests:new Map()};
        a.w=w;a.seen++;a.pos=i;a.at=r.time;
        const rm=w.rest?restModel(w.rest,w.model):'';
        if(rm)modelRest(a,rm,w.rest,T);else if(T>=a.restAt){a.rest=w.rest||null;a.restAt=T;}
        if(!w.rest&&w.model&&(a.mrests.get(w.model)?.at||0)<=T)a.mrests.delete(w.model);
        by.set(key,a);candidates.set(w.id,a);
      });
      for(const tr of r.tries){
        const a=candidates.get(tr.id);if(!a||!tr.done||tr.fail==='canceled')continue;
        const end=at(tr.start)+(tr.ms||0);
        if(tr.fail==='auth'&&!tryOk(tr))a.authAt=Math.max(a.authAt,end);
        if(seed){if(tryOk(tr))a.last=Math.max(a.last,end);}
        else{a.tried++;if(tryOk(tr)){a.ok++;a.last=Math.max(a.last,end);const m=tr.model||r.order.find(x=>x.id===tr.id)?.model;if(m)a.models.add(m);}
          else{const k=tr.fail==='quota'&&tr.rest?.rate?'rate':tr.fail||'other';a.fails[k]=(a.fails[k]||0)+1;}}
        if(tr.rest){const rm=restModel(tr.rest,tr.model||r.order.find(x=>x.id===tr.id)?.model);if(rm)modelRest(a,rm,tr.rest,end);else if(end>=a.restAt){a.rest=tr.rest;a.restAt=end;}}
      }
    }
    return by;
  }
  const usedRenews=w=>known0(w.usedRenews)?at(w.usedRenews):(w.renews||[]).length===1&&known0(w.renews[0])?at(w.renews[0]):0;
  const pct=n=>Math.round(n)+'%';
  const balText=w=>(countFormat.format(w.balance)+' '+t(w.unit||'')).trim();
  const quota=(w,used,left,vars)=>w.balance!=null?t(left,{n:balText(w),...vars}):(w.usedWindow?shortWindow(w.usedWindow)+' ':'')+(w.limit>0?countFormat.format(w.amount||0)+' / '+countFormat.format(w.limit)+' '+t(w.unit||'')+' · ':'')+t(used,{n:pct(w.usedPercent||0),...vars});
  const PLAN_NAMES={self_serve_business_prolite:'Business',self_serve_business_usage_based:'Business',free_workspace:'Free',ent26:'Enterprise',prolite:'Pro Lite',promax:'Pro Max'};
  const planName=p=>p&&(PLAN_NAMES[p]||(/^enterprise_cbp_/.test(p)?'Enterprise':p));
  const noShare=x=>!!x.text||x.used==null||x.balance!=null;
  const quotaText=x=>{
    if(x.unlimited)return t('Unlimited');
    if(x.balance!=null)return t('{n} left',{n:(countFormat.format(x.balance)+' '+t(x.unit||'')).trim()});
    if(x.text&&x.used>=100)return t('In use');
    if(noShare(x))return t(x.display||'No allowance reported');
    const n=Math.max(0,Math.min(100,x.used));
    const pctText=t('{n} used',{n:(Number.isInteger(n)?n:n.toFixed(1))+'%'});
    return x.limit>0?countFormat.format(x.amount||0)+' / '+countFormat.format(x.limit)+' '+t(x.unit||'')+' · '+pctText:pctText;
  };
  const familyWindows=ws=>{
    if(!ws?.some(w=>w.family))return ws;
    const fams=new Map();for(const w of ws){const k=w.family?'f:'+w.family:'w:'+fams.size;if(!fams.has(k))fams.set(k,[]);fams.get(k).push(w);}
    if(fams.size===ws.length)return ws;
    const soon=w=>w.resetsAt?new Date(w.resetsAt).getTime():Infinity,out=[];
    for(const tiers of fams.values()){if(!tiers[0].family){out.push(tiers[0]);continue;}
      const top=tiers.reduce((a,b)=>b.used>a.used||(b.used===a.used&&soon(b)<soon(a))?b:a);out.push({...top,name:top.family,tiers});}
    return out;
  };
  const resetIn=at=>at<=Date.now()?t('Reset time passed'):t('renews in {d}',{d:dur(at-Date.now())});
  const resetAtText=at=>at<=Date.now()?t('Reset time passed {when}',{when:new Date(at).toLocaleString(locale())}):t('Resets {when}',{when:new Date(at).toLocaleString(locale())});
  function winParts(w){
    const card=!value.historyDay?cardFor(w,value.cards||[]):null;if(!card||!card.windows.length)return [];
    return (familyWindows(card.windows)||[]).map(x=>{const at_=x.resetsAt?at(x.resetsAt):0,v=quotaText(x);
      return {x,q:card,k:shortWindow(x.name),v,r:at_?resetIn(at_):'',text:t(x.name)+' '+v+(at_?' · '+resetIn(at_):''),tip:t(x.name)+' '+v+(at_?' · '+resetAtText(at_):'')+(x.runsOutAt&&x.runsOut>0&&at(x.runsOutAt)>Date.now()?' · '+t('{n} expire {when}',{n:countFormat.format(x.runsOut)+(x.unit?' '+t(x.unit):''),when:new Date(x.runsOutAt).toLocaleString(locale())}):'')};});
  }
  const cardWindows=w=>winParts(w).map(p=>p.text);
  const cardError=w=>{if(value.historyDay)return '';const q=cardMatch(w,value.cards||[]);return q&&!winParts(w).length&&q.error?String(q.error):'';};
  const needsSignIn=a=>a.w.kind==='account'&&a.authAt>a.last;
  const unlistedWord=w=>w.heldBy?t('not an account {group} may use',{group:w.heldBy}):w.held?t('not an account the gateway key may use'):w.noCredits?t('held: its allowance used up, set not to spend credits'):w.capped?t('held at its {cap}% usage cap',{cap:w.capped}):w.barred?t('set to serve other models, not {model}',{model:w.model}):w.kind==='key'?t("{name}'s list for this key has no {model}",{name:w.name,model:w.model}):t("its plan doesn't list {model}",{model:w.model});
  function keysRow(ks,pk,open,n,kind){
    let row=keyRows.get(pk);
    if(!row){row=el('div','rt-act rt-keys');row.tabIndex=0;row.setAttribute('role','button');
      const flip=()=>{const next=row.getAttribute('aria-expanded')!=='true';if(next){keysOpen.add(pk);keysShut.delete(pk);}else{keysShut.add(pk);keysOpen.delete(pk);}render(true);};
      row.onclick=flip;row.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();flip();}};keyRows.set(pk,row);}
    row.classList.toggle('open',open);row.setAttribute('aria-expanded',String(open));
    const acct=kind==='account';row.title=t(open?(acct?'Fold these accounts into one row':'Fold these keys into one row'):(acct?'Show each account':'Show each key'));
    const chev=el('span','chev');chev.append(icon(CHEV,12,1.7));const name=el('div','nm');name.append(el('b','',t(acct?'{n} accounts':'{n} keys',{n:ks.length})),chev);
    const resting=ks.filter(a=>a.rest&&at(a.rest.until)>n).length,st=[];
    if(resting<ks.length)st.push(t('{n} available',{n:ks.length-resting}));if(resting)st.push(t('{n} resting',{n:resting}));
    const sum=f=>ks.reduce((x,a)=>x+f(a),0),fails={};for(const a of ks)for(const[k,v]of Object.entries(a.fails))fails[k]=(fails[k]||0)+v;
    const last=Math.max(0,...ks.map(a=>a.last)),tally=el('div','tally'),bad=Object.entries(fails).map(([k,v])=>`${v} ${failWord(k)}`);
    tally.append(el('span','',t('tried {n}',{n:sum(a=>a.tried)})),el('span','ok',t('answered {n}',{n:sum(a=>a.ok)})),...(bad.length?[el('span','bad',bad.join(', '))]:[]),...(last?[el('span','',t('last answered {time}',{time:clock(last)}))]:[]));
    row.classList.add('said');row.replaceChildren(name,el('div','st'+(resting===ks.length?' rest':''),st.join(' · ')),tally);return row;
  }
  function renderActs(rows){
    const n=value.clock??Date.now(),liftedAt=value.data?.lifted||{};
    // A rest lifted by hand since the request that found it is over (Magpie lifted()).
    const lifted=(key,found)=>{const l=Date.parse(liftedAt[key])||0;return !!key&&l>=found&&l<=n;};
    const ordered=[...foldActs(rows).values()].map(a=>{
      const rest=a.rest&&lifted(a.rest.key,a.restAt)?null:a.rest,live=[...a.mrests].filter(([,x])=>!lifted(x.rest.key,x.at));
      return rest===a.rest&&live.length===a.mrests.size?a:{...a,rest,mrests:new Map(live)};
    }).sort((x,y)=>(x.w.name||'').localeCompare(y.w.name||'')||x.w.provider.localeCompare(y.w.provider)||(x.w.rank||0)-(y.w.rank||0)||x.pos-y.pos);
    // A provider is one box: its accounts stay together, ordered by the first of them, so a name that changed does not split it.
    const byProvider=new Map();for(const a of ordered)byProvider.has(a.w.provider)?byProvider.get(a.w.provider).push(a):byProvider.set(a.w.provider,[a]);
    const list=[...byProvider.values()].flat();
    // With no new push, a rest that ends or a countdown still has to move: wake at the earliest end, at least every 30s. A replay has its own clock.
    clearTimeout(restTimer);restTimer=0;
    const ends=list.flatMap(a=>[a.rest,...[...a.mrests.values()].map(x=>x.rest)]).filter(Boolean).map(r=>at(r.until)).filter(u=>u>n);
    if(value.clock==null&&ends.length)restTimer=setTimeout(()=>{restTimer=0;if(value?.visible)render(true);},Math.max(1000,Math.min(Math.min(...ends)-n+50,30000)));
    setText(actLabel,t('Accounts and keys'));setText(actNote,t(!value.historyDay&&value.tallies?.length?"over today's requests":'over those requests'));
    actError.textContent=value.cardsError||'';actError.hidden=!value.cardsError;
    actRead.hidden=!!value.historyDay||!list.some(a=>a.w.kind==='account');
    actRead.classList.toggle('busy',!!value.cardsLoading);actRead.title=t("Read the accounts' allowances again");actRead.setAttribute('aria-label',t('Refresh now'));
    if(value.cardsLoading)actRead.setAttribute('aria-busy','true');else actRead.removeAttribute('aria-busy');
    let prov='';const out=[],lead=[],meta=new Map();
    const put=(e,leads,keep=false)=>{if(leads)return lead.push(e);const b=[...lead.splice(0),e];out.push(b);meta.set(b,{prov,keep,head:b[0].classList.contains('rt-prov'),n:b.length===1?1:b.reduce((c,x)=>c+x.matches('.rt-act')+x.querySelectorAll('.rt-act').length,0)});};
    const kin=new Map(),kinOf=w=>w.provider+'\u0000'+w.kind;for(const a of list){const k=kinOf(a.w);kin.has(k)?kin.get(k).push(a):kin.set(k,[a]);}
    const inUse=new Map();for(const a of list){if(!a.last||(a.rest&&at(a.rest.until)>n))continue;const u=inUse.get(a.w.provider);if(!u||a.last>u.last)inUse.set(a.w.provider,a);}
    const winsBy=new Map();let wk=0,wv=0,wr=0;
    for(const a of list){if(value.historyDay||a.w.kind!=='account'||a.w.balance!=null)continue;const ps=winParts(a.w);if(!ps.length)continue;
      winsBy.set(a,ps);for(const p of ps){wk=Math.max(wk,chw(p.k));wv=Math.max(wv,chw(p.v));wr=Math.max(wr,chw(p.r));}}
    for(const a of list){
      const w=a.w;let opened=false;
      if(w.provider!==prov){
        prov=w.provider;const ic=w.icon||w.preset||w.provider,nm=w.name||w.provider,pool=list.filter(x=>x.w.provider===prov&&!x.w.fallback).length>1;
        const mode=pool?words().modeName(list.find(x=>x.w.provider===prov&&!x.w.fallback)?.w.routing||''):null,key=[ic,nm,mode].join('\u0000');
        let h=provHeads.get(prov)?.key===key?provHeads.get(prov).h:null;
        if(!h){h=el('div','rt-prov');h.append(brand(ctx,w.provider,ic),el('b','',nm));if(mode!==null)h.append(el('span','',mode));provHeads.set(prov,{key,h});}
        put(h,true);
      }
      if(w.kind==='key'||w.kind==='account'){
        const ks=kin.get(kinOf(w));
        if(ks.length>=FOLD_AT){
          const pk=w.provider+(w.kind==='account'?'/@':'/*'),dflt=w.kind==='account'&&ks.length<LONG,open=keysShut.has(pk)?false:keysOpen.has(pk)?true:dflt;
          const signIns=!open&&ks.some(needsSignIn);opened=open&&keysOpen.has(pk);
          if(ks[0]===a)put(keysRow(ks,pk,open,n,w.kind),open||signIns,ks.some(k=>needsSignIn(k)||(k.rest&&at(k.rest.until)>n)));
          if(!open&&!needsSignIn(a))continue;
        }
      }
      const row=el('div','rt-act'),name=el('div','nm');
      if(w.kind==='provider')name.append(el('b','',w.model||w.name));else name.append(el('b','',''),el('span','',planName(w.plan)||(w.kind==='key'?t('API key'):'')));
      if(w.kind!=='provider')name.firstChild.append(accountText(w));
      let st,cls='',asOf='',carded=false,readError='';const resting=a.rest&&at(a.rest.until)>n,grid=winsBy.get(a),parts=resting?[]:[...a.mrests].filter(([,x])=>at(x.rest.until)>n).sort(([m,x],[l,y])=>at(x.rest.until)-at(y.rest.until)||m.localeCompare(l));
      if(resting){st=restSay(a.rest,n);cls='rest';}
      else if(w.unlisted){st=unlistedWord(w);cls='left';}
      else if(grid){st='';if(w.known)asOf=t('as of {time}',{time:clock(a.at)});}
      else if(w.known){const soon=usedRenews(w);
        st=soon&&soon<=n?quota(w,'{n} used at {time}; it has renewed since','{n} left at {time}; it has renewed since',{time:clock(a.at)})
          :soon?quota(w,'{n} used · renews in {d}','{n} left · renews in {d}',{d:dur(soon-n)}):quota(w,'{n} used','{n} left');
        if(!(soon&&soon<=n))asOf=t('as of {time}',{time:clock(a.at)});}
      else if(w.kind==='account'){
        const card=winParts(w).map(p=>p.text);
        if(card.length){st=card[0];carded=true;}
        else if((readError=cardError(w)))st=t('Allowance unavailable — hover for why');
        else st=t("what's left not known yet");
      }else st='';
      const signIn=needsSignIn(a),tally=el('div','tally');
      const fails=Object.entries(a.fails).map(([k,v])=>`${v} ${k==='auth'&&a.authAt&&!signIn?t('sign-in refused (answered since)'):failWord(k)}`);
      tally.append(el('span','',t('tried {n}',{n:a.tried})),el('span','ok',t('answered {n}',{n:a.ok})),...(fails.length?[el('span','bad',fails.join(', '))]:[]),...(a.last?[el('span','',t('last answered {time}',{time:clock(a.last)}))]:[]));
      const stEl=el('div','st '+cls,st),ws=grid?[]:cardWindows(w),figure=!!st&&(resting||w.known||w.unlisted||carded);
      if(resting&&a.rest.error)stEl.title=a.rest.error;else if(figure&&(ws.length||asOf))stEl.title=[...ws,asOf].filter(Boolean).join('\n');else if(readError)stEl.title=readError;
      row.append(name,stEl);
      if(grid){
        // one line a window: short name, bar, what is used or left, when it resets; each column as wide as the widest down the list
        const box=el('div','wq');box.style.setProperty('--wk',Math.min(wk+1,8)+'ch');box.style.setProperty('--wv',wv+'ch');box.style.setProperty('--wr',wr+'ch');
        for(const p of grid){const line=el('div');let bar=el('span','b');
          if(!noShare(p.x)){bar=el('span','b quota-track'+(p.x.used>=90?' full':''));const fi=el('i');fi.style.width=Math.round(Math.max(0,Math.min(100,p.x.used)))+'%';bar.append(fi);}
          line.append(el('span','k',p.k),bar,el('span','v',p.v),el('span','r',p.r));box.append(line);}
        box.title=[...grid.map(p=>p.tip),asOf].filter(Boolean).join('\n');row.append(box);
      }
      if(parts.length){const part=el('div','st rest part',parts.map(([m])=>m).join(', ')+' · '+restSay(parts[0][1].rest,n));if(parts[0][1].rest.error)part.title=parts[0][1].rest.error;row.append(part);}
      if(ws.length&&!figure){const line=el('div','wins');line.append(...ws.map(text=>el('span','',text)));if(ws.length>1)line.title=ws.join('\n');row.append(line);}
      row.append(tally);
      if(signIn){const fix=el('div','fix');fix.append(el('span','link rt-signin',failWord('auth')));row.append(fix);}
      if(w.known&&w.balance==null&&!grid){const bar=el('div','bar quota-track'),bi=el('i');bi.style.width=Math.max(0,Math.min(100,w.usedPercent||0))+'%';bar.append(bi);row.append(bar);}
      const act=signIn||(!a.ok&&fails.length>0)||(resting&&(a.rest.why==='restricted'||a.rest.why==='verify')),said=!!st||!!grid||(ws.length>0&&!figure);
      row.classList.toggle('act',act);row.classList.toggle('rest',!act&&!!resting);row.classList.toggle('on',!act&&inUse.get(w.provider)===a);row.classList.toggle('said',said&&!act);
      name.prepend(el('i','dot'));
      const mdls=[...a.models].filter(m=>!(w.kind==='provider'&&m===w.model));
      row.title=[value.masked&&w.kind==='account'?'':w.id,mdls.join(', '),said&&!act?[...tally.children].map(e=>e.textContent).join(' · '):''].filter(Boolean).join('\n');
      put(row,false,opened||signIn||resting||parts.length>0||(!a.ok&&Object.keys(a.fails).length>0));
    }
    const hide=new Set(),seen=new Set();let shown=0,hidden=0;
    for(const b of out){const m=meta.get(b);if(m.keep)seen.add(m.prov);else if(shown<ACTS_SHOWN){shown+=m.n;seen.add(m.prov);}else hide.add(b);}
    for(const b of out)if(hide.has(b)&&seen.has(meta.get(b).prov)&&meta.get(b).head)hide.delete(b);
    for(const b of hide)hidden+=meta.get(b).n;if(hidden<=2)hide.clear();
    actMore.hidden=!hide.size;setText(actMore,actsAll?t('Show fewer'):t('Show {n} more',{n:hidden}));setAttr(actMore,'aria-expanded',String(actsAll));
    actFoot.hidden=actMore.hidden;
    const runs=[];for(const b of actsAll?out:out.filter(b=>!hide.has(b))){const p=meta.get(b).prov,last=runs.at(-1);if(last&&last.p===p)last.bs.push(b);else runs.push({p,bs:[b]});}
    const boxes=runs.map(({p,bs})=>{let g=provBoxes.get(p);if(!g)provBoxes.set(p,g=el('div','rt-pgrp'));patch(g,bs.flat());g.classList.toggle('long',bs.reduce((x,b)=>x+meta.get(b).n,0)>12);return g;});
    placeRows(acts,boxes);
  }

  // Put a list's new rows in, keeping each old node that says the same (Magpie patch).
  function patch(box,rows){
    const old=[...box.children],same=(r,o)=>o&&!r.querySelector('button')&&r.isEqualNode(o);
    if(old.length===rows.length&&rows.every((r,i)=>same(r,old[i])))return;
    rows=rows.map((r,i)=>same(r,old[i])?old[i]:r);
    rows.forEach((r,i)=>{if(box.children[i]!==r)box.insertBefore(r,box.children[i]||null);});
    while(box.children.length>rows.length)box.lastElementChild.remove();
  }
  function render(force=false){
    if(!value?.visible)return;
    const sorted=sortRequests(value.filtered,'newest'),selection=value.route?requestKey(value.route):'';
    costAvailable=value.filtered.some(r=>(r.priced&&Number.isFinite(r.cost))||r.usage?.some(u=>u.credits!=null));
    const scope=JSON.stringify([groupBy,value.historyDay,value.filter,value.purpose]);
    if(scope!==scopeKey){scopeKey=scope;shownRows=CHUNK;lastSelection='';}
    const key=JSON.stringify([shownRows,groupBy,[...visibleMetrics],[...closedGroups],[...keysOpen],[...keysShut],actsAll,value.route?.id,value.route?.time,value.masked,value.historyDay,value.historyDays,value.historyLoading,value.historyCut,value.cardsLoading,value.cardsError,value.filter,value.purpose,sorted.some(r=>!r.done)?Math.floor(Date.now()/1000):0,Math.floor((value.clock??Date.now())/30000),JSON.stringify(value.data?.lifted||{}),locale()]);
    if(!force&&key===lastKey&&lastCards===value.cards&&lastTallies===value.tallies&&lastRows.length===sorted.length&&lastRows.every((r,i)=>r===sorted[i]))return;
    lastKey=key;lastCards=value.cards;lastTallies=value.tallies;lastRows=sorted;
    const allPurposes=[...new Set([...value.allRoutes.map(requestPurpose),...value.purpose])];
    purposeTools.hidden=allPurposes.length<2&&!value.purpose.length;purposeTools.classList.toggle('set',!!value.purpose.length);purposeClear.hidden=!value.purpose.length;
    const label=value.purpose.length?t('Purpose: {name}',{name:value.purpose.map(p=>t(purposeName(p))).join(', ')}):t('Purpose filter');
    setText(purposeLabel,label);setAttr(purposePick,'aria-label',label);setAttr(purposePick,'title',t('Filter routing by purpose')+(value.purpose.length?'\n'+label:''));
    setAttr(purposeClear,'title',t('Clear filter'));setAttr(purposeClear,'aria-label',t('Clear filter'));
    setText(metricLabel,t('Metrics'));setAttr(metricPick,'title',t('Metrics to show'));
    setText(reqLabel,t('Requests'));setText(replayAll,t('Replay them all'));
    replayAll.hidden=!(sorted.filter(r=>r.done&&Number.isFinite(Date.parse(r.time))).length>1&&!value.replaying);replayAll.onclick=()=>actions.replay(value.filtered);
    setText(reqNote,value.historyLoading?t('Loading…'):value.historyDay?t(value.historyCut?'the last {n} of {day}':'{n} on {day}',{n:sorted.length,day:dayName(value.historyDay)}):t('the last {n} the gateway keeps',{n:sorted.length}));
    renderDays();
    const by=groupBy==='key'&&!value.allRoutes.some(r=>r.callerKey)?'request':groupBy;
    for(const b of groupButtons){setText(b,t(b.dataset.label));b.classList.toggle('on',by===b.dataset.groupBy);setAttr(b,'aria-pressed',String(by===b.dataset.groupBy));if(b.dataset.groupBy==='key')b.hidden=!value.allRoutes.some(r=>r.callerKey);}
    groupBar.hidden=!sorted.length;
    const none=!sorted.length,tallied=!value.historyDay&&!value.purpose.length&&value.tallies?.length>0;reqNote.hidden=none&&!value.historyLoading;reqs.classList.toggle('none',none);colB.hidden=none&&!tallied;hist.classList.toggle('solo',colB.hidden);
    hist.hidden=none&&!tallied&&!value.historyDay&&!value.historyDays.length&&!value.purpose.length&&!value.allRoutes.length;
    if(none){
      const p=el('div','empty-state');
      p.append(el('b','',value.purpose.length?t('No requests match these filters.'):value.historyDay?t('Nothing on {day}',{day:dayName(value.historyDay)}):t('No requests since magpie started')),t('Each request an agent sends through magpie shows up here: who answered it, why, and each try.'));
      if(!value.historyDay&&value.historyDays.length)p.append(' '+t('Earlier ones are kept by day, in the bar above.'));
      reqs.replaceChildren(p);foldAll.hidden=true;reqRows.clear();groupRows.clear();renderActs(sorted);sideFit();return;
    }
    const grouped=by==='key'||by==='session'&&sorted.some(r=>r.sessionKey),groups=grouped?groupRequests(sorted,by):sorted.map(r=>({key:requestKey(r),rows:[r],route:r}));
    const groupKeys=new Set(groups.map(g=>g.key));for(const k of groupRows.keys())if(!groupKeys.has(k)){groupRows.delete(k);closedGroups.delete(k);}
    const live=new Set(sorted.map(requestKey));for(const k of reqRows.keys())if(!live.has(k))reqRows.delete(k);
    // A selected request beyond the rows drawn is brought into the list.
    // Counted in the order the list draws them, so a By session or By key list loads as far as the selected request sits in its group.
    let selectedAt=-1;
    if(selection&&!value.follow){let before=0;for(const g of groups){if(grouped&&closedGroups.has(g.key))continue;const idx=g.rows.findIndex(r=>requestKey(r)===selection);if(idx>=0){selectedAt=before+idx;break;}before+=g.rows.length;}}
    if(selection!==lastSelection&&selectedAt>=shownRows)shownRows=Math.ceil((selectedAt+1)/CHUNK)*CHUNK;
    const els=[];let drawn=0;
    for(const g of groups){
      const open=!closedGroups.has(g.key);
      if(grouped)els.push(groupHead(g,g.rows,by,open));
      if(grouped&&!open)continue;
      for(const r of g.rows){if(drawn>=shownRows)break;els.push(rowOf(r,Boolean(value.route)&&requestKey(value.route)===requestKey(r)));drawn++;}
      if(drawn>=shownRows)break;
    }
    const folds=grouped&&groups.some(g=>!closedGroups.has(g.key));
    foldAll.hidden=!grouped||groups.length<2;const fold=t(folds?'Collapse all':'Expand all');setAttr(foldAll,'title',fold);setAttr(foldAll,'aria-label',fold);
    if(foldAll.dataset.on!==String(folds)){foldAll.dataset.on=folds;foldAll.replaceChildren(icon(folds?'m5 3 3 3 3-3M5 13l3-3 3 3':'m5 6 3-3 3 3M5 10l3 3 3-3',13,1.6));}
    foldAll.onclick=()=>{if(groups.some(g=>!closedGroups.has(g.key)))for(const g of groups)closedGroups.add(g.key);else closedGroups.clear();render(true);};
    placeRows(reqs,els);metaFit();askFit();sideFit();
    if(selection&&selection!==lastSelection&&!value.follow){const row=reqRows.get(selection)?.b;if(row&&row.isConnected){const top=row.offsetTop-reqs.offsetTop,view=reqs.clientHeight;if(top<reqs.scrollTop||top+row.offsetHeight>reqs.scrollTop+view)reqs.scrollTop=Math.max(0,top-view/2);}}
    lastSelection=selection;
    renderActs(sorted);
  }
  reqs.addEventListener('scroll',()=>{
    if(!value||reqs.scrollTop+reqs.clientHeight<reqs.scrollHeight-160)return;
    const total=value.filtered.length;if(shownRows<total){shownRows+=CHUNK;render(true);}
  },{passive:true});
  return {node,update(next){value=next;render();},dispose(){closeMenu();clearTimeout(restTimer);cancelAnimationFrame(fitSoon);cancelAnimationFrame(sideSoon);cancelAnimationFrame(metaSoon);for(const o of observers)o.disconnect();reqRows.clear();groupRows.clear();dayButtons.clear();keyRows.clear();provHeads.clear();provBoxes.clear();node.remove();}};
}
