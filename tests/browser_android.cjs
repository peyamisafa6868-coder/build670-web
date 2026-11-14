/* Actual Chromium UI checks. Android screenshots are captured independently from the unmodified APK. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {spawn}=require('node:child_process'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/android-web');fs.mkdirSync(out,{recursive:true});
let server,browser,page;const report={checks:[],errors:[],csp:[],screens:[]};
(async()=>{
 server=spawn('python3',['-u','server.py'],{cwd:root,env:{...process.env,PORT:'8784'},stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:8784/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--single-process','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],headless:true});
 page=await browser.newPage({viewport:{width:390,height:820}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.addInitScript(()=>{window.__csp=[];addEventListener('securitypolicyviolation',e=>__csp.push(e.effectiveDirective+':'+e.blockedURI));});
 await page.goto('http://127.0.0.1:8784/?reference',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.__BIST_ANDROID_UI_READY,null,{timeout:30000});await page.evaluate(()=>document.fonts.ready);
 report.initial=await page.evaluate(()=>({fonts:document.fonts.check('12px ApkRoboto'),nativeResources:Object.keys(AndroidLayout.resources.layouts).length}));
 for(const screen of ['main','stocks','bist_scan','settings','settings_search','favorites','notifications','opportunity','scan_results','signal_history','news','viop','viop_analysis','viop_contracts','stock_detail','technical_analysis','viop_detail','market_instrument_detail','settings_detail','info_screen','cheap','universe','delayed']){
  await page.evaluate(s=>BistAndroid.navigate(s,{symbol:'ASELS',mode:'scan',key:'XU100'}),screen);await page.waitForTimeout(150);
  const dimensions=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,buttons:BistAndroid.coverage(),sampleFont:getComputedStyle(document.querySelector('.apk-value-text')||document.querySelector('.apk-universe-text')||document.getElementById('androidApp')).font}));
  report.screens.push({screen,...dimensions});assert.ok(dimensions.document<=390,screen+' horizontal overflow');
  await page.screenshot({path:path.join(out,screen+'-390.png')});
 }
 await page.evaluate(()=>BistAndroid.navigate('main'));await page.locator('#apk-actionBist').click();assert.equal(await page.evaluate(()=>BistAndroid.screen),'bist_scan');report.checks.push('APK main action opens original scan screen');
 await page.evaluate(()=>BistAndroid.navigate('settings'));await page.locator('#apk-searchButton').click();assert.equal(await page.evaluate(()=>BistAndroid.screen),'settings_search');
 await page.locator('#apk-settingsSearchView').fill('tarama');assert.equal(await page.locator('.apk-settings-row').count(),1);await page.locator('.apk-settings-row').click();assert.equal(await page.evaluate(()=>BistAndroid.params.mode),'scan');report.checks.push('Settings search filters and opens the real preference');
 const clear=await page.evaluate(async()=>BistTerminal.api('/api/cache/clear',{}));assert.equal(clear.cleared,true);report.checks.push('Provider cache clear returns successfully');
 for(const width of [320,360,420,480,768,980,1280,1440,1920]){await page.setViewportSize({width,height:844});await page.evaluate(()=>BistAndroid.navigate('main'));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'width '+width);await page.screenshot({path:path.join(out,'main-'+width+'.png')});}
 report.checks.push('Main screen fits ten viewport widths');await page.evaluate(()=>BistAndroid.navigate('stock_detail',{symbol:'THYAO'}));await page.reload();await page.waitForFunction(()=>window.__BIST_ANDROID_UI_READY);assert.equal(await page.evaluate(()=>BistAndroid.params.symbol),'THYAO');report.checks.push('Stock route retains the selected symbol after reload');report.csp=await page.evaluate(()=>__csp);assert.deepEqual(report.errors,[]);assert.deepEqual(report.csp,[]);report.status='passed';
})().catch(async e=>{report.status='failed';report.failure=e.stack;process.exitCode=1;if(page)await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});}).finally(async()=>{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(browser)await browser.close();if(server)server.kill();});
