import {l, locale, errorText} from './i18n.mjs';
import { el, brand, button, paths } from './graphics.mjs';
import { wireLayer } from './flight.mjs';
import { agentName, createAgentColors, routeStatus, candidateState, affinityText, stagedRoutes, stageSeats, stageTree, seatKey, requestKey } from './model.mjs';
import { accountName, maskText, routeOutcome, routingDescription, seatNote, sourceModeName } from './story.mjs';
import {createStory} from './story-view.mjs';
import {createContextView} from './context.mjs';
import {createRequests,sessionSummaries,cardFor,foldQuota} from './requests.mjs';
const compactNumber = value => new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(value);
const timeLabel = value => new Date(value).toLocaleTimeString(locale(), { hour12: false });

function controls(actions, { agentFilter = true } = {}) {
  const node = el('div', 'rr-controls'), connection = el('span', 'rr-connection'); connection.setAttribute('role', 'status');
  const agent = agentFilter ? el('select', 'rr-filter') : null;
  if (agent) { agent.setAttribute('aria-label', l("篩選 Agent")); agent.addEventListener('change', () => actions.selectAgent(agent.value)); }
  const latest = button(l("返回即時"), paths.latest, actions.latest), mask = button(l("帳號打碼"), paths.mask, actions.mask);
  const reconnect = button(l("重新連線"), paths.refresh, actions.reconnect);
  latest.classList.add('rr-back-live'); latest.append(el('span','',l("返回即時")));
  const end=el('div','rr-control-actions');end.append(latest,mask,reconnect);node.append(connection);if(agent)node.append(agent);node.append(end);
  let agentKey = '';
  return { node, agent, update(value) {
    if (agent) {
      const names = [...new Set(value.allRoutes.map(route => route.agent))].sort(), key = names.join('\n');
      if (key !== agentKey || !agent.childElementCount) {
        agentKey = key; const options = [['', l("全部 Agent")], ...names.map(id => [id, agentName(id)])];
        if (value.filter && !names.includes(value.filter)) options.push([value.filter, agentName(value.filter)]);
        agent.replaceChildren(...options.map(([id, name]) => { const item = el('option', '', name); item.value = id; return item; }));
      }
      agent.value = value.filter;
      agent.hidden = names.length <= 1 && !value.filter;
    }
    connection.dataset.state = value.data.connection;
    connection.textContent = value.data.connection === 'online' ? l("即時") : value.data.connection === 'connecting' ? l("連線中") : l("離線");
    latest.hidden=(value.follow&&!value.historyDay&&!value.historyLoading&&!value.replaying)||value.expired;reconnect.hidden=value.data.connection==='online';
    mask.querySelector('path').setAttribute('d', value.masked ? paths.mask : paths.eye);
    mask.setAttribute('aria-pressed', String(value.masked));mask.title=value.masked?l("顯示帳號名稱"):l("將帳號名稱打碼");
  } };
}
function noticeText(value) {
  if (value.error) return value.error;
  if(value.scopeError)return value.scopeError;
  if (value.data.connection === 'offline') return errorText(value.data.error) || l("Magpie 未連線，正在重試。");
  if (value.data.connection === 'connecting') return l("正在連接 Magpie…");
  return value.expired ? l("所選請求已離開最近紀錄，現顯示最新請求。") : '';
}

function base(container,type) {
  const root = el('section',`rr-root rr-${type}`); root.dataset.surface = type; root.setAttribute('aria-label',l("Magpie 路由")); container.append(root);
  return {root, update(value) { root.classList.toggle('rr-offline',value.data.connection !== 'online'); root.classList.toggle('rr-hidden',!value.visible); root.classList.toggle('rr-reduced',value.reduced); },dispose() {root.remove();}};
}

