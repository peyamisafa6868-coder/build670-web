const test=require('node:test'); const assert=require('node:assert/strict');
const levels=require('../chart-support-levels.js');
const a=require('../stock-analysis.js');
const make=(n,closed=true)=>Array.from({length:n},(_,i)=>({timestamp:1700000000000+i*300000,time:1700000000000+i*300000,open:100,high:101+(i%13)/10,low:99-(i%11)/10,close:100.25,volume:1000,closed}));
test('unconfirmed OHLCV never generates a chart pivot',()=>{
  assert.equal(levels.compute(make(260,null)).reason,'INSUFFICIENT_CLOSED_HISTORY');
  assert.equal(levels.compute(make(260,false)).reason,'INSUFFICIENT_CLOSED_HISTORY');
  assert.equal(levels.compute(make(219,true)).reason,'INSUFFICIENT_HISTORY');
  assert.notEqual(levels.compute(make(220,true)).reason,'INSUFFICIENT_CLOSED_HISTORY');
});
test('unconfirmed OHLCV never generates extended metrics or pivot levels',()=>{
 const result=a.extended(make(260,false));
 assert.equal(result.stochastic14,null);assert.equal(result.cci20,null);assert.deepEqual(a.pivotLevels(make(260,false)),[]);
});
