'use strict';
(()=>{
const api=window.ViopLedger,KEY='bist_viop_manual_ledger_v1';
const el=id=>document.getElementById(id);
const say=s=>el('status').textContent=s;
let ledger,locked=false;
try{ledger=api.importBackup(localStorage.getItem(KEY)||api.empty());}
catch(e){locked=true;ledger=api.empty();say('Mevcut kayıt okunamadı; üzerine yazma engellendi. Ham yedeği indirin veya geçerli yedek içe aktarın.');}
const save=(next,confirmedImport=false)=>{if(locked&&!confirmedImport)throw Error('Kayıt korumada: önce ham yedeği indirin veya doğrulanmış yedeği içe aktarın.');localStorage.setItem(KEY,JSON.stringify(next));ledger=next;locked=false;render();};
function render(){
 el('positions').replaceChildren();el('position').replaceChildren();
 const summary=api.summary(ledger);
 el('summary').textContent='Açık kontrat: '+summary.openContracts+' | Gerçekleşen brüt K/Z: '+summary.grossRealized.toLocaleString('tr-TR',{maximumFractionDigits:2})+' | Net K/Z: '+summary.netRealized.toLocaleString('tr-TR',{maximumFractionDigits:2})+' | Açık risk: '+(summary.openRiskTry??'Bilinmiyor')+' TL | Açık teminat: '+(summary.openMarginTry??'Bilinmiyor')+' TL';
 for(const p of ledger.positions){
  const tr=document.createElement('tr');
  for(const v of [p.symbol,p.underlying,p.expiry,p.side,p.quantity,p.average,p.multiplier,p.realizedGross,p.realizedNet??p.realizedGross]){
   const td=document.createElement('td');td.textContent=String(v);tr.append(td);}
  el('positions').append(tr);
  if(p.quantity>0){const o=document.createElement('option');o.value=p.id;o.textContent=p.symbol+' / '+p.side+' / '+p.quantity;el('position').append(o);}
 }
}
const data=f=>Object.fromEntries(new FormData(f));
el('openForm').addEventListener('submit',e=>{
 e.preventDefault();const f=data(e.currentTarget);
 try{
  const id=(typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2));
  save(api.open(ledger,{id,symbol:f.symbol,underlying:f.underlying,expiry:f.expiry,side:f.side,
  multiplier:Number(f.multiplier),quantity:Number(f.quantity),price:Number(f.price),
  stop:Number(f.stop),target:Number(f.target),costPerContract:Number(f.costPerContract),
  marginPerContract:Number(f.marginPerContract),brokerExecutionId:f.brokerExecutionId}));
  e.currentTarget.reset();say('Pozisyon kaydedildi.');
 }catch(error){say('Kayıt hatası: '+error.message);}
});
el('closeForm').addEventListener('submit',e=>{
 e.preventDefault();const f=data(e.currentTarget);
 try{save(api.close(ledger,f.id,Number(f.quantity),Number(f.price),Number(f.extraFeeTry)));e.currentTarget.reset();say('Kısmi/tam kapama kaydedildi.');}
 catch(error){say('Kapama hatası: '+error.message);}
});
el('export').addEventListener('click',()=>{
 const raw=locked?localStorage.getItem(KEY):JSON.stringify(ledger,null,2);
 const blob=new Blob([raw||''],{type:'application/json'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='viop-manuel-defter-'+new Date().toISOString().slice(0,10)+'.json';a.click();URL.revokeObjectURL(url);say('Yedek hazırlandı.');
});
el('import').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
  if(file.size>3000000)throw Error('Dosya fazla büyük.');
  const incoming=api.importBackup(await file.text());
  if(!window.confirm('Mevcut manuel VİOP defterini bu JSON ile değiştirmek istediğinizden emin misiniz?'))return;
  save(incoming,true);say('Yedek içe aktarıldı.');
 }catch(error){say('İçe aktarma reddedildi: '+error.message);}finally{e.target.value='';}
});
function renderCatalog(){
 const rows=window.ViopCatalog.find({query:el('catalogQuery').value,category:el('catalogCategory').value});
 el('catalogRows').replaceChildren();
 for(const item of rows){
  const tr=document.createElement('tr');
  for(const value of [item.underlying,item.expiry,item.category]){
   const td=document.createElement('td');td.textContent=value;tr.append(td);}
  const td=document.createElement('td'),button=document.createElement('button');
  button.type='button';button.textContent='Forma aktar';
  button.addEventListener('click',()=>{
   const form=el('openForm');form.elements.underlying.value=item.underlying;
   form.elements.expiry.value=item.expiry;form.elements.symbol.value='';
   say('Dayanak ve vade aktarıldı. Gerçek sözleşme kodunu ve fiyatını doğrulayıp elle girin.');
  });
  td.append(button);tr.append(td);el('catalogRows').append(tr);
 }
}
el('catalogQuery').addEventListener('input',renderCatalog);
el('catalogCategory').addEventListener('change',renderCatalog);
renderCatalog();
render();
})();