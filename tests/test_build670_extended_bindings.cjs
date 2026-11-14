/* Static wiring regression. Does not replace real Chromium/API integration tests. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../android-app.js'),'utf8');
const chart=fs.readFileSync(path.join(__dirname,'../android-chart.js'),'utf8');
const resources=JSON.parse(fs.readFileSync(path.join(__dirname,'../android-resources.json'),'utf8'));
const resourceText=JSON.stringify(resources);
const frames=['expTrendFive','expTrendTen','expTrendHour','expTrendDaily','expTrendWeekly','expTrendMonthly'];
const indicators=['expRsi','expMacd','expStochastic','expCci','expAdx','expMomentum'];
const levels=['expRes1','expRes2','expRes3','expSup1','expSup2','expSup3','expLastPrice'];
for(const id of [...frames,...indicators,...levels]){
 assert.ok(source.includes(id),`Missing runtime binding: ${id}`);
 assert.ok(resourceText.includes('@+id/'+id),`Missing view definition: ${id}`);
}
assert.match(source,/extendedTickets\.get\(id\)===ticket/);
assert.match(source,/version===detailVersion/);
assert.match(source,/source\.symbol!==symbol\|\|source\.interval!==interval/);
assert.match(source,/bars\.length<220/);
assert.match(source,/closedCandles\(source\)/);
assert.match(source,/chartData!==data/);
assert.match(source,/Number\.isFinite\(refPrice\)/);
assert.match(source,/text\('expIndicatorSource'/);
assert.match(source,/text\('expLevelSource'/);
assert.match(chart,/s\.config\.onError\?\.\(e\)/);
console.log(JSON.stringify({status:'passed',type:'STATIC_UI_WIRING_ONLY',viewIds:frames.length+indicators.length+levels.length,source:'SOURCE_STATIC_CHECK'}));
