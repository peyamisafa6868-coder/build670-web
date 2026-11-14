/* BUILD670 mobile readability: viewport checks, no synthetic quotes required. */
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
const {root,launch}=require('./browser_helpers.cjs');
const folder=path.join(root,'test-results/mobile-readability');
fs.mkdirSync(folder,{recursive:true});
let env;
const report={scope:'Native UI geometry only; NOT APK pixel-equivalence acceptance',checks:[],errors:[]};
(async()=>{
 env=await launch(8834);
 const page=await env.browser.newPage({viewport:{width:390,height:820},locale:'tr-TR',timezoneId:'Europe/Istanbul'});
 page.on('pageerror',e=>report.errors.push(e.message));
 await page.route('**/api/instruments',route=>route.fulfill({json:{items:[]}}));
 await page.route('**/api/universe',route=>route.fulfill({json:{count:0,records:[]}}));
 await page.goto(env.base+'/?reference');
 await page.waitForFunction(()=>window.__BIST_ANDROID_UI_READY);
 for(const width of [320,360,390]){
  await page.setViewportSize({width,height:820});
  await page.evaluate(()=>BistAndroid.navigate('signal_history'));
  await page.waitForSelector('#apk-historyFilters');
  const history=await page.evaluate(()=>{
    const tab=document.getElementById('apk-tabHistory'),strip=tab?.closest('.apk-HorizontalScrollView');
    const filter=document.getElementById('apk-historyAll')?.closest('.apk-HorizontalScrollView');
    const menu=document.getElementById('apk-historyExtraFilters');
    const tabs=['tabHistory','tabForward','tabStats','tabStrategies'].map(id=>{
      const e=document.getElementById('apk-'+id),s=getComputedStyle(e);
      return {id,width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height,whiteSpace:s.whiteSpace,wrap:getComputedStyle(e.querySelector('.apk-text')||e).whiteSpace};
    });
    const rect=menu?.getBoundingClientRect(),filters=filter?.getBoundingClientRect();
    return {tabs,scrollWidth:strip?.scrollWidth,clientWidth:strip?.clientWidth,
      filterOverflow:getComputedStyle(filter).overflowX,filterWidth:filter?.scrollWidth,filterClient:filter?.clientWidth,
      menu:rect?{width:rect.width,height:rect.height,right:rect.right}:null,
      viewport:innerWidth,filters:filters?{x:filters.x,right:filters.right}:null};
  });
  assert.equal(history.tabs.length,4);
  for(const t of history.tabs){assert.equal(t.whiteSpace,'nowrap');assert.equal(t.wrap,'nowrap');assert(t.height>=43,'History tab touch size '+t.id);assert(t.width>=70,'History tab readability '+t.id);}
  assert(history.scrollWidth>=history.clientWidth);
  assert.equal(history.filterOverflow,'auto');
  assert(history.menu?.width>=43);
  report.checks.push({screen:'signal_history',width,geometry:history});
  await page.screenshot({path:path.join(folder,'history-'+width+'.png')});
  await page.evaluate(()=>BistAndroid.navigate('viop_analysis'));
  await page.waitForSelector('#apk-analysisSearch');
  const viop=await page.evaluate(()=>{
    const all=document.getElementById('apk-analysisAll'),container=all.parentElement,expiry=document.getElementById('apk-analysisExpiry');
    const ids=['analysisAll','analysisFutures','analysisOptions'].map(id=>{
      const e=document.getElementById('apk-'+id),style=getComputedStyle(e);return {id,width:e.getBoundingClientRect().width,whiteSpace:style.whiteSpace};
    });
    return {buttons:ids,overflow:getComputedStyle(container).overflowX,
      scrollWidth:container.scrollWidth,clientWidth:container.clientWidth,
      expiryWidth:expiry.getBoundingClientRect().width,
      sortText:getComputedStyle(expiry).color};
  });
  for(const button of viop.buttons){assert.equal(button.whiteSpace,'nowrap');assert(button.width>55);}
  assert.equal(viop.overflow,'auto');assert(viop.expiryWidth>=129);
  report.checks.push({screen:'viop_analysis',width,geometry:viop});
  await page.screenshot({path:path.join(folder,'viop-'+width+'.png')});
  await page.evaluate(()=>BistAndroid.navigate('universe'));
  await page.waitForSelector('.apk-universe-sort');
  const contrast=await page.locator('.apk-universe-sort').evaluate(el=>{
    const style=getComputedStyle(el),option=getComputedStyle(el.options[0]);return {fg:style.color,bg:style.backgroundColor,scheme:style.colorScheme,optionFg:option.color};
  });
  assert.equal(contrast.fg,'rgb(234, 250, 247)');
  assert.equal(contrast.scheme,'dark');
  report.checks.push({screen:'universe',width,contrast});
 }
 // APK locale settings show the device timezone; market timestamps have separate Istanbul rules.
 const foreign=await env.browser.newPage({viewport:{width:390,height:820},timezoneId:'America/New_York',locale:'en-US'});
 foreign.on('pageerror',e=>report.errors.push(e.message));
 await foreign.goto(env.base+'/?reference');
 await foreign.waitForFunction(()=>window.__BIST_ANDROID_UI_READY);
 await foreign.evaluate(()=>BistAndroid.navigate('settings_detail',{mode:'locale'}));
 const localeText=await foreign.locator('#apk-detailContent').innerText();
 assert(localeText.includes('America/New_York'));
 report.checks.push({screen:'settings_detail_locale',hostTimezone:'America/New_York',displayZone:'America/New_York',reason:'Matches native device locale'});
 await foreign.close();
 assert.deepEqual(report.errors,[],'Browser JavaScript errors');
 report.result='passed';
})().catch(e=>{report.result='failed';report.error=e.stack;process.exitCode=1;})
.finally(async()=>{fs.writeFileSync(path.join(folder,'results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({result:report.result,checks:report.checks.length,errors:report.errors,error:report.error}));if(env)await env.close();});
