import {l, locale} from './i18n.mjs';
export const agents = { codex: 'Codex', claude: 'Claude Code', 'claude-code': 'Claude Code', 't3-code': 'T3 Code', t3code: 'T3 Code', t3: 'T3 Code' };
// Magpie client.js hueOf: a known agent keeps its colour; anything else takes
// a spare that is never red, so a failure stays distinct from "in flight".
const hues = { claude: '#d97757', 'claude-code': '#d97757', codex: '#6366f1', gemini: '#0ea5e9', copilot: '#a855f7', cursor: '#14b8a6', opencode: '#eab308', crush: '#ec4899', goose: '#84cc16', pi: '#10b981', omp: '#d946ef', omo: '#7c3aed', dsh: '#06b6d4', commandcode: '#f97316', mimocode: '#3b82f6', deveco: '#3c99cc' };
const spare = ['#8b5cf6', '#22c55e', '#0d9488', '#0891b2', '#ca8a04', '#db2777', '#2563eb', '#65a30d'];
export function agentHue(id) {
  if (hues[id]) return hues[id];
  let hash = 0;
  for (const char of String(id || '')) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return spare[hash % spare.length];
}
export const agentName = id => agents[id] || id || l("未辨識 Agent");
export const routingName = value => ({ rotate: l("輪流"), order: l("依序"), usage: l("較少用量優先"), pace: l("按剩餘配額"), weight: l("按權重"), free: l("免費優先") }[value] || l("智慧路由"));
export const phaseName = value => ({ slot: l("等待空位"), rpm: l("等待速率限制"), upstream: l("等待上游"), redact: l("遮蔽敏感資料"), routing: l("路由中") }[value] || l("處理中"));
export const reasonName = value => ({ quota: l("額度用盡"), rate: l("速率限制"), 'rate-limit': l("速率限制"), credit: l("餘額不足"), credits: l("餘額不足"), restricted: l("帳號受限制"), auth: l("驗證失敗"), busy: l("上游繁忙") }[value] || value);
export function routeStatus(route) {
  if (!route.done) return { tone: 'working', label: l("回應中") };
  if (route.error || route.status >= 400) return { tone: 'failed', label: l("失敗") };
  return { tone: 'done', label: l("已完成") };
}
export function candidateState(candidate, route, lifted = {}) {
  const attempts = route.tries.filter(item => seatKey(tried(route,item)) === seatKey(candidate));
  const last = attempts.at(-1);
  const liveRest = value => value && Date.parse(value.until) > Date.now() && !(value.key && Date.parse(lifted[value.key]) >= Date.parse(route.time));
  if (last) {
    if (!last.done) return { tone: 'working', label: l("回應中"), selected: true, attempts };
    if (last.status >= 400 || last.error || last.fail) return { tone: 'failed', label: reasonName(last.fail) || `HTTP ${last.status || route.status}`, selected: false, attempts };
    return { tone: 'done', label: l("回答了這個請求"), selected: true, attempts };
  }
  if (candidate.held || candidate.barred) return { tone: 'resting', label: candidate.held ? l("此請求不可使用") : l("未開放此模型"), attempts };
  if (candidate.capped) return { tone: 'resting', label: l("達到使用上限"), attempts };
  if (candidate.window) return { tone: 'resting', label: l("請求超出 {p0} context window",{p0:(candidate.window.toLocaleString(locale()))}), attempts };
  if (candidate.noCredits) return { tone: 'resting', label: l("額度用盡，未啟用 credits"), attempts };
  if (liveRest(candidate.rest)) return { tone: 'resting', label: reasonName(candidate.rest.why || candidate.rest.kind) || l("暫時休息"), until: candidate.rest.until, attempts };
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
  const sorted = [...routes].sort((a,b) => a.id-b.id), last = new Map();
  for (const route of sorted) last.set(route.agent,route);
  const out = sorted.filter(route => !route.done || playing.has(route.id)
    || last.get(route.agent) === route && Date.parse(route.time)+(route.ms||0)>now-12000);
  if (!out.includes(current)) out.push(current);
  const agents = [...new Set(out.map(route => route.agent))].slice(-4);
  return out.filter(route => agents.includes(route.agent));
}
export function stageSeats(routes) {
  const seats = new Map();
  for (const route of routes) {
    for (const candidate of [...route.order,...(route.left||[]).filter(row=>!row.held&&(row.capped||row.noCredits||row.window))]) {
      const key = seatKey(candidate); seats.set(key,{key,candidate,route});
    }
  }
  return [...seats.values()].sort((a,b) => (a.candidate.fallback?1:0)-(b.candidate.fallback?1:0)
    || (a.candidate.provider||'').localeCompare(b.candidate.provider||'')
    || (a.candidate.model||'').localeCompare(b.candidate.model||'')
    || (a.candidate.rank||0)-(b.candidate.rank||0)
    || a.key.localeCompare(b.key));
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