// One route stage, with stable source/seat nodes; size-specific CSS supplies
// each surface's geometry. Flights are not restarted by account/trace updates.
function routeStage(ctx,small = false) {
  const node = el('div',`rr-stage${small ? ' rr-stage-small' : ''}`), sources = el('div','rr-sources'), hub = el('div','rr-node rr-hub');
  const endpoint = el('small'), chip = el('i'); hub.append(brand(ctx,'magpie'),el('strong','','magpie'),endpoint,chip);
  const seats = el('ol',small ? 'rr-seats rr-seats-dense' : 'rr-seats');
  node.append(sources,hub,seats);
  const sourceRows = new Map(), seatRows = new Map(), headerRows = new Map();
  let expanded = new Map();
  try { const saved = JSON.parse(localStorage.getItem('magpie-routes.stageExpanded') || '[]'); expanded = new Map(saved.filter(([key,value])=>typeof key==='string'&&typeof value==='boolean')); } catch {}
  let value, timer, disposed = false;
  const {hueOf:agentHue,hues}=createAgentColors();
  const lines = wireLayer(node,()=>[...sources.children],hub,()=>[...seats.children],()=>{if(value)update(value);},agentHue);
  function update(next) {
    value = next; clearTimeout(timer); if (!next.visible) { lines.update({...next,staged:[]}); return; }
    const staged = stagedRoutes(next.filtered,next.route,next.follow,next.clock??Date.now(),lines.playing()), entries = stageSeats(staged);
    const grouped = Boolean(node.closest('.rr-page'));
    const layout = grouped ? stageTree(entries,expanded) : entries.map(entry=>({type:'seat',...entry,depth:0,parent:''}));
    const agents = [...new Set(staged.map(route=>route.agent))], sourceIds = new Set(agents), keys = new Set(entries.map(item=>item.key));
    hues(agents);
    for (const [id,row] of sourceRows) if (!sourceIds.has(id)) {row.remove();sourceRows.delete(id);}
    for (const [key,row] of seatRows) if (!keys.has(key)) {row.remove();seatRows.delete(key);}
    agents.forEach((id,index)=>{
      let row = sourceRows.get(id);
      if (!row) {row=el('div','rr-node rr-source');row.dataset.agent=id;row.append(brand(ctx,id),el('strong'),el('small'));sourceRows.set(id,row);}
      row.style.setProperty('--rr-agent',agentHue(id));
      const route = staged.filter(route=>route.agent===id).at(-1);
      row.children[1].textContent=agentName(id);row.children[1].title=agentName(id);row.children[2].textContent=route.model;row.children[2].title=route.model;
      row.dataset.live=String(staged.some(route=>route.agent===id&&!route.done));
      if(sources.children[index]!==row)sources.insertBefore(row,sources.children[index]||null);
    });
    entries.forEach(({key,candidate,route},index)=>{
      let row = seatRows.get(key);
      if(!row){
        row=el('li','rr-seat');row.dataset.seat=key;
        const body=el('div','rr-seat-body'),head=el('div','rr-seat-name');
        head.append(brand(ctx,candidate.provider,candidate.icon),el('strong'),el('span','rr-plan'),el('code','rr-model'));
        const bar=el('span','rr-bar');bar.append(el('i'));body.append(head,el('span','rr-seat-note'),bar);
        row.append(el('span','rr-seat-dot'),body);seatRows.set(key,row);
      }
      const states=staged.filter(r=>[...r.order,...(r.left||[])].some(c=>seatKey(c)===key)).map(r=>({route:r,state:candidateState(candidate,r,next.data.lifted,next.clock)}));
      const active=states.find(s=>s.state.tone==='working')||states.filter(s=>s.state.selected).at(-1)||{route,state:candidateState(candidate,route,next.data.lifted,next.clock)};
      const state=active.state;
      row.dataset.selected=String(Boolean(state.selected));row.dataset.tone=state.tone;row.style.setProperty('--rr-agent',agentHue(active.route.agent));
      const body=row.children[1],head=body.children[0];
      const shown=accountName(candidate,index);
      head.children[1].replaceChildren(next.masked&&candidate.who?el('span','rr-pii',candidate.who):shown);head.children[1].title=next.masked?'':shown;
      head.children[2].textContent=candidate.plan;head.children[2].hidden=small||!candidate.plan;
      head.children[3].textContent=candidate.model+(candidate.fixed?':'+candidate.fixed:'');head.children[3].title=head.children[3].textContent;
      const note=small?state.label:seatNote(candidate,active.route,state,next.route?.id);
      body.children[1].textContent=note;body.children[1].title=note;
      row.classList.toggle('rr-quiet',Boolean(state.tone==='working'&&active.route.contentAt&&Date.now()-active.route.contentAt>=15000));
      body.children[2].hidden=!candidate.known||candidate.free||candidate.balance!=null;body.children[2].children[0].style.width=`${Math.max(0,Math.min(100,candidate.usedPercent))}%`;
      body.children[2].title=l("路由當時已用 {p0}%",{p0:(Math.round(candidate.usedPercent))});
      const card=!next.historyDay?cardFor(candidate,next.cards||[]):null;
      row.title=card?card.windows.map(w=>l(w.name)+' '+(w.balance!=null?w.balance+' '+l(w.unit||''):Math.round(w.used)+'%')+(w.resetsAt?' · '+new Date(w.resetsAt).toLocaleString(locale()):'')).join('\n'):'';

    });
    const visible = new Set();
    layout.forEach((item,index)=>{
      let row;
      if(item.type==='seat') row=seatRows.get(item.key);
      else {
        visible.add(item.key);
        row=headerRows.get(item.key);
        if(!row){
          row=el('li','rr-branch');
          const toggle=el('button','rr-branch-toggle');toggle.type='button';
          toggle.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();toggle.click();}});
          toggle.addEventListener('click',()=>{
            const {persistKey,open}=row.branch;
            expanded.set(persistKey,!open);
            try {localStorage.setItem('magpie-routes.stageExpanded',JSON.stringify([...expanded]));} catch {}
            update(value);
          });
          row.append(toggle);headerRows.set(item.key,row);
        }
        row.branch=item;
        const toggle=row.firstChild;
        toggle.setAttribute('aria-expanded',String(item.open));
        const title=el('strong','',item.name),ref=el('code','rr-model',item.ref);
        ref.title=item.ref;
        const mode=el('i','rr-branch-mode',sourceModeName(item.mode));
        const chevron=el('span','rr-branch-chevron');
        chevron.innerHTML='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg>';
        const icon=item.icon?brand(ctx,item.icon):el('span','rr-brand');
        if(!item.icon)icon.innerHTML='<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M1.5 8a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0 M11.7 3.4a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0 M11.7 8a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0 M11.7 12.6a1.4 1.4 0 1 0 2.8 0a1.4 1.4 0 1 0-2.8 0 M4.3 8h7.4 M4.3 8c2.6 0 3.2-4.6 5.8-4.6h1.6 M4.3 8c2.6 0 3.2 4.6 5.8 4.6h1.6"/></svg>';
        const count=el('span','rr-branch-count',item.poolKind?l(item.poolKind==='account'?'{n} accounts':'{n} keys',{n:item.seats.length}):'');count.hidden=!item.poolKind;mode.hidden=Boolean(item.poolKind||item.lone);
        toggle.replaceChildren(icon,title,count,ref,mode,chevron);
        // A collapsed heading inherits live/selected state from its descendants.
        const states=item.seats.map(entry=>seatRows.get(entry.key));
        row.dataset.selected=String(states.some(n=>n.dataset.selected==='true'));
        row.dataset.tone=states.some(n=>n.dataset.tone==='working')?'working':'';
        const lit=states.find(n=>n.dataset.tone==='working')||states.find(n=>n.dataset.selected==='true');
        row.style.setProperty('--rr-agent',lit?.style.getPropertyValue('--rr-agent')||'');
        row.rrSeats=item.open?[]:item.seats.map(entry=>entry.key);
        if(!item.open){
          const active=states.find(n=>n.dataset.tone==='working')||states.find(n=>n.dataset.selected==='true');
          const available=states.filter(n=>!['resting','failed'].includes(n.dataset.tone)).length;
          const summary=el('span','rr-branch-summary');
          const quota=!next.historyDay&&item.poolKind==='account'?foldQuota(item.seats.map(e=>e.candidate),next.cards||[]):null;
          if(quota){summary.append(quota.text,' · ');summary.title=quota.tip;}
          if(active)summary.append(active.querySelector('.rr-seat-name strong').cloneNode(true),': ',active.querySelector('.rr-seat-note').textContent,' · ');
          summary.append(l('{n} available',{n:available}));
          if(available<states.length)summary.append(' · ',l('{n} resting',{n:states.length-available}));
          toggle.append(summary);
          if(quota?.used!=null){const bar=el('span','rr-bar'),fill=el('i');fill.style.width=Math.max(0,Math.min(100,quota.used))+'%';bar.append(fill);toggle.append(bar);}
        }
      }
      row.dataset.node=item.key;row.dataset.parent=item.parent;row.style.setProperty('--rr-depth',item.depth);
      if(item.type==='seat')row.rrSeats=[item.key];
      if(seats.children[index]!==row)seats.insertBefore(row,seats.children[index]||null);
    });
    const nodes=new Set(layout.map(item=>item.type==='seat'?seatRows.get(item.key):headerRows.get(item.key)));
    for(const row of [...seats.children])if(!nodes.has(row))row.remove();
    for(const [key,row]of headerRows)if(!visible.has(key)){row.remove();headerRows.delete(key);}
    const route=next.route,mode=route?.group?.routing??route?.order[0]?.routing;
    endpoint.textContent=next.data.endpoint;chip.textContent=sourceModeName(mode);
    node.dataset.seats=entries.length;node.dataset.agents=agents.length;
    node.setAttribute('aria-label',l("{p0} 個 Agent，{p1} 個帳號／模型節點",{p0:(agents.length),p1:(entries.length)}));
    lines.update({...next,staged});
    // Only wake for the 12s upstream linger boundary. Idle/held stages use no RAF loop.
    const expires=staged.filter(route=>route.done&&!lines.playing().has(requestKey(route))&&requestKey(route)!==requestKey(next.route)).map(route=>Date.parse(route.time)+(route.ms||0)+12000-Date.now()).filter(ms=>ms>0);
    if(expires.length&&!next.replaying)timer=setTimeout(()=>{if(!disposed)update(value);},Math.min(...expires)+20);
    return {staged,seats:entries};
  }
  return {node,update,playing:()=>lines.playing().size>0,dispose(){disposed=true;clearTimeout(timer);lines.dispose();}};
}

