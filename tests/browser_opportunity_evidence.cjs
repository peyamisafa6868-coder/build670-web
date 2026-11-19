/* Full-width home panel and fundamental-strategy fixture acceptance.
   All data below is synthetic; never interpreted as a real BIST scan. */
const {launch}=require('./browser_helpers.cjs');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const out=path.join(__dirname,'..','test-results','opportunity-evidence');
fs.mkdirSync(out,{recursive:true});
const report={fixture:true,checks:[],errors:[]};
const jobId='h'.repeat(32);
const timestamp=Date.now()-3600000;
const make=(symbol,state,validity,i,change)=>({
  symbol,companyName:'EXPLICIT TEST '+symbol,price:110+i,dailyChangePct:change,
  signalValidity:validity,direction:validity==='VALID'?'LONG':'NONE',score:99,
  dataTimestamp:timestamp+i*60000,closedBarCount:220,
  source:'SYNTHETIC DELAYED TEST',interval:'5m',
  discovery:{reason:'Kapanmış mum ve teknik hesap kanıtı • '+symbol},
  trendDisplay:{verifiedSignal:validity==='VALID',trend:{state,label:state}},
  candles:Array.from({length:36},(_,j)=>({timestamp:timestamp-(35-j)*300000,close:100+j*(i%2?-1:1)+i}))
});
const rows=[
 make('ASELS','BULLISH','WATCH',0,1.2),
 make('THYAO','STRONG_BULLISH','WATCH',1,null),
 make('EREGL','BEARISH','WATCH',2,-1.5),
 make('SISE','NEUTRAL','WATCH',3,null),
 make('TUPRS','STRONG_BEARISH','VALID',4,null)
];
const job={id:jobId,status:'COMPLETE',total:632,processed:632,successful:628,insufficient:3,errors:1,
  interval:'5m',provider:'EXPLICIT DELAYED FIXTURE',signalAttestationVerified:false,
  completedAt:Date.now(),createdAt:Date.now()-100000};
