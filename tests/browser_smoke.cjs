/* Real Chromium acceptance tests. Requires playwright; starts its own local server. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.join(__dirname,'..'),output=process.env.TEST_OUTPUT||path.join(root,'test-results');
fs.mkdirSync(output,{recursive:true});
const port=process.env.TEST_PORT||'8780',base=process.env.TEST_BASE_URL||'http://127.0.0.1:'+port;
const result={time:new Date().toISOString(),base,layouts:[],flows:[],provider:[],errors:[]};
const local=!process.env.TEST_BASE_URL;
let server,browser,page;
const check=(name,value)=>{assert.ok(value,name);result.flows.push(name);};
(async()=>{
 if(local){
  server=spawn('python3',['-u','server.py'],{cwd:root,env:{...process.env,PORT:port},stdio:['ignore','ignore','pipe']});
  for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 }
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,
  args:process.env.CHROMIUM_EXECUTABLE?['--single-process','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']:[],headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844}});page=await context.newPage();
 page.on('pageerror',e=>result.errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
 await page.addInitScript(()=>{window.__testCsp=[];addEventListener('securitypolicyviolation',e=>window.__testCsp.push({directive:e.effectiveDirective,blocked:e.blockedURI}));});
 await page.goto(base+'/?legacy=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__BIST_MAIN_BOOTED&&window.BistStockAnalysis&&window.BistYahooAuto);
 await page.waitForFunction(()=>document.getElementById('chartSource').textContent.includes('YAHOO FINANCE'),null,{timeout:45000});
 check('Real delayed Yahoo chart loads on first open',await page.locator('#chartSource').textContent().then(t=>t.includes('YAHOO FINANCE')));
 check('Extended indicator is numeric',await page.locator('#indAdx').textContent().then(t=>t!=='—'));
 check('Readable analysis appears below graph',await page.locator('#easyPriceMovement').textContent().then(t=>t.includes('Seçilen')));
 const quoteSafety=await page.evaluate(()=>{
  const b=diagFixtureBars(2);b[0].timestamp=Date.UTC(2025,10,5,7);b[1].timestamp=Date.UTC(2025,10,6,7);
  const real={market:'BIST',symbol:'ASELS',interval:'5m',candles:b,lastBarClosed:true,source:'YAHOO FINANCE (RESMI DEGIL / GECIKMELI): ASELS.IS'};
  const synthetic={...real,interval:'1d',source:OFFLINE_TEST_MARK,candles:[{...b[0],open:1,high:1,low:1,close:1}]};
  const daily={...real,interval:'1d',candles:[b[0]]};
  return {mixed:offlineQuoteForSeries(real,[real,synthetic]).previousClose,matching:offlineQuoteForSeries(real,[real,daily]).previousClose};
 });
 check('Synthetic daily close cannot affect Yahoo percentage',quoteSafety.mixed===null&&quoteSafety.matching===100);
 for(const width of [320,360,390,420,480,768,980,1280]){
  await page.setViewportSize({width,height:844});
  const measure=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,
   controls:[...document.querySelectorAll('#timeframeGroup button')].filter(x=>getComputedStyle(x).display!=='none').length,
   explanation:document.getElementById('stockExplanationPanel').getBoundingClientRect().width}));
  assert.ok(measure.document<=width+1,'document overflow '+JSON.stringify(measure));
  assert.equal(measure.controls,12);assert.ok(measure.explanation<=width);
  result.layouts.push({width,...measure,status:'passed'});
 }
 await page.screenshot({path:path.join(output,'desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:path.join(output,'mobile.png'),fullPage:true});
 for(const view of ['markets','favorites','viop','scanner','alerts','data','news','system','settings','dashboard']){
  await page.evaluate(v=>navigate(v),view);
  assert.ok(await page.locator('#page-'+view).evaluate(x=>x.classList.contains('active')),view);
  check('Navigation: '+view,true);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'page overflow '+view);
 }
 const diagnostics=await page.evaluate(()=>{const r=diagRunTests();return {total:r.tests.length,failures:r.tests.filter(t=>t.status==='BAŞARISIZ').map(t=>({id:t.id,title:t.title,observed:t.observed}))};});
 result.diagnostics=diagnostics;check('Built-in diagnostic suite',diagnostics.failures.length===0);
 // Select a new timeframe through the actual chart button, then verify its dataset.
 await page.locator('[data-interval="10m"]').click();
 await page.waitForFunction(()=>state.interval==='10m'&&state.candlePayload?.interval==='10m',null,{timeout:30000});
 check('10-minute chart UI selects real derived data',await page.locator('#chartSource').textContent().then(t=>t.includes('YAHOO')));
 // Real server/provider checks are independent of the browser's local datasets.
 for(const interval of ['1m','3m','5m','10m','15m','30m','60m','240m','1d','1w','1mo','all']){
  const range=interval==='all'?'max':['1m','3m'].includes(interval)?'7d':['1d','1w','1mo'].includes(interval)?'2y':'1mo';
  const response=await fetch(base+'/history?'+new URLSearchParams({symbol:'ASELS',interval,range}));
  const data=await response.json();
  const entry={interval,http:response.status,bars:data.candles?.length||0,sourceInterval:data.sourceInterval,delayed:data.delayed,error:data.error};result.provider.push(entry);
  assert.equal(response.status,200,'provider '+JSON.stringify(entry));
  assert.equal(data.interval,interval);assert.equal(data.symbol,'ASELS.IS');assert.equal(data.delayed,true);
  assert.ok(data.candles.length>1);let last=0;
  for(const b of data.candles){assert.ok(b.time>last);last=b.time;assert.ok([b.open,b.high,b.low,b.close,b.volume].every(Number.isFinite));assert.ok(b.low>0&&b.volume>=0&&b.low<=b.open&&b.low<=b.close&&b.high>=b.open&&b.high>=b.close);}
  console.log('provider',JSON.stringify(entry));
 }
 for(const interval of ['1m','3m','5m','15m','30m','60m','240m','1d','1w','1mo','all']){
  await page.locator('[data-interval="'+interval+'"]').click();
  await page.waitForFunction(tf=>state.interval===tf&&state.candlePayload?.interval===tf,interval,{timeout:30000});
  check('Chart timeframe: '+interval,await page.locator('#chartArea svg').count()===1);
 }
 await page.evaluate(()=>navigate('scanner'));
 // Existing research importer is kept in an explicitly expandable workspace.
 await page.locator('#researchScanner').evaluate(e=>e.open=true);
 await page.locator('#scannerYahooSymbols').fill('ASELS,THYAO');
 await page.locator('#scannerYahooRun').click();
 await page.waitForFunction(()=>document.getElementById('yahooStatus').textContent.startsWith('Aktarıldı:'),null,{timeout:60000});
 const scan=await page.evaluate(()=>({universe:ADV_SCAN_LAST.universe,rows:ADV_SCAN_ROWS.length,daily:advancedScanInput(false).map(x=>({symbol:x.symbol,bars:x.candles.length})),text:document.getElementById('advancedScanStatus').textContent}));
 result.scanner=scan;check('Yahoo daily import and actual scanner output',scan.universe>=2&&scan.daily.every(x=>x.bars>=205));
 // HTTP failure injected in a fresh symbol: no demo fallback, explicit error.
 await page.route('**/history?**',route=>route.fulfill({status:502,contentType:'application/json',body:JSON.stringify({error:'TEST_PROVIDER_UNAVAILABLE'})}));
 await page.evaluate(()=>openSymbol('TESTX','BIST','5m'));
 await page.waitForFunction(()=>document.getElementById('chartSource').textContent.includes('TEST_PROVIDER_UNAVAILABLE'));
 check('Provider failure is visible without synthetic fallback',await page.locator('#chartArea svg').count()===0);
 const violations=await page.evaluate(()=>window.__testCsp);result.csp=violations;assert.deepEqual(violations,[]);
 assert.deepEqual(result.errors.filter(x=>!x.includes('502 (Bad Gateway)')),[]);
 result.status='passed';
})().catch(async e=>{result.status='failed';result.failure=e.stack;process.exitCode=1;if(page)result.lastState=await page.evaluate(()=>({guide:document.getElementById('homeChartGuide')?.textContent,source:document.getElementById('chartSource')?.textContent,status:document.getElementById('yahooStatus')?.textContent})).catch(()=>null);}).finally(async()=>{
 fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));if(browser)await browser.close();if(server)server.kill();
});
