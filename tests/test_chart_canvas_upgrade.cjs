const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'index.html'),'utf8').split('/* === ORIGINAL BUILD 668 MODULE: indicators.js === */')[1].split('function closedCandles(payload)')[0];
global.window=global;
vm.runInThisContext(source);
require('../chart-support-levels.js');
require('../chart-integrity.js');
global.devicePixelRatio=1;
global.getComputedStyle=()=>({paddingLeft:'0px',paddingRight:'0px',paddingTop:'0px',paddingBottom:'0px'});
global.requestAnimationFrame=fn=>setTimeout(fn,0);global.cancelAnimationFrame=clearTimeout;
const context=new Proxy({measureText:v=>({width:String(v).length*6})},{get:(o,k)=>k in o?o[k]:()=>{},set:(o,k,v)=>{o[k]=v;return true;}});
const canvas={style:{},getContext:()=>context,setAttribute:()=>{},getBoundingClientRect:()=>({left:0,width:1200}),parentElement:null};
global.document={createElement:type=>{assert.equal(type,'canvas');return canvas;}};
vm.runInThisContext(fs.readFileSync(path.join(root,'android-chart.js'),'utf8'));
const chart={clientWidth:1200,clientHeight:560,isConnected:true,querySelector:q=>q==='canvas'&&canvas.parentElement===chart?canvas:null,replaceChildren(x){canvas.parentElement=x?this:null;}};
const bars=Array.from({length:280},(_,i)=>{const p=100+Math.sin(i/6)*4+Math.sin(i/17)*1.1;return {timestamp:1700000000000+i*300000,open:p-.12,close:p+.12,high:p+.65,low:p-.65,volume:1000+i,closed:true};});
const data={symbol:'ASELS',interval:'5m',source:'TEST_ONLY',lastBarClosed:true,candles:bars};
const series=calculateIndicators(bars,{intraday:true});
global.BistTerminal={api:async()=>({series,trend:{},levels:{support:{price:97.02},resistance:{price:103.05}}})};
const opts={toggleSupportResistance:true,toggleSupport:true,toggleResistance:true,toggleEma9:true,toggleEma21:true,toggleSma50:true,toggleSma200:true,toggleVwap:true,toggleBollinger:true,toggleRsi:true,toggleVolume:true,toggleMacd:false};
const st=AndroidPriceChart.mount(chart,data,{options:opts});
setTimeout(()=>{
 try{
  assert.ok(st.model,'Kotlin-model promise resolved');
  assert.ok(st.mergedLevels.support.length&&st.mergedLevels.resistance.length);
  assert.ok(st.drawnLevels.support.length&&st.drawnLevels.resistance.length);
  assert.ok(st.axisLabels.some(x=>x.source==='LAST_PRICE'));
  const labels=st.axisLabels;
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++)assert.ok(Math.abs(labels[i].labelY-labels[j].labelY)>=17);
  const prev=st.model.series.ema9.at(-1);
  opts.toggleSupport=false;AndroidPriceChart.mount(chart,data,{options:opts});
  assert.equal(st.drawnLevels.support.length,0);assert.ok(st.drawnLevels.resistance.length>0);
  assert.equal(st.model.series.ema9.at(-1),prev);
  console.log(JSON.stringify({status:'passed',renderer:'mock Canvas, actual android-chart.js',checks:7}));
 }catch(e){console.error(e);process.exitCode=1;}
},20);
