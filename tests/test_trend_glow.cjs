/* Visual-only technical trend palette: do not infer signals or price action. */
const assert=require('node:assert/strict');
const {trendGlow}=require('../android-results.js');
const expected=[
 ['BULLISH','UP',1,[108,245,65]],
 ['STRONG_BULLISH','UP',2,[57,255,20]],
 ['BEARISH','DOWN',1,[255,94,103]],
 ['STRONG_BEARISH','DOWN',2,[255,28,64]]
];
for(const [state,direction,level,[red,green,blue]] of expected){
 const got=trendGlow({state,strengthLevel:100,red:0,green:0,blue:0});
 assert.deepEqual({direction:got.direction,level:got.level,red:got.red,green:got.green,blue:got.blue},{direction,level,red,green,blue});
}
for(const value of [null,undefined,{}, {state:'NEUTRAL'}, {state:'INSUFFICIENT_DATA'},
 {state:'REJECTED'}, {state:'LONG'}, {state:'SHORT'}, {state:42}]){
 assert.equal(trendGlow(value),null);
}
assert.ok(trendGlow({state:'STRONG_BULLISH'}).green>trendGlow({state:'BULLISH'}).green);
assert.ok(trendGlow({state:'STRONG_BEARISH'}).green<trendGlow({state:'BEARISH'}).green);
console.log(JSON.stringify({status:'passed',cases:expected.length+9,policy:'technical trend only'}));
