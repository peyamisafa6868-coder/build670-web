/* Same test candles, dimensions, paints and Android display options as ReferenceRunner. */
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),out=path.join(root,'test-results/android-harness');let server,browser;
(async()=>{
 server=spawn('python3',['-u','server.py'],{cwd:root,env:{...process.env,PORT:'8788'},stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:8788/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE,args:['--single-process','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage'],headless:true});
 const page=await browser.newPage({viewport:{width:390,height:820}});await page.goto('http://127.0.0.1:8788/?reference');await page.waitForFunction(()=>window.__BIST_ANDROID_UI_READY);
 const fixture=JSON.parse(fs.readFileSync(path.join(out,'parity-input.json'),'utf8'));
 const state=await page.evaluate(async fixture=>{
  const app=document.getElementById('androidApp');app.replaceChildren();const chart=document.createElement('div');chart.id='chartReference';chart.style.cssText='position:relative;left:10px;top:80px;width:370px;height:352px;padding:8px;background:#06263a;border-radius:18px;outline:1px solid #15506e;outline-offset:-1px';app.append(chart);
  const data={candles:fixture.candles.map(x=>({...x,closed:true})),lastBarClosed:true,interval:'5 DK',source:'EXPLICIT TEST FIXTURE',symbol:'ASELS'};
  // ReferenceRunner injects the full component trend, independently from the activity's asynchronous provider request.
  const input={candles:data.candles,intraday:true,excludeNewestForTrend:false};const response=await BistTerminal.api('/api/chart-analysis',input);
  const s=AndroidPriceChart.mount(chart,{...data,interval:'5m'},{options:{toggleEma9:true,toggleEma21:true,toggleVwap:true,toggleEma20:false,toggleEma50:false,toggleEma200:false,toggleBollinger:false,toggleMacd:false,toggleTrend:true,toggleChannel:true,toggleSupportResistance:true}});
  for(let i=0;i<100&&!s.model;i++)await new Promise(r=>setTimeout(r,20));s.model=response;
  // Force the reference component model and the same timeframe text.
  s.data.interval='5 DK';AndroidPriceChart.zoom(chart,1);await document.fonts.ready;
  return {bounds:s.bounds,bars:s.bars.length,error:s.error};
 },fixture);
 await page.locator('#chartReference').screenshot({path:path.join(out,'web-chart-crop.png')});fs.writeFileSync(path.join(out,'web-chart-state.json'),JSON.stringify(state,null,2));console.log(JSON.stringify(state));
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)server.kill();});
