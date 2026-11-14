const assert=require('node:assert/strict'),p=require('../android-preferences.js');let checks=0;
for(const quantity of [0,.5,1,1.5]){const s={...p.defaults(),quantity};assert.deepEqual(p.validate(JSON.parse(JSON.stringify(s))),s);checks++;}
for(const invalid of [[],null,{...p.defaults(),interval:'240m'},{...p.defaults(),cadence:'5'},{...p.defaults(),quantity:-1},{...p.defaults(),watchlist:['ASELS','ASELS']}]){assert.throws(()=>p.validate(invalid));checks++;}
const raw={...p.defaults(),cadence:'bad',auto:true,favorites:['ASELS','bad!','THYAO','ASELS'],watchlist:['TUPRS']},r=p.recover(raw);assert.deepEqual(r.settings.favorites,['ASELS','THYAO']);assert.deepEqual(r.settings.watchlist,['TUPRS']);assert.equal(r.settings.auto,false);assert.equal(raw.auto,true);checks++;
assert.notEqual(p.defaults().favorites,p.defaults().favorites);checks++;console.log(JSON.stringify({checks,status:'passed'}));
