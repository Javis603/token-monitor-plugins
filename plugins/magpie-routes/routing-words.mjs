import {t,locale} from './i18n.mjs';
// Adapted verbatim from yetone/magpie f2b4b989 (MIT); see SOURCE-NOTICE.md.
import {agentName,tried} from './model.mjs';
import {took,timeSaid} from './timing.mjs';

export const routingText=t;
const now=()=>Date.now(),intlLang=locale,ctxShort=n=>n>=1000?Math.round(n/1000)+'k':String(n);
// Custom JS routing descriptions require Magpie's GUI settings; trace metadata alone has no script registry.
const jsRoutings=()=>[];
export function sourceWords(route,displayName){
 const userShown=(_provider,name)=>displayName(name),whoShown=w=>displayName(w.who)||w.name||w.id;
const REQUEST_KINDS = {
  "agent_job": {
    "purpose": "kind:collab_spawn",
    "name": "Subagent"
  },
  "ambient_suggestion_safety": {
    "purpose": "kind:ambient_suggestions",
    "name": "Suggestions"
  },
  "ambient_suggestions": {
    "purpose": "kind:ambient_suggestions",
    "name": "Suggestions"
  },
  "api_detect": {
    "purpose": "kind:api_detect",
    "name": "Detect APIs"
  },
  "auto_review": {
    "purpose": "kind:guardian",
    "name": "Approval check"
  },
  "collab_spawn": {
    "purpose": "kind:collab_spawn",
    "name": "Subagent"
  },
  "compact": {
    "purpose": "kind:compact",
    "name": "Compaction"
  },
  "composer_predictions": {
    "purpose": "kind:composer_predictions",
    "name": "Prediction"
  },
  "guardian": {
    "purpose": "kind:guardian",
    "name": "Approval check"
  },
  "guardian_review": {
    "purpose": "kind:guardian",
    "name": "Approval check"
  },
  "luna_reserve": {
    "purpose": "kind:luna_reserve",
    "name": "Luna Reserve"
  },
  "memgen": {
    "purpose": "kind:memory_consolidation",
    "name": "Memory"
  },
  "memory": {
    "purpose": "kind:memory_consolidation",
    "name": "Memory"
  },
  "memory_consolidation": {
    "purpose": "kind:memory_consolidation",
    "name": "Memory"
  },
  "model_list": {
    "purpose": "kind:model_list",
    "name": "Model list"
  },
  "provider_test": {
    "purpose": "kind:provider_test",
    "name": "Test"
  },
  "review": {
    "purpose": "kind:review",
    "name": "Review"
  },
  "routing": {
    "purpose": "kind:routing",
    "name": "Routing classifier"
  },
  "thread_description": {
    "purpose": "kind:thread_description",
    "name": "Description"
  },
  "thread_spawn": {
    "purpose": "kind:collab_spawn",
    "name": "Subagent"
  },
  "thread_title": {
    "purpose": "kind:thread_title",
    "name": "Title"
  },
  "thread_title_reconsideration": {
    "purpose": "kind:thread_title",
    "name": "Title"
  },
  "title": {
    "purpose": "kind:thread_title",
    "name": "Title"
  },
  "title_generation": {
    "purpose": "kind:thread_title",
    "name": "Title"
  },
  "vision": {
    "purpose": "kind:vision",
    "name": "Image description"
  },
  "web_search": {
    "purpose": "kind:web_search",
    "name": "Web search"
  }
};

const atOf = new Map();

const at = (s) => {
    if (typeof s !== "string") return new Date(s).getTime();
    let v = atOf.get(s);
    if (v === undefined) {
      if (atOf.size > 50000) atOf.clear();
      atOf.set(s, v = new Date(s).getTime());
    }
    return v;
  };

const known0 = (s) => s && !s.startsWith("0001-");

function dur(ms) {
    const s = Math.max(1, Math.round(ms / 1000));
    if (s < 60) return t("{n} s", { n: s });
    const m = Math.round(s / 60);
    if (m < 60) return t("{n} min", { n: m });
    const h = Math.floor(m / 60), mm = m % 60;
    if (h < 10 && mm) return t("{h} h {m} min", { h, m: mm });
    if (h < 48) return t("{n} h", { n: Math.round(m / 60) });
    return t("{n} d", { n: Math.round(m / 1440) });
  }

let fmtLang = null, HM, WD;

function clock(s) {
    const d = new Date(s), n = new Date();
    if (fmtLang !== intlLang()) {
      fmtLang = intlLang();
      HM = new Intl.DateTimeFormat(fmtLang, { hour: "2-digit", minute: "2-digit" });
      WD = new Intl.DateTimeFormat(fmtLang, { weekday: "short" });
    }
    const hm = HM.format(d);
    return d.toDateString() === n.toDateString() ? hm : WD.format(d) + " " + hm;
  }

function decodeOf(r, ms, ttft, firstText, flow = r.flow, firstReasoning = r.firstReasoning, reasoningHidden = r.reasoningHidden) {
    if (reasoningHidden && !(firstText > 0)) return null;
    const think = reasoningOf(r), visible = think > 0 && !(firstText > 0) && firstReasoning >= ttft && flow > 0 && think <= r.out;
    const n = think > 0 && !visible ? r.out - think : r.out, from = visible ? firstReasoning : think > 0 ? firstText : ttft;
    const w = ms - from;
    if (!(n > 0 && ttft > 0 && from > 0 && w >= 100 && n * 1000 <= 10000 * w)) return null;
    if (flow > 0 && flow * 4 < w) return null;
    if (think > 0 && firstText > 0 && n * (firstText - ttft) > 20 * think * w) return null;
    return { n, w };
  }

const reasoningOf = (r) => r.reasoning ?? (r.usage?.length ? r.usage[r.usage.length - 1].reasoning || 0 : 0);

const speedOf = (r, ms = r.ms, ttft = r.ttft, firstText = r.firstText, flow = r.flow, firstReasoning = r.firstReasoning, reasoningHidden = r.reasoningHidden) => {
    const d = decodeOf(r, ms, ttft, firstText, flow, firstReasoning, reasoningHidden);
    return d ? d.n / (d.w / 1000) : 0;
  };

function promptOf(r) {
    let prompt = 0, read = 0;
    // Input excludes both cache tiers. Include writes in the denominator,
    // and every billable try, as the request's cost does. Older history
    // without the tiers cannot tell a hit rate, even when it has tokens.
    // A vendor that counts no cache tokens (cache_unknown: Kiro tells
    // credits only) has no hit rate, not 0%.
    for (const u of r.usage || []) {
      if (u.cache_unknown) continue;
      read += u.cache_read || 0;
      prompt += (u.in || 0) + (u.cache_read || 0) + (u.cache_write || 0);
    }
    return { prompt, read };
  }

function firstNote(r, tr) {
    let s = tr.ttft ? " · " + t("first token in {ms}", { ms: took(tr.ttft) }) : "";
    if (tr.ttft && tr.firstText > tr.ttft) s += " · " + t("first text in {ms}", { ms: took(tr.firstText) });
    const v = speedOf(r, tr.ms, tr.ttft, tr.firstText, tr.flow, tr.firstReasoning || 0, tr.reasoningHidden || false);
    if (v) s += " · " + t("{n} tok/s", { n: Math.round(v) });
    const { prompt, read } = promptOf(r);
    if (prompt) s += " · " + t("request cache hit rate {p}", { p: pct(100 * read / prompt) });
    return s;
  }

const tokens = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "k" : String(Math.round(n));

const pct = (n) => Math.round(n) + "%";

const FAIL = { rate: "rate limited", credit: "out of credit", quota: "quota used up", other: "failed", auth: "sign-in required", canceled: "canceled", foreign: "another account's reasoning", floor: "reply too short", verify: "needs verification", refused: "refused (safety filter)", shape: "request not understood", proxy: "proxy not reachable", effort: "reasoning effort not in its plan", overflow: "too long for its model", room: "reply asked past the window left", slow: "slow to start", prompt: "agent's prompt turned away", restricted: "account restricted by the vendor" };

const failWord = (why) => t(FAIL[why] || "failed");

const tryOk = (tr) => tr.status < 400 && !tr.fail;

const API = { anthropic: "Anthropic", chat: "OpenAI", responses: "OpenAI Responses", gemini: "Gemini" };

const MODES = {
    "": ["Smart", "Smart: of the accounts with quota to spare, the one whose allowance renews soonest goes first — what it has left would be lost at the reset. The week decides; an account with five hours and no week goes by its five hours. One at 90% or more waits until the others can't answer; one resting after a failure goes last."],
    order: ["In order", "In order: the first answers everything until it can't; then the next."],
    rotate: ["In turn", "In turn: each conversation's next turn goes to the account after the one that answered its last, and a new conversation starts one further along; the requests within a turn stay put, keeping the prompt cache."],
    usage: ["Least used", "Least used first: the account with the most of its allowance left goes first; a key by the tokens magpie sent it lately."],
    pace: ["Weekly pace", "Weekly pace: the account with the most of its week left per hour until it renews goes first — the one with the most to lose at its reset; an account with five hours and no week by what its five hours have left per hour. One at 90% or more waits until the others can't answer; a key by the tokens magpie sent it lately."],
    manual: ["Manual", "Manual: every request goes to the model picked on the group's card, over its own accounts or keys."],
    // the provider's key routing (#841); both strings as the provider
    // editor's routing options say them (app.js ROUTINGS), so every
    // language is already spoken
    weight: ["By weight", "Requests spread over the keys by the weight set beside each: a key weighing 3 takes three requests for every one a key weighing 1 takes, evenly over a few requests. One that fails is passed over while it rests, and the others share its requests; a conversation stays with its key as Stays says."],
    free: ["Free first", "Requests go to what costs nothing first: the models their vendor serves at no cost to this subscription's allowance or credits, in their listed order, and only when those can't answer to one that spends them. Nothing that cost nothing is left unused."],
    fast: ["Speed first", "Requests go to the one that has answered this model fastest lately, by its time to the first token and how fast it writes; those within a tenth of each other keep their listed order. One not measured lately gets one request in five, so it is measured again, and one that fails is passed over while it rests."],
  };

const modeOf = (r) => MODES[r] || (r && jsRoutings(r).find(([id]) => id === r)?.slice(1, 3)) || MODES[""];

const GROUP_ORDER = "In order: member by member, the first model the group names until it can't answer, each over its own accounts or keys as its provider routes them.";

const GROUP_WEIGHT = "By weight: each model takes its share of the requests by the weight set beside it — one weighing 3 three for every one a model weighing 1 takes, spread out rather than in bursts. One resting after a failure leaves the round and the others share its requests; the next model is the fallback when one fails.";

const KEYS_SMART = "Smart: keys that suit the request go first — one made for the model's own API — then in their order. One resting after a failure goes last.";

const LONE = "Only one account or key is on for this, so routing has nothing to choose between. Turn on a second in the provider's editor, and how it routes is set under Several accounts or keys below.";

const who = (w) => w.kind === "provider" ? w.name : whoShown(w);

const group = (w) => w.used >= 98 ? "spent" : w.used >= 90 ? "low" : "fine";

const renews = (w) => (w.renews || []).map((s) => known0(s) ? at(s) : 0);

const renewsBy = (w) => {
    const rs = known0(w.restarts) ? at(w.restarts) : 0;
    return renews(w).map((x) => rs && (!x || rs < x) ? rs : x);
  };

function cmpRenews(a, b) {
    const ra = renewsBy(a), rb = renewsBy(b), H = 3600e3;
    for (let k = 0; k < ra.length || k < rb.length; k++) {
      const x = ra[k] ? Math.floor(ra[k] / H) : 0, y = rb[k] ? Math.floor(rb[k] / H) : 0;
      if (x === y) continue;
      if (!x || !y) return { c: x ? -1 : 1, k };
      return { c: x < y ? -1 : 1, k };
    }
    return { c: 0, k: -1 };
  }

function restWhen(rest, from = now()) {
    const left = at(rest.until) - from;
    return left < 3600e3 ? t("back in {d}", { d: dur(left) }) : t("back at {time} · in {d}", { time: clock(rest.until), d: dur(left) });
  }

function restHow(rest, from) {
    const d = dur(at(rest.until) - from), time = clock(rest.until);
    switch (rest.by) {
      case "retry-after": return t("It rests {d}, as the vendor's Retry-After says", { d });
      case "credit": return t("It sits out half an hour, until someone tops it up");
      case "window": return t("Its allowance is used up: it rests until that renews, at {time}", { time });
      case "resets": return t("It rests until {time}, when the vendor says the limit resets", { time });
      case "quota": return t("It rests 15 minutes: out of quota, with no word of when it resets");
      // a Codex account that holds credits, refused again once asked
      // again onto them: not benched until its window renews
      case "credits": return t("It holds credits, so it rests only {d} and its usage is read again, not until its allowance renews", { d });
      case "verify": return t("The vendor wants the account verified first: it rests half an hour, or until you say it's verified");
      // its provider set never to rest after an unknown failure
      // (`magpie provider rest-cap <id> off`): asked again next time
      case "off": return t("It doesn't rest: its provider is set to ask it again after an error like this");
      // the vendor restricted the account itself (#1849): only its lifting,
      // which the vendor's appeal asks for, brings it back
      case "restricted": return t("The vendor restricted the account: it rests {d}, as only the vendor lifting the restriction brings it back. Appeal with the vendor; once it's lifted, try it again here", { d });
      case "backoff": return rest.why === "rate"
        ? t("It was rate limited again as soon as it was back ({n} times in a row): it rests {d}, longer each time until it answers", { n: rest.failures, d })
        : rest.failures > 1
        ? t("It has failed {n} times in a row: it rests {d}, longer each time", { n: rest.failures, d })
        : t("It rests {d}, longer if it fails again", { d });
      case "cooldown": return rest.why === "rate"
        ? t("It cools down {d}: the vendor didn't say for how long", { d })
        : t("It rests {d}", { d });
      default: return t("It rests {d}", { d });
    }
  }

const wentOn = (r) => (r.subagent && !r.subagent.kept ? r.subagent.to : r.model);

const placeRouting = (r, x) => {
    const via = x.via || [];
    return via.length ? r.group?.subs?.find((s) => s.id === via[via.length - 1])?.routing || "" : r.group?.routing || "";
  };

const wholeMembers = (r, x) => !!r.group && ["order", "weight"].includes(placeRouting(r, x));

function weighedWith(r, x) {
    const via = (y) => (y.via || []).join(">");
    const whole = wholeMembers(r, x);
    return r.order.filter((y) => !!y.fallback === !!x.fallback && via(y) === via(x)
      && (!(x.fallback || whole) || (y.provider === x.provider && y.model === x.model && (y.fixed || "") === (x.fixed || "") && !!y.fast === !!x.fast)));
  }

function firstWhy(r) {
    const f = r.order[0];
    if (!f) return t("Nothing could take {model}.", { model: r.model });
    const w = who(f);
    if (r.sealedTask && r.leadAccount === f.id) return t("{who} goes first: it answered the parent agent and may be needed to read this encrypted task.", { who: w });
    if (r.compaction && r.order.length === 1) return t("{who} compacted this conversation natively, and only it can read that compaction, so the conversation stays on it: other accounts aren't asked. Start a new conversation to use them.", { who: w });
    if (r.order.length === 1) {
      if (f.rest) return t("{who} is the only one, so it's tried though it is resting.", { who: w });
      return f.kind === "account" ? t("{who} is the only account on for {model} — nothing to choose between.", { who: w, model: wentOn(r) })
        : t("{name} has one key on — nothing to choose between.", { name: f.name });
    }
    if (f.rest) return t("Every one is resting after a failure, so {who}, first in line, is tried all the same.", { who: w });
    if (f.fallback) {
      const name = r.order.find((x) => !x.fallback)?.name || r.provider;
      return t("{name} is resting, so its fallback {fb} goes first.", { name, fb: `${f.provider}/${f.model}` });
    }
    if (wholeMembers(r, f)) {
      // first as the group's member: by its place, or the round's pick;
      // weighed only against its own member's others, if any
      const own = weighedWith(r, f);
      if (own.length > 1) return firstWhy({ ...r, order: own, group: null });
      if (placeRouting(r, f) === "weight") return t("By weight: it's {who}'s share — each model takes requests as the weight set beside it says.", { who: w });
      const ahead = r.order.filter((x) => x !== f && x.rest).map(who);
      return ahead.length
        ? t("In order: with {rested} resting after a failure, {who} is the first that can answer.", { rested: ahead.join(", "), who: w })
        : t("In order: {who} is first, and answers everything while it can.", { who: w });
    }
    const peers = r.order.filter((x) => x !== f && !x.fallback && !x.rest);
    const someKnown = r.order.some((x) => x.known);
    const rested = r.order.filter((x) => x !== f && !x.fallback && x.rest).map(who);
    const restedTo = (s) => rested.length ? t("With {rested} resting after a failure, {who} goes first: ", { rested: rested.join(", "), who: w }) + s : null;
    switch (f.routing) {
      case "order": return rested.length
        ? t("In order: with {rested} resting after a failure, {who} is the first that can answer.", { rested: rested.join(", "), who: w })
        : t("In order: {who} is first, and answers everything while it can.", { who: w });
      case "rotate": return t("In turn: it's {who}'s turn — each request starts one further along.", { who: w });
      case "weight": return t("By weight: it's {who}'s share — each key takes requests as its weight says.", { who: w });
      case "free":
        if (f.free) return restedTo(t("it costs nothing there, so it's spent first."))
          || t("Free first: {model} costs nothing on {who}, so it's tried before any that spends the allowance.", { model: f.model, who: w });
        return t("Free first: every one that costs nothing is spent or resting, so {model} on {who}, which spends the allowance, is next.", { model: f.model, who: w });
      case "fast": {
        // Speed first (routes.Fastest): its time to the first token and
        // pace lately, as the gateway measured them (Weighed.lateTtft)
        if (f.lateTtft) {
          const secs = (f.lateTtft / 1000).toFixed(1);
          const pace = f.lateTps ? t("first token in {s}s, {n} tokens a second", { s: secs, n: Math.round(f.lateTps) })
            : t("first token in {s}s", { s: secs });
          return restedTo(t("it answered fastest lately — {pace}.", { pace }))
            || t("Speed first: {who} answered {model} fastest lately — {pace}.", { who: w, model: f.model, pace });
        }
        if (r.order.some((x) => x !== f && !x.fallback && !x.rest && x.lateTtft))
          return t("Speed first: {who} hasn't answered {model} lately, so it takes this request to be measured — one request in five goes to one not measured.", { who: w, model: f.model });
        return t("Speed first: none has answered {model} lately, so {who}, first in the list, goes first and its answer measures it.", { who: w, model: f.model });
      }
      case "usage":
        if (f.known) return t("Least used first: {who} has the most of its allowance left — {n} used.", { who: w, n: pct(f.used) });
        if (f.kind === "key" && !someKnown) return t("Least used first: {who} served the fewest tokens lately — {n}.", { who: w, n: tokens(f.tokens || 0) });
        return t("Least used first: {who} goes first.", { who: w });
      case "pace":
        if (f.known) {
          // The allowance window used for pace, which may be shorter than a week.
          const left = known0(f.due) ? Math.min(100, Math.round((f.pace || 0) * Math.max(1, (at(f.due) - at(r.time)) / 36e5))) : null;
          if (left !== null && f.dueBy === "reset") return t("Weekly pace: {who} has the most remaining allowance per hour until one of its Codex resets about to run out is used by itself — {n} left, used in {d}.", { who: w, n: pct(left), d: dur(at(f.due) - at(r.time)) });
          return left !== null
            ? t("Weekly pace: {who} has the most remaining allowance per hour until reset — {n} left, resets in {d}.", { who: w, n: pct(left), d: dur(at(f.due) - at(r.time)) })
            : t("Weekly pace: {who} has the most remaining allowance per hour until reset — {n} used.", { who: w, n: pct(f.used) });
        }
        if (f.kind === "key" && !someKnown) return t("Weekly pace: {who} served the fewest tokens lately — {n}.", { who: w, n: tokens(f.tokens || 0) });
        return t("Weekly pace: {who} goes first.", { who: w });
    }
    // keys that read their own windows (a sub2api key's limits) are
    // weighed by them, as accounts are, and one not read yet beside them
    // too: told below as one
    if (f.kind === "key" && !someKnown) {
      if (!f.fit && peers.some((p) => p.fit > 0)) return t("{who} goes first: it's made for {api}, the API {model} is at home in, so nothing is translated.", { who: w, api: API[f.speaks] || f.speaks, model: f.model });
      return restedTo(t("the others go in their order.")) || t("{who} goes first: keys go in their order, those that suit the request first.", { who: w });
    }
    if (f.kind !== "account" && !f.known) return t("{who} goes first.", { who: w });
    if (f.learns && peers.some((p) => p.known)) return t("{who} goes first: what it has left isn't known yet, and its answer tells — kept behind those known, it would never answer and never be known.", { who: w });
    if (!f.known && !peers.some((p) => p.known)) return t("The vendor hasn't said yet what these accounts have left, so they go in their order: {who} first.", { who: w });
    if (group(f) === "spent" && f.credits) return t("Every account is all but used up, so {who} goes first: it goes on on its credits, which the vendor spends once its allowance is used up.", { who: w });
    if (group(f) !== "fine") return r.order.some((x) => x.kind !== "account" && x.known)
      ? t("Every key and account here is at 90% or more of its allowance, so the one with the most left goes first: {who}, at {n}.", { who: w, n: pct(f.used) })
      : t("Every account is at 90% or more of its allowance, so the one with the most left goes first: {who}, at {n}.", { who: w, n: pct(f.used) });
    const next = peers.find((p) => p.known && group(p) === "fine");
    const soon = renewsBy(f).find(Boolean);
    if (!next) return t("{who} goes first: it has quota to spare, and the others are kept for last.", { who: w });
    const { c, k } = cmpRenews(f, next);
    if (c < 0 && k === 0 && known0(f.restarts)) return t("{who} goes first: of those with quota to spare, its allowance starts again soonest — one of its Codex resets about to run out is used by itself in {d}, and what it has left then is lost. {other} renews later and keeps its own.", { who: w, d: dur(at(f.restarts) - at(r.time)), other: who(next) });
    if (c < 0 && k === 0) return t("{who} goes first: of those with quota to spare, its allowance renews soonest — in {d} — and what it has left then is lost. {other} renews later and keeps its own.", { who: w, d: dur(renews(f)[0] - at(r.time)), other: who(next) });
    if (c < 0) return t("{who} goes first: its allowance renews in the same hour as {other}'s, and its shorter one sooner — in {d}.", { who: w, other: who(next), d: dur(renewsBy(f)[k] - at(r.time)) });
    if (soon) return t("{who} and {other} renew within the same hour, so the order given stays — and the vendor's prompt cache stays warm.", { who: w, other: who(next) });
    return t("{who} goes first, in the order given: when its allowance renews isn't known.", { who: w });
  }

function memberSplit(r, f, x) {
    if (!r.group) return null;
    const fv = f.via || [], xv = x.via || [];
    const subOf = (id) => r.group.subs?.find((s) => s.id === id);
    const at = (w, v, i) => i < v.length ? "group/" + v[i] : `${w.provider}/${w.model}${w.fixed ? ":" + w.fixed : ""}`;
    const named = (w, v, i) => i < v.length ? subOf(v[i])?.name || v[i] : w.name || w.provider;
    let g = r.group;
    for (let i = 0; i <= Math.max(fv.length, xv.length); i++) {
      const a = at(f, fv, i), b = at(x, xv, i);
      if (a !== b) {
        const routing = g?.routing || "";
        if (routing !== "weight" && routing !== "order") return null;
        // the first there by the round's pick, or by the order, not kept
        // on for its conversation or sent there by a rule
        if (routing === "weight" ? !f.turn : r.affinity?.kept || r.rule && !r.rule.bare) return null;
        return { routing, member: named(x, xv, i), first: named(f, fv, i), group: g.name || g.id };
      }
      if (i >= fv.length || i >= xv.length) return null; // one member
      g = subOf(fv[i]);
    }
    return null;
  }

function asides(r) {
    const out = [];
    const told = new Set(); // the members told as behind by weight or order
    const aff = affWhy(r, true) ? null : affWhy(r, false);
    if (aff) out.push(aff);
    const cls = classWhy(r.rule);
    if (cls) out.push(cls);
    for (const n of r.nested || []) {
      const c = classWhy(n.rule);
      if (c) out.push(t("In {group}: {text}", { group: n.name || n.group, text: c }));
    }
    const rule = ruleWhy(r, false);
    if (rule) out.push(rule);
    // a member a pause rule holds for now is out of the group: not tried,
    // not a fallback
    for (const p of r.group?.paused || []) {
      const when = (p.when || []).map(condText).join(", ");
      out.push(p.group
        ? t("{model} is paused by rule {n} of {group} ({when}), so it is left out until that ends.", { model: p.member, n: p.rule, group: r.group?.subs?.find((s) => s.id === p.group)?.name || p.group, when })
        : t("{model} is paused by rule {n} ({when}), so it is left out until that ends.", { model: p.member, n: p.rule, when }));
      // a pause by folder (#1606) says the folder it read, or that none was said
      if (p.byFolder) out[out.length - 1] += " " + (p.folder ? t("The agent works in {folder}.", { folder: p.folder }) : t("The agent didn't say which folder it works in."));
    }
    const smart = (x) => !x.routing && (x.kind === "account" || x.known);
    // weighed with one known: its place among them is what Smart says
    const someKnown = (x) => weighedWith(r, x).some((y) => y !== x && y.known);
    const f0 = r.order[0];
    for (const x of r.order.slice(1)) {
      // behind the first by a group's weights or its order, which take
      // each member whole: not by what x has left (Creat.wu: a group in
      // a group by weight, its accounts at 91%, read as passed over)
      const by = !x.rest && !x.sunk && f0 ? memberSplit(r, f0, x) : null;
      if (by && smart(x) && (x.known ? group(x) === "low" : someKnown(x))) {
        if (!told.has(by.member)) {
          told.add(by.member);
          out.push(by.routing === "weight"
            ? t("{member} isn't passed over for being near its limit: by weight this request was {first}'s share, and {member} takes its own share of the requests while it can answer.", { member: by.member, first: by.first })
            : t("{member} isn't passed over for being near its limit: it comes after {first} in {group}'s order.", { member: by.member, first: by.first, group: by.group }));
        }
        continue;
      }
      if (x.sunk && !x.rest) out.push(t("{who} was rate limited at {time} while it had quota left, so it went to the back: it comes round again once those ahead of it are rate limited in turn.", { who: who(x), time: clock(x.sunk) }));
      else if (x.rest) out.push(t("{who} is resting — {why}, {when} — so it waits at the back.", { who: who(x), why: `${x.rest.status} · ${failWord(x.rest.why)}`, when: restWhen(x.rest, at(r.time)) }));
      else if (smart(x) && x.known && group(x) === "spent" && x.credits) out.push(t("{who} is at {n} of its allowance but goes on on its credits — ahead of those used up with nothing to go on with, after those with allowance left.", { who: who(x), n: pct(x.used) }));
      else if (smart(x) && x.known && group(x) === "spent" && weighedWith(r, x).length > 1) out.push(t("{who} is at {n} — all but used up, it answers only when nothing else can.", { who: who(x), n: pct(x.used) }));
      else if (smart(x) && x.known && group(x) === "low" && weighedWith(r, x).length > 1) out.push(t("{who} is at {n} — kept for when the others can't.", { who: who(x), n: pct(x.used) }));
      else if (smart(x) && x.learns && someKnown(x)) out.push(t("{who}: what it has left isn't known yet, and its answer tells, so it goes before those known.", { who: who(x) }));
      else if (smart(x) && !x.known && someKnown(x)) out.push(t("{who}: what it has left isn't known yet, so it goes after those known.", { who: who(x) }));
    }
    const pooled = r.order.find((x) => !x.aside && x.kind === "key");
    for (const x of r.order.filter((x) => x.aside)) out.push(t("{who} is made for {api}, not {other} as the keys routed over are, so it isn't one of them: it's tried after them.", { who: who(x), api: API[x.speaks] || x.speaks || t("any API"), other: API[pooled?.speaks] || pooled?.speaks || t("any API") }));
    for (const x of r.left || []) out.push(x.held
      ? t("{who} is left out: the gateway key asking may not use its account.", { who: who(x) })
      : x.window
      ? t("{who} is left out: this request is longer than its {n} context window, so it would only refuse it. It's asked only once every one with room is out of its allowance.", { who: who(x), n: ctxShort(x.window) })
      : x.noCredits
      ? t("{who} is left out: a usage window is used up, and the account is set not to spend its credits, so it counts as used up until that window renews.", { who: who(x) })
      : x.capped
      ? t("{who} is left out: a usage window is at {n}, past the {cap}% cap set on the account, so it counts as used up until that window renews.", { who: who(x), n: pct(x.used), cap: x.capped })
      : x.barred
      ? t("{who} is left out: it is set to serve other models, not {model}.", { who: who(x), model: x.model })
      : x.kind === "key"
      ? t("{who} is left out: {name} lists {model} to its other keys, not this one.", { who: who(x), name: x.name, model: x.model })
      : t("{who} is left out: its plan doesn't list {model}.", { who: who(x), model: x.model }));
    return out;
  }

function affWhy(r, lead) {
    const a = r.affinity;
    if (!a) return null;
    const lw = r.order.find((x) => x.id === a.last), last = lw ? who(lw) : a.last;
    const routing = r.group ? r.group.routing : r.order[0]?.routing;
    const ago = known0(a.at) ? dur(at(r.time) - at(a.at)) : "";
    switch (a.why) {
      case "session": return t("Kept on {who}: it answered this conversation before, and affinity keeps a session with one account.", { who: last });
      case "turn": return t("Kept on {who}: {agent} is handing back tool results within turn {n}, and moving now would lose what the vendor cached of it.", { who: last, agent: agentName(r.agent), n: a.turn });
      case "cache": return t("Kept on {who}: {d} ago the vendor read {r} tokens of this conversation from its cache and wrote {w} to it; anyone else would be sent them afresh and paid in full.", { who: last, r: tokens(a.cacheRead || 0), w: tokens(a.cacheWrite || 0), d: ago });
      case "new-turn": return routing === "rotate"
        ? t("Turn {n} begins: in turn, it goes to the one after {who}, which answered the last turn — {next}.", { n: a.turn, who: last, next: who(r.order[0]) })
        : lead ? null : t("Turn {n} begins: affinity keeps a conversation only within a turn, so routing decides afresh.", { n: a.turn });
    }
    if (lead) return null;
    switch (a.why) {
      case "resting": return t("{who} answered this conversation last, but it is resting, so the conversation moves.", { who: last });
      case "spent": return t("{who} answered this conversation last, but its allowance is all but used up, so the conversation moves.", { who: last });
      case "gone": return t("{who} answered this conversation last, but it is no longer one to route to.", { who: last });
      case "no-cache": return t("{who} answered this conversation last, but the vendor then read only {r} tokens of it from its cache and wrote {w} — not worth staying for.", { who: last, r: tokens(a.cacheRead || 0), w: tokens(a.cacheWrite || 0) });
      case "cold": return t("{who} answered this conversation {d} ago, longer than the 5 minutes a vendor keeps a prompt cached — so routing decides afresh.", { who: last, d: ago });
      case "off": return t("Affinity is off: each request is routed afresh, whoever answered its conversation before.");
      case "rule": {
        // the group's rule, or that of a group in it, that moved it
        const x = r.nested?.findLast((n) => n.rule?.use && !n.rule.unready && !n.rule.held)?.rule || r.rule;
        return t("{who} answered this conversation last, but a new turn begins and the group's rule {n} puts {use} first.", { who: last, n: x?.n, use: useName(r, x?.instead && !x.unready ? x.instead : x?.use) });
      }
    }
    return null;
  }

function ruleWhy(r, lead) {
    if (!r.rule || r.rule.bare) return null;
    const x = { ...r.rule, use: useName(r, r.rule.use) };
    const when = (x.when || []).map(condText).join(", ");
    // the folder the agent said it works in, when a rule asks for one
    const dir = x.folder ? " " + t("The agent works in {folder}.", { folder: x.folder }) : "";
    if (x.use && !x.unready) {
      // the rule's first had none to take it, and its next went first
      const first = x.use;
      if (x.instead) x.use = useName(r, x.instead);
      const held = t("Rule {n} ({when}) sent turn {turn} to {use} as it began; the turn stays with whoever took it then.", { n: x.n, when, turn: x.turn, use: x.use });
      if (x.compact) return lead ? t("The agent is compacting the conversation, so rule {n} sends the summary to {use}; the conversation stays on the model it was on.", { n: x.n, use: x.use }) + (x.small?.length ? " " + t("Passed over, as the conversation is longer than they take: {models}.", { models: x.small.map((id) => useName(r, id)).join(", ") }) : "") : null;
      if (x.held) return lead || affWhy(r, true) ? held : null;
      if (x.grown) return lead ? t("Within turn {turn} the conversation grew to about {tokens} tokens, more than the model it was on takes, so rule {n} ({when}) moves it to {use}.", { turn: x.turn, tokens: tokens(x.tokens), n: x.n, when, use: x.use }) : null;
      if (!lead) return null;
      if (x.instead) return t("Rule {n} matches, but {use} has no account or key that can take this request, so {instead}, which the rule names after it, goes first.", { n: x.n, use: first, instead: x.use }) + dir;
      if (x.more?.length) return t("Turn {turn} begins and rule {n} matches — {when} — so {use} goes first, then {more}, which the rule names after it; the later rules' and the group's others stay behind them.", { turn: x.turn, n: x.n, when, use: x.use, more: x.more.map((id) => useName(r, id)).join(", ") }) + dir;
      if (x.then?.length) return t("Turn {turn} begins and rule {n} matches — {when} — so {use} goes first; if it fails, {then}, which the rules after it that match too name, then the group's others.", { turn: x.turn, n: x.n, when, use: x.use, then: x.then.map((id) => useName(r, id)).join(", ") }) + dir;
      return t("Turn {turn} begins and rule {n} matches — {when} — so {use} goes first; the group's others stay behind it if it fails.", { turn: x.turn, n: x.n, when, use: x.use }) + dir;
    }
    if (x.use && x.instead) return lead ? t("Rule {n} matches, but {use} has no account or key that can take this request, so a later matching rule puts {instead} first.", { n: x.n, use: x.use, instead: useName(r, x.instead) }) : null;
    if (lead) return null;
    if (x.use) return t("Rule {n} matches, but {use} has no account or key that can take this request, so the group's order stands.", { n: x.n, use: x.use });
    if (x.waits) return t("This turn began before magpie saw it, so the rules wait for the next one.");
    if (x.held) return null;
    return t("No rule matches turn {turn} (about {n} tokens{img}).", { turn: x.turn, n: tokens(x.tokens), img: x.images ? t(", with an image") : "" }) + dir;
  }

function treeText(g) {
    const name = (id) => g.subs?.find((s) => s.id === id)?.name || id;
    let out = "";
    const open = [];
    (g.members || []).forEach((m, i) => {
      const via = (g.via?.[i] || "").split(">").filter(Boolean);
      let k = 0;
      while (k < open.length && k < via.length && open[k] === via[k]) k++;
      while (open.length > k) { out += "]"; open.pop(); }
      if (out && !out.endsWith("[")) out += ", ";
      while (open.length < via.length) { const v = via[open.length]; out += name(v) + " ["; open.push(v); }
      out += m;
    });
    return out + "]".repeat(open.length);
  }

const useName = (r, id) => {
    if (!id?.startsWith("group/")) return id;
    const s = r.group?.subs?.find((s) => "group/" + s.id === id);
    return t("the group {name}", { name: s?.name || (s?.ref && !s.ref.startsWith("group/") ? s.ref : id.slice(6)) });
  };

function nestedWhy(r) {
    const out = [];
    for (const n of r.nested || []) {
      const x = n.rule, g = n.name || n.group;
      if (!x) continue;
      const when = (x.when || []).map(condText).join(", ");
      if (x.use && x.instead && !x.unready && !x.held) out.push(t("In {group}, rule {n} matches, but {use} has no account or key that can take this request, so {instead}, which the rule names after it, goes first there.", { group: g, n: x.n, use: x.use, instead: x.instead }));
      else if (x.use && x.instead && x.unready) out.push(t("In {group}, rule {n} matches, but {use} has no account or key that can take this request, so a later matching rule puts {instead} first.", { group: g, n: x.n, use: x.use, instead: x.instead }));
      else if (x.use && x.unready) out.push(t("In {group}, rule {n} matches, but {use} has no account or key that can take this request, so {group}'s order stands.", { group: g, n: x.n, use: x.use }));
      else if (x.use && x.held) out.push(t("In {group}, rule {n} ({when}) sent turn {turn} to {use} as it began; the turn stays with whoever took it then.", { group: g, n: x.n, when, turn: x.turn, use: x.instead || x.use }));
      else if (x.use) out.push(t("In {group}, rule {n} matches — {when} — so {use} goes first there.", { group: g, n: x.n, when, use: x.use }));
      else if (!x.waits) out.push(t("In {group}, no rule matches.", { group: g }));
    }
    const f = r.order[0];
    if (f?.via?.length && r.group) {
      const names = f.via.map((id) => r.group.subs?.find((s) => s.id === id)?.name || id);
      const inner = r.group.subs?.find((s) => s.id === f.via[f.via.length - 1]);
      out.push(t("{who} is one of {path}, a group in {name}; that group routes {mode}.", { who: who(f), path: names.join(" › "), name: r.group.name, mode: t(modeOf(inner?.routing || "")[0]).toLowerCase() }));
    }
    return out;
  }

function classWhy(x) {
    const c = x?.classified;
    if (!c) return x?.pick ? t("Turn {turn} reasons at {level}, as the classifier picked when it began.", { turn: x.turn, level: x.pick }) : null;
    const r = { rule: x };
    const by = c.by || t("the classifier"), kinds = (c.intents || []).map((x) => `“${x}”`).join(", ");
    // it couldn't say, and the turn keeps the intent the turn before had
    // (#1826), rather than going with none
    if (c.error && c.fallback === "previous" && c.intent) return t("{by} was to tell which of {kinds} turn {turn} is, but couldn't — {err} — so the turn keeps “{intent}”, as turn {prev} was.", { by, kinds, turn: r.rule.turn, err: c.error, intent: c.intent, prev: r.rule.turn - 1 });
    if (c.error) return c.intents?.length
      ? t("{by} was to tell which of {kinds} turn {turn} is, but couldn't — {err} — so no rule with an intent matches it.", { by, kinds, turn: r.rule.turn, err: c.error })
      : t("{by} was to rate how hard turn {turn} is, but couldn't — {err} — so it reasons as the agent asked.", { by, turn: r.rule.turn, err: c.error });
    const when = c.cached ? t("said before, for the same message") : t("in {ms}", { ms: took(c.ms) });
    const told = c.after ? " " + t("It was told turn {prev} was “{after}”, which a message that only carries on from it is too.", { prev: r.rule.turn - 1, after: c.after }) : "";
    const toldEffort = c.afterEffort ? " " + t("It was told turn {prev} reasoned at {level}, which a message that only carries on from it needs too.", { prev: r.rule.turn - 1, level: c.afterEffort }) : "";
    const effort = c.effort ? t("{by} rated turn {turn} {score} of 3, so it picks {level} reasoning for the turn — each model gets the level it has nearest.", { by, turn: r.rule.turn, score: (c.score || 0).toFixed(1), level: c.effort }) + toldEffort : "";
    if (!c.intents?.length) return effort ? `${effort} (${when})` : null;
    const sure = c.sure ? t(", {n} sure", { n: Math.round(c.sure * 100) + "%" }) : "";
    const said = (!c.intent
      ? t("{by} was asked which of {kinds} turn {turn} is, and said none ({took}).", { by, kinds, turn: r.rule.turn, took: when + sure })
      : t("{by} was asked which of {kinds} turn {turn} is, and said “{intent}” ({took}).", { by, kinds, turn: r.rule.turn, intent: c.intent, took: when + sure })) + told;
    return effort ? `${said} ${effort}` : said;
  }

function condText(c) {
    let m;
    if ((m = /^intent "(.*)"$/.exec(c))) return t("asks for “{intent}”", { intent: m[1].replace(/\\"/g, '"').replace(/\\\\/g, "\\") });
    if ((m = /^tokens ≥ (\d+)$/.exec(c))) return t("≥ {n} tokens", { n: Number(m[1]).toLocaleString(intlLang()) });
    if (c === "images") return t("has an image");
    if (c === "reasoning") return t("reasoning on");
    if (c === "compacting") return t("compacting");
    if ((m = /^effort ≥ (\w+)$/.exec(c))) return t("reasoning ≥ {level}", { level: m[1] });
    if ((m = /^agent (.+)$/.exec(c))) return m[1].split("|").map(agentName).join(" / ");
    if ((m = /^not folder (.+)$/.exec(c))) return t("not in {folders}", { folders: m[1].split("|").join(" / ") });
    if ((m = /^folder (.+)$/.exec(c))) return t("in {folders}", { folders: m[1].split("|").join(" / ") });
    if ((m = /^time (all day|(\d\d:\d\d)–(\d\d:\d\d))(?: ([^ (]+))?(?: \(([^)]+)\))?$/.exec(c))) {
      // the days as the gateway writes them: Mon–Fri, Sat,Sun, Mon,Wed–Fri;
      // the zone the hours are in after them, in brackets, when they have one
      const days = [];
      for (const part of (m[4] || "").split(",").filter(Boolean)) {
        const [a, b] = part.split("–").map((d) => WEEK.indexOf(d.toLowerCase()));
        for (let i = a; i >= 0 && i <= (b >= 0 ? b : a); i++) days.push(WEEK[i]);
      }
      return timeText({ from: m[2] || "00:00", to: m[3] || "00:00", days, zone: m[5] || "" });
    }
    return c;
  }

const WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const DAY_NAMES = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

function daysText(days) {
    const on = WEEK.map((d) => (days || []).includes(d)), out = [];
    for (let i = 0; i < 7; i++) {
      if (!on[i]) continue;
      let j = i;
      while (j + 1 < 7 && on[j + 1]) j++;
      if (j - i >= 2) out.push(t("{from}–{to}", { from: t(DAY_NAMES[WEEK[i]]), to: t(DAY_NAMES[WEEK[j]]) }));
      else for (let k = i; k <= j; k++) out.push(t(DAY_NAMES[WEEK[k]]));
      i = j;
    }
    return out.length === 7 || !out.length ? "" : out.join(t(", "));
  }

function timeText(w) {
    const hours = w.from === w.to ? t("all day") : t("{from}–{to}", { from: w.from, to: w.to });
    const days = daysText(w.days);
    const text = days ? t("{hours} {days}", { hours, days }) : hours;
    const zone = zoneNote(w);
    return zone ? t("{hours} ({zone})", { hours: text, zone }) : text;
  }

function zoneOffset(zone, at = new Date()) {
    try {
      const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
        .formatToParts(at).map((x) => [x.type, x.value]));
      return Math.round((Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - Math.floor(at.getTime() / 1000) * 1000) / 60000);
    } catch { return null; }
  }

const utcText = (min) => "UTC" + (min < 0 ? "−" : "+") + Math.floor(Math.abs(min) / 60) + (Math.abs(min) % 60 ? ":" + String(Math.abs(min) % 60).padStart(2, "0") : "");

function zoneNote(w) {
    let clock;
    try { clock = groups?.clock; } catch { return ""; } // before the groups are in
    if (!clock || typeof clock.offset !== "number") return "";
    const server = Math.round(clock.offset / 60);
    if (w.zone) {
      const off = zoneOffset(w.zone);
      return off === server ? "" : t("{zone} time", { zone: w.zone });
    }
    return -new Date().getTimezoneOffset() === server ? "" : t("server time, {offset}", { offset: utcText(server) });
  }

function tryWhy(r, i) {
    const tr = r.tries[i], said = trySaid(r, i);
    // a prompt turned away is turned away at every level: the level is no part of it
    if (!tr.effort || !r.effort || r.effort === tr.effort || tr.fail === "prompt") return said;
    const agent = agentName(r.agent);
    return said + (/[。！？]$/.test(said) ? "" : " ") + (tr.fixed
      ? t("The group fixes this model at {fixed} reasoning, in place of the {asked} {agent} asked for.", { fixed: tr.fixed, asked: r.effort, agent })
      : tr.ruleEffort
      ? t("The rule asks this model for {level} reasoning, in place of the {asked} {agent} asked for.", { level: tr.effort, asked: r.effort, agent })
      : tr.picked
      ? t("The turn's pick replaced the {asked} {agent} asked for.", { asked: r.effort, agent })
      : t("{level} is the model's nearest to the {asked} {agent} asked for.", { level: tr.effort, asked: r.effort, agent }));
  }

const WB_REFUSED = "WorkBuddy refuses chats from Codex and Claude Code (their system prompt); use it from Hermes, OpenCode or Pi, or add another provider to this group";

const BLOCKED = "the provider's network firewall blocked requests from this IP; wait a while, or switch to another network or proxy";

const ZCODE_BLOCKED = "ZCode's risk control blocked this account for unusual activity (code 3012); it rests, and the group's other providers are used. If the ZCode app fails on this account too, only ZCode support can lift the block";

const AG_TURNED_AWAY = "Antigravity answers this 429 to the system prompt of Claude Code and the Claude Agent SDK (Claude Desktop's chats) whatever quota is left, so it is not a quota and waiting won't help; use another provider for these chats, or put one after Antigravity in a routing group";

const AG_CODEX = "Antigravity answers this 429 to Codex's own system prompt for GPT-5 models whatever quota is left, so it is not a quota and waiting won't help; a Codex chat begun on a GPT model keeps that prompt after a model switch or a fork, so start a new chat on this model";

const AG_HERMES = "Antigravity answers this 429 to Hermes Agent's earlier default persona (its SOUL.md) whatever quota is left, so it is not a quota and waiting won't help; Hermes' current default persona goes through, so put it in SOUL.md, or use another provider for these chats";

const WB_RESTRICTED = "WorkBuddy restricted this account for unusual activity; it stays out until WorkBuddy lifts that, which an appeal (Submit feedback in WorkBuddy) asks for";

const HINTS = [WB_REFUSED, BLOCKED, ZCODE_BLOCKED, AG_TURNED_AWAY, AG_CODEX, AG_HERMES, WB_RESTRICTED];

function trySaid(r, i) {
    const tr = r.tries[i], w = tried(r, tr), agent = agentName(r.agent);
    let name = w ? `${who(w)} (${w.model})` : tr.id;
    // Copilot's Auto: the model it picked last, which this try went as
    if (w && tr.auto?.length) name = `${who(w)} (${w.model} → ${tr.auto[tr.auto.length - 1].model})`;
    if (tr.effort && tr.fail !== "prompt") name += " " + t("at {level} reasoning", { level: tr.effort });
    if (!tr.done) return t("{who} is answering…", { who: name });
    // what came of a try is what the gateway did next, never guessed from
    // where it stood in the order: a later try is the request going on,
    // as the gateway appends one only as it asks it, and with none the
    // error ended the request, the agent's once the route is done (#2281)
    const next = r.tries[i + 1], nw = next && tried(r, next);
    // a Codex reset spent by itself: with Codex's own sign-in the one try
    // it was spent for is the one that then answered
    const spent = tr.reset && tr.status < 400
      ? t("Its week was used up, so one of {account}'s Codex resets was used by itself first.", { account: userShown(w?.provider, tr.reset.who) }) + " "
      // Codex's own sign-in asked again onto its credits: the one try
      : tr.credits && tr.status < 400
      ? t("Its allowance had just run out and it was refused, so it was asked again at once to spend its credits.") + " "
      : "";
    if (tr.status < 400 && tr.fail)
      return tr.rest
        ? t("{who} began answering, then broke off · {fail}. {agent} got what was said before the error; {how}, so {agent}'s next request goes to another first.",
          { who: name, fail: failWord(tr.fail), how: restHow(tr.rest, at(tr.start) + (tr.ms || 0)), agent })
        : t("{who} began answering, then broke off. {agent} got what was said before the error; the conversation isn't kept on {who} for its next request.", { who: name, agent });
    if (tr.status < 400) {
      const tk = (r.tokens ? " · " + t("{n} tokens", { n: tokens(r.tokens) }) : "") + firstNote(r, tr);
      return spent + (i > 0
        ? t("{who} answered in {ms}{tk}. {agent} got one clean reply and never saw the {n} that failed first.", { who: name, ms: took(tr.ms), tk, agent, n: i })
        : t("{who} answered in {ms}{tk}.", { who: name, ms: took(tr.ms), tk }));
    }
    if (tr.reset)
      return t("{who} answered {status}: its week is used up and nobody else could take the request, so one of {account}'s Codex resets was used by itself and the request is asked again, before any of the reply reaches {agent}.",
        { who: name, status: tr.status, account: userShown(w?.provider, tr.reset.who), agent });
    // a Codex account that holds credits, refused as its allowance ran
    // out: asked again at once, for the vendor to spend its credits
    if (tr.credits)
      return t("{who} answered {status}: its allowance had just run out, but the account holds credits, which the vendor spends once the allowance is used up, so it is asked again at once, before any of the reply reaches {agent}.",
        { who: name, status: tr.status, agent });
    if (tr.fail === "canceled")
      return t("{agent} canceled the request while {who} was answering: nobody failed, so nobody rests and nobody else is asked.", { who: name, agent });
    if (tr.fail === "auth")
      return next
        ? t("{who} could not authenticate. Sign in again in magpie; this login is not retried. The request went to {next}.", { who: name, next: nw ? who(nw) : t("the next") })
        : t("{who} could not authenticate. Sign in again in magpie; this login is not retried. No other account could answer.", { who: name });
    if (tr.fail === "foreign")
      return t("{who} couldn't read the reasoning another account wrote earlier in this conversation, so it is asked again without it, before any of the reply reaches {agent}.", { who: name, agent });
    if (tr.fail === "floor")
      return t("{who} takes no request for a reply as short as this one asked for, so it is asked again for the shortest it gives, before any of the reply reaches {agent}.", { who: name, agent });
    if (tr.fail === "update")
      return t("{who} turned away the reasoning effort changed mid-conversation as an update that keeps its cache, so it is asked again at the new effort the usual way, before any of the reply reaches {agent}.", { who: name, agent });
    if (tr.fail === "verify" && !r.tries[i + 1])
      return t("{who} answered {status}: the vendor wants the account verified before it serves it again, and nobody is left to try, so {agent} gets the error with how to verify it. For a minute {agent}'s retries get the same answer without asking the vendor.", { who: name, status: tr.status, agent });
    if (tr.fail === "refused")
      return r.tries[i + 1]
        ? t("{who}'s safety filter refused the request before saying anything, so it goes on to the next before any of the reply reaches {agent}. Nothing is wrong with {who}, so it doesn't rest.", { who: name, agent })
        : t("{who}'s safety filter refused the request before saying anything, and nobody is left to try, so {agent} gets an error saying so, not an empty reply to ask again for.", { who: name, agent });
    if (tr.fail === "prompt")
      return r.tries[i + 1]
        ? t("{who} answered {status}: the vendor turns away {agent}'s system prompt whichever account it goes to, so it goes on to the next before any of the reply reaches {agent}. Nothing is wrong with {who}, so it doesn't rest.", { who: name, status: tr.status, agent })
        : t("{who} answered {status}: the vendor turns away {agent}'s system prompt whichever account it goes to, and nobody else is left to try, so {agent} gets the error. Nothing is wrong with {who}, so it doesn't rest.", { who: name, status: tr.status, agent });
    if (tr.fail === "shape")
      return t("{who} answered {status}: its API couldn't read something in the request that another's may, so it goes on to the next before any of the reply reaches {agent}. Nothing is wrong with {who}, so it doesn't rest.", { who: name, status: tr.status, agent });
    if (tr.fail === "effort")
      return r.tries[i + 1]
        ? t("{who} answered {status}: its plan doesn't take the reasoning effort asked for, so another account goes on with it before any of the reply reaches {agent}. {who} serves other efforts, so it doesn't rest.", { who: name, status: tr.status, agent })
        : t("{who} answered {status}: its plan doesn't take the reasoning effort asked for, and no account left that does could answer, so {agent} gets an error saying so.", { who: name, status: tr.status, agent });
    if (tr.fail === "slow")
      return !next && r.done
        ? t("{who} hadn't begun answering after {ms}, and nobody is left to try, so {agent} gets the error.", { who: name, ms: took(tr.ms), agent })
        // slow again and again on this account: its model rests here
        : tr.rest
        ? t("{who} hadn't begun answering after {ms}, {n} times in a row, so the request went on to the next before any of it reached {agent}. It rests {d} for {model} alone, longer each time it is slow again; its other models answer as before.",
          { who: name, ms: took(tr.ms), n: tr.rest.failures, model: tr.rest.model || tr.model, d: dur(at(tr.rest.until) - at(tr.start) - (tr.ms || 0)), agent })
        : t("{who} hadn't begun answering after {ms}, so the request went on to the next before any of it reached {agent}. Nothing is wrong with {who}, so it doesn't rest.", { who: name, ms: took(tr.ms), agent });
    if (tr.fail === "proxy")
      return r.tries[i + 1]
        ? t("{who}: the proxy magpie goes through didn't take the connection, so the request never reached the vendor and goes on to the next. Nothing is wrong with {who}, so it doesn't rest: once the proxy is up it is asked first again.", { who: name })
        : t("{who}: the proxy magpie goes through didn't take the connection, so the request never reached the vendor, and nobody is left to try: {agent} gets the error. Start the proxy, or change it in Settings.", { who: name, agent });
    // the agent left while magpie waited to ask again (#1894): the
    // story ends there, not on a retry that never came
    if (tr.gone)
      return t("{who} answered {status} · {fail}, and was to be asked again in {d}, but {agent} canceled the request before then, so nobody is asked again.",
        { who: name, status: tr.status, fail: failWord(tr.fail), d: took(tr.again), agent });
    if (tr.replan)
      return t("{who} answered {status} · {fail}, and every member had failed with an error that may pass, so after {d} the {n} of them are asked again, in turn, before any of the reply reaches {agent}. The group waits up to {p} for one to answer.",
        { who: name, status: tr.status, fail: failWord(tr.fail), d: took(tr.again), n: tr.replan, p: took((tr.patience || 0) * 1000), agent });
    if (tr.again)
      return t("{who} answered {status} · {fail}, and nobody else is left to ask — a failure that may pass, so it is tried again in {d}, before any of the reply reaches {agent}.",
        { who: name, status: tr.status, fail: failWord(tr.fail), d: took(tr.again), agent });
    // the last one left out of its allowance, after another failed
    // otherwise: the agent was told that one's error (Try.Earlier)
    if (tr.earlier && !next)
      return t("{who} answered {status} and nobody is left to try. {agent} gets the error an earlier try gave, not this used-up allowance, so it doesn't stop as if every account were out.", { who: name, status: tr.status, agent });
    // the error came, and nothing after it is known yet
    if (!next && !r.done) return t("{who} answered {status}.", { who: name, status: tr.status });
    const how = tr.rest && restHow(tr.rest, at(tr.start) + (tr.ms || 0));
    if (next)
      return tr.rest
        ? t("{who} answered {status} · {fail}. {how}; the request goes on to {next} before any of the reply reaches {agent}.",
          { who: name, status: tr.status, fail: failWord(tr.fail), how, next: nw ? who(nw) : t("the next"), agent })
        : t("{who} answered {status}, and the request goes on to {next} before any of the reply reaches {agent}. {who} doesn't rest for it.",
          { who: name, status: tr.status, next: nw ? who(nw) : t("the next"), agent });
    if (tr.rest)
      return t("{who} answered {status} · {fail}. {how}; nobody is left to try, so {agent} gets the error.",
        { who: name, status: tr.status, fail: failWord(tr.fail), how, agent });
    // the gateway stopped here with accounts left in the order: one it
    // would not go on from (the same history refused on every account of
    // a vendor, with no other vendor left)
    return i >= r.order.length - 1
      ? t("{who} answered {status} and nobody is left to try, so {agent} gets the error.", { who: name, status: tr.status, agent })
      : t("{who} answered {status} — an error another account wouldn't fix, so {agent} gets it.", { who: name, status: tr.status, agent });
  }

const knownKind = (k) => Object.hasOwn(REQUEST_KINDS, k) ? REQUEST_KINDS[k] : null;

const kindName = (k) => knownKind(k) ? t(knownKind(k).name) : k;

const purposeOf = (kind) => !kind ? "unmarked" : knownKind(kind)?.purpose || "kind:" + kind;

const tagKind = (r) => r.kind || (r.subagentId ? "collab_spawn" : "");

const clineRoute = (tr) => /^vmc\//.test(tr.served || "") && /(^|\/)cline-pass\//.test(tr.model || "");

function swapWhy(tr, o = {}) {
    if (!clineRoute(tr)) return t("The vendor was asked for {sent}, but its reply says {served} answered: likely another model. The same model under a dated name or spelled otherwise isn't marked.", { sent: tr.model, served: tr.served });
    const s = t("ClinePass answered {sent} through {served}, a route it picks itself: the name is the route's, not another model's.", { sent: tr.model, served: tr.served });
    if (tr.upstream) return s + " " + t("Its reply says {upstream} answered.", { upstream: tr.upstream });
    if (o.pinUnknown) return s + " " + t("Its reply didn't say which provider answered.");
    if (tr.pin) return s + " " + t("{pin} was asked for, but its reply didn't say which provider answered, so whether ClinePass kept to it is unknown.", { pin: tr.pin });
    const tick = /(^|\/)cline-pass\/(deepseek|glm)/i.test(tr.model) ? " " + t("To ask for the maker's own API, tick “{tick}” in the provider's settings.", { tick: t("DeepSeek and GLM models only from their makers' own APIs") }) : "";
    return s + " " + t("No provider was asked for, and its reply didn't say which one answered.") + tick;
  }

const routedWhy = (tr) => t("{sent} is a routing group of the remote magpie, and it routed the request to {served}: the group picking one of its models, not the vendor swapping the model.", { sent: tr.model, served: tr.served });

const upstreamWhy = (tr) => t("The aggregator passed the request on to {upstream}, as its reply says: the provider that actually answered it.", { upstream: tr.upstream });

function subagentWhy(r) {
    const agent = agentName(r.agent);
    return r.subagent.kept
      ? t("{agent} requested a subagent on {model} and it stayed there: its subagents are set to {to}, but {why}.", { agent, model: r.subagent.asked, to: r.subagent.to, why: t(r.subagent.kept) })
      : t("{agent} requested a subagent on {model}; magpie put it on {to}, the model set for its subagents.", { agent, model: r.subagent.asked, to: r.subagent.to });
  }

function kindWhy(r) {
    const agent = agentName(r.agent);
    if (purposeOf(tagKind(r)) === "kind:collab_spawn" && r.subagent) return subagentWhy(r);
    if (purposeOf(tagKind(r)) === "kind:collab_spawn") return r.group
      ? t("{agent} requested a subagent; magpie selects its model within this routing group.", { agent })
      : t("{agent} requested a subagent on {model}.", { agent, model: r.model });
    if (purposeOf(r.kind) === "kind:ambient_suggestions") return t("{agent} drafted the suggested prompts on its home page by itself, in the background, searching the project's files and connected apps, and checked them for safety. Not a turn of the conversation; Codex's Settings › Configuration › Suggested prompts turns it off.", { agent });
    if (purposeOf(r.kind) === "kind:composer_predictions") return t("{agent} guessed your next message for its composer by itself, reading the whole conversation again. Not a turn of the conversation; Codex composer predictions, under Settings in Codex's row on the Agents page, picks its model, and Codex's Settings › General › Show predictions turns it off.", { agent });
    if (r.kind === "luna_reserve") return t("{agent} sent this turn on Luna Reserve, which it turns to once the plan's own allowance is used up; it picks the model itself.", { agent });
    // the searcher asked first failed or found nothing, and this one
    // searched in its place: say which and why, not just who searched
    // (Gearclickist on Discord: Grok picked, Codex's model searched)
    if (r.kind === "web_search" && r.for?.instead) {
      const f = r.for;
      const whom = f.mcp ? t("{agent}'s call to magpie's web_search MCP tool", { agent: agentName(f.agent) })
        : f.model ? t("{agent}'s {model}", { agent: agentName(f.agent), model: f.model })
        : t("a model that can't search the web by itself");
      const why = f.notSearched ? t("it answered without searching the web, so its account or plan may not offer web search") : f.nothingFound ? t("its reply named no page it found") : f.why || t("it failed");
      return f.picked
        ? t("{failed}, the searcher picked in Settings › Models › Web search, didn't search for {whom}: {why}. So magpie had {searcher}, the next searcher it can use, search in its place. Not a turn of the conversation.", { failed: f.instead, whom, why, searcher: r.model })
        : t("{failed}, the searcher magpie picked, didn't search for {whom}: {why}. So magpie had {searcher}, the next searcher it can use, search in its place. Not a turn of the conversation.", { failed: f.instead, whom, why, searcher: r.model });
    }
    // the agent called magpie's web search MCP server itself, for no model
    if (r.kind === "web_search" && r.for?.mcp) return t("{agent} called magpie's web_search MCP tool: {searcher} searched for it. Not a turn of the conversation.", { agent: agentName(r.for.agent), searcher: r.model });
    if (r.kind === "web_search") return r.for
      ? t("magpie ran this web search for {agent}'s {model}, which can't search the web by itself: {searcher} searched, and {model} goes on answering once it has what was found. Not a turn of the conversation.", { agent: agentName(r.for.agent), model: r.for.model, searcher: r.model })
      : t("magpie ran this web search for a model that can't search the web by itself: {searcher} searched, and that model goes on answering once it has what was found. Not a turn of the conversation.", { searcher: r.model });
    // why the model was counted as unable to see, and where the user says
    // otherwise or picks the describer (#1287: a DeepSeek model's images
    // went to Codex's GPT, and nothing said why or where to change it)
    // the Image recognition model the user picked is missing: the one
    // magpie picks described in its place, and the row says so
    // the agent called magpie's image recognition MCP server itself
    if (r.kind === "vision" && r.for?.mcp) return t("{agent} called magpie's analyze_image MCP tool: {describer} looked at the image for it. Not a turn of the conversation.", { agent: agentName(r.for.agent), describer: r.model });
    if (r.kind === "vision" && r.for?.missing) return t("{picked}, the Image recognition model picked in Settings, isn't set up any more, so magpie had {describer}, its automatic choice, describe an image for {agent}'s {model} in its place. Pick another in Settings › Models › Image recognition. Not a turn of the conversation.", { picked: r.for.missing, agent: agentName(r.for.agent), model: r.for.model, describer: r.model });
    if (r.kind === "vision" && r.for?.unknown) return t("magpie had {describer} describe an image for {agent}'s {model}: nothing magpie knows says {model} can see images, so it is counted as text-only and given the description in the image's place. If it does see them, tick “Accepts images” for it in its provider's models. Settings › Models › Image recognition picks the model that describes. Not a turn of the conversation.", { agent: agentName(r.for.agent), model: r.for.model, describer: r.model });
    if (r.kind === "vision") return r.for
      ? t("magpie had {describer} describe an image for {agent}'s {model}, which its provider's list or its own setting says takes text only: {model} is given the description in the image's place. Settings › Models › Image recognition picks the model that describes. Not a turn of the conversation.", { agent: agentName(r.for.agent), model: r.for.model, describer: r.model })
      : t("magpie had {describer} describe an image for a model that can't see images, which is given the description in the image's place. Not a turn of the conversation.", { describer: r.model });
    return t("{agent} made this call itself ({kind}), not as a turn of the conversation, and picks its model itself.", { agent, kind: kindName(r.kind) });
  }

let groups = null, gEdit = null;
 function items(r){
    const items = [];
    const main = r.order.find((x) => !x.fallback);
    items.push([r.group
      ? t("{agent} asked for the routing group {name}: {members}", { agent: agentName(r.agent), name: r.group.name, members: treeText(r.group) })
      : main && main.model !== r.model && wentOn(r) === r.model
      ? t("{agent} asked for {model}: {name} serves it, and the vendor is asked for {sent}", { agent: agentName(r.agent), model: r.model, name: main.name, sent: main.model })
      : t("{agent} asked for {model}", { agent: agentName(r.agent), model: r.model }) + " → " + (main?.name || r.provider), ""]);
    if (tagKind(r)) items.push([kindWhy(r), "aside kind"]);
    else if (r.subagent) items.push([subagentWhy(r), "aside"]);
    if (r.subagentEffort) items.push([t("The subagent effort set in magpie is {effort}; the model's supported levels and a routing group's fixed member effort still apply.", { effort: t(r.subagentEffort) }), "aside"]);
    if (r.sealedTask) items.push([t(r.group
      ? "This subagent task is encrypted. Only ChatGPT accounts can read it; other providers (such as Claude) are excluded regardless of quota."
      : "This subagent task is encrypted. Only ChatGPT accounts can read it."), "aside"]);
    items.push([affWhy(r, true) || ruleWhy(r, true) || firstWhy(r), "why"]);
    for (const s of nestedWhy(r)) items.push([s, "why"]);
    for (const a of asides(r)) items.push([a, "aside"]);
    r.tries.forEach((tr, i) => {
      items.push([tryWhy(r, i), tr.done ? (tryOk(tr) ? "ok" : "bad") : "wait"]);
      // where its time went, once it is done: the first try's has the
      // request's masking before it
      const timed = i === 0 && r.masking > 0 ? { ...tr, masking: r.masking } : tr;
      const when = tr.done && timeSaid(timed);
      if (when) items.push([when, "aside time", timed]);
      // each model Copilot's Auto picked for it, where from, and whether
      // Copilot refused it, on which API and with Auto's session token or
      // without (#256)
      for (const p of tr.auto || []) {
        let s = t("Copilot's Auto picked {model} ({via})", { model: p.model, via: p.via === "fallback" ? t("the model the account may pick by hand") : p.via });
        if (p.skipped) s += " · " + t("not from /auto: {why}", { why: p.skipped });
        if (p.api) s += " · " + t(p.session ? "sent to {api} with Auto's session token" : "sent to {api}", { api: p.api });
        if (p.refused) s += " · " + t("Copilot refused it: {error}", { error: p.refused });
        items.push([s, "aside"]);
      }
      // what the vendor said, word for word: the why above is magpie's reading of it
      if (tr.done && !tryOk(tr) && tr.error) {
        const hint = HINTS.find((h) => tr.error.endsWith(" — " + h));
        const said = hint ? tr.error.slice(0, -(hint.length + 3)) : tr.error;
        items.push([t("It said: {error}", { error: said.length > 600 ? said.slice(0, 600) + "…" : said }), "aside said"]);
        if (hint) items.push([t(hint), "aside"]);
      }
      // the reply said another model answered it
      if (tr.done && tryOk(tr) && tr.swapped) items.push([swapWhy(tr), "swap", tr]);
      // another magpie's routing group named the member it routed to
      else if (tr.done && tryOk(tr) && tr.routed) items.push([routedWhy(tr), "aside", tr]);
      if (tr.done && tryOk(tr) && tr.upstream) items.push([upstreamWhy(tr), "aside upstream-said", tr]);
    });
    if (r.done && !r.tries.length) items.push([t("Nothing was tried: {error}", { error: r.error || r.status }), "bad"]);

return items;}
 return {items:()=>items(route),outcome:()=>route.done&&route.tries.length?tryWhy(route,route.tries.length-1):affWhy(route,true)||ruleWhy(route,true)||firstWhy(route),description:mode=>t(modeOf(mode)[1]),rest:(rest,from)=>restWhen(rest,from),failure:failWord};
}
