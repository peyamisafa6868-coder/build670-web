const assert=require('node:assert/strict');
const fs=require('node:fs');
const {launch}=require('./browser_helpers.cjs');
(async()=>{const env=await launch(8871);try{
 const page=await env.browser.newPage({viewport:{width:390,height:844}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));let mode='partial',requests=0;
 await page.route('**/api/instruments',async route=>{requests++;
  if(mode==='failed')return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Test bağlantısı kullanılamıyor'})});
  await route.fulfill({json:{items:[{key:'XU100',ticker:'XU100.IS',provider:'TEST FIXTURE',price:123,changePct:0,asOf:1793946600000}, {key:'XAUUSD',error:'XAUUSD=X: HTTP 404',status:404}],live:false}});
 });
 await page.goto(env.base+'/');await page.waitForFunction(()=>window.__BIST_ANDROID_UI_READY);
 await page.waitForFunction(()=>document.getElementById('apk-market-diagnostics')?.textContent.includes('HTTP 404'));
 assert.equal(await page.locator('[data-apk-id="marketBist100Value"]').innerText(),'123,00');
 assert.match(await page.locator('[data-apk-id="marketBist100Spark"]').innerText(),/06\.11\.2026/);
 assert.equal(await page.locator('[data-apk-id="marketGoldValue"]').innerText(),'—');
 await page.locator('#apk-market-status summary').click();
 mode='failed';await page.getByRole('button',{name:'PİYASA VERİSİNİ YENİDEN DENE'}).click();
 await page.waitForFunction(()=>document.getElementById('apk-market-diagnostics')?.textContent.includes('Yenileme başarısız'));
 assert.equal(await page.locator('[data-apk-id="marketBist100Value"]').innerText(),'123,00');
 mode='partial';await page.getByRole('button',{name:'PİYASA VERİSİNİ YENİDEN DENE'}).click();
 await page.waitForFunction(()=>!document.getElementById('apk-market-diagnostics')?.textContent.includes('Yenileme başarısız'));
 for(const width of [320,360,390,768,1280]){await page.setViewportSize({width,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'overflow at '+width);}
 fs.mkdirSync('test-results/market',{recursive:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/market/fixture-errors-390.png'});
 await page.locator('[data-apk-id="marketViopCard"]').click();
 assert.equal(await page.evaluate(()=>BistAndroid.screen),'viop');
 assert.deepEqual(errors,[]);assert(requests>=3);
 fs.mkdirSync('test-results/market',{recursive:true});fs.writeFileSync('test-results/market/checks.json',JSON.stringify({passed:true,requests,widths:[320,360,390,768,1280],fixtureOnly:true}));
 console.log('PASS: partial failure, date, retry, stale retention, recovery, VIOP navigation, responsive widths');
}finally{await env.close();}})().catch(e=>{console.error(e);process.exitCode=1});
