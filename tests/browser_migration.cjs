// Existing Yahoo history upgrade, reload persistence and real graph; no CSV writes.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {spawn}=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict');
let server,browser;
(async()=>{
 server=spawn('python3',['server.py'],{cwd:path.join(__dirname,'..'),env:{...process.env,PORT:'8781'},stdio:'ignore'});
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:8781/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}
 browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,args:process.env.CHROMIUM_EXECUTABLE?['--single-process','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[],headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:8781/?legacy=1');
 await page.waitForFunction(()=>window.BistYahooAuto&&document.getElementById('chartSource').textContent.includes('Mum:'),null,{timeout:45000});
 const result=await page.evaluate(async()=>{
  const key=OFFLINE_KEY('BIST','ASELS','15m'),current=OFFLINE_DB.get(key);
  const old=structuredClone(current);old.source='YAHOO FINANCE (RESMI DEGIL / GECIKMELI): ASELS.IS';old.sources=[old.source];
  old.candles.at(-1).close+=10;old.candles.at(-1).high=Math.max(old.candles.at(-1).high,old.candles.at(-1).close);
  OFFLINE_DB.set(key,old);
  const refreshed=await BistYahooAuto.fetch('ASELS','15m',true);
  await offlinePersist();state.market='BIST';state.symbol='ASELS';state.interval='15m';await loadHistory();
  return {changed:refreshed.candles.at(-1).close!==old.candles.at(-1).close,bars:refreshed.candles.length,source:refreshed.source};
 });
 assert.equal(result.changed,true);assert.ok(result.source.includes('Mum: 5m → 15m'));
 await page.reload();await page.waitForFunction(()=>window.BistYahooAuto&&window.__BIST_MAIN_BOOTED);
 await page.locator('[data-interval="15m"]').click();
 await page.waitForFunction(()=>state.candlePayload?.interval==='15m'&&document.getElementById('chartSource').textContent.includes('Mum:'),null,{timeout:30000});
 const diagnostics=await page.evaluate(()=>{const t=diagRunTests().tests;return {total:t.length,failed:t.filter(x=>x.status==='BAŞARISIZ').map(x=>x.id)};});
 assert.deepEqual(diagnostics.failed,[]);assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'passed',...result,reload:'passed',diagnostics,errors}));
})().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{if(browser)await browser.close();if(server)server.kill();});
