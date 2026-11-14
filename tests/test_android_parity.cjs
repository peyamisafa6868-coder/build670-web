// Independently generated Kotlin JVM golden outputs; compare every aligned value.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const context={Intl,Date};
vm.runInNewContext(html.slice(html.indexOf('const finite=x=>'),html.indexOf('function closedCandles(')),context);
const extra=require(path.join(root,'stock-analysis.js'));
const groups={};
for(const line of fs.readFileSync(path.join(__dirname,'fixtures/candles.csv'),'utf8').trim().split(/\r?\n/).slice(1)){
 const [name,...values]=line.split(','),[timestamp,open,high,low,close,volume]=values.map(Number);
 (groups[name]??=[]).push({timestamp,open,high,low,close,volume,closed:true});
}
const expected=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/android_golden.json'),'utf8'));
let comparisons=0,maxDifference=0;
function compare(actual,want,label){
 if(Array.isArray(want)){assert.equal(actual.length,want.length,label);want.forEach((v,i)=>compare(actual[i],v,label+'['+i+']'));return;}
 if(want&&typeof want==='object'){for(const k of Object.keys(want))compare(actual[k],want[k],label+'.'+k);return;}
 if(typeof want==='number'){
  assert.equal(typeof actual,'number',label);const diff=Math.abs(actual-want);maxDifference=Math.max(maxDifference,diff);
  assert.ok(diff<=1e-8,label+': '+actual+' != '+want);
 }else assert.equal(actual,want,label);
 comparisons++;
}
for(const [name,bars] of Object.entries(groups)){
 const result=context.calculateIndicators(bars,{intraday:name==='intraday'});
 compare(result,expected[name].series,name+'.series');compare(extra.extended(bars),expected[name].extended,name+'.extended');
 compare(extra.ladder(bars,bars.at(-1).close),expected[name].ladder,name+'.ladder');
 compare(extra.readable(bars,name==='intraday'?'5m':'1d',context.calculateIndicators),expected[name].readable,name+'.readable');
 const forming={...bars.at(-1),timestamp:bars.at(-1).timestamp+86400000,open:250,high:300,low:200,close:275,closed:false};
 compare(context.calculateIndicators([...bars,forming],{intraday:name==='intraday'}),expected[name].series,name+'.formingExcluded');
 compare(extra.extended([...bars,forming]),expected[name].extended,name+'.formingExtraExcluded');
}
console.log(JSON.stringify({cases:Object.keys(groups).length,comparisons,maxDifference,status:'passed'}));
