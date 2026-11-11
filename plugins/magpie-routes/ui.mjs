import {l, locale} from './i18n.mjs';
import {routeStatus,requestKey} from './model.mjs';
import {requestPurpose} from './requests.mjs';
import {replayPlan,replayAt,replayClock} from './replay.mjs';
import { createPage, createNotch, createDock, createRail } from './views.mjs';

export async function activate(ctx) {
  let data = await ctx.backend.call('snapshot');
  const listeners = new Set();
  const off = ctx.backend.subscribe(next => { if (next) { data = next; for (const listener of listeners) listener(); } });
  return {
    mount(container, initialContext) {
      const rail = initialContext.surface === 'edgeDock' && (initialContext.variant === 'compact' || initialContext.surfaceVariant === 'rail');
      if (!rail && typeof initialContext.headerActions?.append !== 'function') {
        throw new Error(locale() === 'zh-TW' ? 'Magpie 路由需要支援標題列操作區的 Token Monitor 版本。' : locale() === 'zh-CN' ? 'Magpie 路由需要支持标题栏操作区的 Token Monitor 版本。' : 'Magpie Routes requires a Token Monitor build with header actions support.');
      }
      let context = initialContext, filter = '', selected = null, follow = true;
      let visible = context.visible !== false;
      let error = '', view, kind, language, headerActions;
      let historyDay='',historyRows=[],historyDays=[],historyCut=false,historyLoading=false,scopeError='',historyRead=0,tallies=[],historyAt=0,historyWarning='',historyRevision=data.historyRevision,historyDirty=false;
      let cards=[],cardsLoading=false,cardsError='',cardRead=0,purpose=[],replay=null,replayFrame=0,replayEpoch=0,disposed=false;
      let cardSource=JSON.stringify([data.endpoint,data.processId,historyRevision]),cardConnection=data.connection,cardsDirty=true;
      function stopReplay(restore=false){const back=replay?.back;cancelAnimationFrame(replayFrame);replayFrame=0;replay=null;if(restore&&back){selected=back.selected;follow=back.follow;}}
      function replayStep(now){
        replayFrame=0;if(!replay||disposed||!visible)return;
        if(!replay.paused)replay.v+=Math.min(now-replay.at,250)*replay.speed;
        replay.at=now;
        if(replay.v>replay.plan.total&&replay.event===replay.plan.vs.length-1&&!view.isPlaying?.()){stopReplay(true);render();return;}
        const event=replay.plan.vs.findLastIndex(at=>at<=replay.v);
        if(event!==replay.event){replay.event=event;render();}
        else view.updateReplay?.({replay:{...replay,total:replay.plan.total,...replayClock(replay.plan,replay.v)}});
        if(replay&&!replay.paused)replayFrame=requestAnimationFrame(replayStep);
      }
      async function loadHistory(day,select=false){
        if(!visible){historyDirty=true;return;}historyDirty=false;
        const request=++historyRead;historyAt=Date.now();historyLoading=true;scopeError='';render();
        try{const got=await ctx.backend.call('history',{day});if(disposed||request!==historyRead)return;
          historyDays=got.days;historyRows=got.routes.sort((a,b)=>Date.parse(b.time)-Date.parse(a.time)||b.id-a.id);historyCut=got.cut;
          tallies=got.tallies;if(select){historyDay=day;selected=null;follow=!day;}
          historyWarning=got.unavailableDays?.length?l('Some history files could not be read. Dates and totals may be incomplete: {days}',{days:got.unavailableDays.join(', ')}):'';
        }catch(e){if(disposed||request!==historyRead)return;scopeError=l('Unable to read routing history.');}
        finally{if(!disposed&&request===historyRead){historyLoading=false;render();}}
      }
      async function loadCards(){
        if(!visible||data.connection!=='online')return;
        cardsDirty=false;
        const request=++cardRead;cardsLoading=true;cardsError='';render();
        try{const got=await ctx.backend.call('cards');if(disposed||request!==cardRead)return;cards=got;}
        catch{if(!disposed&&request===cardRead)cardsError=l('Magpie has no saved allowance reading available.');}
        finally{if(!disposed&&request===cardRead){cardsLoading=false;render();}}
      }
      const languageObserver = new MutationObserver(() => render());
      languageObserver.observe(document.documentElement, {attributes:true,attributeFilter:['lang']});
      const read = () => {
        let replaying=null;
        if(replay){const event=replay.plan.vs.findLastIndex(at=>at<=replay.v);if(!replay.sample||replay.sampleEvent!==event){replay.sample=replayAt(replay.plan,replay.v);replay.sampleEvent=event;}
          replaying={...replay.sample,...replayClock(replay.plan,replay.v)};for(const row of replaying.rows)row.replayAt=replaying.real;
        }
        const allRoutes=historyDay?historyRows:data.routes;
        const source=replaying?[...replaying.rows].reverse():allRoutes;
        const filtered=source.filter(row=>(!filter||row.agent===filter)&&(!purpose.length||purpose.includes(requestPurpose(row))));
        const pinned=!follow&&filtered.find(row=>requestKey(row)===selected);
        const expired=!replay&&!historyDay&&!follow&&selected!==null&&!pinned;
        if(expired){follow=true;selected=null;}
        const route=pinned||filtered[0];
        const done=filtered.filter(r=>r.done);
        // Match Magpie trace.update/renderStats: failed tries that rested and
        // handed on, not the number of requests labelled "Rerouted".
        const totals=historyDay||purpose.length?{requests:done.length,rerouted:done.reduce((n,r)=>n+r.tries.filter((tr,i)=>tr.rest&&i<r.tries.length-1).length,0),errors:done.filter(r=>routeStatus(r).tone==='failed').length}:data.totals;
        return {data:{...data,totals},route,filtered,allRoutes,filter,masked:data.maskAccounts,follow:replay?true:follow,error,visible,nativeData:context.nativeData,
          expired,purpose,historyDay,historyDays,historyCut,historyLoading,scopeError:scopeError||historyWarning,cards,cardsError,cardsLoading,replaying:Boolean(replay),replayEpoch,
          tallies,clock:replaying?.real,replay:replay?{v:replay.v,total:replay.plan.total,speed:replay.speed,paused:replay.paused,real:replaying.real,fast:replaying.fast}:null,
          reduced:context.nativeData?.appearance?.reduceMotion==='on'||document.documentElement.dataset.reduceMotion==='on'};

      };
      const actions = {
        selectAgent(value) { stopReplay();filter = value; selected = null; follow = !historyDay; render(); },
        pick(route) { selected = requestKey(route); follow = false; render(); },
        latest() {stopReplay();historyRead++;historyLoading=false;scopeError='';historyDay='';purpose=[];follow=true;selected=null;render();},
        day(day){stopReplay();void loadHistory(day,true);},cards:loadCards,
        purpose(value){stopReplay();purpose=value;selected=null;follow=!historyDay;render();},
        replay(rows){const plan=replayPlan(rows);if(!plan)return;const back=replay?.back||{selected,follow};stopReplay();selected=null;replayEpoch++;replay={plan,back,event:-2,v:-500,at:performance.now(),speed:1,paused:false};render();replayFrame=requestAnimationFrame(replayStep);},
        replayStop(){stopReplay(true);render();},
        replaySpeed(){if(replay){replay.speed=replay.speed>=8?1:replay.speed*2;render();}},
        replayPause(){if(replay){replay.paused=!replay.paused;cancelAnimationFrame(replayFrame);replay.at=performance.now();render();if(!replay.paused)replayFrame=requestAnimationFrame(replayStep);}},
        replaySeek(fraction){if(replay){replayEpoch++;replay.v=Math.max(0,Math.min(1,fraction))*replay.plan.total;replay.at=performance.now();render();}},
        async mask() {
          try { await ctx.backend.call('toggleMask'); error = ''; }
          catch { error = l('無法儲存打碼設定，請重試。'); }
          render();
        },
        async reconnect() { try { data = await ctx.backend.call('reconnect'); error = ''; } catch { error = l("重新連線失敗，請在插件設定重啟。"); } render(); }
      };
      function render() {
        const nextKind = context.surface === 'notch' ? 'notch' : context.surface === 'edgeDock'
          ? context.variant === 'compact' || context.surfaceVariant === 'rail' ? 'rail' : 'dock' : 'page';
        if (kind !== nextKind || language !== locale() || headerActions !== context.headerActions) {
          headerActions = context.headerActions;
          language = locale();
          view?.dispose(); kind = nextKind;
          view = ({ page: createPage, notch: createNotch, dock: createDock, rail: createRail })[kind](container, { ...ctx, headerActions: context.headerActions }, actions);
        }
        view.update(read());
      }
      const onUpdate=()=>{
        const nextHistoryRevision=data.historyRevision??historyRevision;
        if(historyRevision!==nextHistoryRevision){historyRevision=nextHistoryRevision;stopReplay();historyRows=[];historyDays=[];tallies=[];historyWarning='';historyDirty=true;selected=null;if(kind==='page')void loadHistory(historyDay,true);}
        const nextCardSource=JSON.stringify([data.endpoint,data.processId,historyRevision]);
        if(cardSource!==nextCardSource||cardConnection!==data.connection&&data.connection!=='online'){
          cardRead++;cards=[];cardsError='';cardsLoading=false;cardsDirty=true;
        }
        cardSource=nextCardSource;cardConnection=data.connection;
        if(kind==='page'&&cardsDirty)void loadCards();
        render();if(kind==='page'&&visible&&!historyDay&&!historyLoading&&!replay&&Date.now()-historyAt>15000&&data.routes.some(r=>r.done))void loadHistory('');};
      listeners.add(onUpdate); render();if(kind==='page'){void loadHistory('');void loadCards();}
      return { update(next) { const previous=visible;context = next; visible = next.visible !== false;if(!visible&&previous){historyRead++;cardRead++;historyLoading=false;cardsLoading=false;}if(replay){replay.at=performance.now();cancelAnimationFrame(replayFrame);if(visible&&!replay.paused)replayFrame=requestAnimationFrame(replayStep);} render();if(visible&&!previous&&kind==='page'){if(historyDirty||!historyDay)void loadHistory(historyDay,historyDirty);void loadCards();} }, dispose() {disposed=true;historyRead++;cardRead++;stopReplay(); languageObserver.disconnect(); listeners.delete(onUpdate); view.dispose(); } };
    },
    dispose() { off(); listeners.clear(); }
  };
}
