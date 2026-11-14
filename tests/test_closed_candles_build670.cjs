'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
function extract(file){
 const src=fs.readFileSync(path.join(root,file),'utf8');
 const start=src.indexOf('function confirmedCandles(');assert(start>=0,`${file}: missing helper`);
 const open=src.indexOf('{',start);let depth=0,end=-1;
 for(let i=open;i<src.length;i++){if(src[i]==='{')depth++;else if(src[i]==='}'&&!--depth){end=i+1;break;}}
 assert(end>0);return vm.runInNewContext(`(${src.slice(start,end)})`);
}
for(const file of ['android-fullscreen.js','android-technical.js']){
 const fn=extract(file);
 const bars=[{timestamp:1000,closed:true},{timestamp:2000,closed:true},{timestamp:3000,closed:false}];
 assert.equal(fn({candles:bars}).length,2,`${file}: open bar removed`);
 assert.equal(fn({candles:bars.slice(0,2)}).length,2,`${file}: explicitly closed latest bar kept`);
 assert.equal(fn({candles:[{timestamp:1000},{timestamp:2000}]}).length,1,`${file}: unknown latest excluded`);
 assert.equal(fn({candles:[{timestamp:1000},{timestamp:2000}],lastBarClosed:true}).length,2,`${file}: verified latest retained`);
 assert.equal(fn({candles:[{timestamp:1000}, {timestamp:0,closed:true}]}).length,1,`${file}: malformed timestamp rejected`);
 console.log('PASS',file,'5 closed candle validations');
}
const fullscreen=fs.readFileSync(path.join(root,'android-fullscreen.js'),'utf8');
assert(fullscreen.includes('candles:confirmedCandles(data)'));
assert(!fullscreen.includes('data.candles.slice(0,-1)'));
console.log('PASS fullscreen analysis request uses confirmed bars');
