/* Synthetic independent frames; original Kotlin trends/summary, real rendered Android XML. */
const {root,launch}=require('./browser_helpers.cjs'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const out=path.join(root,'test-results/technical');fs.mkdirSync(out,{recursive:true});let env,page;const report={scope:'Explicit OHLCV fixtures; no live feed or whole APK screenshot acceptance.',checks:[],errors:[]};
(async()=>{
 env=await launch(8800);page=await env.browser.newPage({viewport:{width:390,height:844}});page.on('pageerror',e=>report.errors.push(e.message));await page.route('**/api/universe',r=>r.fulfill({json:{count:0,records:[],identityMatched:0}}));await page.route('**/api/instruments',r=>r.fulfill({json:{items:[]}}));await page.goto(env.base+'/?reference');await page.waitForFunction(()=>window.__BIST_ANDROID_UI_READY);
 await page.evaluate(()=>BistAndroid.navigate('technical_analysis'));assert.equal(await page.locator('#apk-techSignal').innerText(),'VERİ YOK');assert.equal(await page.locator('[data-native-item=indicator]').count(),0);report.checks.push('No selection uses the original empty analysis state');
 await page.evaluate(()=>{
  window.__frames=[];window.BistYahooAuto={fetch:async(symbol,interval)=>{__frames.push(interval);const step=({'3m':1,'5m':-1,'60m':0,'1d':1})[interval];return {symbol,interval,candles:Array.from({length:40},(_,i)=>({timestamp:1700000000000+i*60000,open:100+i*step,high:102+i*step,low:99+i*step,close:101+i*step,volume:100,closed:true}))};}};
  BistAndroid.navigate('technical_analysis',{symbol:'ASELS',opportunity:{symbol:'ASELS',companyName:'EXPLICIT ANALYSIS FIXTURE',price:120,technicalLabel:'GECİKMELİ',technical:{rsi14:50,macd:2,macdSignal:1,ema20:110,ema50:105,ema200:100,volumeRatio:1.5,atr14:2,support:95,resistance:140}}});
 });
 await page.waitForFunction(()=>document.getElementById('apk-techAdviceScore').textContent.includes('/100'));assert.deepEqual((await page.evaluate(()=>__frames)).sort(),['1d','3m','5m','60m']);assert.equal(await page.locator('[data-native-item=indicator]').count(),12);assert.equal(await page.locator('#apk-trend3mTrend').innerText(),'YÜKSELİŞ');assert.equal(await page.locator('#apk-trend5mTrend').innerText(),'DÜŞÜŞ');assert.equal(await page.locator('#apk-trend1hTrend').innerText(),'YATAY');report.checks.push('Twelve original indicator rows and four independent timeframe regressions are populated');
 await page.locator('#apk-techTabPattern').click();
 assert.equal(await page.locator('#apk-techTabPattern').getAttribute('aria-pressed'),'true');
 assert.match(await page.locator('#apk-tech-tab-detail').innerText(),/Doğrulanmış mum formasyonu sonucu mevcut değil/);
 assert.equal(await page.locator('#apk-indicatorContainer').isVisible(),false);
 await page.locator('#apk-techTabLevels').click();
 assert.match(await page.locator('#apk-tech-tab-detail').innerText(),/Destek: 95,00/);
 assert.match(await page.locator('#apk-tech-tab-detail').innerText(),/Direnç: 140,00/);
 await page.locator('#apk-techTabIndicators').click();
 assert.equal(await page.locator('#apk-techTabIndicators').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('#apk-indicatorContainer').isVisible(),true);
 report.checks.push('All three native technical tabs open distinct panels and retain real support/resistance values');
 assert.match(await page.locator('#apk-techAdviceEvidence').innerText(),/Kanıt kalitesi/);assert.match(await page.locator('#apk-techAdviceDetail').innerText(),/NEDEN BU SONUÇ/);assert.match(await page.locator('#apk-techAdviceInvalidation').innerText(),/./);assert.equal(await page.locator('#apk-techSignal').innerText(),'TEKNİK İZLEME • AL/SAT ONAYI YOK');report.checks.push('Original evidence, risk and invalidation appear without granting a delayed trade signal');await page.screenshot({path:path.join(out,'filled-390.png')});
 await page.evaluate(()=>{BistAndroid.navigate('main');window.__release=null;window.BistYahooAuto={fetch:()=>new Promise(r=>{__release=r;})};BistAndroid.navigate('technical_analysis',{symbol:'OLD',opportunity:{symbol:'OLD',price:100,technical:{}}});});await page.waitForFunction(()=>typeof __release==='function');await page.evaluate(()=>{BistAndroid.navigate('settings');__release({candles:[]});});await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>BistAndroid.screen),'settings');assert.equal(await page.locator('dialog[open]').count(),0);report.checks.push('A late timeframe result cannot repaint a different route');
 assert.deepEqual(report.errors,[]);report.status='passed';
})().catch(async e=>{report.status='failed';report.failure=e.stack;process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}).finally(async()=>{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(env)await env.close();});
