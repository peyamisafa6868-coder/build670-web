/* Explicit local auth identities; no real credentials or market provider. */
const {launch}=require('./browser_helpers.cjs'),assert=require('node:assert/strict'),crypto=require('node:crypto'),fs=require('node:fs');
const alice='EXPLICIT_BROWSER_ALICE_'+'a'.repeat(40),bob='EXPLICIT_BROWSER_BOB_'+'b'.repeat(40);
process.env.BUILD670_AUTH_REQUIRED='1';process.env.BUILD670_USER_TOKEN_HASHES=JSON.stringify({alice:crypto.createHash('sha256').update(alice).digest('hex'),bob:crypto.createHash('sha256').update(bob).digest('hex')});
let env;const report={scope:'Isolated browser-session identities; no real provider or staging credentials',checks:[],errors:[]};
(async()=>{
 env=await launch(8821);const context=await env.browser.newContext(),page=await context.newPage();
 page.on('pageerror',e=>report.errors.push(e.message));
 await context.addInitScript(()=>{window.__nativeLocal=window.localStorage;window.__nativeSession=window.sessionStorage;});
 await context.route('**/api/universe',r=>r.fulfill({json:{count:0,records:[],identityMatched:0}}));
 await context.route('**/api/instruments',r=>r.fulfill({json:{items:[]}}));
 await context.route('**/history?**',r=>r.fulfill({status:503,json:{error:'EXPLICIT NO PROVIDER FIXTURE'}}));
 await page.goto(env.base);assert.ok(await page.locator('#access-token').isVisible());
 await page.evaluate(()=>localStorage.setItem('bist_build670_settings','{"favorites":["LEGACY"]}'));
 async function login(token){await page.locator('#access-token').fill(token);await page.locator('#login-button').click();await page.locator('#build670-session').waitFor();await page.waitForFunction(()=>window.__BIST_ANDROID_UI_READY);}
 await page.locator('#access-token').fill('wrong');await page.locator('#login-button').click();await page.getByText('Erişim anahtarı doğrulanamadı.').waitFor();assert.equal(await page.locator('#access-token').inputValue(),'');
 await login(alice);assert.match(await page.locator('#build670-session').innerText(),/alice/);
 const cookies=await context.cookies();const cookie=cookies.find(c=>c.name==='__Host-build670_session');assert.ok(cookie.httpOnly&&cookie.secure&&cookie.sameSite==='Strict');assert.ok(!cookie.value.includes(alice));
 assert.equal(await page.evaluate(()=>fetch('/api/core/metadata').then(r=>r.status)),200);
 const aBinding=await page.locator('meta[name="build670-session-binding"]').getAttribute('content');
 await page.evaluate(()=>{localStorage.setItem('session_test_record','alice-only');sessionStorage.setItem('session_test_record','alice-tab');});
 assert.equal(await page.evaluate(()=>localStorage.getItem('bist_build670_settings')),null);
 assert.equal(await page.evaluate(()=>__nativeLocal.getItem('bist_build670_settings')),'{"favorites":["LEGACY"]}');
 report.checks.push('Login gates app, wrong credentials clear input, HttpOnly/Secure/Strict cookie, protected Kotlin API succeeds');
 // The real chart request goes through the cookie-bound fetch wrapper.
 await page.evaluate(()=>BistAndroid.navigate('fullscreen',{symbol:'ASELS',data:{symbol:'ASELS',interval:'5m',source:'EXPLICIT SESSION TEST',lastBarClosed:true,candles:Array.from({length:280},(_,i)=>{const p=100+Math.sin(i/6)*4;return {timestamp:1700000000000+i*300000,open:p-.1,close:p+.1,high:p+.6,low:p-.6,volume:1000+i,closed:true};})}}));
 await page.waitForFunction(()=>!!AndroidPriceChart.getState(document.querySelector('#apk-fullChart'))?.model,null,{timeout:25000});
 assert.ok(await page.locator('#apk-fullChart canvas:not(.chart-focus-cursor)').isVisible());
 report.checks.push('Authenticated fullscreen fixture reaches real Kotlin chart endpoint');
 await page.getByRole('button',{name:'Oturumu kapat',exact:true}).click();await page.locator('#access-token').waitFor();
 await login(bob);assert.equal(await page.evaluate(()=>localStorage.getItem('session_test_record')),null);assert.equal(await page.evaluate(()=>sessionStorage.getItem('session_test_record')),null);
 await page.evaluate(()=>localStorage.setItem('session_test_record','bob-only'));
 const stale=await context.request.get(env.base+'/api/core/metadata',{headers:{'X-Build670-Session':aBinding}});assert.equal(stale.status(),409);
 const bBinding=await page.locator('meta[name="build670-session-binding"]').getAttribute('content');
 await page.reload();await page.locator('#build670-session').waitFor();assert.match(await page.locator('#build670-session').innerText(),/bob/);assert.equal(await page.evaluate(()=>localStorage.getItem('session_test_record')),'bob-only');
 await page.getByRole('button',{name:'Oturumu kapat',exact:true}).click();await page.locator('#access-token').waitFor();
 const loggedOut=await context.request.get(env.base+'/api/core/metadata',{headers:{'X-Build670-Session':bBinding}});assert.equal(loggedOut.status(),401);
 await login(alice);assert.equal(await page.evaluate(()=>localStorage.getItem('session_test_record')),'alice-only');assert.equal(await page.evaluate(()=>sessionStorage.getItem('session_test_record')),'alice-tab');
 assert.equal(await page.evaluate(()=>__nativeLocal.getItem('bist_build670_settings')),'{"favorites":["LEGACY"]}');
 const stored=await page.evaluate(()=>JSON.stringify({...__nativeLocal,...__nativeSession}));assert.ok(!stored.includes(alice)&&!stored.includes(bob));
 report.checks.push('Account switch isolates local and session records, preserves legacy bytes, rejects stale tab, survives reload and revokes logout');
 assert.deepEqual(report.errors,[]);report.status='passed';await context.close();
})().catch(e=>{report.status='failed';report.failure=e.stack;process.exitCode=1;}).finally(async()=>{fs.mkdirSync('test-results/sessions',{recursive:true});fs.writeFileSync('test-results/sessions/results.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(env)await env.close();});
