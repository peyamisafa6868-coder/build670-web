/* APK SettingsDetailActivity system report parity, with real production fallbacks. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {root,launch}=require('./browser_helpers.cjs');
const out=path.join(root,'test-results/system-report-parity');
fs.mkdirSync(out,{recursive:true});
let env;
const results={status:'pending',checks:[],jsErrors:[]};
(async()=>{
  env=await launch(8865);
  const page=await env.browser.newPage({viewport:{width:390,height:820},locale:'tr-TR',timezoneId:'Europe/Istanbul',acceptDownloads:true});
  page.on('pageerror',error=>results.jsErrors.push(error.message));
  await page.goto(env.base+'/?reference');
  await page.waitForFunction(()=>window.__BIST_ANDROID_UI_READY);
  for(const width of [320,360,390]){
    await page.setViewportSize({width,height:820});
    await page.evaluate(()=>BistAndroid.navigate('settings_detail',{mode:'system_status'}));
    await page.waitForSelector('#apk-system-report-body');
    const observed=await page.evaluate(()=>{
      const back=document.getElementById('apk-detailBack');
      const card=document.querySelector('#apk-detailContent .apk-system-report-card');
      const actions=[...document.querySelectorAll('#apk-detailContent .apk-system-report-action')];
      const br=back.getBoundingClientRect(),cr=card.getBoundingClientRect();
      return {title:document.getElementById('apk-detailTitle')?.innerText,
        subtitle:document.getElementById('apk-detailSubtitle')?.innerText,
        body:document.getElementById('apk-system-report-body')?.innerText,
        back:{width:br.width,height:br.height},
        card:{width:cr.width,height:cr.height},
        actions:actions.map(x=>({label:x.innerText,height:x.getBoundingClientRect().height})),
        pageWidth:document.documentElement.scrollWidth,
        viewport:window.innerWidth
      };
    });
    assert.equal(observed.title,'SİSTEM RAPORU');
    assert.match(observed.subtitle,/Kısa özet/);
    assert.match(observed.body,/SİSTEM RAPORU.*670/);
    assert.equal(observed.actions.length,6);
    assert(observed.back.width<=112,'Back button should not stretch to full screen.');
    assert(observed.card.width<=width-24);
    assert.equal(observed.pageWidth<=width,true,'Page must not horizontally overflow');
    for(const action of observed.actions)assert(action.height>=48,'Button touch target '+action.label);
    assert.deepEqual(observed.actions.map(x=>x.label),[
      'RAPORU YENİLE','TEKNİK DETAYLAR / DERİN TEŞHİS','CANLI PROVIDER / OHLCV TESTİ YAP',
      'KISA RAPORU KOPYALA','TARAMA HATA / EKSİK VERİ JSON İNDİR','KISA TXT İNDİR'
    ]);
    results.checks.push({type:'native-system-report',width,back:observed.back,card:observed.card});
    await page.screenshot({path:path.join(out,'system-report-'+width+'.png')});
  }
  await page.setViewportSize({width:390,height:820});
  await page.evaluate(()=>BistAndroid.navigate('notifications'));
  await page.waitForSelector('#apk-notificationState');
  const notification=await page.evaluate(()=>({
    state:document.getElementById('apk-notificationState')?.innerText,
    refresh:document.getElementById('apk-notificationRefresh')?.innerText,
    empty:document.getElementById('apk-notificationEmpty')?.innerText,
    webhook:document.getElementById('apk-tradingViewStatus')?.innerText,
    description:document.getElementById('apk-tradingViewSignals')?.innerText
  }));
  assert.match(notification.state,/TERCİH KAPALI|TERCİH AÇIK/);
  assert.match(notification.refresh,/Yenileme aralığı:/);
  assert.match(notification.empty,/Henüz kalıcı alarm olayı yok/);
  assert.match(notification.webhook,/TradingView webhook sinyalleri alınamadı/);
  assert.match(notification.description,/Production Backend/);
  results.checks.push({type:'apk-notification-empty-state',status:'passed'});
  await page.screenshot({path:path.join(out,'notifications-390.png')});
  await page.evaluate(()=>BistAndroid.navigate('viop_detail'));
  await page.waitForSelector('#apk-viopDataState');
  assert.equal(await page.locator('#apk-viopDetailSubtitle').innerText(),'Seçili sözleşme yok');
  assert.equal(await page.locator('#apk-viopDataState').innerText(),'VERİ YOK');
  assert.equal(await page.locator('#apk-viopChartTitle').innerText(),'VİOP • 5 DAKİKA • VERİ YOK');
  results.checks.push({type:'viop-empty-contract-state',result:'passed'});
  await page.screenshot({path:path.join(out,'viop-detail-empty-390.png')});
  await page.evaluate(()=>BistAndroid.navigate('settings_detail',{mode:'system_status'}));
  const [download]=await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button',{name:'KISA TXT İNDİR'}).click()
  ]);
  assert.match(download.suggestedFilename(),/SISTEM-RAPORU\.txt$/);
  results.checks.push({type:'system-report-download',result:'passed'});
  const fixtureJob={id:'a'.repeat(32),status:'COMPLETE',interval:'5m',processed:1,total:1,successful:0,insufficient:1,errors:0,failures:[{symbol:'TESTX',code:'INSUFFICIENT_HISTORY',closedBarCount:83,requiredClosedBars:220}]};
  await page.route('**/api/scans/'+fixtureJob.id+'*',r=>r.fulfill({json:r.request().url().includes('/results')?{total:0,page:1,size:25,results:[]}:fixtureJob}));
  await page.evaluate(id=>sessionStorage.setItem('bist_core_job',id),fixtureJob.id);
  await page.goto(env.base+'/');
  await page.waitForFunction(()=>window.__BIST_ANDROID_UI_READY);
  await page.evaluate(()=>BistAndroid.navigate('settings_detail',{mode:'system_status'}));
  await page.waitForFunction(()=>document.getElementById('apk-system-report-body')?.innerText.includes('GÜNCEL SORUNLAR'),null,{timeout:12000});
  const report=await page.locator('#apk-system-report-body').innerText();
  assert.match(report,/VİOP sağlayıcısı:/);
  assert.match(report,/DOĞRULANMADI|NOT_CONFIGURED|BACKEND_URL_MISSING/);
  assert.doesNotMatch(report,/CANLI VERİ: DOĞRULANDI/);
  results.checks.push({type:'real-provider-fail-closed',result:'passed'});
  const [detailDownload]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'TARAMA HATA / EKSİK VERİ JSON İNDİR',exact:true}).click()]);
  const details=JSON.parse(fs.readFileSync(await detailDownload.path(),'utf8'));
  assert.equal(details.failures[0].closedBarCount,83);assert.equal(details.failures[0].requiredClosedBars,220);
  results.checks.push({type:'detailed-scan-json-download-fixture',result:'passed'});
  await page.evaluate(()=>BistAndroid.navigate('settings_detail',{mode:'diagnostics'}));
  await page.getByRole('button',{name:'SİSTEM TANILAMASINI ÇALIŞTIR'}).click();
  await page.waitForSelector('dialog[open] .apk-status-card');
  const diagnostic=await page.locator('dialog[open] .apk-status-card').innerText();
  assert.match(diagnostic,/\/ready:/);
  assert.match(diagnostic,/\/api\/provider\/status:/);
  assert.match(diagnostic,/DOĞRULANMADI/);
  await page.getByRole('button',{name:'TAMAM'}).click();
  results.checks.push({type:'live-diagnostics-action',result:'passed'});
  assert.deepEqual(results.jsErrors,[],'No browser JavaScript errors');
  results.status='passed';
})().catch(e=>{results.status='failed';results.error=e.stack;process.exitCode=1;})
.finally(async()=>{fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({status:results.status,checks:results.checks,errors:results.jsErrors,error:results.error}));if(env)await env.close();});