function focusLabel(value) {
  return value.follow ? l("最新請求") : l("歷史請求 · {p0}",{p0:(value.route ? timeLabel(value.route.time) : '')});
}

export function createNotch(container,ctx,actions) {
  const shell=base(container,'notch'),root=shell.root,tools=controls(actions),graph=routeStage(ctx,false);
  const footer=el('div','rr-notch-foot'),caption=el('span','rr-notch-outcome'),stats=el('dl','rr-notch-stats');
  const values=[l("請求"),l("改道"),l("Agent 收到的錯誤")].map(label=>{const group=el('div'),value=el('dd');group.append(value,el('dt','',label));stats.append(group);return value;});
  footer.append(caption,stats);
  tools.node.classList.add('rr-root','rr-notch-header-tools');ctx.headerActions.append(tools.node);
  root.append(graph.node,footer);
  let captionKey='';
  return {update(value){shell.update(value);graph.update(value);if(!value.visible)return;tools.update(value);
    const route=value.route,text=noticeText(value)||(route?routeOutcome(route,value.masked):value.data.connection==='online'?l("等待請求"):l("未連線"));
    const key=JSON.stringify([text,value.masked,route?.order.map(row=>row.who)]);
    if(key!==captionKey){captionKey=key;caption.replaceChildren(...(route?maskText(text,route):[document.createTextNode(text)]));}
    caption.title=value.masked?'':text;caption.dataset.tone=route?routeStatus(route).tone:'';
    for(const[index,field]of ['requests','rerouted','errors'].entries())values[index].textContent=compactNumber(value.data.totals[field]);
  },dispose(){tools.node.remove();graph.dispose();shell.dispose();}};
}

