import {l} from './i18n.mjs';
import {el,brand} from './graphics.mjs';
import {accountName,maskText,storyItems} from './story.mjs';
import {timeElement} from './timing.mjs';

// Original logoed/renderSteps anatomy: one logoed decision, each attempt then
// its inline timeElement, with stable DOM for unchanged sentences and icons.
function logoed(ctx,s,r) {
  const word=/[A-Za-z0-9_]/;let hit=null;
  for(const [index,w] of r.order.entries())for(const n of new Set([accountName(w,index,r.masked),w.name].filter(Boolean))){
    for(let i=s.indexOf(n);i>=0;i=s.indexOf(n,i+1)){
      if(word.test(s[i-1]||'')||word.test(s[i+n.length]||''))continue;
      if(!hit||i<hit.i||i===hit.i&&n.length>hit.n.length)hit={i,n,w};break;
    }
  }
  if(!hit)return maskText(s,r);
  const name=el('span','rr-named');name.append(brand(ctx,hit.w.provider,hit.w.icon),...maskText(hit.n,r));
  return [...maskText(s.slice(0,hit.i),r),name,...maskText(s.slice(hit.i+hit.n.length),r)].filter(x=>x!=='');
}
export function createStory(ctx) {
  const node=el('ul','rr-steps');node.tabIndex=0;node.setAttribute('aria-label',l('請求路由過程'));let routeId=null;
  return {node,update(route,masked){
    const items=storyItems(route,masked).map(([text,cls,timed])=>({text,cls,timed:cls==='aside time'?timed:null}));
    const previous=new Map([...node.children].map(row=>[row.dataset.key,row]));
    const rows=items.filter(item=>item.text).map(({text,cls,timed})=>{
      const key=JSON.stringify([text,cls,route.order.map(w=>w.provider)]);let li=previous.get(key);
      if(li)return li;
      li=el('li',cls);li.dataset.key=key;
      if(timed)li.append(timeElement(timed));
      else li.append(...(/^(why|ok|bad|wait|aside|swap)( |$)/.test(cls)?logoed(ctx,text,{...route,masked}):[text]));
      return li;
    });
    const scroll=node.scrollTop;
    for(const child of [...node.children])if(!rows.includes(child))child.remove();
    rows.forEach((row,index)=>{if(node.children[index]!==row)node.insertBefore(row,node.children[index]||null);});
    node.scrollTop=routeId===route.id?scroll:0;routeId=route.id;
  }};
}
