/* BUILD670 chart-only pivot overlay. Does not alter Kotlin signals or indicators. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.Build670ChartLevels=api;
})(typeof window!=='undefined'?window:typeof globalThis!=='undefined'?globalThis:null,function(){
 'use strict';
 const finite=Number.isFinite;
 function compute(bars,{lastBarClosed=null,lookback=480,left=3,right=3}={}){
  if(!Array.isArray(bars)||bars.length<220)return {supports:[],resistances:[],reason:'INSUFFICIENT_HISTORY'};
  const closed=bars.filter((b,i)=>b&&typeof b==='object'&&(b.closed===true||(b.closed==null&&typeof lastBarClosed==='boolean'&&(i<bars.length-1||lastBarClosed))));
  if(closed.length<220)return {supports:[],resistances:[],reason:'INSUFFICIENT_CLOSED_HISTORY'};
  // No silently dropped corrupt OHLCV or reordered timestamps; no invented levels.
  let previous=-Infinity;
  for(const b of closed){
    const t=b.timestamp??b.time;
    if(!finite(t)||t<=previous||![b.open,b.high,b.low,b.close,b.volume].every(finite)
      ||!(0<b.low&&b.low<=Math.min(b.open,b.close)&&Math.max(b.open,b.close)<=b.high&&b.volume>=0))
      return {supports:[],resistances:[],reason:'INVALID_OHLCV'};
    previous=t;
  }
  const source=closed.slice(-Math.max(220,Math.min(1200,lookback)));
  const n=source.length,last=source[n-1],reference=last.close;
  const ranges=source.slice(-20).map((b,i,a)=>{
    const prev=i? a[i-1].close:b.close;
    return Math.max(b.high-b.low,Math.abs(b.high-prev),Math.abs(b.low-prev));
  });
  const atr=ranges.reduce((sum,v)=>sum+v,0)/ranges.length;
  const tolerance=Math.max(atr*.25,reference*.0015,Number.EPSILON);
  const candidates=[];
  for(let i=left;i<n-right;i++){
    const b=source[i],prior=source.slice(i-left,i),following=source.slice(i+1,i+right+1);
    if(prior.every(x=>b.low<x.low)&&following.every(x=>b.low<=x.low))
      candidates.push({price:b.low,kind:'support',idx:i});
    if(prior.every(x=>b.high>x.high)&&following.every(x=>b.high>=x.high))
      candidates.push({price:b.high,kind:'resistance',idx:i});
  }
  const groups={support:[],resistance:[]};
  for(const pivot of candidates){
    const list=groups[pivot.kind];
    let group=list.find(g=>Math.abs(g.price-pivot.price)<=tolerance);
    if(!group){group={price:pivot.price,count:0,lastIdx:pivot.idx,prices:[]};list.push(group);}
    group.prices.push(pivot.price);group.count++;
    group.price=group.prices.reduce((sum,v)=>sum+v,0)/group.prices.length;
    group.lastIdx=Math.max(group.lastIdx,pivot.idx);
  }
  const select=(kind)=>{
    const sorted=groups[kind].filter(g=>kind==='support'?g.price<reference:g.price>reference).map(g=>({
      price:g.price,touches:g.count,age:n-1-g.lastIdx,
      strength:Math.min(1,.25+.13*g.count+.34*(g.lastIdx/n)),
      source:'CONFIRMED_PIVOT',bandHalfWidth:tolerance,
      kind
    })).sort((a,b)=>(kind==='support'?b.price-a.price:a.price-b.price));
    const out=[];
    for(const item of sorted){
      if(out.every(v=>Math.abs(v.price-item.price)>tolerance*1.5))out.push(item);
      if(out.length===2)break;
    }
    return out;
  };
  return {supports:select('support'),resistances:select('resistance'),
    reason:'CLOSED_PIVOTS',closedCount:closed.length,atr,tolerance,reference};
 }
 return {compute};
});