export function createDock(container,ctx,actions) {
  const shell=base(container,'dock'),root=shell.root,tools=controls(actions,{agentFilter:false}),graph=routeStage(ctx,true),outcome=el('p','rr-dock-outcome');
  tools.node.classList.add('rr-root','rr-dock-header-tools');ctx.headerActions.append(tools.node);
  root.append(graph.node,outcome);
  // The native card's first measure can precede async module loading. Use its
  // existing size-report service when our intrinsic content subsequently grows.
  let value,lastSize='';
  const size=new ResizeObserver(()=>{
    if(!value?.visible||value.nativeData?.surface!=='bubble'||!ctx.app?.reportBubbleSize)return;
    const card=root.closest('.edge-dock-card'),id=value.nativeData.cell?.id;
    if(!card||!id)return;
    const height=Math.min(Math.ceil(card.getBoundingClientRect().height),value.nativeData.maxCardHeight||Infinity),key=`${id}:${height}`;
    if(height>0&&key!==lastSize){lastSize=key;ctx.app.reportBubbleSize(id,height);}
  });size.observe(root);
  return {update(next){value=next;shell.update(value);graph.update(value);if(!value.visible)return;tools.update(value);
    const status=value.route&&routeStatus(value.route);outcome.dataset.tone=status?.tone||'';
    outcome.textContent=noticeText(value)||[focusLabel(value),status?.label,affinityText(value.route?.affinity)].filter(Boolean).join(' · ');
  },dispose(){size.disconnect();tools.node.remove();graph.dispose();shell.dispose();}};
}

