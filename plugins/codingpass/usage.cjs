'use strict';
// Pure parsing of the codingpass.ai console RPC responses into Token Monitor
// quota windows. No network or host access here, so it can be unit tested.
//
// Field names come from the console bundle (OverviewData island):
//   usage.quota   { used5hMicro, limit5hMicro, usedWeekMicro, limitWeekMicro,
//                   usedMicro, limitMicro, monthStart, monthEnd }
//   usage.live    { window5hStartAt, global: [{ layer, usedMicro, limitMicro, resetAt }] }
//   usage.subscription { status, planName, planCode, periodEnd, quotaResetCredits, ... }
//   wallet        { balanceMicro, monthSpentMicro, rateBps, paygEnabled }
// All money values are USD micro-units (1 USD = 1e6), formatted by the site as
// `$${(micro / 1e6).toFixed(2)}`. A null limit means the window has no cap.

const MICRO = 1e6;

const TEXT = {
  en: {
    noCap: 'No cap', idle: '5-hour window not started', used: 'Used', cap: 'Cap', left: 'Left',
    wallet: 'PAYG wallet', walletMonth: 'Spent this month', payg: 'Pay-as-you-go', on: 'On', off: 'Off',
    renews: 'Plan period ends', resets: 'Allowance resets available', resetsValue: 'Full {month} · Weekly {week}',
    noPlan: 'No active CodingPass plan', pending: 'Plan activation pending',
    window5h: '5-hour', windowWeek: 'Weekly', windowMonth: 'Monthly'
  },
  'zh-CN': {
    noCap: '不限额', idle: '5 小时窗口尚未开始', used: '已用', cap: '上限', left: '剩余',
    wallet: '按量钱包余额', walletMonth: '本月按量消费', payg: '按量计费', on: '开启', off: '关闭',
    renews: '本期结束', resets: '可用额度重置次数', resetsValue: '完整 {month} · 每周 {week}',
    noPlan: '当前没有生效的 CodingPass 套餐', pending: '套餐正在开通中',
    window5h: '5 小时', windowWeek: '每周', windowMonth: '每月'
  },
  'zh-TW': {
    noCap: '不限額', idle: '5 小時視窗尚未開始', used: '已用', cap: '上限', left: '剩餘',
    wallet: '按量錢包餘額', walletMonth: '本月按量消費', payg: '按量計費', on: '開啟', off: '關閉',
    renews: '本期結束', resets: '可用額度重設次數', resetsValue: '完整 {month} · 每週 {week}',
    noPlan: '目前沒有生效的 CodingPass 方案', pending: '方案正在開通中',
    window5h: '5 小時', windowWeek: '每週', windowMonth: '每月'
  }
};

function resolveLocale(value) {
  const tag = String(value || '').toLowerCase();
  if (tag.startsWith('zh')) return /(tw|hk|mo|hant)/.test(tag) ? 'zh-TW' : 'zh-CN';
  return 'en';
}

function t(locale, key, vars) {
  let text = (TEXT[locale] || TEXT.en)[key] ?? TEXT.en[key];
  for (const [name, value] of Object.entries(vars || {})) text = text.replace(`{${name}}`, String(value));
  return text;
}

// oRPC may serialize BigInt/number as string; accept both, reject garbage.
function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

