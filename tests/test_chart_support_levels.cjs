/* BUILD670 deterministic closed-candle pivot geometry; never signals or licensed prices. */
const assert=require('node:assert/strict');
const levels=require('../chart-support-levels.js');
const bars=Array.from({length:280},(_,i)=>{
  const p=100+Math.sin(i/6)*4+Math.sin(i/17)*1.1;
  return {timestamp:1700000000000+i*300000,open:p-.12,close:p+.12,
    high:p+.65,low:p-.65,volume:1000+i,closed:true};
});
const ok=levels.compute(bars,{lastBarClosed:true});
assert.equal(ok.reason,'CLOSED_PIVOTS');
assert.equal(ok.closedCount,280);
assert.ok(ok.supports.length>=1,'Expected known prior pivot lows');
assert.ok(ok.resistances.length>=1,'Expected known prior pivot highs');
assert.ok(ok.supports.length<=2&&ok.resistances.length<=2);
for(const l of ok.supports)assert.ok(l.price<ok.reference&&l.price>0);
for(const l of ok.resistances)assert.ok(l.price>ok.reference&&l.price>0);
assert.ok(ok.atr>0&&ok.tolerance>0);
assert.equal(levels.compute(bars.slice(0,219),{lastBarClosed:true}).reason,'INSUFFICIENT_HISTORY');
const forming={...bars.at(-1),timestamp:bars.at(-1).timestamp+300000,open:10,high:999,low:1,close:500,closed:false};
const closed=levels.compute(bars,{lastBarClosed:true});
const open=levels.compute([...bars,forming],{lastBarClosed:false});
assert.deepEqual(open,closed,'Unclosed extreme bar must never move pivots, reference or ATR');
const wrong=bars.map(b=>({...b}));wrong[100].timestamp=wrong[99].timestamp;
assert.equal(levels.compute(wrong,{lastBarClosed:true}).reason,'INVALID_OHLCV');
const invalid=bars.map(b=>({...b}));invalid[105].high=invalid[105].low-2;
assert.equal(levels.compute(invalid,{lastBarClosed:true}).reason,'INVALID_OHLCV');
const poor=bars.map(b=>({...b}));poor[90].volume=NaN;
assert.equal(levels.compute(poor,{lastBarClosed:true}).reason,'INVALID_OHLCV');
const truncated=bars.map((b,i)=>({...b,closed:i<219}));
assert.equal(levels.compute(truncated,{lastBarClosed:false}).reason,'INSUFFICIENT_CLOSED_HISTORY');
console.log(JSON.stringify({status:'passed',type:'CLOSED_OHLCV_ONLY',checks:10,
  supportCount:ok.supports.length,resistanceCount:ok.resistances.length,source:'SYNTHETIC_FIXTURE'}));