export function createRail(container,ctx) {
  const shell=base(container,'rail'),root=shell.root,count=el('strong'),caption=el('span','rr-rail-caption');root.append(brand(ctx,'magpie'),count,caption);
  return {update(value){shell.update(value);if(!value.visible)return;count.textContent=value.data.connection!=='online'?'—':value.data.activityAvailable?String(value.data.active.length):'·';caption.textContent=value.data.connection==='online'?l("請求中"):l("離線");root.setAttribute('aria-label',`Magpie · ${count.textContent} ${caption.textContent}`);},dispose:shell.dispose};
}

export function createPage(container,ctx,actions) {
  const shell=base(container,'page'),root=shell.root,tools=controls(actions),notice=el('p','rr-notice');notice.setAttribute('role','status');
  const pageHeading=el('div','rr-page-heading'),stageBox=el('section','rr-stage-box'),heading=el('div','rr-what'),mode=el('p','rr-mode'),graph=routeStage(ctx);
  const foot=el('div','rr-foot'),caption=el('p','rr-caption'),stats=el('dl','rr-stats');let captionKey='';
  const values=[l("請求"),l("改道"),l("Agent 收到的錯誤")].map(label=>{const group=el('div'),value=el('dd');group.append(value,el('dt','',label));stats.append(group);return value;});foot.append(caption,stats);
  const story=el('div','rr-story'),storyHead=el('strong'),storyView=createStory(ctx);
  story.append(storyHead,storyView.node);stageBox.append(mode,graph.node,foot,story); pageHeading.append(heading);
  tools.node.classList.add('rr-root','rr-header-tools');ctx.headerActions.append(tools.node);pageHeading.append(tools.agent);
  const context=createContextView(actions,ctx);
  const sessionNumbers=new Map(),requests=createRequests(ctx,actions,sessionNumbers),sessions=el('div','rr-context rr-context-sessions');sessions.setAttribute('aria-label',l("Each session's context window"));
  let value;
  const failedCount=stats.lastChild;failedCount.tabIndex=0;failedCount.setAttribute('role','button');failedCount.title=l('Show the latest request that failed');
  failedCount.onclick=()=>{const r=value?.filtered.find(r=>routeStatus(r).tone==='failed');if(r)actions.pick(r);};
  failedCount.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();failedCount.click();}};
  const sessionRows=new Map();
  function renderSessions(value){
    const groups=value.historyDay||value.replaying?[]:sessionSummaries(value.filtered);
    sessions.hidden=groups.length<2;const nodes=[];
    if(groups.length<2){sessions.replaceChildren();sessionRows.clear();return;}
    for(const g of groups){
      let b=sessionRows.get(g.key);if(!b){b=el('button','rr-context-session');b.type='button';sessionRows.set(g.key,b);}
      b.dataset.session=g.key;
      const r=g.route,p=r.prompt,scale=Math.max(p.window||0,p.tokens,1),bar=el('span','ctx-stack');
      bar.setAttribute('role','img');bar.setAttribute('aria-label',l('{used} of {window} tokens used',{used:compactNumber(p.tokens),window:compactNumber(p.window||p.tokens)}));
      for(const kind of ['system','tools','skills','memory','files','results','chat']){const cell=el('i','k-'+kind);cell.style.width=((p.parts.find(p=>p.kind===kind)?.tokens||0)/scale*100).toFixed(2)+'%';bar.append(cell);}
      b.replaceChildren(el('strong','',agentName(r.agent)+' · '+l('Session {n}',{n:sessionNumbers.get(g.key)})),el('span','',compactNumber(p.tokens)+(p.window?' / '+compactNumber(p.window)+' · '+Math.round(p.tokens/p.window*100)+'%':'')),bar);
      b.setAttribute('aria-pressed',String(r.sessionKey===value.route?.sessionKey&&r.agent===value.route?.agent));b.onclick=()=>actions.pick(g.rows[0]);nodes.push(b);
    }
    const keys=new Set(groups.map(g=>g.key));for(const[key,b]of sessionRows)if(!keys.has(key)){b.remove();sessionRows.delete(key);}
    nodes.forEach((b,i)=>{if(sessions.children[i]!==b)sessions.insertBefore(b,sessions.children[i]||null);});
  }
  const replay=el('section','rr-replay'),replayClock=el('strong'),replaySpeed=el('button','rr-text'),replayPause=el('button','rr-text'),replayStop=el('button','rr-text',l('Stop replay')),seek=el('input'),replayNote=el('span');
  replaySpeed.type=replayPause.type=replayStop.type='button';replaySpeed.onclick=actions.replaySpeed;replayPause.onclick=actions.replayPause;replayStop.onclick=actions.replayStop;
  replaySpeed.dataset.action='speed';replayPause.dataset.action='pause';replayStop.dataset.action='stop';
  seek.type='range';seek.min=0;seek.max=1000;seek.value=0;seek.setAttribute('aria-label',l('Replay position'));seek.oninput=()=>actions.replaySeek(Number(seek.value)/1000);
  replay.append(el('span','',l('Replaying')),replayClock,replaySpeed,replayPause,replayStop,replayNote,seek);replay.hidden=true;
  const empty=el('p','rr-empty');root.append(notice,replay,pageHeading,stageBox,empty,context.node,sessions,requests.node);
  function renderReplay(value){
    replay.hidden=!value.replay;
    if(value.replay){const p=value.replay,clock=new Date(p.real).toLocaleTimeString(locale(),{hour12:false}),speed=l('{n}× speed',{n:p.speed}),pause=l(p.paused?'Resume':'Pause');
      if(replayClock.textContent!==clock)replayClock.textContent=clock;if(replaySpeed.textContent!==speed)replaySpeed.textContent=speed;if(replayPause.textContent!==pause)replayPause.textContent=pause;
      seek.value=Math.round(Math.max(0,p.v)/(p.total||1)*1000);replayNote.textContent=p.fast>1.5?l('skipping a quiet stretch · clock {n}×',{n:Math.round(p.fast)}):'';
    }
  }
  let resizeFrame=0;
  const resize=new ResizeObserver(()=>{cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{resizeFrame=0;graph.node.classList.toggle('rr-narrow',root.clientWidth<560);});});resize.observe(root);
  return {update(next){value=next;shell.update(value);graph.update(value);if(!value.visible){context.update(value);return;}tools.update(value); pageHeading.hidden=!value.route&&tools.agent.hidden;heading.hidden=!value.route;
    notice.textContent=noticeText(value);notice.hidden=!notice.textContent;
    const route=value.route;stageBox.hidden=!route;empty.hidden=Boolean(route);empty.textContent=value.data.connection==='online'?l("等待請求。Agent 經過 Magpie 時，路由會在這裡出現。"):l("連接 menu bar 的 Magpie 後顯示路由。");
    if(route){
      heading.textContent=l("{p0} · 啟用 {p1} 個",{p0:(route.group?.name||route.order[0]?.name||route.provider||'Magpie'),p1:(new Set(route.order.map(candidate=>candidate.id)).size)});
      mode.textContent=routingDescription(route.group?.routing??route.order[0]?.routing,Boolean(route.group));
      if(!value.follow)mode.textContent+=` · ${focusLabel(value)}`;
      const status=routeStatus(route);caption.dataset.tone=status.tone;
      const text=routeOutcome(route,value.masked),key=JSON.stringify([text,value.masked,route.order.map(w=>w.who)]);
      if(captionKey!==key){captionKey=key;caption.replaceChildren(...maskText(text,route));caption.classList.remove('rr-caption-in');if(!value.reduced){void caption.offsetWidth;caption.classList.add('rr-caption-in');}}
      if(value.reduced)caption.classList.remove('rr-caption-in');caption.title=value.masked?'':caption.textContent;
      for(const[index,field]of ['requests','rerouted','errors'].entries())values[index].textContent=compactNumber(value.data.totals[field]);
      storyHead.textContent=value.follow?l("最近一個請求是怎麼路由的"):l("這個歷史請求是怎麼路由的");
      storyView.update(route,value.masked);
    }
    for(const r of [...value.allRoutes].reverse())if(r.sessionKey&&!sessionNumbers.has(r.agent+' '+r.sessionKey))sessionNumbers.set(r.agent+' '+r.sessionKey,sessionNumbers.size+1);
    context.update(value);renderSessions(value);requests.update(value);
    renderReplay(value);

  },updateReplay:renderReplay,isPlaying:graph.playing,dispose(){resize.disconnect();cancelAnimationFrame(resizeFrame);tools.node.remove();context.dispose();requests.dispose();graph.dispose();shell.dispose();}};
}
