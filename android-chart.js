/* Canvas port of BUILD670 PriceChartView. Coordinates, paints, panels and gestures follow the Android source. */
(() => {
  'use strict';
  const states=new WeakMap(),models=new WeakMap();
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),finite=Number.isFinite;
  const fmt=(x,n=2)=>Number(x).toFixed(n);
  const compact=v=>v>=1e9?fmt(v/1e9,1)+'B':v>=1e6?fmt(v/1e6,1)+'M':v>=1000?fmt(v/1000,1)+'K':fmt(v,0);
  function date(t,year=false){const p=new Intl.DateTimeFormat('tr-TR',{timeZone:'Europe/Istanbul',day:'2-digit',month:'2-digit',...(year?{year:'2-digit'}:{}),hour:'2-digit',minute:'2-digit'}).formatToParts(t),get=k=>p.find(x=>x.type===k)?.value;return get('day')+'.'+get('month')+(year?'.'+get('year'):'')+' '+get('hour')+':'+get('minute');}
  const colors={grid:'#52708630',up:'#16c994',down:'#f07972',ema20:'#ffd247',ema50:'#21b4ff',ema200:'#b385fa',bb:'#a9b7cbb2',rsi:'#ffe14f',macd:'#00e5ff',signal:'#ffad45',text:'#b9ccd9',axis:'#d0ddea',price:'#00e6aa'};
  function relativeVolumeFill(bars,index,lastBarClosed){
    const b=bars[index],isClosed=(v,i)=>v.closed===true||(v.closed==null&&(i<bars.length-1||lastBarClosed===true));
    if(!b||!isClosed(b,index)||!Number.isFinite(b.volume)||b.volume<0||index<50)return null;
    const prior=bars.slice(index-50,index);
    if(prior.length!==50||prior.some((v,i)=>!isClosed(v,index-50+i)||!Number.isFinite(v.volume)||v.volume<0))return null;
    return prior.filter(v=>v.volume<b.volume).length/50;
  }
  function model(data,bars){
    if(!models.has(data)){
      const pending=BistTerminal.api('/api/chart-analysis',{candles:bars.map((x,i)=>({...x,closed:typeof x.closed==='boolean'?x.closed:i<bars.length-1||data.lastBarClosed})),intraday:!['1d','1w','1mo','all'].includes(data.interval)}).catch(error=>{if(models.get(data)===pending)models.delete(data);throw error;});
      models.set(data,pending);
    }
    return models.get(data);
  }
  function mount(container,data,configuration={}){
    if(!container)return;
    if(!data||!validBars(data.candles)||typeof data.lastBarClosed!=='boolean')throw Error('Grafik için doğrulanmış OHLCV biçimi gerekli.');
    const quality=window.Build670ChartIntegrity?.inspect(data);
    if(quality&&!quality.valid)throw Error('Grafik OHLCV sırası veya değerleri geçersiz; veri otomatik onarılmadı.');
    const bars=data.candles;let s=states.get(container);
    if(!s||s.data!==data||s.error){
      s={data,bars,quality,visible:Math.min(96,bars.length),pan:0,selected:null,autoScale:true,verticalScale:1,verticalOffset:0,mouse:null,followLast:true,panelRatios:[.70,.15,.15],options:configuration.options||{},config:configuration,model:null,error:null};states.set(container,s);
      model(data,bars).then(m=>{s.model=m;if(container.isConnected&&states.get(container)===s){s.config.onModel?.(m);draw(container,s);}}).catch(e=>{s.error=e.message;if(container.isConnected&&states.get(container)===s){s.config.onError?.(e);draw(container,s);}});
    }
    s.options=configuration.options||s.options;s.config=configuration;if(!s.resizeObserver&&typeof ResizeObserver==='function'){s.resizeObserver=new ResizeObserver(()=>{if(container.isConnected&&states.get(container)===s)s.redraw?.();else s.resizeObserver?.disconnect();});s.resizeObserver.observe(container);}draw(container,s);return s;
  }
  function draw(container,s){
    const canvas=container.querySelector('canvas:not(.chart-focus-cursor)')||document.createElement('canvas'),w=Math.max(1,container.clientWidth),h=Math.max(1,container.clientHeight||400),ratio=devicePixelRatio||1;
    canvas.width=Math.round(w*ratio);canvas.height=Math.round(h*ratio);canvas.style.cssText='position:absolute;left:0;top:0;width:'+w+'px;height:'+h+'px';canvas.setAttribute('aria-label','Gerçek OHLCV grafiği; '+s.bars.length+' mum');if(canvas.parentElement!==container)container.replaceChildren(canvas);
    const overlayEnabled=typeof container.append==='function';
    let cursor=overlayEnabled?container.querySelector('canvas.chart-focus-cursor'):null;
    if(overlayEnabled&&!cursor){cursor=document.createElement('canvas');cursor.className='chart-focus-cursor';cursor.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:3';container.append(cursor);}
    if(cursor){cursor.width=canvas.width;cursor.height=canvas.height;cursor.style.width=w+'px';cursor.style.height=h+'px';}
    const cc=cursor?.getContext('2d');if(cc)cc.setTransform(ratio,0,0,ratio,0,0);
    const c=canvas.getContext('2d');c.scale(ratio,ratio);const all=s.bars,op=s.options;
    const enabled=(name,defaultValue=true)=>op[name]??defaultValue;
    function text(value,x,y,color=colors.text,size=10,bold=false,align='left'){c.font=(bold?'700 ':'400 ')+size+'px ApkRoboto';c.fillStyle=color;c.textAlign=align;c.textBaseline='alphabetic';c.fillText(value,x,y);c.textAlign='left';}
    function line(x1,y1,x2,y2,color=colors.grid,width=1,dash=[]){c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();c.setLineDash([]);}
    function rect(x1,y1,x2,y2,color){c.fillStyle=color;c.fillRect(x1,y1,x2-x1,y2-y1);}
    if(!all.length){text('OHLCV VERİSİ YOK',12,h/2,'#e1ebf4',12);return;}
    s.pan=Math.round(clamp(s.pan,0,Math.max(0,all.length-Math.floor(s.visible))));
    const count=clamp(Math.floor(s.visible),Math.min(12,all.length),all.length),end=clamp(all.length-s.pan,count,all.length),start=end-count,visible=all.slice(start,end),latest=visible.at(-1);
    const series=s.model?.series||(s.cachedSeries??=calculateIndicators(all,{intraday:!['1d','1w','1mo','all'].includes(s.data.interval),includeForming:true})),legacy=s.cachedLegacy??=calculateIndicators(all,{includeForming:true}),trend=s.model?.trend,levels=s.model?.levels;
    // Additional non-repainting chart geometry: never changes Kotlin series,
    // technical scores or existing reference levels and never uses open candles.
    const autoLevels=s.autoLevels??=(window.Build670ChartLevels?.compute(all,{lastBarClosed:s.data.lastBarClosed})||{supports:[],resistances:[],reason:'UNAVAILABLE'});
    const sides={support:enabledSide('support'),resistance:enabledSide('resistance')};
    function enabledSide(side){return enabled('toggleSupportResistance')&&enabled(side==='support'?'toggleSupport':'toggleResistance');}
    const css=getComputedStyle(container),pl=parseFloat(css.paddingLeft)||0,pr=parseFloat(css.paddingRight)||0,ptop=parseFloat(css.paddingTop)||0,pbottom=parseFloat(css.paddingBottom)||0;
    c.font='10px ApkRoboto';const left=pl+12,right=w-pr-Math.max(108,c.measureText(fmt(Math.max(...visible.map(x=>x.high)))).width+20),top=ptop+8,bottom=h-pbottom-18;
    if(right<=left||bottom<=top)return;
    const sh=enabled('toggleVolume'),sr=enabled('toggleRsi'),sm=enabled('toggleMacd'),sa=enabled('toggleAtr',false),H=bottom-top;
    const wanted=[sh?Math.max(54,H*(s.panelRatios?.[1]||.15)):0,sr?Math.max(60,H*(s.panelRatios?.[2]||.15)):0,sm?Math.max(65,H*.14):0,sa?Math.max(56,H*.10):0];
    const scale=Math.min(1,Math.max(0,H-150)/Math.max(1,wanted.reduce((a,b)=>a+b,0)));
    const [volumeH,rsiH,macdH,atrH]=wanted.map(v=>Math.round(v*scale));
    const pb=bottom-volumeH-rsiH-macdH-atrH,vt=pb+(sh?14:0),vb=pb+volumeH,rt=vb+(sr?14:0),rb=vb+rsiH,mt=rb+(sm?14:0),mb=rb+macdH,at=mb+(sa?14:0);
    for(const yy of [pb,vb,rb])line(left,yy,right,yy);for(let i=0;i<=5;i++){const xx=left+(right-left)*i/5;line(xx,top,xx,bottom);}
    const recorded=!!s.config.recorded,historical=recorded&&end<all.length,closeContext=historical?'GEÇMİŞ '+date(latest.timestamp,true):'SON KAYIT';
    const frameLabel={'1m':'1 DK','3m':'3 DK','5m':'5 DK','10m':'10 DK','15m':'15 DK','30m':'30 DK','60m':'1 SAAT','240m':'4 SAAT','1d':'1 GÜN','1w':'1 HAFTA','1mo':'1 AY','all':'TÜM ZAMANLAR'}[s.data.interval]||s.data.interval||'GRAFİK';
    const forming=latest.closed===false||(latest.closed==null&&end===all.length&&!s.data.lastBarClosed);
    text((recorded?closeContext:frameLabel)+' · K '+fmt(latest.close)+(forming?' • OLUŞAN MUM':''),left,top+10,historical?'#ffc34b':colors.text);
    if(sh)text('HACİM '+compact(latest.volume)+' • Ort20',left,vt+10);if(sr)text('RSI (14) · 30/50/70',left,rt+10);if(sm)text('MACD (12,26,9)',left,mt+10);
    if(s.quality?.spikes?.length)text('⚠ ŞÜPHELİ FİTİL '+s.quality.spikes.length+' • KAYNAK TEYİDİ YOK',left+Math.min(250,(right-left)*.42),top+10,'#ffbd65',9);
    const pt=top+15,step=count<=1?right-left:(right-left)/(count-1),x=i=>count<=1?(left+right)/2:left+step*i;
    const overlays=[];
    for(const [key,toggle,color] of [['ema9','toggleEma9',colors.ema50],['ema21','toggleEma21',colors.ema20],['sma50','toggleSma50',colors.ema200],['sma200','toggleSma200',colors.signal],['vwap','toggleVwap',colors.price]])if(enabled(toggle,false)&&(key!=='vwap'||!['1d','1w','1mo','all'].includes(s.data.interval)))overlays.push([series[key],color,2]);
    for(const [key,toggle,color] of [['ema20','toggleEma20',colors.ema20],['ema50','toggleEma50',colors.ema50],['ema200','toggleEma200',colors.ema200]])if(enabled(toggle))overlays.push([legacy[key],color,2]);
    if(enabled('toggleBollinger')){overlays.push([series.upper,colors.bb,1.5],[series.lower,colors.bb,1.5]);}
    // Scale price based on visible candles rather than distant trendlines.
    const values=visible.flatMap(b=>[b.low,b.high]);
    const lr=(l,i)=>l.intercept+l.slope*i;
    const vlow=Math.min(...visible.map(x=>x.low)),vhigh=Math.max(...visible.map(x=>x.high)),headroom=Math.max(vhigh-vlow,vhigh*.005)*.18;
    const merger=window.Build670ChartIntegrity?.mergeLevels;
    const merged={support:[],resistance:[]};
    for(const side of ['support','resistance'])merged[side]=merger?.(side,latest.close,autoLevels[side==='support'?'supports':'resistances'],levels?.[side],autoLevels.tolerance||0,2)||[];
    s.mergedLevels=merged;
    for(const [a] of overlays)for(const v of a.slice(start,end))if(finite(v)&&v>vlow-3*headroom&&v<vhigh+3*headroom)values.push(v);
    for(const kind of ['support','resistance'])if(sides[kind])for(const level of merged[kind])
      if(level.price>=vlow-headroom&&level.price<=vhigh+headroom)values.push(level.price);
    const marker=finite(s.config.signalPrice)&&finite(s.config.signalTime)&&s.config.signalTime>=visible[0].timestamp&&s.config.signalTime<=latest.timestamp;if(marker&&s.config.signalPrice>=vlow-headroom&&s.config.signalPrice<=vhigh+headroom)values.push(s.config.signalPrice);
    const valid=values.filter(x=>finite(x)&&x>0),rawMin=Math.min(...valid),rawMax=Math.max(...valid),margin=Math.max((rawMax-rawMin)*.12,rawMax*.001),autoMin=rawMin-margin,autoMax=rawMax+margin,center=(autoMin+autoMax)/2+(s.verticalOffset||0),half=(autoMax-autoMin)/2*(s.autoScale?1:s.verticalScale||1),min=center-half,max=center+half,span=max-min||1,y=v=>pb-(v-min)/span*(pb-pt);
    // Price elements stay clipped inside their panel.
    c.save();c.beginPath();c.rect(left,pt,right-left,pb-pt);c.clip();
    if(enabled('toggleChannel')&&enabled('toggleSupportResistance')&&trend?.main&&count>=2){
      const main=trend.main,high=all.map((b,i)=>b.high-lr(main,i)).filter(finite).sort((a,b)=>a-b),low=all.map((b,i)=>b.low-lr(main,i)).filter(finite).sort((a,b)=>a-b);
      if(high.length>=6&&low.length>=6){const upper=high[Math.floor((high.length-1)*.9)],lower=low[Math.floor((low.length-1)*.1)],u1=lr(main,start)+upper,u2=lr(main,end-1)+upper,l1=lr(main,start)+lower,l2=lr(main,end-1)+lower;
        if([u1,u2,l1,l2].every(x=>finite(x)&&x>0)){c.fillStyle=main.direction==='UP'?'#00c87826':main.direction==='DOWN'?'#ff525226':'#7896b41c';c.beginPath();c.moveTo(left,y(u1));c.lineTo(right,y(u2));c.lineTo(right,y(l2));c.lineTo(left,y(l1));c.closePath();c.fill();line(left,y(u1),right,y(u2),'#2664ff',3);line(left,y(l1),right,y(l2),'#ff4b4b',3);line(left,y(lr(main,start)),right,y(lr(main,end-1)),'#dcdcdcb4',1.5,[10,8]);}
      }
    }
    const drawnLevels={support:[],resistance:[]};
    // Native Kotlin S/R stays authoritative for the first reference. Extra
    // confirmed pivots add only nearby levels, with a strict 2-per-side cap.
    for(const [kind,stroke,tint] of [['resistance','#ff4969','#ff49691e'],['support','#19e88a','#19e88a1a']]){
      if(!sides[kind])continue;
      for(const item of merged[kind]){
        if(drawnLevels[kind].length>=2)break;
        const v=item.price;
        if(!finite(v)||v<min||v>max||y(v)<pt+9||y(v)>pb-9)continue;
        const strength=item.strength??.5,yy=y(v);
        const half=Math.min(item.bandHalfWidth||0,span*.03);
        if(half>0)rect(left,clamp(y(v+half),pt,pb),right,clamp(y(v-half),pt,pb),tint);
        line(left,yy,right,yy,stroke,strength>=.75?2.3:1.3,strength>=.75?[]:[6,5]);
        drawnLevels[kind].push({price:v,screenY:yy,source:item.source||'UNSPECIFIED',strength});
      }
    }
    s.drawnLevels=drawnLevels;
    function aligned(a,yy,color,width=2){c.beginPath();let started=false;for(let i=0;i<count;i++){const v=a[start+i];if(!finite(v))continue;const xx=x(i);if(started)c.lineTo(xx,yy(v));else{c.moveTo(xx,yy(v));started=true;}}if(started){c.strokeStyle=color;c.lineWidth=width;c.stroke();}}
    const body=Math.max(2,Math.min(12,step*.55));const spikeIdx=new Set((s.quality?.spikes||[]).map(v=>v.index));
    visible.forEach((b,i)=>{const xx=x(i),color=b.close>=b.open?colors.up:colors.down;line(xx,y(b.low),xx,y(b.high),color,2);const y1=y(b.open),y2=y(b.close),upper=Math.min(y1,y2),lower=Math.max(y1,y2),height=lower-upper;
      const index=start+i,percentile=relativeVolumeFill(all,index,s.data.lastBarClosed);
      if(enabled('toggleRelativeVolumeFill',false)){
        c.strokeStyle=color;c.lineWidth=1.5;
        if(height<=1)line(xx-body/2,y(b.close),xx+body/2,y(b.close),color,2);
        else{c.strokeRect(xx-body/2,upper,body,height);
          if(percentile!==null&&percentile>0){c.fillStyle=color;const fill=height*percentile;c.fillRect(xx-body/2,b.close>=b.open?lower-fill:upper,body,fill);}
        }
      }else rect(xx-body/2,upper,xx+body/2,Math.max(lower,upper+2),color);
      if(spikeIdx.has(start+i)){c.fillStyle='#ffcf78';c.beginPath();c.arc(xx,Math.max(pt+8,y(b.high)-5),3,0,Math.PI*2);c.fill();}
    });
    for(const [a,color,width] of overlays)aligned(a,y,color,width);
    if(enabled('toggleTrend')&&trend){for(const [key,color,width] of [['main','#e0e0e0',1.5],['support',colors.up,2],['resistance',colors.down,2]]){const l=trend[key];if(!l||key!=='main'&&!sides[key])continue;const v1=lr(l,start),v2=lr(l,end-1);if(v1>0&&v2>0)line(left,y(v1),right,y(v2),color,width);}for(const [key,prefix] of [['supportNow','D'],['resistanceNow','R']]){const v=trend[key];if(sides[key==='supportNow'?'support':'resistance']&&finite(v)&&v>=min&&v<=max)text(prefix+' '+fmt(v),right-104,y(v)-5);}}
    c.restore();
    for(let i=0;i<=4;i++){const v=min+(max-min)*i/4,yy=y(v);line(left,yy,right,yy);text(fmt(v),right+8,yy+6,colors.axis);}
    // The last price wins collision priority; S/R tags move without moving their lines.
    const closeY=y(latest.close),closeColor=historical?'#ffc34b':colors.price;
    const priceTags=[{y:closeY,price:latest.close,priority:0,color:closeColor,title:'',source:'LAST_PRICE'}];
    for(const [side,color,title] of [['support','#00e58d','D'],['resistance','#ff5475','R']])
      for(const item of drawnLevels[side])priceTags.push({y:item.screenY,price:item.price,
        priority:item.source.includes('KOTLIN_REFERENCE')?1:2,color,title,source:item.source});
    const labels=window.Build670ChartIntegrity?.layoutLabels(priceTags,pt+8,pb-8,19)||priceTags.map(v=>({...v,labelY:v.y}));
    s.axisLabels=labels;
    line(left,closeY,right,closeY,closeColor,1.5);
    for(const tag of labels){
      if(Math.abs(tag.labelY-tag.y)>2)line(right,tag.y,right+3,tag.labelY,tag.color,1.2);
      const y0=clamp(tag.labelY-8,pt,pb-16);
      rect(right+3,y0,w-pr-2,y0+16,tag.color);
      const source=tag.source.includes('KOTLIN')?' K':tag.source.includes('PIVOT')?' P':'';
      text(tag.title?tag.title+' '+fmt(tag.price)+source:fmt(tag.price),(right+w-pr)/2,y0+12,'#061321',9.5,true,'center');
    }
    if(marker){const i=visible.reduce((best,b,i)=>Math.abs(b.timestamp-s.config.signalTime)<Math.abs(visible[best].timestamp-s.config.signalTime)?i:best,0),xx=x(i),yy=y(s.config.signalPrice);c.fillStyle=colors.signal;c.beginPath();c.moveTo(xx,yy-12);c.lineTo(xx-9,yy+8);c.lineTo(xx+9,yy+8);c.closePath();c.fill();}
    if(sh){const maxVol=Math.max(...visible.map(x=>x.volume),...series.volume20.slice(start,end).filter(finite));if(maxVol>0){const yy=v=>vb-v/maxVol*(vb-vt-12),bw=Math.max(2,Math.min(10,step*.5));visible.forEach((b,i)=>rect(x(i)-bw/2,yy(b.volume),x(i)+bw/2,vb,b.close>=b.open?colors.up:colors.down));aligned(series.volume20,yy,colors.ema20);text(compact(maxVol),right+5,vt+10,colors.axis,9);text('0',right+5,vb-3,colors.axis,9);}}
    if(sr){const yy=v=>rb-clamp(v,0,100)/100*(rb-rt-12);for(const mark of [30,50,70]){line(left,yy(mark),right,yy(mark),colors.grid,mark===50?1.1:.7,[3,4]);text(String(mark),right+5,yy(mark)-3,colors.axis,9);}
      aligned(series.rsi,yy,colors.rsi);const last=series.rsi[end-1];if(finite(last))text('RSI '+fmt(last,1),left,rb-4,colors.rsi,10,true);}
    if(sm){const vals=[...series.macd.slice(start,end),...series.signal.slice(start,end),...series.histogram.slice(start,end)].filter(finite);if(vals.length){const lo=Math.min(0,...vals),hi=Math.max(0,...vals),sp=hi-lo||1,yy=v=>mb-(v-lo)/sp*(mb-mt-12);line(left,yy(0),right,yy(0));for(let i=0;i<count;i++){const v=series.histogram[start+i];if(finite(v))rect(x(i)-2,Math.min(yy(0),yy(v)),x(i)+2,Math.max(yy(0),yy(v)),v>=0?colors.up:colors.down);}aligned(series.macd,yy,colors.macd);aligned(series.signal,yy,colors.signal);const v=series.macd[end-1];if(finite(v))text(fmt(v,3),right+8,mt+12,colors.axis);}}
    if(sa){const a=series.atr.slice(start,end).filter(finite),high=Math.max(...a,1);text('ATR14 '+(a.length?fmt(a.at(-1),3):'—'),left,at+10);aligned(series.atr,v=>bottom-v/high*(bottom-at-12),colors.down);}
    text(date(visible[0].timestamp),left,bottom+10,colors.axis);c.font='10px ApkRoboto';const lastDate=date(latest.timestamp);text(lastDate,right-c.measureText(lastDate).width,bottom+10,colors.axis);
    
    if(s.error)text('Trend / seviye servisi: '+s.error,left,h-2,'#ff9b9b',9);
    // Cursor layer is independent of the price/indicator rendering. Mouse movement never
    // requests a full chart redraw or recalculates Kotlin / JS indicator series.
    const point=e=>{const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*w/r.width,y:(e.clientY-r.top)*h/r.height};};
    const localX=e=>point(e).x;
    const priceAt=yy=>min+(pb-yy)/(pb-pt)*span;
    const xIndex=xx=>clamp(start+Math.round((xx-left)/(right-left)*(count-1)),start,end-1);
    const label=(v,n=clamp(Number(s.data.pricePrecision??s.data.decimals??2)||2,0,6))=>finite(v)?new Intl.NumberFormat('tr-TR',{minimumFractionDigits:n,maximumFractionDigits:n}).format(v):'—';
    function cursorDraw(){
      if(!cc)return;
      cc.clearRect(0,0,w,h);
      const hover=s.mouse&&s.mouse.x>=left&&s.mouse.x<=right&&s.mouse.y>=top&&s.mouse.y<=bottom;
      const index=hover?xIndex(s.mouse.x):end-1,b=all[index],xx=x(index-start);
      if(!b)return;
      const indicator=s.model?.series||s.cachedSeries||{},rsi=indicator.rsi?.[index];
      const difference=index>0&&finite(all[index-1]?.close)?(b.close/all[index-1].close-1)*100:null;
      // Pin readout above the price panel rather than attaching it to the cursor.
      cc.font='11px ApkRoboto, Arial';cc.textBaseline='middle';cc.fillStyle='#dbe5ee';
      const line1='A '+label(b.open)+'   Y '+label(b.high)+'   D '+label(b.low)+'   K '+label(b.close)+'   '+(finite(difference)?(difference>=0?'+':'')+label(difference,2)+'%':'—')+(b.closed===false?'   · AÇIK MUM':'');
      cc.fillText(line1,left+3,top+26,Math.max(80,right-left-6));
      if(sh){cc.fillStyle='#c6d4df';cc.fillText('HACİM  '+label(b.volume,0),left+3,vt+23);}
      if(sr){cc.fillStyle='#e6c958';cc.fillText('RSI (14)  '+label(rsi,1),left+3,rt+22);}
      if(!hover)return;
      cc.strokeStyle='#c5d2ddaa';cc.lineWidth=1;cc.setLineDash([4,5]);cc.beginPath();cc.moveTo(xx,top);cc.lineTo(xx,bottom);cc.stroke();
      const yy=s.mouse.y,withinPrice=yy>=pt&&yy<=pb,withinVol=sh&&yy>=vt&&yy<=vb,withinRsi=sr&&yy>=rt&&yy<=rb;
      if(withinPrice||withinVol||withinRsi){cc.beginPath();cc.moveTo(left,yy);cc.lineTo(right,yy);cc.stroke();cc.setLineDash([]);
        let value=withinPrice?label(priceAt(yy)):withinVol?label((vb-yy)/Math.max(1,vb-vt-12)*Math.max(0,...visible.map(v=>v.volume)),0):label(clamp((rb-yy)/Math.max(1,rb-rt-12)*100,0,100),1);
        cc.fillStyle='#516a7b';cc.fillRect(right+3,clamp(yy-10,top,bottom-20),Math.min(90,w-right-5),20);
        cc.fillStyle='#fff';cc.fillText(value,right+8,clamp(yy,top+10,bottom-10),Math.max(20,w-right-12));
      }else cc.setLineDash([]);
      const dateText=date(b.timestamp,true);cc.font='11px ApkRoboto, Arial';const tw=Math.min(right-left,cc.measureText(dateText).width+16);const tx=clamp(xx-tw/2,left,right-tw);
      cc.fillStyle='#425969';cc.fillRect(tx,bottom+2,tw,17);cc.fillStyle='#fff';cc.textAlign='center';cc.fillText(dateText,tx+tw/2,bottom+11);cc.textAlign='left';
    }
    cursorDraw();
    const schedule=()=>{if(s.frame==null)s.frame=requestAnimationFrame(()=>{s.frame=null;if(states.get(container)===s&&container.isConnected)draw(container,s);});};
    const zoomAt=(factor,e)=>{
      const oldCount=clamp(Math.floor(s.visible),Math.min(12,all.length),all.length),oldEnd=clamp(all.length-Math.round(s.pan),oldCount,all.length);
      const f=clamp((localX(e)-left)/(right-left),0,1),anchor=oldEnd-oldCount+f*(oldCount-1),next=clamp(Math.round(oldCount*factor),Math.min(12,all.length),all.length);
      s.visible=next;s.pan=clamp(Math.round(all.length-next-anchor+f*(next-1)),0,all.length-next);s.followLast=s.pan===0;s.mouse=null;schedule();
    };
    s.pointers??=new Map();
    const distance=()=>{const [a,b]=[...s.pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y);};
    const release=e=>{clearTimeout(s.longTimer);s.pointers.delete(e.pointerId);s.pinch=null;s.pointer=null;canvas.style.cursor='crosshair';};
    canvas.onpointerdown=e=>{
      if(e.pointerType==='mouse'&&e.button!==0)return;
      const pt=point(e);s.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});try{canvas.setPointerCapture(e.pointerId);}catch{}
      clearTimeout(s.longTimer);
      if(s.pointers.size===2){s.pinch={distance:distance(),visible:s.visible};s.pointer=null;}
      else{s.pointer={id:e.pointerId,x:e.clientX,y:e.clientY,pan:s.pan,count:Math.floor(s.visible),width:right-left,scale:w/canvas.getBoundingClientRect().width,moved:false,axis:pt.x>right,scaleStart:s.verticalScale||1,divider:Math.abs(pt.y-pb)<7&&sh&&sr?'price':Math.abs(pt.y-vb)<7&&sh&&sr?'volume':null,ratios:s.panelRatios.slice()};
        canvas.style.cursor='grabbing';if(e.pointerType==='touch')s.longTimer=setTimeout(()=>{if(s.pointer&&!s.pointer.moved){s.pointer.moved=true;s.config.onFullscreen?.();}},600);}
    };
    canvas.onpointermove=e=>{
      s.mouse=point(e);
      if(!s.pointers.has(e.pointerId)){cursorDraw();return;}
      s.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if(s.pinch&&s.pointers.size===2){s.visible=clamp(Math.round(s.pinch.visible*s.pinch.distance/Math.max(1,distance())),Math.min(12,all.length),all.length);s.pan=clamp(Math.round(s.pan),0,all.length-s.visible);schedule();return;}
      const p=s.pointer;if(!p||p.id!==e.pointerId)return;
      if(Math.hypot(e.clientX-p.x,e.clientY-p.y)>4){p.moved=true;clearTimeout(s.longTimer);}
      if(p.moved){if(p.divider){const delta=(e.clientY-p.y)/Math.max(1,H);if(p.divider==='price'){s.panelRatios[1]=clamp(p.ratios[1]-delta,.12,.35);s.panelRatios[0]=1-s.panelRatios[1]-s.panelRatios[2];}else{s.panelRatios[1]=clamp(p.ratios[1]+delta,.12,.35);s.panelRatios[2]=clamp(p.ratios[2]-delta,.12,.35);}schedule();}else if(p.axis){s.autoScale=false;s.verticalScale=clamp(p.scaleStart*Math.exp((e.clientY-p.y)*.006),.2,10);}else{s.pan=clamp(p.pan+Math.round((e.clientX-p.x)*p.scale*(p.count-1)/p.width),0,all.length-p.count);s.followLast=s.pan===0;}schedule();}
      else cursorDraw();
    };
    canvas.onpointerleave=()=>{if(!s.pointer){s.mouse=null;cursorDraw();}};
    canvas.onpointerup=e=>{if(!s.pinch&&s.pointer?.id===e.pointerId&&!s.pointer.moved){s.mouse=point(e);const b=all[xIndex(s.mouse.x)];s.selected=xIndex(s.mouse.x);s.config.onSelect?.(b);cursorDraw();}release(e);};
    canvas.onpointercancel=release;canvas.onlostpointercapture=release;
    canvas.onwheel=e=>{e.preventDefault();if(!Number.isFinite(e.deltaY)||e.deltaY===0)return;clearTimeout(s.longTimer);s.pointer=null;
      const pixels=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?h:1);zoomAt(Math.exp(clamp(pixels,-120,120)*.0015),e);};
    canvas.ondblclick=e=>{if(point(e).x>right){s.autoScale=true;s.verticalScale=1;s.verticalOffset=0;schedule();}else if(e.button===0)zoomAt(1/1.2,e);};
    canvas.style.touchAction='none';canvas.style.cursor=s.pointer?'grabbing':(s.mouse?.x>right?'ns-resize':s.mouse&&(Math.abs(s.mouse.y-pb)<7||Math.abs(s.mouse.y-vb)<7)?'row-resize':'crosshair');
    s.redraw=schedule;s.fit=()=>{s.visible=Math.min(96,s.bars.length);s.pan=0;s.followLast=true;s.autoScale=true;s.verticalScale=1;s.verticalOffset=0;s.mouse=null;schedule();};s.last=()=>{s.pan=0;s.followLast=true;schedule();};
    s.bounds={left,right,top,bottom,start,count,min,max};s.canvas=canvas;
  }
  function zoom(container,factor){const s=states.get(container);if(s){s.visible=clamp(Math.round(s.visible/factor),Math.min(12,s.bars.length),s.bars.length);s.redraw?.();}}
  function clear(container){if(container){const s=states.get(container);if(s){clearTimeout(s.longTimer);s.resizeObserver?.disconnect();if(s.frame!=null)cancelAnimationFrame(s.frame);s.pointers?.clear();}states.delete(container);container.replaceChildren();}}
  window.AndroidPriceChart={mount,zoom,clear,getState:container=>states.get(container),colors};
  if(typeof module!=='undefined')module.exports={relativeVolumeFill};
})();