function iso(value) {
  if (value === null || value === undefined || value === '') return null;
  const time = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

const usd = micro => Math.round(micro / MICRO * 100) / 100;
const money = micro => ({ amount: usd(micro), currency: 'USD' });

// oRPC wraps successful payloads as { json, meta }. Accept a bare payload too.
function unwrapRpc(body) {
  const parsed = typeof body === 'string' ? JSON.parse(body) : body;
  if (parsed && typeof parsed === 'object' && Object.hasOwn(parsed, 'json')) return parsed.json;
  return parsed;
}

function buildWindow({ kind, label, usedMicro, limitMicro, resetsAt, span, locale }) {
  const used = Math.max(0, usedMicro ?? 0);
  return {
    kind, label, used: usd(used), limit: usd(limitMicro), currency: 'USD',
    ...(resetsAt ? { resetsAt, boundaryKind: 'reset' } : {}),
    span,
    infoRows: [
      { label: t(locale, 'used'), value: money(used) },
      { label: t(locale, 'cap'), value: money(limitMicro) },
      { label: t(locale, 'left'), value: money(Math.max(0, limitMicro - used)) }
    ]
  };
}

function parseUsage(usage, wallet, { locale = 'en' } = {}) {
  if (!usage || typeof usage !== 'object') throw Error('invalid-usage-response');
  const quota = usage.quota ?? null;
  const live = usage.live ?? null;
  const subscription = usage.subscription ?? null;
  const layer = name => (Array.isArray(live?.global) ? live.global : []).find(entry => entry?.layer === name) ?? null;
  const g5h = layer('global_5h'), gWeek = layer('global_week'), gMonth = layer('global_month');

  const windows = [];
  const notes = [];
  const uncapped = [];

  if (quota && typeof quota === 'object') {
    const specs = [
      { kind: 'session', label: '5-hour', name: 'window5h', used: num(g5h?.usedMicro) ?? num(quota.used5hMicro),
        limit: num(quota.limit5hMicro) ?? num(g5h?.limitMicro),
        // The 5-hour window only has a reset time once a request has started it.
        reset: live?.window5hStartAt && g5h ? iso(g5h.resetAt) : null, idle: Boolean(live) && !live.window5hStartAt },
      { kind: 'weekly', label: 'Weekly', name: 'windowWeek', used: num(gWeek?.usedMicro) ?? num(quota.usedWeekMicro),
        limit: num(quota.limitWeekMicro) ?? num(gWeek?.limitMicro), reset: iso(gWeek?.resetAt) },
      { kind: 'billing', label: 'Monthly', name: 'windowMonth', used: num(gMonth?.usedMicro) ?? num(quota.usedMicro),
        limit: num(quota.limitMicro) ?? num(gMonth?.limitMicro), reset: iso(gMonth?.resetAt) ?? iso(quota.monthEnd) }
    ];
    const capped = specs.filter(spec => spec.limit !== null && spec.limit > 0);
    for (const spec of specs) {
      if (!(spec.limit !== null && spec.limit > 0)) { uncapped.push(spec); continue; }
      // Two short windows share a row; the monthly allowance takes a full row.
      const span = spec.kind === 'billing' || capped.length === 1 ? 2 : 1;
      const window = buildWindow({ kind: spec.kind, label: spec.label, usedMicro: spec.used, limitMicro: spec.limit, resetsAt: spec.reset, span, locale });
      if (spec.idle && spec.kind === 'session') window.infoRows.push({ label: t(locale, 'idle'), value: '—' });
      windows.push(window);
    }
  }
  for (const spec of uncapped) notes.push({ label: t(locale, spec.name), value: t(locale, 'noCap') });

  if (!subscription) notes.push({ label: t(locale, quota ? 'pending' : 'noPlan') });
  else {
    const periodEnd = iso(subscription.periodEnd);
    if (periodEnd) notes.push({ label: t(locale, 'renews'), value: periodEnd.slice(0, 10) });
    const month = num(subscription.quotaResetCredits) ?? 0, week = num(subscription.quotaResetWeekCredits) ?? 0;
    if (month > 0 || week > 0) notes.push({ label: t(locale, 'resets'), value: t(locale, 'resetsValue', { month, week }) });
  }

  if (wallet && typeof wallet === 'object') {
    const balance = num(wallet.balanceMicro);
    if (balance !== null) {
      // Same conversion as the console's wallet display (rate in basis points).
      const rateBps = num(wallet.rateBps);
      const factor = rateBps !== null && rateBps > 0 ? Math.round(MICRO / rateBps) / 100 : 1;
      const display = micro => factor === 1 ? micro : Math.round(micro * factor);
      const infoRows = [];
      const spent = num(wallet.monthSpentMicro);
      if (spent !== null) infoRows.push({ label: t(locale, 'walletMonth'), value: money(display(spent)) });
      if (typeof wallet.paygEnabled === 'boolean') infoRows.push({ label: t(locale, 'payg'), value: t(locale, wallet.paygEnabled ? 'on' : 'off') });
      notes.push({ label: t(locale, 'wallet'), value: money(display(balance)), ...(infoRows.length ? { infoRows } : {}) });
    }
  }

  const planName = typeof subscription?.planName === 'string' && subscription.planName.trim()
    ? subscription.planName.trim().slice(0, 80) : undefined;
  return { status: 'ok', windows, ...(planName ? { plan: planName } : {}), ...(notes.length ? { notes: notes.slice(0, 8) } : {}) };
}

// Accept what users typically copy from DevTools: the raw value, a
// "Cookie: ..." line, or several lines / name=value pairs.
function normalizeCookie(raw) {
  let text = String(raw ?? '').trim().replace(/^cookie\s*:\s*/i, '');
  const parts = text.split(/[\r\n;]+/).map(part => part.trim()).filter(Boolean);
  text = parts.join('; ');
  if (!text || /[\x00-\x1f\x7f]/.test(text) || !parts.every(part => /^[^=\s]+=/.test(part))) return null;
  return text;
}

module.exports = { parseUsage, unwrapRpc, normalizeCookie, resolveLocale, t };
