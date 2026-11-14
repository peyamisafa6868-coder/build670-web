/* Fixture-only browser acceptance: scan completion handoff + neon technical trends.
 * No live provider, signal attestation or APK runtime is claimed.
 */
const {launch,until}=require('./browser_helpers.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const output=path.join(__dirname,'..','test-results','scan-completion-trends');
fs.mkdirSync(output,{recursive:true});
const report={fixture:true,checks:[],errors:[]};
const initialId='f'.repeat(32);
let id=initialId,phase='RUNNING',env,page,holdPost=false,releasePost=null;
const rawRows=[
 ['ASELS','STRONG_BULLISH','GÜÇLÜ YÜKSELİŞ'],
 ['THYAO','BULLISH','YÜKSELİŞ'],
 ['TUPRS','STRONG_BEARISH','GÜÇLÜ DÜŞÜŞ'],
 ['EREGL','BEARISH','DÜŞÜŞ'],
 ['SISE','NEUTRAL','YATAY'],
 ['BIMAS','INSUFFICIENT_DATA','YETERSİZ VERİ']
].map(([symbol,state,label],i)=>({
 symbol,price:100+i,score:70+i,rankingScore:60+i,finalSignalScore:0,riskScore:10,
 dataConfidenceScore:75,rankingStatus:'WATCH_ONLY',signalValidity:'WATCH',
 signalValidityReason:'EXPLICIT DELAYED FIXTURE',direction:'NONE',
 source:'FIXTURE DELAYED',interval:'1d',closedBarCount:220,
 dataTimestamp:Date.now(),technical:{volumeRatio:1},
 discovery:{classification:'İZLEME',factors:[]},
 trendDisplay:{verifiedSignal:false,signalLabel:'GECİKMELİ • TEKNİK',scoreLabel:'—',
   dataLabel:'GECİKMELİ',trend:{state,label,strengthLevel:state.startsWith('STRONG_')?2:1}},
 candles:[]
}));
function snapshot(){
 const complete=phase!=='RUNNING';
 return {id,status:phase,total:632,processed:complete?632:35,successful:complete?589:20,
  insufficient:complete?39:0,errors:complete?4:0,interval:'1d',
  provider:'EXPLICIT MOCK • YAHOO DELAYED',signalAttestationVerified:false,
  failures:[],createdAt:Date.now()-30000,completedAt:complete?Date.now():null};
}
(async()=>{
 env=await launch(8808);page=await env.browser.newPage({viewport:{width:390,height:844}});
 page.on('pageerror',error=>report.errors.push(error.message));
 await page.route('**/api/universe',route=>route.fulfill({json:{count:632,records:[],identityMatched:0}}));
 await page.route('**/api/instruments',route=>route.fulfill({json:{items:[]}}));
 await page.route('**/api/scans',async route=>{
  assert.equal(route.request().method(),'POST');
  if(holdPost)await new Promise(resolve=>{releasePost=resolve;});
  return route.fulfill({json:snapshot()});
 });
 await page.route('**/api/scans/**',route=>route.fulfill({json:
  route.request().url().includes('/results?')?{total:rawRows.length,results:rawRows}:snapshot()}));
 await page.goto(env.base+'/?reference',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__BIST_ANDROID_UI_READY,null,{timeout:30000});
 await page.evaluate(()=>{
  const settings=BistNativePreferences.defaults();settings.delayed=true;settings.auto=false;
  localStorage.setItem('bist_build670_settings',JSON.stringify(settings));
  BistAndroid.reloadSettings();BistAndroid.navigate('bist_scan');
 });
 await page.locator('#apk-btnStartScan').click();
 await page.waitForFunction(jobId=>BistTerminal.job?.id===jobId&&BistAndroid.screen==='bist_scan',id);
 report.checks.push('Running job stays on scanner; no premature navigation');
 phase='COMPLETED_WITH_ERRORS';
 await page.waitForFunction(()=>BistAndroid.screen==='scan_results',null,{timeout:12000});
 await page.waitForFunction(()=>document.querySelectorAll('[data-native-item=scan_result]').length===6);
 const cards=await page.locator('[data-native-item=scan_result]').evaluateAll(nodes=>nodes.map(c=>({
  symbol:c.querySelector('[data-apk-id=symbol]')?.textContent,
  state:c.dataset.trendState||null,level:c.dataset.trendLevel||null,
  box:c.style.boxShadow,background:c.style.background,tooltip:c.title
 })));
 const bySymbol=Object.fromEntries(cards.map(card=>[card.symbol,card]));
 for(const [symbol,state,level,fragment] of [
  ['ASELS','STRONG_BULLISH','2','57, 255, 20'],
  ['THYAO','BULLISH','1','108, 245, 65'],
  ['TUPRS','STRONG_BEARISH','2','255, 28, 64'],
  ['EREGL','BEARISH','1','255, 94, 103']
 ]){
  const card=bySymbol[symbol];assert.ok(card,symbol);
  assert.equal(card.state,state);
  assert.equal(card.level,level);
  assert.ok(card.box.includes(fragment),symbol+' visual must use trend color');
  assert.ok(card.tooltip.includes('Canlı AL/SAT onayı değildir.'));
 }
 assert.ok(bySymbol.ASELS.box.includes('25px')&&bySymbol.THYAO.box.includes('12px'));
 assert.ok(bySymbol.TUPRS.box.includes('25px')&&bySymbol.EREGL.box.includes('12px'));
 assert.equal(bySymbol.SISE.state,null);
 assert.equal(bySymbol.BIMAS.state,null);
 report.checks.push('Strong upward trends phosphor green and weak upward trends softer green');
 report.checks.push('Strong downward trends brighter red; neutral/insufficient remain uncolored');
 await page.screenshot({path:path.join(output,'completed-neon-trends.png')});
 await page.evaluate(()=>BistAndroid.navigate('favorites'));
 await page.waitForTimeout(2500);
 assert.equal(await page.evaluate(()=>BistAndroid.screen),'favorites');
 report.checks.push('Completed job never steals navigation again');
 id='e'.repeat(32);phase='RUNNING';
 await page.evaluate(()=>BistAndroid.navigate('bist_scan'));
 await page.locator('#apk-btnStartScan').click();
 await page.waitForFunction(jobId=>BistTerminal.job?.id===jobId&&BistAndroid.screen==='bist_scan',id);
 await page.evaluate(()=>BistAndroid.navigate('favorites'));
 phase='COMPLETE';
 await page.waitForFunction(()=>BistTerminal.job?.status==='COMPLETE',null,{timeout:10000});
 await page.waitForTimeout(2300);
 assert.equal(await page.evaluate(()=>BistAndroid.screen),'favorites');
 report.checks.push('Manual navigation before scan completes cancels auto-handoff');
 await page.evaluate(()=>BistAndroid.navigate('bist_scan'));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__BIST_ANDROID_UI_READY,null,{timeout:30000});
 await page.waitForTimeout(2600);
 assert.equal(await page.evaluate(()=>BistAndroid.screen),'bist_scan');
 report.checks.push('Reloaded completed job does not trigger stale redirect');
 // A slow POST must not take the screen away after the user navigates.
 id='c'.repeat(32);phase='RUNNING';holdPost=true;
 await page.locator('#apk-btnStartScan').click();
 await until(()=>typeof releasePost==='function',6000);
 await page.evaluate(()=>BistAndroid.navigate('favorites'));
 holdPost=false;releasePost();
 await page.waitForFunction(jobId=>BistTerminal.job?.id===jobId,id);
 assert.equal(await page.evaluate(()=>BistAndroid.screen),'favorites');
 report.checks.push('Late scan-create HTTP response cannot steal a newer route');
 assert.deepEqual(report.errors,[]);
 report.status='passed';
})().catch(async error=>{
 report.status='failed';report.failure=error.stack;process.exitCode=1;
 if(page)await page.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
}).finally(async()=>{
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));if(env)await env.close();
});
