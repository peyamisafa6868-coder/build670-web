/* Real Chromium + live Yahoo + UI persistence. Local server lives in this process namespace. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),siteRoot=process.env.SCREENSHOT_ROOT||root;
const baseline=!!process.env.BASELINE,output=process.env.TEST_OUTPUT||path.join(root,'test-results',baseline?'before':'after');
fs.mkdirSync(output,{recursive:true});
const base=process.env.TEST_BASE_URL||'http://127.0.0.1:8783',widths=[320,360,390,420,480,768,980,1280,1440,1920];
let server,browser,page;const report={baseline,base,checks:[],layouts:[],errors:[],csp:[]};
const check=(label,value)=>{assert.ok(value,label);report.checks.push(label);};
(async()=>{
 if(!process.env.TEST_BASE_URL){server=spawn('python3',['-u','server.py'],{cwd:siteRoot,env:{...process.env,PORT:'8783'},stdio:'ignore'});for(let i=0;i<100;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:process.env.CHROMIUM_EXECUTABLE?['--single-process','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']:[],headless:true});
 page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{window.__csp=[];window.__permissionCalls=0;addEventListener('securitypolicyviolation',e=>__csp.push(e.effectiveDirective+':'+e.blockedURI));if('Notification' in window)Notification.requestPermission=async()=>{window.__permissionCalls++;return 'denied';};});
 await page.goto(base+'/?legacy=1',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__BIST_MAIN_BOOTED&&window.BistYahooAuto);
 if(!baseline)await page.waitForFunction(()=>window.__BIST_TERMINAL_BOOTED,null,{timeout:15000});
 await page.waitForFunction(()=>document.getElementById('chartSource').textContent.includes('YAHOO'),null,{timeout:45000});
 check('Real Yahoo chart before screenshots',await page.locator('#chartArea svg').count()===1);
 if(!baseline){
  check('No automatic notification permission',await page.evaluate(()=>window.__permissionCalls===0));
  check('Fresh web session does not seed synthetic market data',await page.evaluate(()=>offlineTestCount()===0));
  await page.evaluate(()=>navigate('scanner'));
  check('Universe exceeds the old 10-symbol limit',await page.locator('#coreUniverseCount').textContent().then(t=>Number(t)>100));
  await page.locator('#coreScope').selectOption('selected');await page.locator('#coreSymbols').fill('ASELS,THYAO,TUPRS');await page.locator('#coreRun').click();
  await page.waitForFunction(()=>['COMPLETE','COMPLETED_WITH_ERRORS'].includes(BistTerminal.job?.status),null,{timeout:90000});
  report.scan=await page.evaluate(()=>BistTerminal.job);
  check('Three actual stocks traverse Android core',report.scan.processed===3&&report.scan.successful===3&&report.scan.errors===0);
  check('Results rendered',await page.locator('#coreRows tr').count()===3);
  await page.locator('#coreRows .row-open').first().click();await page.waitForSelector('#terminalDialog[open]');
  check('Calculation audit is inspectable',await page.locator('#terminalDialog').textContent().then(t=>t.includes('V531_AUDIT=COMPONENT=TREND')));
  await page.locator('#terminalDialog .terminal-dialog-head button').click();
  await page.locator('#coreFilter').selectOption('LONG');await page.waitForFunction(()=>document.getElementById('coreRows').children.length===0);
  check('Delayed observations cannot enter verified LONG filter',await page.locator('#coreEmpty').textContent().then(t=>t.includes('doğrulanmış')));
  await page.locator('#coreFilter').selectOption('ALL');await page.waitForFunction(()=>document.getElementById('coreRows').children.length===3);
  await page.locator('#coreScope').selectOption('discovered');
  await page.setViewportSize({width:1349,height:612});
  await page.screenshot({path:path.join(output,'scanner-1349x612.png'),fullPage:false});
  check('Scanner results visible on supplied desktop size',await page.locator('#coreRows tr').first().evaluate(e=>e.getBoundingClientRect().top<600));
 }
 for(const width of widths){
  await page.setViewportSize({width,height:900});
  for(const view of ['scanner','dashboard','markets','viop']){
   await page.evaluate(v=>{navigate(v);scrollTo(0,0);},view);
   await page.screenshot({path:path.join(output,view+'-'+width+'.png'),fullPage:false});
   const m=await page.evaluate(()=>({width:innerWidth,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth}));
   report.layouts.push({view,...m});assert.ok(m.documentWidth<=width+1,view+' overflow '+JSON.stringify(m));
  }
 }
 if(!baseline){
  await page.setViewportSize({width:1280,height:900});await page.evaluate(()=>navigate('markets'));await page.locator('#directoryQuery').fill('garanti');
  await page.locator('#instrumentRefresh').click();await page.waitForFunction(()=>!document.getElementById('instrumentRefresh').disabled,null,{timeout:45000});
  check('Real market instrument cards',await page.locator('#instrumentTiles button').count()===5);
  check('Official KAP alias mapping retains GARAN',await page.locator('#directoryRows').textContent().then(t=>t.includes('GARAN')));
  await page.locator('#directoryQuery').fill('KRDMD');check('Multiple share class maps to company',await page.locator('#directoryRows').textContent().then(t=>t.includes('KARDEMİR')));
  await page.evaluate(()=>navigate('settings'));await page.locator('#settingsQuery').fill('yedek');
  check('Settings search finds backup',await page.locator('#settingsSearchResults button').count()===1);
  await page.locator('#settingsSearchResults button').click();check('Settings result navigates to data',await page.locator('#page-data').evaluate(e=>e.classList.contains('active')));
  await page.evaluate(()=>navigate('viop'));await page.locator('#ledgerEntryDetails summary').click();
  await page.locator('#viopCatalogQuery').fill('garanti');await page.waitForFunction(()=>document.getElementById('viopCatalogRows').children.length>0,null,{timeout:15000});
  check('Original Android alias search and reference-only catalog',await page.locator('#viopCatalogRows').textContent().then(t=>t.includes('GARAN')&&t.includes('— / — / —')));
  for(const [id,value] of Object.entries({Broker:'TEST-EXECUTION-001',Symbol:'F_TEST',Quantity:'2',Entry:'100',Stop:'99',Target:'105',Multiplier:'10',Cost:'2',Margin:'1000'}))await page.locator('#ledger'+id).fill(value);
  await page.locator('#ledgerRecord').click();await page.waitForFunction(()=>BistTerminal.exportState().ledger.length===1);
  check('Executed journal saved locally',await page.locator('#ledgerRows').textContent().then(t=>t.includes('TEST-EXECUTION-001')));
  await page.locator('#ledgerRows button').click();await page.locator('#exitQuantity').fill('1');await page.locator('#exitPrice').fill('102');await page.locator('#exitRecord').click();
  const ledger=await page.evaluate(()=>{const x=BistTerminal.exportState().ledger[0];return {remaining:ViopLedger.remaining(x),pnl:ViopLedger.realized(x),state:ViopLedger.summarize([x])};});
  report.ledger=ledger;check('Partial close: 1 open, 18 TRY net, 12 TRY open risk',ledger.remaining===1&&ledger.pnl===18&&ledger.state.openRiskTry===12&&ledger.state.marginTry===1000);
  await page.reload();await page.waitForFunction(()=>window.__BIST_TERMINAL_BOOTED);
  check('Journal survives reload',await page.evaluate(()=>BistTerminal.exportState().ledger[0].exits.length===1));
  await page.evaluate(()=>navigate('data'));const downloadPromise=page.waitForEvent('download');await page.locator('#offlineExport').click();const download=await downloadPromise;
  const downloaded=await download.path(),backup=JSON.parse(fs.readFileSync(downloaded,'utf8'));
  check('Complete backup includes ledger, settings, notices, scan history',backup.extensions.version===1&&backup.extensions.ledger.length===1&&backup.extensions.history.length===1);
  const restore=await page.evaluate(async backup=>{
   const before=JSON.stringify(BistTerminal.exportState()),bytes=localStorage.getItem('bist_viop_ledger_v1');
   const invalid=structuredClone(backup);invalid.extensions.ledger[0].multiplier=-1;let rejected=false;
   try{offlineBuildDatasets(invalid,'invalid-backup.json',{market:'BIST',symbol:'ASELS',interval:'1d',lastBarClosed:true});}catch{rejected=true;}
   const untouched=before===JSON.stringify(BistTerminal.exportState())&&bytes===localStorage.getItem('bist_viop_ledger_v1');
   const parsed=offlineBuildDatasets(backup,'valid-backup.json',{market:'BIST',symbol:'ASELS',interval:'1d',lastBarClosed:true});offlineIngest(parsed);
   return {rejected,untouched,restored:JSON.stringify(BistTerminal.exportState())===before,datasets:OFFLINE_DB.size};
  },backup);report.backup=restore;check('Malformed extension rejected before mutation; valid backup round-trips',restore.rejected&&restore.untouched&&restore.restored);
  await page.evaluate(()=>navigate('news'));await page.waitForFunction(()=>!document.getElementById('newsList').textContent.includes('sorgulanıyor'),null,{timeout:30000});
  report.news=await page.locator('#newsList').textContent();check('Live RSS yields linked headlines',await page.locator('#newsList a').count()>0);
  await page.evaluate(()=>navigate('alerts'));await page.locator('#notificationPermission').click();check('Permission requested only through explicit button',await page.evaluate(()=>window.__permissionCalls===1));
  await page.evaluate(()=>navigate('history'));check('Completed scan in local history',await page.locator('#coreHistoryRows').textContent().then(t=>t.includes('3 / 3')||t.includes('3/3')));
  report.diagnostics=await page.evaluate(()=>{const tests=diagRunTests().tests;return {total:tests.length,failed:tests.filter(x=>x.status==='BAŞARISIZ').map(x=>x.id)};});assert.deepEqual(report.diagnostics.failed,[]);
 }
 report.csp=await page.evaluate(()=>window.__csp);assert.deepEqual(report.csp,[]);assert.deepEqual(report.errors,[]);report.status='passed';
})().catch(async e=>{report.status='failed';report.failure=e.stack;process.exitCode=1;if(page){report.last=await page.evaluate(()=>({boot:window.__BIST_TERMINAL_BOOTED,source:document.getElementById('chartSource')?.textContent,core:document.getElementById('coreError')?.textContent})).catch(()=>null);await page.screenshot({path:path.join(output,'failure.png'),fullPage:true}).catch(()=>{});}}).finally(async()=>{fs.writeFileSync(path.join(output,'terminal-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(browser)await browser.close();if(server)server.kill();});
