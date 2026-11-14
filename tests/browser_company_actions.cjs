const assert=require('node:assert/strict'),fs=require('node:fs'),{launch}=require('./browser_helpers.cjs');
(async()=>{const env=await launch(8886);try{
 const page=await env.browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));let requests=[],newsCategories=[];
 await page.route('**/history?*',r=>r.fulfill({status:503,json:{error:'TEST market unavailable'}}));
 await page.route('**/api/company?*',r=>{const u=new URL(r.request().url()),kind=u.searchParams.get('kind');requests.push(kind);return r.fulfill({json:{symbol:'TTRAK',companyName:'TÜRK TRAKTÖR VE ZİRAAT MAKİNELERİ A.Ş.',source:'https://www.kap.org.tr',fetchedAt:1794300000000,note:'EXPLICIT TEST FIXTURE',tables:kind==='ownership'?[[['Ortak','Pay (%)'],['TEST ORTAK','37,5']]]:[[['FİNANSAL DURUM TABLOSU','2026/09'],['TEST VARLIK','123']]]}});});
 await page.route('**/api/news?*',r=>{newsCategories.push(new URL(r.request().url()).searchParams.get('category'));return r.fulfill({json:{provider:'EXPLICIT TEST FIXTURE',fetchedAt:1794300000000,items:[{title:'TTRAK temettü açıklaması',url:'https://www.kap.org.tr/tr/arama',source:'TEST',publishedAt:1794300000000},{title:'TTRAK analiz raporu',url:'https://www.isyatirim.com.tr',source:'TEST',publishedAt:1794300000000}]}});});
 await page.goto(env.base+'/#stock_detail?symbol=TTRAK');await page.waitForFunction(()=>window.__BIST_ANDROID_UI_READY);
 for(let round=0;round<3;round++)for(const [id,heading] of [['expNavCompany','Şirket Bilgileri'],['expNavFinancial','Finansal Tablolar'],['expNavOwnership','Ortaklık Yapısı'],['expNavDividend','Temettü geçmişi'],['expNavLegislation','Resmî Mevzuat'],['expNavAnalyst','Analist Raporları']]){
  const button=page.locator('#apk-'+id);await button.focus();await page.keyboard.press(id==='expNavOwnership'?'Space':'Enter');
  await page.waitForSelector('dialog[open] h2');assert.match(await page.locator('dialog[open] h2').innerText(),new RegExp('TTRAK.*'+heading));assert.match(await page.locator('dialog[open] .company-identity').innerText(),/TÜRK TRAKTÖR/);
  assert.match(await page.locator('dialog[open] a').first().getAttribute('href'),/1393-turk-traktor/);
  if(id==='expNavFinancial'||id==='expNavOwnership'){await page.waitForSelector('dialog[open] .company-source-content table');assert.match(await page.locator('dialog[open] .company-source-content table').innerText(),id==='expNavOwnership'?/TEST ORTAK/:/TEST VARLIK/);}
  if(id==='expNavDividend'||id==='expNavAnalyst')await page.waitForSelector('dialog[open] .company-headline');
  assert(await page.locator('dialog[open] .apk-detail-button').first().evaluate(e=>getComputedStyle(e).backgroundColor==='rgb(8, 123, 232)'));
  await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 }
 await page.locator('#apk-detailTabTechnical').click();await page.locator('#apk-expNavGraph').click();assert(await page.locator('#apk-detailChartSection').isVisible());assert(!(await page.locator('#apk-detailTechnicalSection').isVisible()));
 await page.locator('#apk-expNavNews').click();await page.waitForFunction(()=>BistAndroid.screen==='news');assert.equal(await page.evaluate(()=>BistAndroid.params.symbol),'TTRAK');
 assert.deepEqual(errors,[]);assert(requests.includes('financial')&&requests.includes('ownership'));assert(newsCategories.includes('dividend')&&newsCategories.includes('analyst'));
 fs.mkdirSync('test-results/company-actions',{recursive:true});fs.writeFileSync('test-results/company-actions/result.json',JSON.stringify({passed:true,buttons:8,rapidDialogRounds:3,requests,newsCategories,keyboard:['Enter','Space','Escape'],fixtureOnly:true}));console.log('PASS: eight stock actions, lazy identity, official tables, symbol links, keyboard, dialog styling');
}finally{await env.close();}})().catch(e=>{console.error(e);process.exitCode=1});
