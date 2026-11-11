'use strict';
// Run with Electron and TOKEN_MONITOR_CHECKOUT pointing to the host checkout.
// Uses synthetic state and a disposable profile; never opens the real App data.
const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..'), host = process.env.TOKEN_MONITOR_CHECKOUT;
if (!host) throw Error('Set TOKEN_MONITOR_CHECKOUT to the tested Token Monitor source tree.');
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'tm-community-plugins-ui-'));
const evidence = path.join(root, '_local/verification');
fs.mkdirSync(evidence, { recursive: true });
app.setPath('userData', path.join(scratch, 'profile'));
protocol.registerSchemesAsPrivileged([{ scheme: 'tm-plugin', privileges: { standard: true, secure: true, corsEnabled: true, supportFetchAPI: true } }]);
app.on('window-all-closed', () => {});
app.whenReady().then(async () => {
  app.dock?.hide();
  const manifests = Object.fromEntries(['magpie-routes'].map(id => [id, JSON.parse(fs.readFileSync(path.join(root, 'plugins', id, 'manifest.json')))]));
  protocol.handle('tm-plugin', request => {
    const url = new URL(request.url), name = decodeURIComponent(url.pathname.slice(1));
    if (!manifests[url.hostname]?.files.includes(name)) return new Response('', { status: 404 });
    const file = path.join(root, 'plugins', url.hostname, name);
    return new Response(fs.readFileSync(file), { headers: { 'access-control-allow-origin': '*', 'content-type': ({ mjs: 'text/javascript', cjs: 'text/javascript', css: 'text/css', png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp' })[name.split('.').pop()] || 'application/octet-stream' } });
  });
  const renderer = name => pathToFileURL(path.join(host, 'src/electron/renderer', name)).href;
  const html = path.join(scratch, 'ui.html');
  fs.writeFileSync(html, `<!doctype html><html lang="zh-TW" data-reduce-motion="on"><meta charset="utf-8"><link rel="stylesheet" href="${renderer('styles.css')}"><link rel="stylesheet" href="${renderer('pluginViews.css')}"><style>body{display:block;height:auto;width:auto;margin:0;padding:20px;background:rgb(var(--panel-rgb));overflow:auto}.settings-panel{max-height:none}.host-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}h1{font-size:17px}.surface{position:relative;min-width:0}.hidden{display:none!important}</style><header class="host-header"><h1 id="title">社群外掛 · 本機候選</h1><div id="header-actions"></div></header><div id="settings" class="settings-panel"></div><main id="surface" class="surface"></main>${['pluginUi.js','pluginViews.js','selectControl.js','i18n.js','pluginSettings.js'].map(name => `<script src="${renderer(name)}"></script>`).join('')}</html>`);
  const win = new BrowserWindow({ show: false, width: 900, height: 900, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  const errors = [];
  win.webContents.on('console-message', event => {
    if (event.level === 'error' || /Uncaught|Error loading/.test(event.message)) { errors.push(event.message); console.error('Renderer:', event.message); }
  });
  await win.loadFile(html);
  const localize = value => typeof value === 'string' ? value : value?.['zh-TW'] || value?.en || '';
  const descriptors = Object.values(manifests).map(m => ({ id: m.id, name: localize(m.name), author: m.author, version: m.version,
    description: localize(m.description), identityIcon: m.identityIcon, source: 'user', status: 'disabled', enabled: false, trusted: false,
    types: ['widget','page'], views: [] }));
  const checks = await win.webContents.executeJavaScript(`(async()=>{
    const checks=[];window.check=(name,value)=>{if(!value)throw Error(name);checks.push(name)};
    const container=document.getElementById('settings');
    const panel=TokenMonitorPluginSettings.createPluginSettingsPanel({document,container,t:(k,v)=>TokenMonitorI18n.translate('zh-TW',k,v),api:{list:async()=>({enabled:true,plugins:${JSON.stringify(descriptors)}})}});
    await panel.refresh();
    check('clean-public-author-label',!container.textContent.includes('Local test')&&!container.textContent.includes('Local integration')&&container.textContent.includes('Javis603'));
    check('identity-has-real-png',container.querySelectorAll('.plugin-identity-art img').length===1);
    window.panel=panel;window.checks=checks;return checks;
  })()`);
  const cardClip = await win.webContents.executeJavaScript(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>{const r=document.getElementById('settings').getBoundingClientRect();check('cards-have-visible-layout',r.height>100);resolve({x:0,y:0,width:innerWidth,height:Math.min(innerHeight,Math.ceil(r.bottom)+20)})})))`);
  await new Promise(resolve => setTimeout(resolve, 150));
  fs.writeFileSync(path.join(evidence, 'plugin-cards.png'), (await win.webContents.capturePage(cardClip)).toPNG());
  const gateway = require('../plugins/magpie-routes/gateway.cjs');
  const row = { id: 1, session: 'synthetic-session', agent: 'dsh', model: 'gpt-6.1-sol', provider: 'codex', time: new Date().toISOString(), phase: 'upstream', done: false,
    order: [{ id: 'demo-a', provider: 'codex', name: 'demo-a@example.test', model: 'gpt-6.1-sol', used: 42, rank: 1 }, { id: 'demo-b', provider: 'codex', name: 'demo-b@example.test', model: 'gpt-6.1-sol', used: 18, rank: 2 }],
    tries: [{ id: 'demo-a', model: 'gpt-6.1-sol', done: false }],
    prompt: { tokens: 12000, window: 128000, turns: 3, parts: [{ kind: 'system', tokens: 2000, items: [] }, { kind: 'tools', tokens: 1000, items: [] }, { kind: 'files', tokens: 4000, items: [{ name: 'demo.ts', tokens: 4000 }] }, { kind: 'results', tokens: 2000, items: [] }, { kind: 'chat', tokens: 3000, items: [] }] } };
  const projected = gateway.trace({ object: 'trace', pid: 1, seq: 1, ids: [1], routes: [row], totals: { requests: 12, rerouted: 1, errors: 0 } });
  const strict = gateway.trace({object:'trace',pid:1,seq:1,ids:[1],totals:{},routes:[{...row,
    affinity:{why:'strict',last:'demo-a',main:{id:'main',kind:'account',name:'Provider',who:'main-private@example.test'}}}]});
  const magpie = { connection: 'online', endpoint: '127.0.0.1:3425', version: 'synthetic fixture', updatedAt: Date.now(), routes: projected.routes,
    totals: projected.totals, lifted: {}, active: [{ id: 1, route: 1, agent: 'dsh', model: 'gpt-6.1-sol', phase: 'upstream', ms: 1000 }], activityAvailable: true, maskAccounts: true };
  await win.webContents.executeJavaScript(`(async()=>{
    document.getElementById('settings').classList.add('hidden');document.getElementById('title').textContent='Magpie 路由 · 合成資料';
    const root=document.getElementById('surface'),header=document.getElementById('header-actions');
    const css=${JSON.stringify(manifests['magpie-routes'].css)};for(const file of css){const link=document.createElement('link');link.rel='stylesheet';link.href='tm-plugin://magpie-routes/'+file;document.head.append(link)}
    const plugin=await import('tm-plugin://magpie-routes/ui.mjs');
    window.backendCalls=[];
    const ctx={asset:name=>'tm-plugin://magpie-routes/'+name,backend:{call:async(method,params)=>{backendCalls.push(method);if(method==='history'){if(window.delayHistory)return new Promise(resolve=>window.resolveHistory=resolve);return structuredClone(window.historyFixtures?.[params?.day||'']||{days:[],routes:[],cut:false,tallies:[]});}if(method==='cards')return structuredClone(window.cardsFixture||[]);return (${JSON.stringify(magpie)});},subscribe:fn=>{window.pushMagpie=fn;return()=>{}}},app:{reportBubbleSize(){}}};
    window.magpie=await plugin.activate(ctx);
    let missing=false;try{magpie.mount(root,{surface:'page',visible:true})}catch(e){missing=/Token Monitor/.test(e.message)}
    check('missing-header-host-reports-clear-requirement',missing);
    window.page=magpie.mount(root,{surface:'page',visible:true,headerActions:header,nativeData:{appearance:{reduceMotion:'on'}}});
    await new Promise(r=>setTimeout(r,150));
    check('magpie-page-renders-real-graph',root.querySelectorAll('svg').length>0&&root.textContent.includes('gpt-6.1-sol'));
    check('dsh-source-name',root.textContent.includes('DeepSeek Harness'));
    const whale=root.querySelector('.rr-source [data-brand="deepseek-color"] img');await whale.decode();
    check('dsh-whale-is-loaded',whale.naturalWidth>0);
    window.nextMagpie=${JSON.stringify(magpie)};
    nextMagpie.routes[0].prompt.tokens=24000;pushMagpie(nextMagpie);
    check('context-live-update',root.querySelector('.ctx-card').textContent.includes('24K'));
    window.contextIconMeasurements={};
    for(const [name,selector,expected] of [['agent','.ctx-who > .rr-brand',14],['model','.ctx-what > .rr-brand',12]]){
      const rect=root.querySelector(selector).getBoundingClientRect();
      contextIconMeasurements[name]={width:rect.width,height:rect.height};
      check('context-'+name+'-icon-'+expected+'px ('+rect.width+'x'+rect.height+')',rect.width===expected&&rect.height===expected);
    }
    const before=root.querySelector('.ctx-card');
    nextMagpie.routes[0].prompt=null;pushMagpie(nextMagpie);
    check('context-card-removed-without-prompt',!root.querySelector('.ctx-card'));
    nextMagpie.routes[0].prompt=${JSON.stringify(projected.routes[0].prompt)};pushMagpie(nextMagpie);
    check('context-card-restored',root.querySelectorAll('.ctx-card').length===1&&!before.isConnected);
    root.querySelector('.ctx-tile.k-files')?.click();
    check('context-inspects-metadata-only',root.querySelector('.ctx-contents').textContent.includes('demo.ts'));

    const restore=structuredClone(nextMagpie);
    const auxiliary=structuredClone(nextMagpie.routes[0]);
    auxiliary.kind='compact';auxiliary.done=true;auxiliary.sessionKey='aux-session-a';
    auxiliary.usage=[{in:50,cache_read:50}];auxiliary.prompt.counted=true;
    nextMagpie.routes=[auxiliary];pushMagpie(nextMagpie);
    const cacheText=()=>root.querySelector('.ctx-cache .ctx-big b')?.textContent;
    check('aux-context-records-session-cache',cacheText()==='50%');
    auxiliary.id++;auxiliary.done=false;auxiliary.usage=[];auxiliary.prompt.counted=false;pushMagpie(nextMagpie);
    check('aux-context-retains-same-session-cache',cacheText()==='50%');
    auxiliary.id++;auxiliary.sessionKey='aux-session-b';pushMagpie(nextMagpie);
    check('aux-context-does-not-leak-other-session-cache',cacheText()==='—');
    auxiliary.sessionKey='';auxiliary.done=true;auxiliary.usage=[{in:50,cache_read:50}];auxiliary.prompt.counted=true;pushMagpie(nextMagpie);
    auxiliary.id++;auxiliary.done=false;auxiliary.usage=[];auxiliary.prompt.counted=false;pushMagpie(nextMagpie);
    check('aux-context-without-session-isolates-requests',cacheText()==='—');
    pushMagpie({...restore,routes:${JSON.stringify(strict.routes)}});
    const privateName='main-private@example.test';
    check('strict-main-account-uses-existing-blur',[...root.querySelectorAll('.rr-pii')].some(n=>n.textContent===privateName&&getComputedStyle(n).filter.includes('blur')));
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let textNode,unmasked=false;
    while((textNode=walker.nextNode()))if(textNode.textContent.includes(privateName)&&!textNode.parentElement.closest('.rr-pii'))unmasked=true;
    check('strict-main-account-has-no-unmasked-copy',!unmasked);
    pushMagpie(restore);
    window.sparkRestore=restore;
    const history=structuredClone(restore),earlier=structuredClone(history.routes[0]);
    earlier.id=0;earlier.prompt.tokens=6000;earlier.done=true;
    history.routes.push(earlier);pushMagpie(history);
    const point=root.querySelector('.ctx-spark .hit');
    check('context-history-point-is-keyboard-button',point?.getAttribute('role')==='button'&&point.getAttribute('tabindex')==='0');
    check('context-history-point-has-window-label',point.getAttribute('aria-label')===point.querySelector('title').textContent&&point.getAttribute('aria-label').includes('128K'));
    point.focus();check('context-history-point-receives-focus',document.activeElement===point);

    check('magpie-page-uses-header-outlet',header.children.length>0);
  })()`);
  await win.webContents.executeJavaScript(`(()=>{
    const root=document.getElementById('surface');
    window.stageRestore=structuredClone(sparkRestore);
    const direct=structuredClone(stageRestore.routes[0]);
    direct.id=10;direct.agent='t3code';direct.provider='codex';direct.model='codex/codex-auto-review';
    direct.order=direct.order.map((w,i)=>({...w,kind:'account',name:'Codex',who:w.name,plan:i?'plus':'Pro Lite',model:'codex-auto-review',routing:'',known:true,usedPercent:i?100:54}));
    direct.tries=[{id:direct.order[0].id,model:'codex-auto-review',done:false}];
    direct.bytes=63400;direct.contentAt=Date.now()-1000;direct.estTok=1000;
    const auto=structuredClone(direct);auto.id=11;auto.model='group/smart-split';auto.provider='group';
    auto.group={id:'smart-split',name:'Auto',routing:'order',members:['codex/gpt-6.1-sol','commandcode/deepseek/deepseek-v4.1-flash']};
    auto.order=auto.order.map(w=>({...w,model:'gpt-6.1-sol'}));
    auto.order.push({...auto.order[0],id:'command-a',provider:'commandcode',name:'Command Code',icon:'commandcode',who:'demo-goat@example.test',model:'deepseek/deepseek-v4.1-flash'});
    auto.tries=[{id:'command-a',model:'deepseek/deepseek-v4.1-flash',done:false}];
    window.groupedFixture={...structuredClone(stageRestore),routes:[direct,auto]};
    pushMagpie(groupedFixture);
    check('stage-has-separate-route-headings',root.querySelectorAll('.rr-branch').length===2);
    check('stage-heading-count-is-focused-route-only',root.querySelector('.rr-what').textContent.includes('2'));
    check('stage-shows-two-line-account-details',[...root.querySelectorAll('.rr-seat')].every(n=>n.querySelector('.rr-seat-note').getBoundingClientRect().top>=n.querySelector('.rr-seat-name').getBoundingClientRect().bottom));
    check('stage-shows-safe-live-counters',root.textContent.includes('61.9 KiB'));
    check('stage-chinese-statuses-are-translated',[...root.querySelectorAll('.rr-seat-note')].every(n=>!/answering|used|ago|available/.test(n.textContent)));
    check('stage-model-name-not-truncated',root.querySelectorAll('.rr-seat-name code')[4].scrollWidth<=root.querySelectorAll('.rr-seat-name code')[4].clientWidth+1);
    const heading=root.querySelector('.rr-branch-toggle');
    window.stableStageSeat=root.querySelector('.rr-seat');
    heading.click();
    check('stage-fold-preserves-other-route',root.querySelectorAll('.rr-seat').length===3&&heading.getAttribute('aria-expanded')==='false');
    check('stage-fold-shows-active-summary',heading.textContent.includes('61.9 KiB'));
    pushMagpie(structuredClone(groupedFixture));
    check('stage-fold-survives-trace-updates',root.querySelectorAll('.rr-seat').length===3);
    heading.click();
    check('stage-unfold-retains-stable-seat-nodes',root.querySelector('.rr-seat')===stableStageSeat);
    check('stage-account-names-remain-blurred',root.querySelectorAll('.rr-seat-name .rr-pii').length===5&&[...root.querySelectorAll('.rr-seat-name .rr-pii')].every(n=>getComputedStyle(n).filter.includes('blur')));
    window.groupedHeading=heading;heading.focus();
  })()`);
  win.webContents.focus();
  for(const keyCode of ['Enter','Space']) {
    win.webContents.sendInputEvent({type:'keyDown',keyCode});win.webContents.sendInputEvent({type:'keyUp',keyCode});
    await win.webContents.executeJavaScript(`new Promise(r=>setTimeout(r,30))`);
    await win.webContents.executeJavaScript(`check('stage-fold-keyboard-${keyCode}',groupedHeading.getAttribute('aria-expanded')===${JSON.stringify(keyCode==='Space'?'true':'false')})`);
  }
  await win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
  await win.webContents.executeJavaScript(`(()=>{
    const root=document.getElementById('surface');
    const wires=[...root.querySelectorAll('.rr-wires path')];
    check('stage-flight-paths-follow-branch-parents',wires.filter(p=>p.classList.contains('rr-flight-path')).length===5);
    check('stage-wires-have-finite-lengths',wires.every(p=>Number.isFinite(p.getTotalLength())&&p.getTotalLength()>0));
    const svg=root.querySelector('.rr-wires');
    check('stage-wires-end-at-visible-branch-rows',[...root.querySelectorAll('.rr-seats > li')].every(row=>{
      const path=wires.find(p=>p.dataset.target===row.dataset.node),end=path.getPointAtLength(path.getTotalLength()).matrixTransform(svg.getScreenCTM()),rect=row.getBoundingClientRect();
      return Math.hypot(end.x-rect.left,end.y-rect.top-rect.height/2)<1;
    }));
  })()`);
  await win.webContents.executeJavaScript('groupedHeading.blur()');
  fs.writeFileSync(path.join(evidence,'page-grouped-fixture.png'),(await win.webContents.capturePage()).toPNG());
  await win.setSize(520,900);
  await win.webContents.executeJavaScript('new Promise(r=>setTimeout(r,150))');
  await win.webContents.executeJavaScript(`(()=>{
    const root=document.getElementById('surface');
    check('stage-narrow-has-no-horizontal-overflow',root.scrollWidth<=root.clientWidth+1);
    check('stage-narrow-retains-headings-and-seats',root.querySelectorAll('.rr-branch').length===2&&root.querySelectorAll('.rr-seat').length===5);
  })()`);
  fs.writeFileSync(path.join(evidence,'page-grouped-narrow.png'),(await win.webContents.capturePage()).toPNG());
  win.setSize(900,900);
  await win.webContents.executeJavaScript(`(()=>{
    const pool=structuredClone(groupedFixture.routes[0]);pool.group={id:'pool',name:'Pool',members:[],subs:[{id:'nested',name:'Nested',routing:'order'}]};pool.order=Array.from({length:3},(_,i)=>({...pool.order[0],id:'key-'+i,kind:'key',who:'synthetic-key-'+i,via:['nested'],rank:i+1}));pool.tries=[];
    pushMagpie({...groupedFixture,routes:[pool]});
    const root=document.getElementById('surface'),branches=root.querySelectorAll('.rr-branch');
    check('stage-nested-key-pool-starts-folded',branches.length===2&&root.querySelectorAll('.rr-seat').length===0&&branches[1].textContent.includes('3'));
    branches[1].firstChild.click();check('stage-nested-key-pool-expands-in-place',root.querySelectorAll('.rr-seat').length===3);
    branches[0].firstChild.click();check('stage-nested-group-folds-whole-subtree',root.querySelectorAll('.rr-branch').length===1&&root.querySelectorAll('.rr-seat').length===0);
  })()`);
  await win.webContents.executeJavaScript(`(async()=>{
    const root=document.getElementById('surface'),template=structuredClone(sparkRestore.routes[0]),now=Date.now();
    const row=(id,session,change={})=>({...structuredClone(template),id,time:new Date(now-(105-id)*30000).toISOString(),agent:'t3code',sessionKey:session,callerKey:'office-key-id',callerKeyName:'Office',kind:'',done:true,status:200,ms:6000,ttft:1000,flow:5000,out:1000,tokens:(105-id)*10000,tries:[{id:template.order[0].id,model:template.model,done:true,status:200,start:new Date(now-(105-id)*30000).toISOString(),ms:6000}],usage:[{in:20,out:1000,cache_read:60,cache_write:20,credits:1.5}],order:template.order.map(w=>({...w,kind:'account',name:'Codex',who:w.name,plan:'Plus',known:true})),...change});
    window.readonlyRows=[row(105,'session-a',{done:false,tries:[{id:template.order[0].id,model:template.model,done:false}],usage:[],bytes:63400,estTok:1000,contentAt:now-1000}),row(104,'session-b',{callerKey:'automation-key-id',callerKeyName:'Automation',prompt:{...structuredClone(template.prompt),tokens:34000}}),row(103,'session-a',{kind:'thread_title_reconsideration'}),row(102,'session-a'),row(101,'session-old',{time:new Date(now-3600000).toISOString()})];
    window.historyPast=readonlyRows.filter(r=>r.done).map((r,i)=>({...structuredClone(r),id:900+i,time:new Date(Date.UTC(2026,10,9,10,i)).toISOString()}));
    const days=[{day:'2026-11-10',requests:12},{day:'2026-11-09',requests:4}];
    window.historyFixtures={'':{days,routes:[],cut:false,tallies:[]},'2026-11-09':{days,routes:historyPast,cut:false,tallies:[]},'2026-11-10':{days,routes:historyPast,cut:false,tallies:[]}};
    window.cardsFixture=template.order.map(w=>({kind:'subscription',provider:'codex',user:w.name,plan:'Plus',readAt:new Date(now-60000).toISOString(),windows:[{name:'Weekly',used:54,resetsAt:new Date(now+86400000).toISOString()},{name:'Wallet',balance:25,unit:'USD',runsOut:5,runsOutAt:new Date(now+3600000).toISOString()}]}));
    window.readonlyFixture={...structuredClone(sparkRestore),routes:readonlyRows};pushMagpie(readonlyFixture);
    root.querySelector('.rr-history-days button').click();await new Promise(r=>setTimeout(r,80));
    root.querySelector('.rr-account-list button').click();await new Promise(r=>setTimeout(r,80));
    check('concurrent-context-has-two-independent-session-blocks',root.querySelectorAll('.rr-context-session').length===2);
    check('concurrent-context-hides-auxiliary-and-stale-sessions',root.querySelectorAll('.rr-context-session .ctx-stack').length===2);
    check('concurrent-context-stacks-are-visible',[...root.querySelectorAll('.rr-context-session .ctx-stack')].every(n=>n.getBoundingClientRect().width>100&&n.getBoundingClientRect().height>=5));
    root.querySelector('.rr-context-session[data-session="t3code session-b"]').click();check('concurrent-context-click-selects-session-latest',root.querySelector('.ctx-crumbs').textContent.includes('#104'));
    document.querySelector('.rr-back-live').click();
    check('requests-show-live-reply-counters',root.querySelector('.rr-request-live').textContent.includes('61.9 KiB'));
    check('requests-show-metrics-and-reported-credits',root.querySelectorAll('.rr-request-detail [data-metric="cache"]').length>0&&root.querySelectorAll('.rr-request-detail [data-metric="cost"]').length>0);
    check('accounts-show-allowance-windows-and-wallet-expiry',root.querySelector('.rr-account-list').textContent.includes('25 USD')&&root.querySelector('.rr-account-list').textContent.includes('5 USD'));
    check('accounts-retain-mask-for-live-readings',[...root.querySelectorAll('.rr-account-summary > strong .rr-pii')].every(n=>getComputedStyle(n).filter.includes('blur')));
    root.querySelector('[data-group-by="session"]').click();check('requests-group-by-session',root.querySelectorAll('.rr-request-group').length===3);
    const sessionLabelsMatch=()=>[...root.querySelectorAll('.rr-context-session')].every(card=>{
      const r=readonlyRows.find(r=>r.agent+' '+r.sessionKey===card.dataset.session);
      let row=root.querySelector('.rr-request-detail[data-request-id="'+r.id+'"]');
      while(row&&!row.matches('.rr-request-group'))row=row.previousElementSibling;
      return row?.querySelector('strong').textContent===card.querySelector('strong').textContent;
    });
    check('context-session-labels-match-request-groups',sessionLabelsMatch());
    const group=root.querySelector('.rr-request-group');group.focus();group.click();check('request-group-fold-keeps-focused-button',document.activeElement===group&&group.getAttribute('aria-expanded')==='false');group.click();
    root.querySelector('[data-group-by="key"]').click();check('requests-group-by-nonsecret-key-name',root.querySelectorAll('.rr-request-group').length===2&&root.querySelector('.rr-history-list').textContent.includes('Automation'));
    root.querySelector('[data-group-by="request"]').click();
    root.querySelector('[data-purpose="kind:thread_title"]').click();check('purpose-filter-normalizes-upstream-kind-alias',root.querySelectorAll('.rr-request-detail').length===1);
    root.querySelector('[data-purpose="conversation"]').click();check('purpose-filter-supports-multiple-selections',root.querySelectorAll('.rr-request-detail').length===5);
    // Clear by toggling the selected purpose inputs, independent of locale.
    for(const input of [...root.querySelectorAll('[data-purpose]')])if(input.checked)input.click();
    const sorting=root.querySelector('.rr-history-tools select');sorting.value='tokens';sorting.dispatchEvent(new Event('change'));
    check('requests-sort-by-numeric-tokens',root.querySelector('.rr-request-detail').dataset.requestId==='101');
    const cache=root.querySelector('input[data-metric="cache"]');cache.click();check('request-metrics-visibility-toggle',root.querySelectorAll('.rr-request-detail [data-metric="cache"]').length===0);cache.click();
    sorting.value='newest';sorting.dispatchEvent(new Event('change'));
    root.querySelectorAll('.rr-history-days button')[2].click();await new Promise(r=>setTimeout(r,80));
    check('history-day-loads-own-records',root.querySelectorAll('.rr-request-detail').length===4&&root.querySelector('.ctx-crumbs').textContent.includes('#903'));
    check('history-day-hides-live-session-strip',root.querySelector('.rr-context-sessions').hidden);
    const keptTitle=root.querySelector('.rr-request-detail').firstChild;pushMagpie(structuredClone(readonlyFixture));check('history-does-not-repaint-for-unrelated-live-updates',root.querySelector('.rr-request-detail').firstChild===keptTitle);
    root.querySelector('[data-action="replay"]').click();await new Promise(r=>setTimeout(r,80));
    check('replay-starts-with-control-bar',!root.querySelector('.rr-replay').hidden);
    root.querySelector('.rr-replay [data-action="pause"]').click();
    const seek=root.querySelector('.rr-replay input');seek.value=500;seek.dispatchEvent(new Event('input'));
    const at=seek.value;await new Promise(r=>setTimeout(r,80));check('replay-pause-and-seek-hold-position',seek.value===at);
    root.querySelector('.rr-replay [data-action="speed"]').click();check('replay-speed-control',root.querySelector('.rr-replay [data-action="speed"]').textContent.includes('2'));
    root.querySelector('.rr-replay [data-action="stop"]').click();check('replay-stop-restores-history-scope',root.querySelector('.rr-replay').hidden&&root.querySelectorAll('.rr-request-detail').length===4);
    document.querySelector('.rr-back-live').click();check('history-can-return-to-live',root.querySelectorAll('.rr-request-detail').length===5);
    window.delayHistory=true;root.querySelectorAll('.rr-history-days button')[2].click();document.querySelector('.rr-back-live').click();window.delayHistory=false;resolveHistory(structuredClone(historyFixtures['2026-11-09']));await new Promise(r=>setTimeout(r,50));
    check('late-history-response-cannot-replace-live-selection',root.querySelectorAll('.rr-request-detail').length===5);
    check('page-never-calls-a-vendor-or-settings-write',backendCalls.every(method=>['snapshot','history','cards'].includes(method)));
    root.querySelector('.rr-context:not(.rr-context-sessions)').scrollIntoView({block:'start'});await new Promise(r=>setTimeout(r,120));
  })()`);
  fs.writeFileSync(path.join(evidence,'page-context-sessions.png'),(await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`document.querySelector('.rr-requests').scrollIntoView({block:'start'})`);
  await win.webContents.executeJavaScript('new Promise(r=>setTimeout(r,100))');
  fs.writeFileSync(path.join(evidence,'page-request-history.png'),(await win.webContents.capturePage()).toPNG());
  win.setSize(520,900);
  await win.webContents.executeJavaScript(`new Promise(r=>setTimeout(r,150))`);
  await win.webContents.executeJavaScript(`check('readonly-history-narrow-has-no-horizontal-overflow',document.getElementById('surface').scrollWidth<=document.getElementById('surface').clientWidth+1)`);
  fs.writeFileSync(path.join(evidence,'page-request-history-narrow.png'),(await win.webContents.capturePage()).toPNG());
  win.setSize(900,900);
  const reviewProof=await win.webContents.executeJavaScript(`(async()=>{
    const root=document.getElementById('surface'),template=structuredClone(readonlyRows[1]);
    const row=(id,hour,tokens,model,tries)=>({...structuredClone(template),id,time:new Date(Date.UTC(2026,10,9,hour)).toISOString(),model,served:'',prompt:{...structuredClone(template.prompt),tokens},tries});
    const attempt={id:template.order[0].id,model:template.model,done:true,status:200};
    const failed={...attempt,status:429,fail:'rate'},rest={until:'2026-11-09T05:00:00.000Z',why:'rate'};
    historyFixtures['2026-11-09'].routes=[row(7,1,6000,'older-request',[failed,attempt]),row(8,2,9000,'middle-request',[attempt]),row(7,3,12000,'newer-request',[{...failed,rest},{...failed,rest},attempt])];
    root.querySelectorAll('.rr-history-days button')[2].click();await new Promise(r=>setTimeout(r,80));
    const reroutes=root.querySelector('.rr-stats').children[1].querySelector('dd').textContent;
    const older=[...root.querySelectorAll('.rr-request-detail')].find(row=>row.textContent.includes('older-request'));older.click();
    const selected=[...root.querySelectorAll('.rr-request-detail[aria-pressed="true"]')];
    const composite=selected.length===1&&selected[0]===older&&root.querySelector('.ctx-big')?.textContent.startsWith('6K');
    const points=root.querySelectorAll('.ctx-spark .hit');points[points.length-1].dispatchEvent(new MouseEvent('click',{bubbles:true}));
    const spark=Number(root.querySelectorAll('.rr-request-detail[aria-pressed="true"]').length)===1&&root.querySelector('.ctx-big')?.textContent.startsWith('12K')&&root.querySelectorAll('.ctx-spark .at').length===1;
    // Drive between-event animation frames without relying on the display link.
    const originalRAF=window.requestAnimationFrame,originalCancel=window.cancelAnimationFrame,frames=new Map();let frameId=0;
    window.requestAnimationFrame=fn=>{frames.set(++frameId,fn);return frameId;};window.cancelAnimationFrame=id=>frames.delete(id);
    root.querySelector('[data-action="replay"]').click();const start=performance.now();
    for(let i=1;i<=8;i++){const batch=[...frames.values()];frames.clear();for(const fn of batch)fn(start+i*100);}
    const replay=root.querySelector('.rr-replay'),position=Number(replay.querySelector('input').value);
    const progress=!replay.hidden&&position>0&&position<1000;
    replay.querySelector('[data-action="stop"]').click();document.querySelector('.rr-back-live').click();
    window.requestAnimationFrame=originalRAF;window.cancelAnimationFrame=originalCancel;for(const fn of frames.values())originalRAF(fn);
    return {history_composite_selection:composite,history_composite_spark:spark,scoped_reroutes_match_upstream_rest_events:reroutes==='2',incremental_replay_progress:progress,replay_position:position};
  })()`);
  console.log('Review regression proof:',JSON.stringify(reviewProof));
  for(const[name,passed]of Object.entries(reviewProof))if(name!=='replay_position')await win.webContents.executeJavaScript('check('+JSON.stringify(name)+','+JSON.stringify(passed)+')');
  await win.webContents.executeJavaScript(`(()=>{document.querySelector('.rr-back-live').click();pushMagpie(sparkRestore);scrollTo(0,0);})()`);
  await win.webContents.executeJavaScript(`(()=>{pushMagpie(stageRestore);const history=structuredClone(stageRestore),earlier=structuredClone(history.routes[0]);earlier.id=0;earlier.prompt.tokens=6000;earlier.done=true;history.routes.push(earlier);pushMagpie(history);document.querySelector('.ctx-spark .hit').focus();})()`);
  fs.writeFileSync(path.join(evidence,'context-icon-measurements.json'),JSON.stringify(await win.webContents.executeJavaScript('contextIconMeasurements'),null,2)+'\n');
  win.webContents.focus();
  for (const keyCode of ['Enter','Space']) {
    if (keyCode==='Space') await win.webContents.executeJavaScript(`(()=>{document.querySelector('.rr-back-live').click();document.querySelector('.ctx-spark .hit').focus();})()`);
    win.webContents.sendInputEvent({type:'keyDown',keyCode});
    win.webContents.sendInputEvent({type:'keyUp',keyCode});
    await win.webContents.executeJavaScript(`new Promise(r=>setTimeout(r,30))`);
    await win.webContents.executeJavaScript(`check('context-history-${keyCode}-selects-request',document.querySelector('.ctx-crumbs').textContent.includes('#0'))`);
  }
  await win.webContents.executeJavaScript(`document.querySelector('.rr-back-live').click();pushMagpie(sparkRestore)`);
  await win.webContents.executeJavaScript('new Promise(r=>setTimeout(r,150))');
  fs.writeFileSync(path.join(evidence, 'page-fixture.png'), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`(async()=>{
    page.dispose();const root=document.getElementById('surface'),header=document.getElementById('header-actions');root.replaceChildren();header.replaceChildren();
    for(const surface of ['notch','edgeDock']){
      const view=magpie.mount(root,{surface,visible:true,headerActions:header,nativeData:{appearance:{reduceMotion:'on'}}});await new Promise(r=>setTimeout(r,40));
      check('dsh-'+surface+'-whale',root.querySelector('.rr-source [data-brand="deepseek-color"] img')?.getAttribute('src').endsWith('deepseek-color.svg'));
      check('magpie-'+surface+'-mounts-with-shared-header',root.children.length>0&&header.children.length>0);view.dispose();root.replaceChildren();header.replaceChildren();
    }
    document.documentElement.dataset.reduceMotion='off';
    root.style.cssText='width:640px;height:190px;transform-origin:top left;transform:scale(.4)';
    const flightContext={surface:'notch',visible:true,headerActions:header,nativeData:{appearance:{reduceMotion:'off'}}};
    const waitLayout=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(resolve,40))));
    let flying=magpie.mount(root,flightContext);
    await waitLayout();
    const measure=()=>{
      const stage=root.querySelector('.rr-stage'),sky=root.querySelector('.rr-sky'),bird=root.querySelector('.rr-flier'),matrix=bird?.getScreenCTM();
      const wires=root.querySelector('.rr-wires'),bridge=wires.querySelector('.rr-bridge'),start=bridge.getPointAtLength(0).matrixTransform(wires.getScreenCTM()),hub=root.querySelector('.rr-hub').getBoundingClientRect();
      return {layoutWidth:stage.clientWidth,viewBoxWidth:sky.viewBox.baseVal.width,birdScale:matrix?Math.hypot(matrix.a,matrix.b):null,wireAlignmentError:Math.hypot(start.x-hub.left,start.y-hub.top-hub.height/2)};
    };
    const opening=measure();
    root.style.transform='none';await waitLayout();const opened=measure();
    // Repeat the selected page's close/reopen visibility path without changing layout size.
    flying.update({...flightContext,visible:false});root.style.transform='scale(.4)';
    flying.update(flightContext);await waitLayout();root.style.transform='none';await waitLayout();const reopened=measure();
    flying.dispose();root.replaceChildren();header.replaceChildren();
    // Switching from another page mounts after the shell is already fully open.
    flying=magpie.mount(root,flightContext);await waitLayout();const switched=measure();
    flying.dispose();root.replaceChildren();header.replaceChildren();
    root.style.zoom='1.25';root.style.transform='scale(.4)';
    flying=magpie.mount(root,flightContext);await waitLayout();root.style.transform='none';await waitLayout();const zoomed=measure();
    window.flightMeasurements={opening,opened,reopened,switched,zoomed};
    flying.dispose();root.replaceChildren();header.replaceChildren();root.style.cssText='';
    magpie.dispose();
  })()`);
  const flight = await win.webContents.executeJavaScript('flightMeasurements');
  fs.writeFileSync(path.join(evidence, 'flight-measurements.json'), JSON.stringify(flight, null, 2)+'\n');
  for (const [name, value] of Object.entries(flight)) {
    assert.ok(Math.abs(value.layoutWidth-value.viewBoxWidth)<1, `${name}: SVG must use untransformed layout dimensions`);
    const expected=name==='opening'?.4:name==='zoomed'?1.25:1;
    assert.ok(Math.abs(value.birdScale-expected)<.01, `${name}: bird must track the host scale, got ${value.birdScale}`);
    assert.ok(value.wireAlignmentError<1, `${name}: wires must remain aligned with the route nodes`);
  }
  const result = await win.webContents.executeJavaScript(`(()=>{panel.dispose();check('plugin-disposes-content',!document.querySelector('#surface .rr-root'));return checks})()`);
  assert.deepEqual(errors, []); assert.ok(result.length >= checks.length);
  fs.writeFileSync(path.join(evidence, 'ui-checks.json'), JSON.stringify({ checks: result, flightChecks: Object.keys(flight).length*3, flight, syntheticData: true, errors }, null, 2) + '\n');
  console.log(JSON.stringify({ checks: result.length, flightChecks: Object.keys(flight).length*3, status: 'passed', screenshots: '_local/verification', privateEvidence: '_local/verification' }));
  win.destroy();app.quit();
}).catch(error => { console.error(error); app.exit(1); });
