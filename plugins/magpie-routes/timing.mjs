import {t} from './i18n.mjs';
export {t} from './i18n.mjs';
// Magpie timeParts/timeElement, f2b4b98948d0aeb7f1baa3929aeb6ead0d679437.
// Same phase order, thresholds, grouping, fractions and DOM. MIT; only class
// prefix, local element helper and translation injection differ from upstream.
import { el } from './graphics.mjs';

export const took=(ms=0)=>ms<1000?t('{n} ms',{n:ms}):t('{n} s',{n:(ms/1000).toFixed(ms<10000?1:0)});
export const ms1=n=>n<10?t('{n} ms',{n:(Math.round(n*10)/10).toString()}):took(Math.round(n));
export function timeParts(tr) {
  const n=tr.net,out=[],add=(who,label,v)=>{if(v>=.1)out.push({who,label,v});};
  add('magpie','Masking',tr.masking||0);
  if(!n)return out;
  add('magpie','Waiting for a slot',tr.queued||0);
  add('magpie','In magpie',n.own||0);
  add('net','Requests before it',n.before||0);
  if((n.pool||0)>=1)add('net','Waiting for a connection',n.pool);
  add('net','DNS',n.dns||0);
  add('net','Connecting',n.connect||0);
  add('net','TLS',n.tls||0);
  add('net','Sending',n.send||0);
  add('vendor','Vendor (first byte)',n.wait||0);
  const head=n.head||0;
  if(tr.ttft>0){
    add('vendor','First token',tr.ttft-head);
    add('vendor','Streaming',(tr.ms||0)-tr.ttft);
  }else add('vendor','Reading the reply',(tr.ms||0)-head);
  return out;
}
const WHO={magpie:'magpie {ms}',net:'network {ms}',vendor:'vendor {ms}'};
export function timingTotals(parts) {
  const sum={};for(const p of parts)sum[p.who]=(sum[p.who]||0)+p.v;return sum;
}
export function timeSaid(tr) {
  const parts=timeParts(tr);if(!parts.length)return '';
  const sum=timingTotals(parts),whose=Object.keys(WHO).filter(k=>sum[k]>0).map(k=>t(WHO[k],{ms:ms1(sum[k])}));
  return [t('Where the time went'),whose.join(' · '),parts.map(p=>t(p.label)+' '+ms1(p.v)).join(' · ')].filter(Boolean).join(': ');
}
export function timeElement(tr) {
  const parts=timeParts(tr),total=parts.reduce((a,p)=>a+p.v,0)||1;
  const box=el('div','rr-time'),head=el('div','rr-time-head',t('Where the time went')),sum=timingTotals(parts);
  for(const k of Object.keys(WHO))if(sum[k]>0)head.append(el('span','rr-time-who '+k,t(WHO[k],{ms:ms1(sum[k])})));
  const bar=el('div','rr-time-bar');bar.setAttribute('aria-hidden','true');
  const list=el('ul','rr-time-parts');
  for(const p of parts){
    const seg=el('span',p.who);seg.style.flexGrow=String(p.v/total);seg.title=t(p.label)+' '+ms1(p.v);bar.append(seg);
    const li=el('li',p.who);li.append(el('span','k',t(p.label)),el('span','v',ms1(p.v)));list.append(li);
  }
  box.append(head,bar,list);return box;
}
