const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),assert=require('assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE?{executablePath:process.env.CHROMIUM_EXECUTABLE}:{}),args:['--no-sandbox']});try{
const page=await browser.newPage({viewport:{width:1100,height:700}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.setContent('<div id="chart" style="position:relative;width:900px;height:550px;margin:20px"></div>');
const html=fs.readFileSync('index.html','utf8');await page.addScriptTag({content:html.slice(html.indexOf('const finite=x=>'),html.indexOf('function closedCandles('))});
await page.addScriptTag({content:'window.validBars=()=>true;window.BistTerminal={api:()=>Promise.resolve({})};window.fullscreens=0;'});
await page.addScriptTag({path:'android-chart.js'});
await page.evaluate(()=>{const candles=Array.from({length:300},(_,i)=>({timestamp:1700000000000+i*86400000,open:100+i*.1,high:102+i*.1,low:99+i*.1,close:101+i*.1,volume:1000+i,closed:true}));AndroidPriceChart.mount(document.querySelector('#chart'),{candles,lastBarClosed:true,interval:'1d'},{onFullscreen:()=>fullscreens++});});
const state=()=>page.evaluate(()=>{const s=AndroidPriceChart.getState(document.querySelector('#chart'));return {pan:s.pan,visible:s.visible,selected:s.selected,b:s.bounds,fullscreens};});
const box=await page.locator('canvas').boundingBox();let a=await state();const x=box.x+(a.b.left+a.b.right)/2,y=box.y+150;
await page.mouse.move(x,y);await page.mouse.down();await page.waitForTimeout(650);assert.equal((await state()).fullscreens,0);await page.mouse.move(x+120,y,{steps:12});await page.mouse.up();await page.waitForTimeout(40);assert.ok((await state()).pan>0);
a=await state();const anchor=a.b.start+.5*(a.b.count-1);await page.mouse.move(x,y);await page.mouse.wheel(0,-100);await page.waitForTimeout(60);let b=await state();assert.ok(b.visible<a.visible);assert.ok(Math.abs(b.b.start+.5*(b.b.count-1)-anchor)<=1);
await page.mouse.click(x,y);await page.waitForTimeout(40);b=await state();assert.equal(b.selected,b.b.start+Math.round(.5*(b.b.count-1)));
for(let i=0;i<20;i++){await page.mouse.wheel(0,i%2?90:-90);await page.mouse.move(x+30*(i%3),y);}
await page.waitForTimeout(60);b=await state();assert.ok(Number.isInteger(b.b.start));assert.ok(b.pan>=0);assert.ok(b.b.start+b.b.count<=300);assert.deepEqual(errors,[]);
await page.evaluate(()=>{const c=document.querySelector('canvas');c.dispatchEvent(new PointerEvent('pointerdown',{pointerId:42,pointerType:'mouse',button:0,clientX:200,clientY:200}));c.dispatchEvent(new PointerEvent('pointercancel',{pointerId:42}));});
assert.equal(await page.evaluate(()=>AndroidPriceChart.getState(document.querySelector('#chart')).pointer),null);
console.log(JSON.stringify({status:'passed',checks:['mouse hold does not open fullscreen','drag pans','wheel anchor within one candle','nearest candle selection','20 alternating wheel moves remain bounded','cancel clears drag','no browser errors'],scope:'isolated Chromium chart fixture; not real-device acceptance'}));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
