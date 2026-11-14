/* Android XML resource renderer. Original dimensions/colors/drawables stay data, not guessed CSS. */
(() => {
  'use strict';
  let resources;
  const xmlns='http://www.w3.org/2000/svg';
  function value(input){
    if(typeof input!=='string')return input;
    if(input==='@android:color/transparent')return 'transparent';
    if(input==='@android:color/white')return '#fff';
    if(input==='@android:color/black')return '#000';
    if(input.startsWith('@string/'))return resources.strings[input.slice(8)]??input;
    if(input.startsWith('@color/'))return value(resources.colors[input.slice(7)]??'#ffffff');
    if(input.startsWith('@dimen/'))return resources.dimens[input.slice(7)]??'0dp';
    if(/^#[\da-f]{8}$/i.test(input))return '#'+input.slice(3)+input.slice(1,3);
    return input;
  }
  function pixels(input){const v=value(input);if(typeof v==='number')return v;return parseFloat(v)||0;}
  function textMetrics(size){
    // Android 11 sans-serif Paint metrics, independently measured on the
    // reference emulator. Font padding is part of the text, not view padding.
    return {top:Math.floor(-1.05615234375*size),ascent:Math.round(-0.927734375*size),descent:Math.round(0.244140625*size),bottom:Math.ceil(0.27099609375*size)};
  }
  function style(name,seen=new Set()){
    name=(name||'').replace('@style/','');if(seen.has(name))return {};seen.add(name);
    const own=resources.styles[name]||{},parent=own.parent?style(own.parent,seen):{};
    return {...parent,...Object.fromEntries(Object.entries(own).filter(([k])=>k!=='parent').map(([k,v])=>[k.replace('android:',''),v]))};
  }
  function drawable(name){
    name=(name||'').replace('@drawable/','');
    let data=resources.drawables[name];if(!data)return {};
    if(data.tag==='selector'){const items=data.children.filter(c=>c.tag==='item');const item=items.find(x=>!Object.keys(x.a).some(k=>k.startsWith('state_')))||items.at(-1);data=item?.children[0]||data;}
    if(data.tag==='layer-list'){const first=data.children.find(x=>x.tag==='item');data=first?.children[0]||data;}
    return data;
  }
  function background(element,reference){
    if(!reference||reference==='@null'||reference.startsWith('?'))return;
    if(!reference.startsWith('@drawable/')){element.style.background=value(reference);return;}
    const data=drawable(reference);if(data.tag!=='shape')return;
    const st=element.style;
    for(const child of data.children){
      const a=child.a;
      if(child.tag==='solid')st.background=value(a.color);
      if(child.tag==='gradient'){
        const angle=(450-(Number(a.angle)||0))%360,colors=[a.startColor,a.centerColor,a.endColor].filter(Boolean).map(value);
        st.background='linear-gradient('+angle+'deg,'+colors.join(',')+')';
      }
      if(child.tag==='corners'){
        if(a.radius)st.borderRadius=pixels(a.radius)+'px';
        for(const [k,css] of [['topLeftRadius','borderTopLeftRadius'],['topRightRadius','borderTopRightRadius'],['bottomLeftRadius','borderBottomLeftRadius'],['bottomRightRadius','borderBottomRightRadius']])if(a[k])st[css]=pixels(a[k])+'px';
      }
      if(child.tag==='stroke'){st.outline=pixels(a.width)+'px solid '+value(a.color);st.outlineOffset=-pixels(a.width)+'px';}
      if(child.tag==='padding')for(const side of ['Left','Top','Right','Bottom'])if(!st['padding'+side])st['padding'+side]=pixels(a[side.toLowerCase()])+'px';
    }
    if(data.a.shape==='oval')st.borderRadius='50%';
  }
  function vector(reference){
    const data=drawable(reference);if(data.tag!=='vector')return null;
    const svg=document.createElementNS(xmlns,'svg'),a=data.a;svg.setAttribute('viewBox','0 0 '+(a.viewportWidth||24)+' '+(a.viewportHeight||24));svg.setAttribute('width',pixels(a.width)||24);svg.setAttribute('height',pixels(a.height)||24);svg.setAttribute('aria-hidden','true');
    function children(parent,items){
      for(const item of items){
        if(item.tag==='group'){const g=document.createElementNS(xmlns,'g');let t='';const x=item.a;t+='translate('+(x.translateX||0)+' '+(x.translateY||0)+') ';if(x.rotation)t+='rotate('+x.rotation+' '+(x.pivotX||0)+' '+(x.pivotY||0)+') ';if(x.scaleX||x.scaleY)t+='scale('+(x.scaleX||1)+' '+(x.scaleY||1)+')';g.setAttribute('transform',t);children(g,item.children);parent.append(g);}
        if(item.tag==='path'){
          const path=document.createElementNS(xmlns,'path'),p=item.a;path.setAttribute('d',p.pathData||'');
          path.setAttribute('fill',p.fillColor?value(p.fillColor):'none');if(p.strokeColor)path.setAttribute('stroke',value(p.strokeColor));if(p.strokeWidth)path.setAttribute('stroke-width',p.strokeWidth);if(p.strokeLineCap)path.setAttribute('stroke-linecap',p.strokeLineCap);if(p.strokeLineJoin)path.setAttribute('stroke-linejoin',p.strokeLineJoin);if(p.fillAlpha)path.setAttribute('fill-opacity',p.fillAlpha);parent.append(path);
        }
      }
    }
    children(svg,data.children);return svg;
  }
  function apply(element,a,parentOrientation,kind,inherited={},explicit={}){
    const s=element.style;s.boxSizing='border-box';
    const weight=Number(a.layout_weight)||0;
    for(const [key,css,axis] of [['layout_width','width','horizontal'],['layout_height','height','vertical']]){
      const v=value(a[key]);
      if(v==='match_parent'||v==='fill_parent')s[css]='100%';
      else if(v==='wrap_content')s[css]='auto';
      else if(v!=null)s[css]=pixels(v)+'px';
      if(weight&&axis===parentOrientation){s.flexGrow=weight;s.flexShrink=1;s.flexBasis=v!=null&&pixels(v)===0&&v!=='wrap_content'&&v!=='match_parent'?'0px':'auto';if(s.flexBasis==='0px'){s[css]='0px';s[css==='width'?'minWidth':'minHeight']='0px';}}
    }
    if(!weight)s.flexShrink='0';
    for(const key of ['minWidth','minHeight','maxWidth','maxHeight'])if(a[key]!=null)s[key]=pixels(a[key])+'px';
    const sides=[['Start','Left'],['End','Right'],['Left','Left'],['Right','Right'],['Top','Top'],['Bottom','Bottom']];
    for(const source of [inherited,explicit])for(const [src,css] of [['padding','padding'],['layout_margin','margin']]){
      if(source[src]!=null)s[css]=pixels(source[src])+'px';
      for(const axis of ['Horizontal','Vertical'])if(source[src+axis]!=null){const n=pixels(source[src+axis])+'px';for(const side of axis==='Horizontal'?['Left','Right']:['Top','Bottom'])s[css+side]=n;}
      for(const [name,side] of sides)if(source[src+name]!=null)s[css+side]=pixels(source[src+name])+'px';
    }
    if(a.textColor)s.color=value(a.textColor);
    if(a.textSize)s.fontSize=pixels(a.textSize)+'px';
    if(a.autoSizeTextType==='uniform'){s.fontSize=pixels(a.autoSizeMaxTextSize||a.textSize)+'px';element.dataset.autoSizeMin=pixels(a.autoSizeMinTextSize||a.textSize);element.dataset.autoSizeMax=pixels(a.autoSizeMaxTextSize||a.textSize);}
    if(a.textStyle?.includes('bold')||a.fontFamily?.includes('medium'))s.fontWeight=a.fontFamily?.includes('medium')?'500':'700';
    if(a.textStyle?.includes('italic'))s.fontStyle='italic';
    if(a.letterSpacing)s.letterSpacing=(Number(a.letterSpacing)*pixels(a.textSize||14))+'px';
    if(a.lineSpacingExtra)s.lineHeight='calc(1.17em + '+pixels(a.lineSpacingExtra)+'px)';
    if(a.alpha)s.opacity=a.alpha;
    if(a.elevation&&pixels(a.elevation)>0)s.boxShadow='0 '+pixels(a.elevation)/3+'px '+pixels(a.elevation)+'px #0005';
    background(element,a.background);
    if(a.backgroundTint&&a.backgroundTint!=='@null'){
      if(kind==='Spinner'){
        s.background='transparent';s.color='inherit';s.appearance='none';
        const svg='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 6"><path d="M0 0H10L5 5Z" fill="'+value(a.backgroundTint)+'"/></svg>';
        s.backgroundImage='url("data:image/svg+xml,'+encodeURIComponent(svg)+'")';s.backgroundRepeat='no-repeat';s.backgroundPosition='right 18px center';s.backgroundSize='10px 6px';s.paddingRight='32px';
      }
      else if(kind==='Button'&&element.classList.contains('apk-platform-button')&&!a.background)s.setProperty('--apk-platform-tint',value(a.backgroundTint));
      else s.background=value(a.backgroundTint);
    }
    if(a.visibility==='gone')element.hidden=true;
    else if(a.visibility==='invisible')s.visibility='hidden';
    if(a.gravity){
      const g=a.gravity;
      s.justifyContent=g.includes('center_vertical')||g==='center'?'center':g.includes('bottom')?'flex-end':'flex-start';
      s.textAlign=g.includes('end')||g.includes('right')?'right':g.includes('center_horizontal')||g==='center'?'center':'left';
      if(kind==='LinearLayout'){
        const vertical=a.orientation==='vertical';
        s.justifyContent=g==='center'||g.includes(vertical?'center_vertical':'center_horizontal')?'center':g.includes(vertical?'bottom':'end')?'flex-end':'flex-start';
        s.alignItems=g==='center'||g.includes(vertical?'center_horizontal':'center_vertical')?'center':g.includes(vertical?'end':'bottom')?'flex-end':'stretch';
      }
      if(kind==='TextView'||kind==='Button')s.alignItems=g.includes('center_horizontal')||g==='center'?'center':g.includes('end')?'flex-end':'flex-start';
    }
    if(a.layout_gravity?.includes('center'))s.alignSelf='center';
    if(a.singleLine==='true'||a.maxLines==='1'){element.classList.add('apk-single');}
    if(a.contentDescription)element.setAttribute('aria-label',value(a.contentDescription));
    if(a.enabled==='false')element.disabled=true;
    if(a.clickable==='true'||kind==='Button'||kind==='ImageButton')element.dataset.apkInteractive='true';
    if(a.textAllCaps==='true')s.textTransform='uppercase';
    if(a.includeFontPadding==='false')element.classList.add('apk-no-font-padding');
  }
  function render(spec,options={},parentOrientation='vertical'){
    if(spec.tag==='include'){
      const child=resources.layouts[(spec.a.layout||'').replace('@layout/','')];
      if(!child)return document.createElement('div');
      return render({tag:child.tag,a:{...child.a,...Object.fromEntries(Object.entries(spec.a).filter(([k])=>k!=='layout'))},children:child.children},options,parentOrientation);
    }
    const inherited=style(spec.a.style),a={...inherited,...spec.a},kind=spec.tag.split('.').at(-1);
    const textKind=['TextView','Button','EditText','SearchView','ImageButton','SwitchCompat','Spinner'].includes(kind);
    const element=document.createElement(kind==='Button'||kind==='ImageButton'?'button':kind==='EditText'||kind==='SearchView'?'input':kind==='Spinner'?'select':kind==='ProgressBar'?'progress':'div');
    element.className='apk-node apk-'+kind;element.dataset.androidTag=kind;
    if(kind==='Button'&&!spec.a.style&&!a.background)element.classList.add('apk-platform-button');
    if(a.id){const id=a.id.split('/').at(-1);element.dataset.apkId=id;element.id=(options.prefix||'apk-')+id;}
    if(kind==='Button'||kind==='ImageButton')element.type='button';
    if(kind==='EditText'||kind==='SearchView'){
      element.type=kind==='SearchView'?'search':a.inputType?.includes('number')?'number':'text';
      if(a.inputType==='textPassword')element.type='password';
      element.placeholder=value(a.hint)||'';if(a.text)element.value=value(a.text);if(a.maxLength)element.maxLength=Number(a.maxLength);
      element.autocomplete='off';element.spellcheck=false;
    }else if(kind==='ProgressBar'){element.max=100;element.value=Number(a.progress)||0;}
    else if(kind==='SwitchCompat'){element.setAttribute('role','switch');element.setAttribute('aria-checked',a.checked==='true'?'true':'false');element.tabIndex=0;}
    else if(textKind&&kind!=='Spinner'){
      if(a.drawableTop){const icon=vector(a.drawableTop);if(icon){element.append(icon);element.classList.add('apk-compound-top');element.style.gap=pixels(a.drawablePadding||0)+'px';}}
      if(a.drawableStart||a.src||a.srcCompat){const icon=vector(a.drawableStart||a.src||a.srcCompat);if(icon)element.append(icon);}
      const span=document.createElement('span');span.className='apk-text';span.textContent=value(a.text)||'';element.append(span);
    }
    if(kind==='ImageView'){const icon=vector(a.src||a.srcCompat);if(icon)element.append(icon);}
    if(kind==='LinearLayout'){element.style.display='flex';element.style.flexDirection=a.orientation==='vertical'?'column':'row';}
    if(kind==='ScrollView'||kind==='NestedScrollView'){element.style.overflowY='auto';element.style.overflowX='hidden';element.style.minHeight='0';}
    if(kind==='HorizontalScrollView'){element.style.overflowX='auto';element.style.overflowY='hidden';}
    if(kind==='CoordinatorLayout'){element.style.display='flex';element.style.flexDirection='column';element.style.overflow='hidden';}
    if(kind==='FrameLayout'){element.style.position='relative';element.style.display='grid';element.style.gridTemplateColumns='minmax(0,1fr)';if(a.layout_height!=='wrap_content')element.style.gridTemplateRows='minmax(0,1fr)';}
    apply(element,a,parentOrientation,kind,inherited,spec.a);
    if(kind==='TextView'||kind==='Button'){
      const span=element.querySelector(':scope>.apk-text');
      if(span){
        const size=parseFloat(element.style.fontSize)||pixels(a.textSize||14),m=textMetrics(size),pad=a.includeFontPadding!=='false';
        span.style.lineHeight=(m.descent-m.ascent+pixels(a.lineSpacingExtra||0))+'px';
        span.style.paddingTop=(pad?m.ascent-m.top:0)+'px';span.style.paddingBottom=(pad?m.bottom-m.descent:0)+'px';
        if(a.autoSizeTextType==='uniform'&&a.layout_height==='wrap_content'&&pixels(a.textSize)>size){
          const declared=textMetrics(pixels(a.textSize)),height=(pad?declared.bottom-declared.top:declared.descent-declared.ascent)+(parseFloat(element.style.paddingTop)||0)+(parseFloat(element.style.paddingBottom)||0);
          element.style.minHeight=Math.max(parseFloat(element.style.minHeight)||0,height)+'px';
        }
      }
    }
    if(a.drawableTop){
      const icon=element.querySelector(':scope>svg');
      if(icon){
        // Android positions a top compound drawable at paddingTop; vertical
        // gravity centers the text in the remaining compound-padding area.
        const top=parseFloat(element.style.paddingTop)||0,height=Number(icon.getAttribute('height'))||24;
        element.style.paddingTop=(top+height+pixels(a.drawablePadding||0))+'px';element.style.gap='0px';
        icon.style.position='absolute';icon.style.top=top+'px';icon.style.left='50%';icon.style.transform='translateX(-50%)';
      }
    }
    if(kind==='EditText'||kind==='SearchView'){
      if(kind==='EditText'){
        if(!a.textSize)element.style.fontSize='18px';
        if(a.layout_height==='wrap_content'&&!a.minHeight)element.style.minHeight='48px';
        if(!a.background){
          element.style.paddingLeft=element.style.paddingLeft||'4px';element.style.paddingRight=element.style.paddingRight||'4px';
          element.style.backgroundImage='linear-gradient(var(--apk-hint-color,#7f9ab0),var(--apk-hint-color,#7f9ab0))';element.style.backgroundPosition='center bottom 8px';element.style.backgroundSize='calc(100% - 8px) 1px';element.style.backgroundRepeat='no-repeat';
        }
      }
      if(a.textColorHint)element.style.setProperty('--apk-hint-color',value(a.textColorHint));
      if(a.drawableStart){const icon=vector(a.drawableStart);if(icon){const width=Number(icon.getAttribute('width'))||24;const left=parseFloat(element.style.paddingLeft)||0;element.style.backgroundImage='url("data:image/svg+xml,'+encodeURIComponent(new XMLSerializer().serializeToString(icon))+'")';element.style.backgroundRepeat='no-repeat';element.style.backgroundPosition=left+'px center';element.style.backgroundSize=width+'px auto';element.style.paddingLeft=(left+width+pixels(a.drawablePadding||0))+'px';}}
    }
    const childOrientation=kind==='LinearLayout'?(a.orientation==='vertical'?'vertical':'horizontal'):kind==='CoordinatorLayout'?'vertical':'none';
    for(const child of spec.children)element.append(render(child,options,childOrientation));
    if(kind==='HorizontalScrollView')for(const row of element.children)if(row.dataset.androidTag==='LinearLayout')for(const child of row.children){
      // Android measures weighted zero-width children intrinsically when the scroll axis is unbounded.
      if(child.style.flexGrow!=='0'&&child.style.flexGrow!==''&&child.style.width==='0px'){child.style.flex='0 0 auto';child.style.width='auto';}
    }
    if(kind==='FrameLayout')for(let i=0;i<spec.children.length;i++){
      const node=element.children[i],gravity=spec.children[i].a.layout_gravity||'';if(!node)continue;node.style.gridArea='1 / 1';
      node.style.alignSelf=gravity.includes('bottom')?'end':gravity==='center'||gravity.includes('center_vertical')?'center':'start';
      if(gravity.includes('right')||gravity.includes('end'))node.style.justifySelf='end';else if(gravity==='center'||gravity.includes('center_horizontal'))node.style.justifySelf='center';
    }
    if(kind==='CoordinatorLayout')for(let i=0;i<element.children.length;i++){const node=element.children[i];if(node.dataset.androidTag==='FrameLayout'){
      const behavior=Object.entries(spec.children[i].a).find(([k])=>k==='layout_behavior'||k.endsWith('}layout_behavior'))?.[1];
      if(behavior?.includes('appbar_scrolling_view_behavior')){
        node.style.height='100%';node.style.flex='0 0 auto';
        const header=[...element.children].find(x=>x.dataset.androidTag==='AppBarLayout');
        if(header){
          let collapsed=0,touch=null;
          const move=delta=>{const next=Math.min(header.getBoundingClientRect().height,Math.max(0,collapsed+delta)),used=next-collapsed;collapsed=next;header.style.transform=node.style.transform='translateY('+(-collapsed)+'px)';element.dataset.apkCollapsedHeight=String(collapsed);return used;};
          element.dataset.apkCollapsedHeight='0';
          element.addEventListener('wheel',event=>{if(event.ctrlKey||Math.abs(event.deltaX)>Math.abs(event.deltaY)||event.target.closest('canvas'))return;const used=move(event.deltaY);if(used){event.preventDefault();const scroll=event.target.closest('.apk-RecyclerView,.apk-ScrollView,.apk-NestedScrollView');if(scroll)scroll.scrollTop+=event.deltaY-used;}},{passive:false});
          element.addEventListener('touchstart',event=>{const p=event.touches[0];touch=p?{x:p.clientX,y:p.clientY}:null;},{passive:true});
          element.addEventListener('touchmove',event=>{if(!touch||event.touches.length!==1||event.target.closest('canvas'))return;const p=event.touches[0],delta=touch.y-p.clientY,dx=touch.x-p.clientX;if(Math.abs(dx)>Math.abs(delta))return;const used=move(delta);touch={x:p.clientX,y:p.clientY};if(used)event.preventDefault();},{passive:false});
          element.addEventListener('keydown',event=>{if(event.target.closest('input,select,textarea'))return;if(event.key==='PageDown'){move(header.getBoundingClientRect().height);event.preventDefault();}if(event.key==='PageUp'){move(-collapsed);event.preventDefault();}});
          element.addEventListener('focusin',event=>{if(!node.contains(event.target))return;const bottom=event.target.getBoundingClientRect().bottom,visible=element.getBoundingClientRect().bottom;if(bottom>visible)move(bottom-visible);});
        }
      }
      else{node.style.height='0px';node.style.flex='1 1 0px';}
      node.style.minHeight='0';
    }}
    if(kind==='HorizontalScrollView'&&element.firstElementChild){element.firstElementChild.style.width='max-content';element.firstElementChild.style.maxWidth='none';element.firstElementChild.style.minWidth=a.fillViewport==='true'?'100%':'0';}
    if(kind==='ScrollView'&&a.fillViewport==='true'&&element.firstElementChild)element.firstElementChild.style.minHeight='100%';
    if(kind==='PriceChartView'||kind.endsWith('SparklineView')||kind==='ForwardCurveView')element.dataset.apkChart='true';
    return element;
  }
  function setText(element,text){if(!element)return;let span=element.querySelector(':scope > .apk-text');if(span)span.textContent=String(text??'');else if(element instanceof HTMLInputElement)element.value=String(text??'');else element.textContent=String(text??'');}
  window.AndroidLayout={load(data){resources=data;},get resources(){return resources;},render,background,vector,value,pixels,setText,
    screen(name){const spec=resources.layouts['activity_'+name];if(!spec)throw Error('Android yerleşimi bulunamadı: '+name);return render(spec);}
  };
})();
