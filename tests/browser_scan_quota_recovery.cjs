/* BUILD670 regression: storage quota must not destroy user history or blank scan UI.
 * All candles/quotes/results are explicit fixtures. No live market or APK claim.
 */
const {launch,until}=require('./browser_helpers.cjs');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const out=path.join(__dirname,'..','test-results','scan-quota-recovery');
fs.mkdirSync(out,{recursive:true});
const report={fixture:true,checks:[],errors:[]};
const jobId='q'.repeat(32);
const journal={version:1,records:[{
 id:'historic-1',symbol:'ASELS',direction:'LONG',
 signalPrice:100,technicalScore:88,riskScore:22,finalSignalScore:89,
 signalGeneratedAt:1700000000000,interval:'5m',outcomes:{}
}],viopRecords:[]};
const job={id:jobId,status:'COMPLETED_WITH_ERRORS',total:632,processed:632,
 successful:589,insufficient:39,errors:4,interval:'5m',provider:'Yahoo unofficial/delayed',
 signalAttestationVerified:false,createdAt:Date.now()-60000,completedAt:Date.now(),
 failures:[],storage:{checkpointSaved:true,ephemeral:false,retentionHours:2,maxRetainedJobs:4}};
const rows=Array.from({length:589},(_,i)=>({
 symbol:'S'+String(i).padStart(4,'0'),companyName:'EXPLICIT FIXTURE',
 price:40+i/10,score:50+i%51,rankingScore:50+i%51,finalSignalScore:0,
 riskScore:20,dataConfidenceScore:75,rankingStatus:'WATCH_ONLY',
 signalValidity:'WATCH',signalValidityReason:'GECİKMELİ TEST',direction:'NONE',
 closedBarCount:220,source:'YAHOO EXPLICIT DELAYED FIXTURE',
 dataTimestamp:Date.now(),technical:{volumeRatio:1},
 trendDisplay:{verifiedSignal:false,signalLabel:'GECİKMELİ TEKNİK İZLEME',
 dataLabel:'GECİKMELİ',trend:{state:'BULLISH',label:'YÜKSELİŞ'}},
 candles:[]
}));
let env,page,holdSecondPage=true,releaseSecondPage=null,failPages=false,historyRequests=0;
(async()=>{
 env=await launch(8812);
 page=await env.browser.newPage({viewport:{width:390,height:844}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(journal=>{
   const original=Storage.prototype.setItem;
   original.call(localStorage,'bist_build670_signal_history',JSON.stringify(journal));
   window.__quotaAttempts=0;
   Storage.prototype.setItem=function(key,value){
     if(key==='bist_build670_signal_history'){
       window.__quotaAttempts++;
       throw new DOMException('Injected quota exhausted','QuotaExceededError');
     }
     return original.call(this,key,value);
   };
 },journal);
 await page.route('**/api/universe',r=>r.fulfill({json:{count:632,records:[],identityMatched:0}}));
 await page.route('**/api/instruments',r=>r.fulfill({json:{items:[]}}));
 await page.route('**/api/history/record',r=>{
   historyRequests++;
   return r.fulfill({json:{added:true,records:[...journal.records,{
     id:'new-verified',symbol:'AKFGY',direction:'LONG',
     signalPrice:20,technicalScore:80,riskScore:30,finalSignalScore:80,
     signalGeneratedAt:1700000001000,interval:'5m'
   }]}});
 });
 await page.route('**/api/scans/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.endsWith('/results')){
     if(failPages)return route.fulfill({status:503,json:{error:'EXPLICIT_RESULTS_FAILURE'}});
     const pageNo=Number(url.searchParams.get('page')||1);
     const size=Number(url.searchParams.get('size')||25);
     if(pageNo===2&&size===100&&holdSecondPage)
       await new Promise(resolve=>{releaseSecondPage=resolve;});
     const start=(pageNo-1)*size;
     return route.fulfill({json:{total:rows.length,page:pageNo,size,results:rows.slice(start,start+size)}});
   }
   return route.fulfill({json:job});
 });
 await page.goto(env.base+'/?reference',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__BIST_ANDROID_UI_READY,null,{timeout:30000});
 await page.evaluate(job=>{BistTerminal.adoptJob(job);BistAndroid.navigate('scan_results');},job);
 await page.waitForFunction(()=>document.querySelectorAll('[data-native-item=scan_result]').length===50);
 await until(()=>typeof releaseSecondPage==='function',6000);
 assert.match(await page.locator('[data-scan-results-progress]').innerText(),/100\/589/);
 assert.equal(await page.locator('[data-native-item=scan_result]').count(),50);
 report.checks.push('First 100 of 589 results are visible before remaining pages finish');
 holdSecondPage=false;releaseSecondPage();
 await page.waitForFunction(()=>document.querySelector('[data-scan-results-loaded="589"]')?.textContent.includes('589 teknik sonuç yüklendi'),null,{timeout:15000});
 assert.equal(await page.locator('[data-native-item=scan_result]').count(),50);
 await page.getByRole('button',{name:'Daha fazla sonuç'}).click();
 assert.equal(await page.locator('[data-native-item=scan_result]').count(),100);
 report.checks.push('Remaining 589 results are paginated without blank screen or regressions');
 await page.waitForTimeout(1200);
 assert.equal(historyRequests,0);
 assert.equal(await page.evaluate(()=>window.__quotaAttempts),0);
 assert.deepEqual(await page.evaluate(()=>AndroidHistory.exportState()),journal);
 report.checks.push('Unverified delayed scan does not write to full signal journal or remove old records');

 // For a truly attested signal, quota exhaustion has an actionable error
 // and preserves the original journal byte-for-byte.
 const storageError=await page.evaluate(async job=>{
   try{await AndroidHistory.recordJob({...job,id:'v'.repeat(32),signalAttestationVerified:true});return 'NO_ERROR';}
   catch(e){return e.message;}
 },job);
 assert.match(storageError,/alanı dolu/);
 assert.equal(historyRequests,1);
 assert.equal(await page.evaluate(()=>window.__quotaAttempts),1);
 assert.deepEqual(await page.evaluate(()=>AndroidHistory.exportState()),journal);
 report.checks.push('Verified-history quota failure is explicit and original journal remains intact');

 // HTTP failures must be reported inline with a retry, rather than blank UI.
 failPages=true;
 await page.evaluate(()=>BistAndroid.navigate('favorites'));
 await page.evaluate(()=>BistAndroid.navigate('scan_results'));
 await page.waitForFunction(()=>document.querySelector('#apk-scanList')?.textContent.includes('EXPLICIT_RESULTS_FAILURE'));
 assert.match(await page.locator('#apk-scanList').innerText(),/Sonuçlar gösterilemiyor/);
 assert.equal(await page.getByRole('button',{name:'SONUÇLARI YENİDEN YÜKLE'}).count(),1);
 failPages=false;
 await page.getByRole('button',{name:'SONUÇLARI YENİDEN YÜKLE'}).click();
 await page.waitForFunction(()=>document.querySelector('[data-scan-results-loaded="589"]')?.textContent.includes('589 teknik sonuç yüklendi'));
 assert.equal(await page.locator('[data-native-item=scan_result]').count(),50);
 report.checks.push('Failed result request exposes retry; retry recovers real technical list');

 await page.evaluate(()=>BistAndroid.navigate('stock_detail',{symbol:'AKFGY'}));
 const external=page.locator('#apk-btnTradingViewChart');
 assert.equal(await external.count(),1);
 assert.equal(await external.isVisible(),true);
 const bounds=await external.boundingBox();
 assert.ok(bounds&&bounds.width>=300&&bounds.height>=44,'TradingView control must be a full-width mobile action');
 assert.equal(await external.evaluate(node=>node.tagName),'A');
 assert.equal(await external.getAttribute('href'),'https://www.tradingview.com/chart/?symbol=BIST%3AAKFGY');
 assert.equal(await external.getAttribute('target'),'_blank');
 assert.match(await external.getAttribute('rel'),/noopener/);
 assert.equal(await external.locator('svg').count(),1);
 await external.evaluate(node=>{
   window.__tvClick=false;
   node.addEventListener('click',e=>{e.preventDefault();window.__tvClick=true;},{once:true});
 });
 await external.click();
 assert.equal(await page.evaluate(()=>window.__tvClick),true);
 await page.evaluate(()=>BistAndroid.navigate('stock_detail',{symbol:'THYAO'}));
 assert.equal(await page.locator('#apk-btnTradingViewChart').getAttribute('href'),
   'https://www.tradingview.com/chart/?symbol=BIST%3ATHYAO');
 report.checks.push('Visible native TradingView control opens symbol-specific BIST HTTPS link');
 await page.screenshot({path:path.join(out,'tradingview-detail.png')});
 assert.deepEqual(report.errors,[]);
 report.status='passed';
})().catch(async e=>{
 report.status='failed';report.failure=e.stack;process.exitCode=1;
 if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});
}).finally(async()=>{
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));if(env)await env.close();
});
