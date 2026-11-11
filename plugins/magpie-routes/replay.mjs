// Magpie client.js replay/ghost/realAt: event time compressed at 1800 ms,
// 500 ms lead-in, recorded tries only. Never sends a request to a vendor.
export function replayPlan(rows){
  const list=rows.filter(r=>r.done&&Number.isFinite(Date.parse(r.time))).sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)||a.id-b.id);
  if(!list.length)return null;
  const start=r=>Date.parse(r.time),at=(tr,r)=>Number.isFinite(Date.parse(tr.start))?Date.parse(tr.start):start(r);
  const end=r=>Math.max(start(r)+(r.ms||0),...r.tries.map(tr=>at(tr,r)+(tr.ms||0)));
  const ts=[...new Set(list.flatMap(r=>[start(r),end(r),...r.tries.flatMap(tr=>[at(tr,r),at(tr,r)+(tr.ms||0)])]))].sort((a,b)=>a-b),vs=[];
  let v=0;ts.forEach((t,i)=>{if(i)v+=Math.min(t-ts[i-1],1800);vs.push(v);});
  const virtual=t=>vs[ts.indexOf(t)];
  return {ts,vs,total:v,rows:list.map(r=>({
    route:r,start:virtual(start(r)),end:virtual(end(r)),
    tries:r.tries.map(tr=>({start:virtual(at(tr,r)),end:virtual(at(tr,r)+(tr.ms||0))}))
  }))};
}
export function replayClock(plan,v){
  let real=plan.ts[0]+v,fast=1;
  for(let i=1;i<plan.ts.length;i++)if(v>0&&v<=plan.vs[i]){const dv=plan.vs[i]-plan.vs[i-1],dt=plan.ts[i]-plan.ts[i-1];real=dv?plan.ts[i-1]+(v-plan.vs[i-1])*dt/dv:plan.ts[i];fast=dv?dt/dv:1;break;}
  if(v>plan.total)real=plan.ts.at(-1);
  return {real,fast};
}
export function replayAt(plan,v){
  const {real,fast}=replayClock(plan,v);
  const rows=plan.rows.filter(g=>g.start<=v).map(g=>{
    const done=g.end<=v;
    return {...g.route,replayAt:real,done,status:done?g.route.status:0,error:done?g.route.error:'',fail:done?g.route.fail:'',tokens:done?g.route.tokens:0,out:done?g.route.out:0,usage:done?g.route.usage:[],bytes:0,contentAt:0,estTok:0,
      tries:g.route.tries.flatMap((tr,i)=>g.tries[i].start>v?[]:[g.tries[i].end<=v?tr:{...tr,done:false,status:0,error:'',fail:'',rest:null,again:0}])};
  });
  return {rows,real,fast};
}
