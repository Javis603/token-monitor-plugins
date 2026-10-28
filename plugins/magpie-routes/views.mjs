import {l, locale, errorText} from './i18n.mjs';
import { el, brand, button, paths } from './graphics.mjs';
import { wireLayer } from './flight.mjs';
import { agentName, agentHue, routingName, routeStatus, candidateState, affinityText, stagedRoutes, stageSeats, seatKey } from './model.mjs';
import { accountName, maskText, routeOutcome, routingDescription, restNote } from './story.mjs';
import {createStory} from './story-view.mjs';
import {createContextView} from './context.mjs';
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
      const names = [...new Set(value.data.routes.map(route => route.agent))].sort(), key = names.join('\n');
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
    latest.hidden=value.follow||value.expired;reconnect.hidden=value.data.connection==='online';
    mask.querySelector('path').setAttribute('d', value.masked ? paths.mask : paths.eye);
    mask.setAttribute('aria-pressed', String(value.masked));mask.title=value.masked?l("顯示帳號名稱"):l("將帳號名稱打碼");
  } };
}
function noticeText(value) {
  if (value.error) return value.error;
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
  const sourceRows = new Map(), seatRows = new Map(); let value, timer, disposed = false;
  const lines = wireLayer(node,()=>[...sources.children],hub,()=>[...seats.children].filter(row=>row.dataset.seat),()=>{if(value)update(value);});
  function update(next) {
    value = next; clearTimeout(timer); if (!next.visible) { lines.update({...next,staged:[]}); return; }
    const staged = stagedRoutes(next.filtered,next.route,next.follow,Date.now(),lines.playing()), entries = stageSeats(staged);
    const agents = [...new Set(staged.map(route=>route.agent))], sourceIds = new Set(agents), keys = new Set(entries.map(item=>item.key));
    for (const [id,row] of sourceRows) if (!sourceIds.has(id)) {row.remove();sourceRows.delete(id);}
    for (const [key,row] of seatRows) if (!keys.has(key)) {row.remove();seatRows.delete(key);}
    agents.forEach((id,index)=>{
      let row = sourceRows.get(id);
      if (!row) {row=el('div','rr-node rr-source');row.dataset.agent=id;row.style.setProperty('--rr-agent',agentHue(id));row.append(brand(ctx,id),el('strong'),el('small'));sourceRows.set(id,row);}
      const route = staged.filter(route=>route.agent===id).at(-1);
      row.children[1].textContent=agentName(id);row.children[2].textContent=route.model;row.children[2].title=route.model;
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
      const states=staged.filter(r=>[...r.order,...(r.left||[])].some(c=>seatKey(c)===key)).map(r=>candidateState(candidate,r,next.data.lifted));
      const state=states.find(s=>s.tone==='working')||states.filter(s=>s.selected).at(-1)||candidateState(candidate,route,next.data.lifted);
      row.dataset.selected=String(Boolean(state.selected));row.dataset.tone=state.tone;row.style.setProperty('--rr-agent',agentHue(route.agent));
      const body=row.children[1],head=body.children[0];
      const shown=accountName(candidate,index);
      head.children[1].replaceChildren(next.masked&&candidate.who?el('span','rr-pii',candidate.who):shown);head.children[1].title=next.masked?'':shown;
      head.children[2].textContent=candidate.plan;head.children[2].hidden=small||!candidate.plan;
      head.children[3].textContent=candidate.model;head.children[3].title=candidate.model;
      let note=state.until&&candidate.rest ? restNote(candidate.rest) : (!small&&state.tone==='working'?l("回答中…"):state.label);
      if(!small&&state.tone==='ready'&&candidate.known){
        const reset=Date.parse(candidate.usedRenews||(candidate.renews?.length===1?candidate.renews[0]:'')),left=reset-Date.now();
        const delta=left>=86400000?l("{p0} 天",{p0:(Math.ceil(left/86400000))}):left>=3600000?l("{p0} 小時",{p0:(Math.ceil(left/3600000))}):l("{p0} 分鐘",{p0:(Math.max(1,Math.ceil(left/60000)))});
        note=l("已用 {p0}%",{p0:(Math.round(candidate.usedPercent))})+(left>0?l(" · {p0}後重置",{p0:(delta)}):'');
      }
      body.children[1].textContent=note;
      body.children[2].hidden=!candidate.known;body.children[2].children[0].style.width=`${Math.max(0,Math.min(100,candidate.usedPercent))}%`;
      body.children[2].title=l("路由當時已用 {p0}%",{p0:(Math.round(candidate.usedPercent))});
      if(seats.children[index]!==row)seats.insertBefore(row,seats.children[index]||null);
    });
    const route=next.route,mode=route?.group?.routing||route?.order[0]?.routing;
    endpoint.textContent=next.data.endpoint;chip.textContent=routingName(mode);
    node.dataset.seats=entries.length;node.dataset.agents=agents.length;
    node.setAttribute('aria-label',l("{p0} 個 Agent，{p1} 個帳號／模型節點",{p0:(agents.length),p1:(entries.length)}));
    lines.update({...next,staged});
    // Only wake for the 12s upstream linger boundary. Idle/held stages use no RAF loop.
    const expires=staged.filter(route=>route.done&&!lines.playing().has(route.id)&&route.id!==next.route?.id).map(route=>Date.parse(route.time)+(route.ms||0)+12000-Date.now()).filter(ms=>ms>0);
    if(expires.length)timer=setTimeout(()=>{if(!disposed)update(value);},Math.min(...expires)+20);
    return {staged,seats:entries};
  }
  return {node,update,dispose(){disposed=true;clearTimeout(timer);lines.dispose();}};
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
  const context=createContextView(actions);
  const history=el('section','rr-requests'),historyHead=el('div','rr-history-head'),historyCount=el('span'),recent=el('div','rr-history');
  historyHead.append(el('h3','',l("請求")),historyCount);history.append(historyHead,recent);
  const empty=el('p','rr-empty');root.append(notice,pageHeading,stageBox,empty,context.node,history);
  let value;const rows=new Map();
  function renderHistory(value){
    const ids=new Set(value.filtered.map(row=>row.id));for(const[id,row]of rows)if(!ids.has(id)){row.remove();rows.delete(id);}
    value.filtered.forEach((item,index)=>{
      let row=rows.get(item.id);if(!row){row=el('button','rr-request');row.type='button';row.style.setProperty('--rr-agent',agentHue(item.agent));row.append(brand(ctx,item.agent),el('strong'),el('code'),el('time'),el('span'));row.addEventListener('click',()=>actions.pick(item.id));rows.set(item.id,row);}
      row.children[1].textContent=agentName(item.agent);row.children[2].textContent=item.served||item.model;row.children[2].title=row.children[2].textContent;
      row.children[3].textContent=timeLabel(item.time);row.children[4].textContent=routeStatus(item).label;row.dataset.tone=routeStatus(item).tone;row.setAttribute('aria-pressed',String(value.route?.id===item.id));
      if(recent.children[index]!==row)recent.insertBefore(row,recent.children[index]||null);
    });
  }
  const resize=new ResizeObserver(()=>graph.node.classList.toggle('rr-narrow',root.clientWidth<560));resize.observe(root);
  return {update(next){value=next;shell.update(value);const stage=graph.update(value);if(!value.visible){context.update(value);return;}tools.update(value); pageHeading.hidden=!value.route&&tools.agent.hidden;heading.hidden=!value.route;
    notice.textContent=noticeText(value);notice.hidden=!notice.textContent;
    const route=value.route;stageBox.hidden=!route;empty.hidden=Boolean(route);empty.textContent=value.data.connection==='online'?l("等待請求。Agent 經過 Magpie 時，路由會在這裡出現。"):l("連接 menu bar 的 Magpie 後顯示路由。");
    if(route){
      heading.textContent=l("{p0} · 啟用 {p1} 個",{p0:(route.group?.name||route.order[0]?.name||route.provider||'Magpie'),p1:(new Set(stage?.seats.map(entry=>entry.candidate.id)).size)});
      mode.textContent=routingDescription(route.group?.routing||route.order[0]?.routing);
      if(!value.follow)mode.textContent+=` · ${focusLabel(value)}`;
      const status=routeStatus(route);caption.dataset.tone=status.tone;
      const text=routeOutcome(route,value.masked),key=JSON.stringify([text,value.masked,route.order.map(w=>w.who)]);
      if(captionKey!==key){captionKey=key;caption.replaceChildren(...maskText(text,route));caption.classList.remove('rr-caption-in');if(!value.reduced){void caption.offsetWidth;caption.classList.add('rr-caption-in');}}
      if(value.reduced)caption.classList.remove('rr-caption-in');caption.title=value.masked?'':caption.textContent;
      for(const[index,field]of ['requests','rerouted','errors'].entries())values[index].textContent=compactNumber(value.data.totals[field]);
      storyHead.textContent=value.follow?l("最近一個請求是怎麼路由的"):l("這個歷史請求是怎麼路由的");
      storyView.update(route,value.masked);
    }
    context.update(value);historyCount.textContent=l("閘道保留的最近 {p0} 個{p1}",{p0:(value.data.routes.length),p1:(value.filter?l(" · 篩選後 ")+value.filtered.length+l(" 個"):'')});renderHistory(value);
  },dispose(){resize.disconnect();tools.node.remove();context.dispose();graph.dispose();shell.dispose();}};
}
