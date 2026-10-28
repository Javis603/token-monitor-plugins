import { svg } from './graphics.mjs';
import { FLIER } from './flier.mjs';
import { agentHue, seatKey, tried } from './model.mjs';

// Magpie play/fly/pose/home, adapted to keyed Token Monitor surface nodes.
// The original artwork, constant-distance flight, return flip, ±24° tilt,
// timings and request/hold/reply/failover choreography are retained. MIT.
export function wireLayer(root, sources, hub, targets, finished) {
  const wires = svg('svg', { class: 'rr-wires', 'aria-hidden': 'true' });
  const sky = svg('svg', { class: 'rr-sky', 'aria-hidden': 'true' });
  root.prepend(wires); root.append(sky);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const plays = new Map(), seen = new Set(), sourcePaths = new Map(), seatPaths = new Map();
  let value, frame = 0, layoutFrame = 0, disposed = false, bridge;
  const allowed = () => value?.visible && value.follow && !value.reduced && !reduced.matches && value.data.connection === 'online';
  const routeNow = id => value.filtered.find(route => route.id === id);
  const failed = attempt => attempt.status >= 400 || attempt.error || attempt.fail;
  function bird() {
    const node = svg('g', { class: 'rr-flier' }); node.innerHTML = FLIER; sky.append(node); return node;
  }
  function away(play) {
    if (!play.bird) return;
    const node = play.bird; play.bird = null; node.classList.add('away');
    node.querySelector('.rt-lift').animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: 'translate(14px,-16px) scale(.8)', opacity: 0 }], { duration: 450, fill: 'forwards' }).finished.then(() => node.remove()).catch(() => node.remove());
  }
  function clear() {
    cancelAnimationFrame(frame); frame = 0;
    plays.clear(); sky.replaceChildren();
  }
  function finish(play) {
    away(play); play.dot.remove(); plays.delete(play.id); seen.add(play.id);
    queueMicrotask(() => { if (!disposed) finished(); });
  }
  function legsFor(play) {
    const source = sourcePaths.get(play.agent), target = seatPaths.get(play.seat);
    if (play.phase === 'inbound') return source ? [{ p: source }] : [];
    if (!target || !source) return [];
    if (play.phase === 'outbound') return play.fromHub ? [{ p: bridge }, { p: target }] : [{ p: source }, { p: bridge }, { p: target }];
    if (play.phase === 'failover') return [{ p: target, rev: true }];
    if (play.phase === 'return') return [{ p: target, rev: true }, { p: bridge, rev: true }, { p: source, rev: true }];
    if (play.phase === 'held') return [{ p: target }];
    return source ? [{ p: source }] : [];
  }
  function pose(play, progress) {
    const legs = legsFor(play).map(leg => ({ ...leg, length: Number(leg.p.dataset.length) }));
    if (!legs.length) { play.dot.setAttribute('visibility', 'hidden'); if (play.bird) play.bird.style.visibility = 'hidden'; return; }
    const total = legs.reduce((sum, leg) => sum + leg.length, 0);
    const point = distance => {
      let remaining = Math.max(0, Math.min(total, distance));
      for (let i = 0; i < legs.length; i++) {
        const leg = legs[i];
        if (remaining <= leg.length || i === legs.length - 1) return leg.p.getPointAtLength(leg.rev ? leg.length - remaining : remaining);
        remaining -= leg.length;
      }
    };
    const distance = progress * total, p = point(distance);
    play.dot.setAttribute('visibility', 'visible'); play.dot.setAttribute('cx', p.x); play.dot.setAttribute('cy', p.y);
    if (!play.bird) return;
    const a = point(distance - 3), b = point(distance + 3); let vx = b.x - a.x, vy = b.y - a.y;
    if (Math.abs(vx) + Math.abs(vy) < .01) { vx = play.vx ?? (legs[0].rev ? -1 : 1); vy = 0; }
    play.vx = vx;
    const flip = vx < 0, aim = Math.max(-24, Math.min(24, Math.atan2(vy, Math.abs(vx)) * 180 / Math.PI));
    play.angle = play.angle === undefined || play.flip !== flip ? aim : play.angle + (aim - play.angle) * .12;
    play.flip = flip;
    const scale = root.classList.contains('rr-stage-small') ? .67 : 1;
    play.bird.style.visibility = '';
    play.bird.setAttribute('transform', `translate(${p.x} ${p.y}) scale(${flip ? -scale : scale} ${scale}) rotate(${play.angle})`);
  }
  function start(play, phase, ms) {
    play.phase = phase; play.started = performance.now(); play.ms = ms;
    play.dot.classList.toggle('held', phase === 'held' || phase === 'hub');
    play.dot.dataset.phase = phase;
    if (ms && !play.bird) play.bird = bird();
    pose(play, ms ? 0 : 1); kick();
  }
  function outbound(play, route, fromHub) {
    play.seat = seatKey(tried(route, route.tries[play.index])); play.fromHub = fromHub;
    play.dot.classList.remove('back', 'err'); start(play, 'outbound', fromHub ? 900 : 1400);
  }
  function advance(play) {
    const route = routeNow(play.id);
    if (!route) { finish(play); return; }
    if (play.phase === 'inbound') { away(play); start(play, 'hub', 0); }
    else if (play.phase === 'outbound') { away(play); start(play, 'held', 0); }
    else if (play.phase === 'failover') { away(play); play.index++; start(play, 'hub', 0); }
    else if (play.phase === 'return') { finish(play); return; }
    if (play.phase === 'hub') {
      if (route.tries[play.index]) outbound(play, route, true);
      else if (route.done) finish(play);
    } else if (play.phase === 'held') {
      const attempt = route.tries[play.index];
      if (!attempt?.done) return;
      if (!failed(attempt) && !route.done) return;
      play.dot.classList.add('back'); play.dot.classList.toggle('err', Boolean(failed(attempt)));
      const retry = failed(attempt) && (route.tries[play.index + 1] || attempt.rest || attempt.credits || attempt.again && !attempt.gone);
      start(play, retry ? 'failover' : 'return', retry ? 620 : failed(attempt) ? 1350 : 1400);
    }
  }
  function tick(now) {
    frame = 0;
    for (const play of [...plays.values()]) if (play.ms) {
      const progress = Math.min(1, (now - play.started) / play.ms); pose(play, progress);
      if (progress === 1) { play.ms = 0; advance(play); }
    }
    kick();
  }
  function kick() { if (!frame && allowed() && [...plays.values()].some(play => play.ms)) frame = requestAnimationFrame(tick); }
  function draw() {
    layoutFrame = 0; if (disposed || !value?.visible) return;
    const width = root.clientWidth, height = root.clientHeight; if (!width || !height) return;
    // Notch scales its panel while opening. Keep SVG units in layout pixels:
    // a screen-space viewBox would retain that temporary scale and enlarge birds.
    for (const layer of [wires, sky]) layer.setAttribute('viewBox', `0 0 ${width} ${height}`);
    const screenToLocal = wires.getScreenCTM().inverse();
    const localPoint = (x, y) => new DOMPoint(x, y).matrixTransform(screenToLocal);
    const point = (node, right) => { const r = node.getBoundingClientRect();
      const list = node.closest('.rr-seats'), lr = list?.getBoundingClientRect();
      return localPoint(r.x + (right ? r.width : 0), lr ? Math.max(lr.top + 3, Math.min(lr.bottom - 3, r.y + r.height / 2)) : r.y + r.height / 2);
    };
    const curve = (a,b) => `M${a.x} ${a.y}C${(a.x+b.x)/2} ${a.y} ${(a.x+b.x)/2} ${b.y} ${b.x} ${b.y}`;
    const addPath = (d,cls = '') => { const p = svg('path', { d, class: cls }); wires.append(p); p.dataset.length = p.getTotalLength(); return p; };
    const add = (a,b,cls = '') => addPath(curve(a,b),cls);
    wires.replaceChildren(); sourcePaths.clear(); seatPaths.clear();
    const dock = root.closest('.rr-dock')||root.classList.contains('rr-narrow'), hr = hub.getBoundingClientRect();
    const left = point(hub,false), right = dock ? localPoint(hr.x+hr.width/2,hr.bottom) : point(hub,true);
    bridge = add(left,right,'rr-bridge');
    for (const node of sources()) {
      const path = add(point(node,true),left,node.dataset.live === 'true' ? 'live' : '');
      path.style.setProperty('--rr-agent', agentHue(node.dataset.agent));
      sourcePaths.set(node.dataset.agent,path);
    }
    for (const node of targets()) {
      const end = point(node,false), cls = node.dataset.tone === 'working' ? 'live' : node.dataset.selected === 'true' ? 'lit' : node.dataset.tone === 'resting' ? 'rest' : '';
      // Dock wires turn into the list's left gutter. They never cross account
      // names/meters as the horizontal Notch paths would at this narrow width.
      const d = dock ? `M${right.x} ${right.y}C${right.x} ${right.y+14} ${end.x-12} ${right.y+14} ${end.x-12} ${right.y+28}L${end.x-12} ${end.y-6}Q${end.x-12} ${end.y} ${end.x} ${end.y}` : curve(right,end);
      const path = addPath(d,cls);
      path.style.setProperty('--rr-agent', node.style.getPropertyValue('--rr-agent') || agentHue());
      seatPaths.set(node.dataset.seat,path);
    }
    if (!allowed()) return;
    for (const route of value.staged) {
      if (route.done || seen.has(route.id) || plays.has(route.id) || !sourcePaths.has(route.agent)) continue;
      const dot = svg('circle',{r:root.classList.contains('rr-stage-small') ? 3 : 4.5,class:'rr-packet'});
      dot.style.setProperty('--rr-agent', agentHue(route.agent)); sky.append(dot);
      const play = {id:route.id,agent:route.agent,index:0,dot,bird:null}; plays.set(route.id,play);
      if (route.tries.length) outbound(play,route,false); else start(play,'inbound',620);
    }
    for (const play of [...plays.values()]) {
      if (!play.ms) { pose(play,1); advance(play); }
    }
    kick();
  }
  function schedule() { if (!layoutFrame) layoutFrame = requestAnimationFrame(draw); }
  const observer = new ResizeObserver(schedule); observer.observe(root);
  const scroll = () => schedule(); root.addEventListener('scroll',scroll,true);
  const motionChanged = () => { if (!allowed()) clear(); else schedule(); };
  reduced.addEventListener('change',motionChanged);
  return {
    playing: () => new Set(plays.keys()),
    update(next) {
      if (value && (value.data.processId !== next.data.processId || value.filter !== next.filter || value.follow !== next.follow)) { clear(); seen.clear(); }
      value = next;
      const ids = new Set(next.filtered.map(route => route.id)); for (const id of seen) if (!ids.has(id)) seen.delete(id);
      for (const route of next.filtered) if (route.done && !plays.has(route.id)) seen.add(route.id);
      root.classList.toggle('rr-paused',!allowed()); if (!allowed()) clear(); schedule();
    },
    dispose() { disposed = true; clear(); cancelAnimationFrame(layoutFrame); observer.disconnect(); root.removeEventListener('scroll',scroll,true); reduced.removeEventListener('change',motionChanged); }
  };
}
