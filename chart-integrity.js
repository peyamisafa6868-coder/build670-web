/* BUILD670 display-only data integrity, source-coherent levels and axis labels.
   No external-provider verification, signal authorization, or OHLC repair. */
(function(root,factory){
 const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;
 if(root)root.Build670ChartIntegrity=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const finite=Number.isFinite;
 const median=arr=>{if(!arr.length)return 0;const a=[...arr].sort((x,y)=>x-y);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;};
 const intervalMs={"1m":60000,"3m":180000,"5m":300000,"10m":600000,"15m":900000,"30m":1800000,"60m":3600000,"240m":14400000};
 const day=t=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(t);
 function inspect(data){
  const bars=data?.candles,invalid=[],spikes=[],gaps=[];
  if(!Array.isArray(bars)||!bars.length||typeof data.lastBarClosed!=='boolean')
   return {valid:false,invalid:[{index:-1,reason:'MISSING_HISTORY_OR_CLOSURE'}],spikes,gaps,providerCompared:false};
  let prior=0;const ranges=[];const timeframe=intervalMs[data.interval];
  for(let i=0;i<bars.length;i++){
   const b=bars[i],t=b?.timestamp??b?.time;
   if(!finite(t)||t<=prior||![b?.open,b?.high,b?.low,b?.close,b?.volume].every(finite)||
    !(b.low>0&&b.low<=Math.min(b.open,b.close)&&b.high>=Math.max(b.open,b.close)&&b.volume>=0)){
    invalid.push({index:i,reason:'INVALID_OHLCV_OR_ORDER'});continue;
   }
   if(i&&timeframe&&day(t)===day(prior)&&t-prior>timeframe*1.5)
    gaps.push({index:i,missingEstimated:Math.max(0,Math.round((t-prior)/timeframe)-1)});
   const previous=bars[i-1];const range=i&&previous&&finite(previous.close)
    ?Math.max(b.high-b.low,Math.abs(b.high-previous.close),Math.abs(b.low-previous.close)):b.high-b.low;
   if(i>=20&&ranges.length>=20){
    const baseline=median(ranges.slice(-20)),bodyHigh=Math.max(b.open,b.close),bodyLow=Math.min(b.open,b.close);
    const longUpper=b.high-bodyHigh,longLower=bodyLow-b.low;
    if(baseline>0&&range>=Math.max(baseline*7,previous.close*.035)&&
      Math.max(longUpper,longLower)>=Math.max(baseline*5,previous.close*.025))
      spikes.push({index:i,timestamp:t,range,baseline,ratio:range/baseline,reason:'SUSPICIOUS_WICK_NOT_PROVEN_ERROR'});
   }
   ranges.push(range);prior=t;
  }
  return {valid:!invalid.length,invalid,spikes,gaps,providerCompared:false,
    closedCount:bars.filter((b,i)=>b?.closed===true||(b?.closed==null&&(i<bars.length-1||data.lastBarClosed===true))).length};
 }
 function mergeLevels(kind,reference,pivot=[],kotlin=null,tolerance=0,limit=3){
  if(!['support','resistance'].includes(kind)||!finite(reference)||reference<=0)return [];
  const candidates=[];
  if(kotlin&&finite(kotlin.price))candidates.push({...kotlin,source:'KOTLIN_REFERENCE',strength:1});
  for(const p of pivot)if(p&&finite(p.price))candidates.push({...p,source:p.source||'CONFIRMED_PIVOT'});
  const selected=[];
  for(const item of candidates){
   if(!(kind==='support'?item.price<reference:item.price>reference))continue;
   const distance=Math.max(tolerance,reference*.0015);
   const existing=selected.find(x=>Math.abs(x.price-item.price)<=distance);
   if(existing){
    existing.sources=[...new Set([...existing.sources,...item.source.split('+')])];
    existing.bandHalfWidth=Math.max(existing.bandHalfWidth||0,item.bandHalfWidth||0);
    existing.strength=Math.max(existing.strength||0,item.strength||0);
    // Kotlin reference remains exactly on its original price; no shifted signal level.
    if(item.source==='KOTLIN_REFERENCE')existing.price=item.price;
   }else selected.push({...item,sources:item.source.split('+')});
  }
  return selected.map(x=>({...x,source:x.sources.join('+')}))
   .sort((a,b)=>kind==='support'?b.price-a.price:a.price-b.price)
   .slice(0,Math.max(0,limit));
 }
 // Keep price and all S/R price tags, moving labels only; never move price lines.
 function layoutLabels(rows,top,bottom,separation=17){
  const out=[];const ordered=[...rows].sort((a,b)=>(a.priority??5)-(b.priority??5));
  for(const row of ordered){
   let y=Math.max(top,Math.min(bottom,row.y));
   if(out.some(x=>Math.abs(x.labelY-y)<separation)){
    const positions=[];for(let delta=1;delta<=Math.ceil((bottom-top)/separation);delta++){
     positions.push(y+delta*separation,y-delta*separation);
    }
    const free=positions.filter(p=>p>=top&&p<=bottom&&!out.some(x=>Math.abs(x.labelY-p)<separation));
    if(free.length)y=free.sort((a,b)=>Math.abs(a-row.y)-Math.abs(b-row.y))[0];
    else continue; // irreducible crowding: label is hidden, underlying level line remains
   }
   out.push({...row,labelY:y});
  }
  return out;
 }
 return Object.freeze({inspect,mergeLevels,layoutLabels});
});
