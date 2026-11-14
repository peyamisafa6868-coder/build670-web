/* Regression check: reversed provider responses, stale drawing and visible error overlay. */
const {launch}=require('./browser_helpers.cjs');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/chart-state'+(process.env.LOCAL_ASSET_DIR?'-patch':''));fs.mkdirSync(out,{recursive:true});
let base;const report={checks:[],errors:[],csp:[],fixture:process.env.TEST_REAL_PROVIDER==='1'?'Real daily provider history; response-order fixture only.':'Synthetic OHLCV fixture; not market-data acceptance.'};let env,browser,page;
const check=(label,ok)=>{assert.ok(ok,label);report.checks.push(label);};
(async()=>{
 env=await launch(8794);base=env.base;browser=env.browser;report.base=base;
 page=await browser.newPage({viewport:{width:390,height:820}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{window.__csp=[];addEventListener('securitypolicyviolation',e=>__csp.push(e.effectiveDirective+':'+e.blockedURI));});
 if(process.env.LOCAL_ASSET_DIR){
  const dir=path.resolve(process.env.LOCAL_ASSET_DIR),assets=['android-app.js','android-chart.js'];
  for(const name of assets)await page.route('**/'+name,route=>route.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync(path.join(dir,name),'utf8')}));
  await page.route(url=>url.origin===new URL(base).origin&&url.pathname==='/',async route=>{const response=await route.fetch();let html=await response.text();for(const name of assets){const re=new RegExp('<script src="/'+name.replaceAll('.','\\.')+'" integrity="(sha256-[^"]+)"');const m=html.match(re);assert.ok(m,'SRI '+name);const hash='sha256-'+crypto.createHash('sha256').update(fs.readFileSync(path.join(dir,name))).digest('base64');html=html.replaceAll(m[1],hash);}html=html.replace(/<style id="android-theme">[\s\S]*?<\/style>/,'<style id="android-theme">'+fs.readFileSync(path.join(dir,'android-ui.css'),'utf8')+'</style>');await route.fulfill({response,body:html});});
 }
 if(process.env.TEST_REAL_PROVIDER!=='1'){await page.route('**/api/universe',r=>r.fulfill({json:{count:0,records:[],identityMatched:0}}));await page.route('**/api/instruments',r=>r.fulfill({json:{items:[]}}));await page.route('**/history?**',r=>r.fulfill({status:503,json:{error:'EXPLICIT TEST'}}));}
 await page.goto(base+'/?reference',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__BIST_ANDROID_UI_READY);await page.evaluate(()=>BistAndroid.navigate('stock_detail',{symbol:'THYAO'}));
 await page.evaluate(async real=>{window.__chartFixture=real?await BistYahooAuto.fetch('THYAO','1d'):{symbol:'THYAO',interval:'1d',lastBarClosed:true,source:'EXPLICIT TEST FIXTURE',candles:diagFixtureBars(260).map(x=>({...x,closed:true}))};window.__pendingChart={};window.BistYahooAuto=Object.freeze({fetch:(symbol,interval)=>new Promise((resolve,reject)=>{__pendingChart[interval]={resolve,reject};})});},process.env.TEST_REAL_PROVIDER==='1');
 await page.locator('#apk-quick5m').click();await page.waitForFunction(()=>__pendingChart['5m']);await page.locator('#apk-quick10m').click();await page.waitForFunction(()=>__pendingChart['10m']);
 await page.evaluate(()=>__pendingChart['10m'].resolve({...__chartFixture,interval:'10m',requestTag:'10m'}));await page.waitForFunction(()=>AndroidPriceChart.getState(document.getElementById('apk-chart'))?.data.requestTag==='10m');
 await page.evaluate(()=>__pendingChart['5m'].resolve({...__chartFixture,interval:'5m',requestTag:'5m'}));await page.waitForTimeout(500);
 check('A late older response cannot replace the latest period request',await page.evaluate(()=>AndroidPriceChart.getState(document.getElementById('apk-chart'))?.data.requestTag==='10m'));
 await page.locator('#apk-quick1h').click();await page.waitForFunction(()=>__pendingChart['60m']);
 check('Starting a new request discards the previous canvas and chart state',await page.evaluate(()=>!AndroidPriceChart.getState(document.getElementById('apk-chart'))&&document.querySelectorAll('#apk-chart canvas').length===0));
 await page.evaluate(()=>__pendingChart['60m'].reject(Error('INJECTED_PROVIDER_FAILURE')));await page.waitForFunction(()=>document.getElementById('apk-chartUnavailableReason').textContent.includes('INJECTED_PROVIDER_FAILURE'));
 await page.locator('#apk-chartUnavailableReason').scrollIntoViewIfNeeded();
 report.overlay=await page.evaluate(()=>{const panel=document.getElementById('apk-chartUnavailablePanel'),frame=document.getElementById('apk-chartFrame'),reason=document.getElementById('apk-chartUnavailableReason'),p=panel.getBoundingClientRect(),f=frame.getBoundingClientRect(),r=reason.getBoundingClientRect(),hit=document.elementFromPoint((r.left+r.right)/2,(r.top+r.bottom)/2);return {panel:{x:p.x,y:p.y,width:p.width,height:p.height},frame:{x:f.x,y:f.y,width:f.width,height:f.height},reasonOnTop:hit===reason||reason.contains(hit),support:document.getElementById('apk-graphSupport').textContent,resistance:document.getElementById('apk-graphResistance').textContent};});
 check('The error panel is contained inside the chart frame',report.overlay.panel.y>=report.overlay.frame.y&&report.overlay.panel.y+report.overlay.panel.height<=report.overlay.frame.y+report.overlay.frame.height+1);
 check('The provider reason is actually painted above other cards',report.overlay.reasonOnTop);
 check('A failed period has no stale support or resistance',report.overlay.support==='DESTEK —'&&report.overlay.resistance==='DİRENÇ —');
 await page.screenshot({path:path.join(out,'provider-error-visible.png')});await page.waitForTimeout(800);
 check('An old asynchronous chart model cannot redraw after failure',await page.evaluate(()=>!AndroidPriceChart.getState(document.getElementById('apk-chart'))&&document.querySelectorAll('#apk-chart canvas').length===0));
 await page.locator('#apk-quick1d').click();await page.waitForFunction(()=>__pendingChart['1d']);await page.evaluate(()=>__pendingChart['1d'].resolve({...__chartFixture,requestTag:'retry'}));await page.waitForFunction(()=>AndroidPriceChart.getState(document.getElementById('apk-chart'))?.model,null,{timeout:45000});
 check('A later successful request restores the chart and hides the error',await page.evaluate(()=>document.querySelectorAll('#apk-chart canvas').length===1&&document.getElementById('apk-chartUnavailablePanel').hidden));
 report.csp=await page.evaluate(()=>__csp);assert.deepEqual(report.errors,[]);assert.deepEqual(report.csp,[]);report.status='passed';
})().catch(async e=>{report.status='failed';report.failure=e.stack;process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}).finally(async()=>{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(env)await env.close();});
