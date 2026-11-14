'use strict';
(()=>{const el=id=>document.getElementById(id);let job=null,page=1,timer=null;
const notice=s=>el('notice').textContent=s;
async function request(url,options){const r=await fetch(url,{cache:'no-store',...options});const data=await r.json();if(!r.ok)throw Error(data.error||'HTTP '+r.status);return data;}
function stop(){if(timer){clearTimeout(timer);timer=null;}}
async function refresh(){
if(!job)return;
try{
 const q=new URLSearchParams({page:String(page),size:el('size').value,filter:el('filter').value,sort:el('sort').value});
 const d=await request('/scan/'+job+'?'+q);
 el('progress').max=d.total;el('progress').value=d.done;
 el('summary').textContent=d.done+'/'+d.total+' işlendi · geçerli: '+d.passed+' · hatalı: '+d.failed+' · durum: '+d.state;
 el('page').textContent=page+' / '+Math.max(1,Math.ceil(d.filteredTotal/d.pageSize));
 el('previous').disabled=page<=1;el('next').disabled=page*d.pageSize>=d.filteredTotal;
 el('results').replaceChildren();
 for(const row of d.results){
 const tr=document.createElement('tr');
 for(const v of [row.symbol,row.close,row.sma20,row.sma50,row.rsi14,row.volumeRatio??"—",new Date(row.lastBarTime).toISOString(),row.provider]){
 const td=document.createElement('td');td.textContent=String(v);tr.append(td);}
 el('results').append(tr);}
 el('errors').textContent=d.errors.map(e=>e.symbol+': '+e.error).join('\n')||'Hata yok.';
 const active=d.state==='queued'||d.state==='running';
 el('cancel').disabled=!active;el('start').disabled=active;
 if(active)timer=setTimeout(refresh,1500);else notice(d.state==='complete'?'Tarama bitti.':'Tarama iptal edildi.');
}catch(e){notice('İlerleme alınamadı: '+e.message);stop();el('start').disabled=false;}
}
el('symbolFile').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;
 try{
  if(file.size>200000)throw Error('Dosya boyutu çok büyük.');
  const raw=await file.text();
  const rows=raw.trim().split(/\r?\n/);
  const symbols=[];
  for(const line of rows){
   const first=line.split(/[;,\t]/)[0].replace(/^["']|["']$/g,'').trim().toUpperCase().replace(/\.IS$/,'');
   if(/^[A-Z0-9]{3,10}$/.test(first))symbols.push(first);
  }
  const unique=[...new Set(symbols)];
  if(!unique.length||unique.length>632)throw Error('1–632 geçerli sembol bulunmalıdır.');
  el('symbols').value=unique.join(', ');
  notice(unique.length+' sembol aktarıldı; kaynağın tam BIST evreni olduğu ayrıca doğrulanmalıdır.');
 }catch(error){notice('Sembol dosyası okunamadı: '+error.message);}
 finally{e.target.value='';}
});
el('start').addEventListener('click',async()=>{
 stop();const symbols=el('symbols').value.toUpperCase().split(/[\s,;]+/).filter(Boolean).map(s=>s.replace(/\.IS$/,''));
 if(!symbols.length||symbols.length>632||new Set(symbols).size!==symbols.length){notice('1–632 benzersiz sembol girin.');return;}
 try{el('start').disabled=true;notice('Başlatılıyor…');const d=await request('/scan/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbols})});job=d.id;page=1;await refresh();}
 catch(e){el('start').disabled=false;notice(e.message);}
});
el('cancel').addEventListener('click',async()=>{if(!job)return;try{await request('/scan/'+job,{method:'DELETE'});notice('İptal istendi; devam eden tek istek sonuçlanabilir.');}catch(e){notice(e.message);}});
for(const id of ['filter','sort','size'])el(id).addEventListener('change',()=>{page=1;stop();refresh();});
el('previous').addEventListener('click',()=>{if(page>1){page--;stop();refresh();}});
el('next').addEventListener('click',()=>{page++;stop();refresh();});
})();