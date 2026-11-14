/* BUILD670 browser fixture: S/D, Support, Resistance on stock + fullscreen. */
const {launch}=require('./browser_helpers.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const folder=path.join(__dirname,'..','test-results','chart-support-levels');
fs.mkdirSync(folder,{recursive:true});
let env,page;const report={scope:'Explicit closed OHLCV fixtures; no real exchange prices or APK acceptance',checks:[],errors:[]};
(async()=>{
 env=await launch(8815);page=await env.browser.newPage({viewport:{width:390,height:844}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/api/universe',r=>r.fulfill({json:{count:0,records:[],identityMatched:0}}));
 await page.route('**/api/instruments',r=>r.fulfill({json:{items:[]}}));
 await page.route('**/history?**',r=>r.fulfill({status:503,json:{error:'MOCK ONLY'}}));
 await page.goto(env.base+'/?reference');
 await page.waitForFunction(()=>window.__BIST_ANDROID_UI_READY);
 await page.evaluate(()=>{
   const candles=Array.from({length:280},(_,i)=>{
     const p=100+Math.sin(i/6)*4+Math.sin(i/17)*1.1;
     return {timestamp:1700000000000+i*300000,open:p-.12,close:p+.12,high:p+.65,low:p-.65,volume:1000+i,closed:true};
   });
   window.__chartFixture={symbol:'ASELS',interval:'5m',source:'EXPLICIT CLOSED TEST BARS',lastBarClosed:true,candles};
   BistYahooAuto=Object.freeze({fetch:async()=>window.__chartFixture});
   BistAndroid.navigate('stock_detail',{symbol:'ASELS'});
 });
 await page.locator('#apk-quick5m').click();
 await page.waitForFunction(()=>!!AndroidPriceChart.getState(document.querySelector('#apk-chart'))?.model,null,{timeout:25000});
 const get=()=>page.evaluate(()=>{
   const s=AndroidPriceChart.getState(document.querySelector('#apk-chart'));
   return {auto:s.autoLevels,drawn:s.drawnLevels,options:{...s.options},
     indicators:s.model?.series?['ema9','ema21','sma50','sma200','vwap','rsi','macd','atr'].map(k=>s.model.series[k]?.at(-1)):[]};
 });
 const first=await get();
 assert.ok(first.auto.supports.length>0&&first.auto.resistances.length>0,'must find closed pivots');
 assert.ok(first.drawn.support.length>0&&first.drawn.resistance.length>0,'both directions visibly drawn');
 for(const k of ['toggleEma9','toggleEma21','toggleVwap'])assert.equal(first.options[k],true);
 report.checks.push('Auto levels rendered from 280 closed candles with all existing indicators retained');
 const support=page.locator('#apk-toggleSupport'),resistance=page.locator('#apk-toggleResistance'),master=page.locator('#apk-toggleSupportResistance');
 assert.ok(await support.isVisible()&&await resistance.isVisible()&&await master.isVisible());
 await support.click();
 const afterSupport=await get();
 assert.equal(afterSupport.drawn.support.length,0);
 assert.ok(afterSupport.drawn.resistance.length>0);
 assert.deepEqual(afterSupport.indicators,first.indicators);
 assert.equal(await support.getAttribute('aria-pressed'),'false');
 report.checks.push('Support hides alone, resistance and Kotlin indicator arrays unchanged');
 await resistance.click();
 const none=await get();
 assert.equal(none.drawn.support.length,0);
 assert.equal(none.drawn.resistance.length,0);
 await master.click();
 const both=await get();
 assert.ok(both.drawn.support.length>0&&both.drawn.resistance.length>0);
 assert.deepEqual(both.indicators,first.indicators);
 report.checks.push('S/D master turns both back on without recomputing RSI/EMA/MACD/ATR');
 await page.screenshot({path:path.join(folder,'portrait-chart-with-levels.png')});
 await page.evaluate(()=>BistAndroid.navigate('fullscreen',{symbol:'ASELS',data:window.__chartFixture}));
 await page.waitForFunction(()=>!!AndroidPriceChart.getState(document.querySelector('#apk-fullChart'))?.model,null,{timeout:25000});
 const full=page.locator('[data-chart-toggle=toggleSupport]'),res=page.locator('[data-chart-toggle=toggleResistance]');
 assert.ok(await full.isVisible()&&await res.isVisible());
 await full.click();
 const toggled=await page.evaluate(()=>AndroidPriceChart.getState(document.querySelector('#apk-fullChart')).drawnLevels);
 assert.equal(toggled.support.length,0);
 assert.ok(toggled.resistance.length>0);
 await full.click();
 const refreshed=await page.evaluate(()=>AndroidPriceChart.getState(document.querySelector('#apk-fullChart')).drawnLevels);
 assert.ok(refreshed.support.length>0);
 report.checks.push('Fullscreen separate S/R toggles work with same chart renderer');
 assert.deepEqual(report.errors,[]);report.status='passed';
})().catch(async e=>{report.status='failed';report.failure=e.stack;process.exitCode=1;if(page)await page.screenshot({path:path.join(folder,'failure.png')}).catch(()=>{});}).finally(async()=>{
 fs.writeFileSync(path.join(folder,'results.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));if(env)await env.close();
});