let env,page;
(async()=>{
  env=await launch(8813);
  page=await env.browser.newPage({viewport:{width:1848,height:688}});
  page.on('pageerror',e=>report.errors.push(e.message));
  await page.route('**/api/instruments',route=>route.fulfill({json:{items:[]}}));
  await page.route('**/api/universe',route=>route.fulfill({json:{count:632,records:[],identityMatched:0}}));
  await page.route('**/api/scans',route=>route.fulfill({json:job}));
  await page.route('**/api/scans/**',route=>{
    const url=route.request().url();
    if(url.includes('/results?'))return route.fulfill({json:{total:rows.length,results:rows}});
    if(url.includes('/failures?'))return route.fulfill({json:{total:1,failures:[{symbol:'MISSING',code:'INSUFFICIENT_HISTORY',classification:'INSUFFICIENT_DATA',closedBarCount:87,error:'87 / 220 kapanmış mum'}]}});
    return route.fulfill({json:job});
  });
  await page.goto(env.base+'/?reference');
  await page.waitForFunction(()=>window.__BIST_ANDROID_UI_READY,null,{timeout:30000});
  await page.evaluate(()=>{
    const settings=BistNativePreferences.defaults();settings.delayed=true;settings.auto=false;settings.interval='5m';
    localStorage.setItem('bist_build670_settings',JSON.stringify(settings));
    BistAndroid.reloadSettings();BistAndroid.navigate('bist_scan');
  });
  await page.locator('#apk-btnStartScan').click();
  await page.waitForFunction(id=>BistTerminal.job?.id===id,jobId);
  await page.evaluate(()=>BistAndroid.navigate('main'));
  await page.waitForFunction(()=>document.querySelectorAll('[data-home-symbol]').length===5);
  await page.waitForFunction(()=>document.querySelectorAll('[data-home-spark] canvas').length===5);
  assert.match(await page.locator('[data-home-dashboard]').innerText(),/Eksik veriyle tamamlandı/);
  assert.match(await page.locator('[data-home-dashboard]').innerText(),/Gecikmeli analiz • Onaylı AL\/SAT yok/);
  assert.match(await page.locator('[data-home-dashboard]').innerText(),/628/);
  assert.equal(await page.locator('[data-home-symbol="ASELS"]').getAttribute('data-home-signal'),'WATCH');
  assert.doesNotMatch(await page.locator('[data-home-symbol="ASELS"]').innerText(),/99\/100/);
  report.checks.push('Full scan metadata, actual closes, reason, independent trend and WATCH state without deceptive score');
  const layout=await page.locator('[data-home-symbol="ASELS"]').boundingBox();
  assert.ok(layout.width>700,'Desktop row should use full available width');
  await page.screenshot({path:path.join(out,'desktop-1848.png'),fullPage:true});
  await page.locator('#apk-todayLongTab').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-home-symbol]').length===2);
  assert.equal(await page.locator('#apk-todayLongTab').getAttribute('aria-pressed'),'true');
  await page.locator('[data-home-filter="Sinyal-VERIFIED"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-home-symbol]').length===0);
  assert.match(await page.locator('#apk-todayEmpty').innerText(),/filtresine uygun kayıt yok/);
  report.checks.push('Trend and verified signal filters are separate; delayed WATCH never becomes verified');
  await page.locator('#apk-todayAllTab').click();
  await page.waitForFunction(()=>document.querySelectorAll('[data-home-symbol]').length===5);
  await page.locator('#apk-btnSeeAllOpportunities').click();
  await page.waitForFunction(()=>BistAndroid.screen==='opportunity');
  assert.equal(await page.evaluate(()=>BistAndroid.params.jobId),jobId);
  assert.equal(await page.evaluate(()=>BistAndroid.params.trendFilter),'ALL');
  report.checks.push('See All retains exact job and filter context without creating a new job');
  await page.evaluate(()=>BistAndroid.navigate('main'));
  await page.waitForFunction(()=>document.querySelectorAll('[data-home-symbol]').length===5);
  await page.locator('[data-home-symbol="THYAO"]').focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(()=>BistAndroid.screen==='stock_detail');
  assert.equal(await page.evaluate(()=>BistAndroid.params.symbol),'THYAO');
  assert.equal(await page.evaluate(()=>BistAndroid.params.interval),'5m');
  report.checks.push('Keyboard card activation preserves the symbol and scan interval');
  await page.evaluate(()=>BistAndroid.navigate('main'));
  await page.setViewportSize({width:390,height:844});
  await page.waitForFunction(()=>document.querySelectorAll('[data-home-symbol]').length===5);
  const size=await page.evaluate(()=>{
    const row=document.querySelector('[data-home-symbol="ASELS"]').getBoundingClientRect();
    const pane=document.querySelector('[data-apk-id="todayOpportunityRows"]').getBoundingClientRect();
    return {rowWidth:row.width,paneWidth:pane.width,viewport:innerWidth};
  });
  assert.ok(size.rowWidth>260&&size.rowWidth<=size.viewport+1,JSON.stringify(size));
  assert.ok(size.paneWidth<=size.viewport+1,JSON.stringify(size));
  await page.screenshot({path:path.join(out,'mobile-390.png'),fullPage:true});
  report.checks.push('390px mobile view has a visible compact card and chart with no fixed 690dp row');
  await page.evaluate(()=>BistAndroid.navigate('cheap'));
  const weights=page.locator('[data-valuation-weights]');
  assert.match(await weights.innerText(),/%50 değer \/ %30 kalite \/ %20 sağlamlık/);
  await page.locator('[data-strategy="QUALITY"]').click();
  assert.match(await weights.innerText(),/%25 değer \/ %50 kalite \/ %25 sağlamlık/);
  assert.equal(await page.locator('[data-strategy="QUALITY"]').getAttribute('aria-pressed'),'true');
  await page.locator('[data-strategy="DISCOUNT"]').click();
  assert.match(await weights.innerText(),/%65 değer \/ %20 kalite \/ %15 sağlamlık/);
  assert.equal(await page.locator('[data-valuation-gate="blocked"]').isDisabled(),true);
  assert.match(await page.locator('[data-financial-source="unverified"]').innerText(),/Rapor dönemi: doğrulanmadı/);
  report.checks.push('Fundamental strategy weight descriptions match Kotlin, with unverified source gate blocked');
  assert.deepEqual(report.errors,[]);
  report.status='passed';
})().catch(async e=>{
  report.status='failed';report.failure=e.stack;process.exitCode=1;
  if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
}).finally(async()=>{
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report));if(env)await env.close();
});
