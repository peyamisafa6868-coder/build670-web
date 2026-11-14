const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
async function launch(port=8790){
 const base=process.env.TEST_BASE_URL||'http://127.0.0.1:'+port;let server;
 if(!process.env.TEST_BASE_URL){server=spawn('python3',['-u','server.py'],{cwd:process.env.TEST_SERVER_ROOT||root,env:{...process.env,PORT:String(port),SOURCE_COMMIT:process.env.GITHUB_SHA||'working-tree'},stdio:'ignore'});for(let i=0;i<120;i++){try{if((await fetch(base+'/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,50));}}
 const external=!['127.0.0.1','localhost'].includes(new URL(base).hostname),proxyUrl=external&&(process.env.HTTPS_PROXY||process.env.HTTP_PROXY);
 const proxy=proxyUrl?(()=>{const u=new URL(proxyUrl);return {server:u.origin,...(u.username?{username:decodeURIComponent(u.username),password:decodeURIComponent(u.password)}:{})};})():undefined;
 const browser=await chromium.launch({proxy,executablePath:process.env.CHROMIUM_EXECUTABLE||undefined,headless:true,args:process.env.CHROMIUM_EXECUTABLE?['--single-process','--no-zygote','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']:[]});
 return {base,browser,async close(){await browser.close();if(server)server.kill();}};
}
async function until(fn,timeout=5000){const start=Date.now();while(!fn()){if(Date.now()-start>timeout)throw Error('Test fixture did not receive the expected request');await new Promise(r=>setTimeout(r,15));}}
module.exports={root,launch,until};
