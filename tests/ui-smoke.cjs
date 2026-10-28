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
  const row = { id: 1, session: 'synthetic-session', agent: 't3-code', model: 'gpt-6.1-sol', provider: 'codex', time: new Date().toISOString(), phase: 'upstream', done: false,
    order: [{ id: 'demo-a', provider: 'codex', name: 'demo-a@example.test', model: 'gpt-6.1-sol', used: 42, rank: 1 }, { id: 'demo-b', provider: 'codex', name: 'demo-b@example.test', model: 'gpt-6.1-sol', used: 18, rank: 2 }],
    tries: [{ id: 'demo-a', model: 'gpt-6.1-sol', done: false }],
    prompt: { tokens: 12000, window: 128000, turns: 3, parts: [{ kind: 'system', tokens: 2000, items: [] }, { kind: 'tools', tokens: 1000, items: [] }, { kind: 'files', tokens: 4000, items: [{ name: 'demo.ts', tokens: 4000 }] }, { kind: 'results', tokens: 2000, items: [] }, { kind: 'chat', tokens: 3000, items: [] }] } };
  const projected = gateway.trace({ object: 'trace', pid: 1, seq: 1, ids: [1], routes: [row], totals: { requests: 12, rerouted: 1, errors: 0 } });
  const magpie = { connection: 'online', endpoint: '127.0.0.1:3425', version: 'synthetic fixture', updatedAt: Date.now(), routes: projected.routes,
    totals: projected.totals, lifted: {}, active: [{ id: 1, route: 1, agent: 't3-code', model: 'gpt-6.1-sol', phase: 'upstream', ms: 1000 }], activityAvailable: true, maskAccounts: true };
  await win.webContents.executeJavaScript(`(async()=>{
    document.getElementById('settings').classList.add('hidden');document.getElementById('title').textContent='Magpie 路由 · 合成資料';
    const root=document.getElementById('surface'),header=document.getElementById('header-actions');
    const css=${JSON.stringify(manifests['magpie-routes'].css)};for(const file of css){const link=document.createElement('link');link.rel='stylesheet';link.href='tm-plugin://magpie-routes/'+file;document.head.append(link)}
    const plugin=await import('tm-plugin://magpie-routes/ui.mjs');
    const ctx={asset:name=>'tm-plugin://magpie-routes/'+name,backend:{call:async()=>(${JSON.stringify(magpie)}),subscribe:()=>()=>{}},app:{reportBubbleSize(){}}};
    window.magpie=await plugin.activate(ctx);
    let missing=false;try{magpie.mount(root,{surface:'page',visible:true})}catch(e){missing=/Token Monitor/.test(e.message)}
    check('missing-header-host-reports-clear-requirement',missing);
    window.page=magpie.mount(root,{surface:'page',visible:true,headerActions:header,nativeData:{appearance:{reduceMotion:'on'}}});
    await new Promise(r=>setTimeout(r,150));
    check('magpie-page-renders-real-graph',root.querySelectorAll('svg').length>0&&root.textContent.includes('gpt-6.1-sol'));
    check('magpie-page-uses-header-outlet',header.children.length>0);
  })()`);
  await win.webContents.executeJavaScript('new Promise(r=>setTimeout(r,150))');
  fs.writeFileSync(path.join(evidence, 'page-fixture.png'), (await win.webContents.capturePage()).toPNG());
  await win.webContents.executeJavaScript(`(async()=>{
    page.dispose();const root=document.getElementById('surface'),header=document.getElementById('header-actions');root.replaceChildren();header.replaceChildren();
    for(const surface of ['notch','edgeDock']){
      const view=magpie.mount(root,{surface,visible:true,headerActions:header,nativeData:{appearance:{reduceMotion:'on'}}});await new Promise(r=>setTimeout(r,40));
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
