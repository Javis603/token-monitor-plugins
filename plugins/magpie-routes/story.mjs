import {l, locale} from './i18n.mjs';
import { el } from './graphics.mjs';
import { agentName, routingName, candidateState, affinityText, reasonName, tried } from './model.mjs';
import {took} from './timing.mjs';
import {sourceWords} from './routing-words.mjs';

const MARK = '\u0000', DOT = '•', marked = (who, index) => MARK + index + DOT.repeat(who.length) + MARK;
// Sentences stay free of the account's own name: a test and anything that
// reads the text must not see it. The marks are only a same-length
// placeholder, swapped for the blurred name when the sentence is rendered.
export const accountName = (candidate, index, masked) => candidate.who && masked ? marked(candidate.who, index) : candidate.who || candidate.name || l("帳號 {p0}",{p0:(index + 1)});
// Magpie hides an account by blurring the whole name, so a screenshot shows
// its length but never its letters. A provider name in the same sentence is
// never marked, so it stays readable.
export function maskText(text, route) {
  const whos = accountNames(route);
  const out = []; let from = 0;
  for (let i = text.indexOf(MARK); i >= 0; i = text.indexOf(MARK, from)) {
    const end = text.indexOf(MARK, i + 1); if (end < 0) break;
    if (i > from) out.push(text.slice(from, i));
    const body = text.slice(i + 1, end), at = body.indexOf(DOT), index = Number(body.slice(0, at));
    const who = whos[index] || body.slice(at);
    const hidden = el('span', 'rr-pii', who); hidden.title = ''; out.push(hidden); from = end + 1;
  }
  if (!out.length) return [text];
  if (from < text.length) out.push(text.slice(from));
  return out;
}
function accountNames(route){return [...(route?.order||[]).map(w=>w.who),...(route?.tries||[]).map(tr=>tr.reset?.who)];}
function official(route,masked){
 const names=accountNames(route),display=name=>name&&masked?marked(name,names.indexOf(name)):name;
 // usedPercent is the normalized DTO name; upstream wording consumes used.
 const r={...route,order:route.order.map(w=>({...w,used:w.usedPercent})),left:(route.left||[]).map(w=>({...w,used:w.usedPercent}))};
 return sourceWords(r,display);
}
export function storyItems(route,masked){return route?official(route,masked).items().filter(([text])=>text):[];}
export function routeStory(route,masked){return storyItems(route,masked).filter(([,cls])=>cls!=='aside time').map(([text])=>text);}
export function routeOutcome(route,masked){return route?official(route,masked).outcome():'';}
export function routingDescription(mode){return sourceWords(null,name=>name).description(mode);}
export function restNote(rest,from){const words=sourceWords(null,name=>name);return words.failure(rest.why||rest.kind)+' · '+words.rest(rest,from);}
