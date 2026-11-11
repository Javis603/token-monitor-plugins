'use strict';
// Magpie history.go: fixed per-day JSONL/gzip files, latest 2000 routes.
// Read-only and projected before crossing the backend/renderer boundary.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { route } = require('./gateway.cjs');
const validDay = day => typeof day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(day+'T12:00:00Z')) && new Date(day+'T12:00:00Z').toISOString().slice(0,10) === day;
function createHistory(directory,signal,clock=()=>new Date()) {
  const cache=new Map();
  async function read(file, stat, keep, tally) {
    const old=cache.get(file);
    if(old?.size===stat.size&&old.mtime===stat.mtimeMs&&(!keep||old.rows)&&(!tally||old.tallies))return old;
    const compressed=file.endsWith('.gz'), incremental=!compressed&&old&&stat.size>old.size&&(!keep||old.rows)&&(!tally||old.tallies);
    const offset=incremental?old.offset:0,tallies=tally&&incremental?new Map([...old.tallies].map(([key,a])=>[key,{...a,models:[...a.models]}])):new Map();
    let count=incremental?old.count:0,rows=keep&&incremental?[...old.rows]:[],pending='',consumed=offset;
    const input=fs.createReadStream(file,{start:offset,signal}),stream=compressed?input.pipe(zlib.createGunzip()):input;
    // Forward source errors through the decompressor as async iteration only
    // listens on its output; always close both handles after a read or failure.
    if(compressed)input.on('error',error=>stream.destroy(error));
    stream.setEncoding('utf8');
    try {
      for await(const chunk of stream){
        pending+=chunk;
        let end;
        while((end=pending.indexOf('\n'))>=0){
          const line=pending.slice(0,end);pending=pending.slice(end+1);consumed+=Buffer.byteLength(line+'\n');
          if(!line.trim())continue;
          if(Buffer.byteLength(line)>8*1024*1024)throw new Error('Magpie history record exceeds the display limit.');
          count++;
          if(keep||tally){
            let row;try{const raw=JSON.parse(line);raw.order ||= [];raw.tries ||= [];row=route(raw);}catch{continue;}
            if(keep){rows.push(row);if(rows.length>2200)rows.splice(0,200);}
            if(tally){
              const key=w=>w.kind==='account'&&w.who?JSON.stringify([w.provider,w.who.trim().toLowerCase()]):w.id;
              for(const w of row.order){const k=key(w);if(!tallies.has(k))tallies.set(k,{key:k,candidate:w,at:Date.parse(row.time)||0,tried:0,ok:0,failed:0,models:[]});const a=tallies.get(k);if((Date.parse(row.time)||0)>=a.at){a.candidate=w;a.at=Date.parse(row.time)||0;}}
              for(const tr of row.tries){if(!tr.done||tr.fail==='canceled')continue;const w=row.order.find(w=>w.id===tr.id&&w.model===tr.model)||row.order.find(w=>w.id===tr.id);if(!w)continue;const a=tallies.get(key(w));a.tried++;if(tr.status<400&&!tr.fail){a.ok++;if(!a.models.includes(tr.model||w.model))a.models.push(tr.model||w.model);}else a.failed++;}
            }
          }
        }
        if(Buffer.byteLength(pending)>8*1024*1024)throw new Error('Magpie history record exceeds the display limit.');
      }
    } finally {stream.destroy();input.destroy();}
    const result={size:stat.size,mtime:stat.mtimeMs,offset:consumed,count,rows:keep?rows:undefined,tallies:tally?tallies:undefined};cache.set(file,result);return result;
  }
  return async function history(day='') {
    if(signal?.aborted)throw signal.reason;
    if(typeof day!=='string'||day&&!validDay(day))throw new Error('Invalid routing history day.');
    let names;
    try{names=await fs.promises.readdir(directory);}catch(error){if(error.code==='ENOENT')return {days:[],routes:[],cut:false,tallies:[]};throw error;}
    const files=names.filter(name=>/^\d{4}-\d{2}-\d{2}\.jsonl(?:\.gz)?$/.test(name)&&validDay(name.slice(0,10))).sort();
    for(const[file,entry]of cache)if(path.basename(file).slice(0,10)!==day)delete entry.rows;
    const todayDate=clock(),today=todayDate.getFullYear()+'-'+String(todayDate.getMonth()+1).padStart(2,'0')+'-'+String(todayDate.getDate()).padStart(2,'0');
    const days=new Map(),routes=[],tallies=new Map();let total=0;
    for(const name of files){
      const file=path.join(directory,name);let stat;try{stat=await fs.promises.lstat(file);}catch(error){if(error.code==='ENOENT')continue;throw error;}
      if(!stat.isFile()||stat.isSymbolicLink())continue;
      const date=name.slice(0,10);let got;try{got=await read(file,stat,date===day,date===today);}catch(error){if(error.code==='ENOENT')continue;throw error;}
      if(date===today)for(const[k,a]of got.tallies){if(!tallies.has(k))tallies.set(k,{...a,models:[...a.models]});else{const prev=tallies.get(k);prev.tried+=a.tried;prev.ok+=a.ok;prev.failed+=a.failed;if(a.at>=prev.at){prev.candidate=a.candidate;prev.at=a.at;}prev.models=[...new Set([...prev.models,...a.models])];}}
      days.set(date,(days.get(date)||0)+got.count);
      if(date===day){routes.push(...got.rows);total+=got.count;}
    }
    for(const file of cache.keys())if(!files.includes(path.basename(file)))cache.delete(file);
    const unique=new Map();for(const row of routes)unique.set(row.id+'\0'+row.time,row);
    const sorted=[...unique.values()].sort((a,b)=>Date.parse(a.time)-Date.parse(b.time)||a.id-b.id);
    return {days:[...days].sort(([a],[b])=>b.localeCompare(a)).map(([day,requests])=>({day,requests})),routes:sorted.slice(-2000),cut:total>2000,tallies:[...tallies.values()]};
  };
}
module.exports={createHistory,validDay};
