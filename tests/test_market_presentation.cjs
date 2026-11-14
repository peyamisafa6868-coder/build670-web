const a=require('node:assert/strict'),m=require('../android-market.js');let checks=0;
const rows=[{symbol:'CCC',price:20,dailyChangePct:null},{symbol:'AAA',price:10,dailyChangePct:2},{symbol:'BBB',price:10,dailyChangePct:2}];
for(const [key,expected] of [['SOURCE',['CCC','AAA','BBB']],['SYMBOL',['AAA','BBB','CCC']],['CHANGE',['AAA','BBB','CCC']],['PRICE_ASC',['AAA','BBB','CCC']]]){a.deepEqual(m.order(rows,key).map(x=>x.symbol),expected);checks++;}
a.deepEqual(rows.map(x=>x.symbol),['CCC','AAA','BBB']);checks++;
a.equal(m.price({price:100},{price:110}),110);a.ok(Math.abs(m.change({}, {price:110,previousDailyClose:100})-10)<1e-10);a.equal(m.change({}, {price:110}),null);checks+=3;
const delayed={direction:'LONG',dailyChangePct:10,trendDisplay:{verifiedSignal:false,trend:{state:'BEARISH'}}};a.equal(m.matches(delayed,'LONG'),false);a.equal(m.matches(delayed,'TREND_UP'),false);a.equal(m.matches(delayed,'TREND_DOWN'),true);checks+=3;
console.log(JSON.stringify({checks,status:'passed'}));
