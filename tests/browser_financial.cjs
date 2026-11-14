const assert=require('node:assert/strict'),fs=require('node:fs'),{launch}=require('./browser_helpers.cjs');
(async()=>{const env=await launch(8881);let page;try{
page=await env.browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));let calls=0,mode='ok';
await page.route('**/api/valuation',async r=>{calls++;await new Promise(r=>setTimeout(r,150));if(mode==='html')return r.fulfill({status:502,contentType:'text/html',body:'<h1>TEST upstream</h1>'});return r.fulfill(mode==='ok'?{json:{results:[],publicationGate:'KAP_CONTENT_UNVERIFIED',note:'TEST FIXTURE'}}:{status:Number(mode),json:{error:'TEST HTTP '+mode}});});
await page.goto(env.base+'/?reference=1');await page.waitForFunction(()=>window.__BIST_ANDROID_UI_READY);
await page.evaluate(()=>BistAndroid.navigate('stock_detail',{symbol:'ASELS'}));await page.locator('[data-apk-id="expNavFinancial"]').click();
assert.match(await page.locator('dialog[open] h2').innerText(),/Finansal Tablolar/);assert.equal(await page.locator('dialog[open] #coreValueRun').count(),0);
const file=page.locator('dialog[open] input[type=file]');
const upload=async (locator,value)=>locator.setInputFiles({name:'fixture.json',mimeType:'application/json',buffer:Buffer.from(typeof value==='string'?value:JSON.stringify(value))});
await upload(file,{symbol:'WRONG'});await page.waitForFunction(()=>document.querySelector('dialog [role=alert]')?.textContent.includes('Şema'));
await upload(file,{symbol:'ASELS',sourceUrl:'https://www.kap.org.tr/tr/arama',asOf:'2026-11-10',currency:'TRY',periods:['2025','2024'],balanceSheet:[{label:'Test özkaynak',values:[100,90]}],incomeStatement:[],cashFlow:[]});await page.waitForSelector('dialog table');assert.match(await page.locator('dialog table').first().innerText(),/100,00/);
await page.getByRole('button',{name:'SEKTÖREL ÇARPAN KARŞILAŞTIRMASI',exact:true}).click();await page.waitForSelector('dialog[open] #coreValueRun');
const run=page.locator('#coreValueRun'),status=page.locator('#coreValueStatus'),input=page.locator('#coreFinancialFile');
await run.click();await page.waitForFunction(()=>document.getElementById('coreValueStatus').getAttribute('role')==='alert');assert.match(await status.innerText(),/Önce/);assert.equal(calls,0);
for(const value of ['{',null,{financials:[]}]){await upload(input,JSON.stringify(value));await run.click();await page.waitForFunction(()=>!document.getElementById('coreValueRun').disabled);assert.equal(await status.getAttribute('role'),'alert');assert.equal(calls,0);}
await upload(input,{financials:[{symbol:'ASELS'}]});
for(mode of ['400','422','500','503','html','ok']){const before=calls;await run.click();await page.waitForFunction(()=>document.getElementById('coreValueRun').disabled);await page.evaluate(()=>document.getElementById('coreValueRun').click());await page.waitForFunction(()=>!document.getElementById('coreValueRun').disabled);assert.equal(calls,before+1);assert.match(await status.innerText(),mode==='ok'?/referans hesap/:mode==='html'?/HTTP 502.*JSON/:new RegExp('HTTP '+mode));}
await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.querySelector('dialog[open]'));await page.locator('[data-apk-id="expNavFinancial"]').focus();await page.keyboard.press('Enter');await page.waitForSelector('dialog[open]');await page.keyboard.press('Escape');
await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.equal(await page.locator('dialog[open]').count(),0);assert.deepEqual(errors,[]);
fs.mkdirSync('test-results/financial',{recursive:true});await page.locator('[data-apk-id="expNavFinancial"]').click();await page.screenshot({path:'test-results/financial/mobile.png'});fs.writeFileSync('test-results/financial/result.json',JSON.stringify({passed:true,calls,checks:['separate statements','local import','schema rejection','missing file','bad JSON','HTTP 400/422/500/503','success','duplicate suppression','keyboard reopen'],fixtureOnly:true}));console.log('PASS financial browser workflows');
}finally{await env.close();}})().catch(e=>{console.error(e);process.exitCode=1});
