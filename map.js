(() => {
  'use strict';
  const $=id=>document.getElementById(id),T=MeetingTime,UI=MeetingUI,svg=$('world-map'),scroll=$('map-scroll');
  let focus=null;let field='target';const ns='http://www.w3.org/2000/svg',WORLD=1440;
  let world=svg,overlap=scroll.clientWidth/4,elementId=0;
  const el=(name,attrs={},parent=world)=>{const e=document.createElementNS(ns,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);parent.append(e);return e;};
  world=el('g',{transform:`translate(${overlap} 0)`},svg);
  svg.setAttribute('viewBox',`0 0 ${WORLD+2*overlap} 240`);
  // Reference the same geometry at either edge rather than duplicate the boundary data.
  function wrap(e,bind){
    if(!e.id)e.id='map-shape-'+(++elementId);
    return [-WORLD,WORLD].map(x=>{const copy=el('use',{href:'#'+e.id,x,'aria-hidden':'true','class':'map-copy'},e.parentNode);if(bind)bind(copy);else copy.setAttribute('pointer-events','none');return copy;});
  }
  const P=MeetingProjection;let blend=0;
  const project=(lat,lon)=>[(lon+180)*4,P.y(lat,blend)];
  const projectionStart=performance.now(),geometry=[...new Set([MapData.land,...MapData.regions.map(r=>r[1])])],projector=P.compile(geometry),geometryIndex=new Map(geometry.map((d,i)=>[d,i]));
  const compileMs=performance.now()-projectionStart,shapeNodes=[];
  function shape(attrs,parent=world){const node=el('path',attrs,parent);shapeNodes.push([node,geometryIndex.get(attrs.d)]);return node;}
  let projectionTimings={build:0,apply:0};
  function applyProjection(next){
    if(Math.abs(next-blend)<.00001)return;
    const start=performance.now(),paths=projector.project(next),built=performance.now();
    shapeNodes.forEach(([node,i])=>node.setAttribute('d',paths[i]));blend=next;
    svg.querySelectorAll('[data-lat]').forEach(node=>{const [x,y]=project(+node.dataset.lat,+node.dataset.lon);if(node.tagName==='text')node.setAttribute('y',y);else node.setAttribute('transform',`translate(${x} ${y})`);});
    projectionTimings={build:built-start,apply:performance.now()-built};
    const height=P.height(blend);svg.style.height=height*zoom+'px';svg.setAttribute('viewBox',`0 0 ${WORLD+2*overlap} ${height}`);
    background.setAttribute('height',height);grid.querySelectorAll('line').forEach(node=>node.setAttribute('y2',height-1));
    svg.dataset.projectionBlend=blend.toFixed(4);
  }
  const localAnchor=p=>({x:(scroll.scrollLeft+p.x)/zoom,lat:P.latitude((scroll.scrollTop+p.y)/zoom,blend)});
  const projectionMode=$('map-projection');projectionMode.value=UI.state.mapProjection;
  function selectedLatitudes(){return ['source','target'].map(f=>getPoint(f)?.[0]).filter(Number.isFinite);}
  function updateProjection(){applyProjection(P.amount(zoom,projectionMode.value,selectedLatitudes()));}
  projectionMode.onchange=()=>{UI.state.mapProjection=projectionMode.value;UI.save();clearHover();focus.enable(projectionMode.value==='focus');if(!focus.active){setZoom(zoom);redraw();panTo(field,'instant');}};
  const safeZone=z=>{try{T.offset(Date.now(),z);return true;}catch{return false;}};
  const regions=MapData.regions.filter(r=>safeZone(r[0]));
  const background=el('rect',{width:1440,height:240,fill:'#deebeb'});wrap(background);
  wrap(shape({d:MapData.land,fill:'#fffef2',stroke:'#8ca39d','stroke-width':.5}));
  const regionLayer=el('g',{'class':'map-regions'});
  const hoverGroups=new WeakMap();let hoveredRegions=null;
  // One hover state owns both the original geometry and its wrapped copies.
  function setHover(group=null){
    if(group===hoveredRegions)return;
    hoveredRegions?.forEach(node=>node.classList.remove('is-hover'));
    hoveredRegions=group;
    group?.forEach(node=>node.classList.add('is-hover'));
    if(group){const zone=group[0].dataset.zone;$('map-hint').textContent=`${zone} · ${T.offsetLabel(Date.now(),zone)} now`;}
  }
  const clearHover=()=>setHover();
  const regionPaths=regions.flatMap(([zone,path])=>{
    const offset=T.offset(Date.now(),zone),hue=180+offset/20;
    const e=shape({d:path,fill:`hsl(${hue} 32% 60%)`,'fill-opacity':.32,'fill-rule':'evenodd',stroke:'#638e88','stroke-opacity':.55,'stroke-width':.55,'data-zone':zone,'class':'map-region'},regionLayer);
    el('title',{},e).textContent=`${zone} · ${T.zoneLabel(Date.now(),zone)}`;
    function bind(node){node.dataset.zone=zone;node.classList.add('map-region');node.addEventListener('click',event=>{event.stopPropagation();select({zone,label:UI.city(zone)});});}
    bind(e);const group=[e,...wrap(e,bind)];group.forEach(node=>hoverGroups.set(node,group));return group;
  });
  const grid=el('g',{'pointer-events':'none'});
  for(let lon=-180;lon<180;lon+=30){const x=project(0,lon)[0];el('line',{x1:x,y1:15,x2:x,y2:239,stroke:'#446d67','stroke-opacity':.16,'stroke-dasharray':'2 5'},grid);const label=el('text',{x:x+6,y:14,'class':'longitude'},grid);label.textContent=lon===0?'0°':Math.abs(lon)+'°'+(lon<0?'W':'E');}
  wrap(grid);
  wrap(shape({d:MapData.land,fill:'none',stroke:'#345e57','stroke-opacity':.6,'stroke-width':.7,'pointer-events':'none'}));
  const labels=el('g',{'pointer-events':'none','class':'continent-labels'});
  [['NORTH AMERICA',48,-110],['SOUTH AMERICA',-18,-60],['EUROPE',57,15],['AFRICA',4,18],['ASIA',50,92],['AUSTRALIA',-25,135]].forEach(([text,lat,lon])=>{const [x,y]=project(lat,lon);el('text',{x,y,'data-lat':lat,'data-lon':lon,'text-anchor':'middle'},labels).textContent=text;});
  wrap(labels);
  const pins=el('g',{'class':'map-pins'});
  function renderCityPins(){
  pins.replaceChildren();
  const allCities=UI.state.favorites.map(f=>[f.label,'','','',f.zone,f.lat,f.lon]);
  const labelRects=[];
  allCities.forEach(c=>{
    const [x,y]=project(c[5],c[6]),name=c[0]==='New York City'?'New York':c[0];
    const g=el('g',{transform:`translate(${x} ${y})`,'class':'city-pin','data-city':name,'data-zone':c[4],'data-lat':c[5],'data-lon':c[6],role:'button',tabindex:'0','aria-label':`Set ${name} timezone, ${c[4]}`},pins);
    el('circle',{r:10,fill:'transparent'},g);el('circle',{r:3.2,'class':'pin-dot'},g);
    const placement={London:[-8,-6,'end'],Paris:[8,13,'start'],Chicago:[-7,-5,'end'],Beijing:[-7,-5,'end'],Seoul:[-5,-10,'end'],Tokyo:[8,12,'start'],Kyoto:[-8,-7,'end']};
    const choices=[placement[name]||[7,4,'start'],[-8,-7,'end'],[7,18,'start'],[-8,18,'end'],[7,-16,'start'],[-8,-20,'end']];
    let chosen=choices[0],rect;
    for(const choice of choices){const [dx,dy,align]=choice,w=name.length*6.5;rect={left:x+dx-(align==='end'?w:0),right:x+dx+(align==='end'?0:w),top:y+dy-11,bottom:y+dy+2};chosen=choice;if(!labelRects.some(r=>r.left<rect.right+2&&r.right>rect.left-2&&r.top<rect.bottom+2&&r.bottom>rect.top-2))break;}
    labelRects.push(rect);const [dx,dy,align]=chosen;
    el('text',{x:dx,y:dy,'text-anchor':align,'class':'pin-label'},g).textContent=name;
    const entry={zone:c[4],label:name,lat:c[5],lon:c[6]};
    g.addEventListener('click',e=>{e.stopPropagation();select(entry);});g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(entry);}});
    wrap(g,copy=>{copy.classList.add('city-pin');copy.dataset.city=name;copy.addEventListener('click',e=>{e.stopPropagation();select(entry);});});
  });
  }
  renderCityPins();
  document.addEventListener('favoriteschange',renderCityPins);
  const selectedLayer=el('g',{'class':'selected-map-pins','pointer-events':'none'});
  wrap(selectedLayer);
  const knownPoints={UTC:[0,0]};
  for(const c of CityData)if(!knownPoints[UI.canonical(c[4])])knownPoints[UI.canonical(c[4])]=[c[5],c[6]];
  let selectedPoints={};
  for(const f of ['source','target']){const c=CityData.find(c=>c[0]===UI.state[f+'Place']&&UI.canonical(c[4])===UI.canonical(UI.state[f]));if(c)selectedPoints[f]=[c[5],c[6]];}
  function getPoint(f){return selectedPoints[f]||knownPoints[UI.canonical(UI.state[f])];}
  function redraw(){
    regionPaths.forEach(e=>{const z=UI.canonical(e.dataset.zone);e.classList.toggle('is-source',z===UI.canonical(UI.state.source));e.classList.toggle('is-target',z===UI.canonical(UI.state.target));});
    selectedLayer.replaceChildren();
    const a=getPoint('source'),b=getPoint('target'),together=a&&b&&Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])<3;
    ['source','target'].forEach(f=>{const p=getPoint(f);if(!p)return;const [x,y]=project(...p),g=el('g',{transform:`translate(${x} ${y})`,'data-lat':p[0],'data-lon':p[1],'class':f==='source'?'selected-me':'selected-them'},selectedLayer);el('circle',{r:7,'fill-opacity':.22},g);el('circle',{cx:together?(f==='source'?-3:3):0,r:4,stroke:'#fff','stroke-width':1.5},g);});
    updateBadgeRail();
  }
  let zoom=1;
  function updateBadgeRail(){
    const width=scroll.clientWidth,positions={};
    for(const f of ['source','target']){const badge=$(f+'-map-badge'),p=getPoint(f);if(!p){badge.hidden=true;continue;}const x=project(...p)[0]+overlap,copies=[x-WORLD,x,x+WORLD].map(v=>v*zoom-scroll.scrollLeft).filter(v=>v>=0&&v<=width);badge.hidden=!copies.length;if(copies.length)positions[f]=copies.reduce((a,b)=>Math.abs(a-width/2)<Math.abs(b-width/2)?a:b);badge.title=`${f==='source'?'My':'Their'} timezone: ${UI.state[f]}`;}
    if(positions.source!==undefined&&positions.target!==undefined&&Math.abs(positions.source-positions.target)<48){const center=Math.max(46,Math.min(width-46,(positions.source+positions.target)/2));positions.source=center-23;positions.target=center+23;}
    for(const f of ['source','target'])if(positions[f]!==undefined)$(f+'-map-badge').style.left=Math.max(23,Math.min(width-23,positions[f]))+'px';
  }
  function panTo(f,behavior='smooth'){if(focus?.active){focus.panTo(f);return;}clearHover();const p=getPoint(f);if(!p)return;const [x,y]=project(...p),center=(scroll.scrollLeft+scroll.clientWidth/2)/zoom;const copies=[x+overlap-WORLD,x+overlap,x+overlap+WORLD].filter(n=>n>=0&&n<=WORLD+2*overlap);const nearest=copies.reduce((a,b)=>Math.abs(a-center)<Math.abs(b-center)?a:b);scroll.scrollTo({left:nearest*zoom-scroll.clientWidth/2,top:zoom>1?y*zoom-scroll.clientHeight/2:0,behavior});}
  function select(entry){clearHover();UI.chooseZone(field,entry);$('map-hint').textContent=`${field==='source'?'My':'Their'} timezone: ${entry.label} · ${T.offsetLabel(Date.now(),entry.zone)} now`;}
  function mode(f){field=f;$('map-source').setAttribute('aria-pressed',String(f==='source'));$('map-target').setAttribute('aria-pressed',String(f==='target'));$('map-hint').textContent=`Click a region or city to set ${f==='source'?'my':'their'} timezone.`;panTo(f);}
  $('map-source').onclick=()=>mode('source');$('map-target').onclick=()=>mode('target');
  $('map-left').onclick=()=>focus?.active?focus.west():scroll.scrollBy({left:-Math.max(180,scroll.clientWidth*.55),behavior:'smooth'});$('map-right').onclick=()=>focus?.active?focus.east():scroll.scrollBy({left:Math.max(180,scroll.clientWidth*.55),behavior:'smooth'});
  function setZoom(value,point,world){
    if(focus?.active){focus.setZoom(value,point,world);return;}
    clearHover();if(zoomFrame){cancelAnimationFrame(zoomFrame);zoomFrame=0;pendingZoom=null;}
    const next=Math.max(1,Math.min(4,value)),p=point||{x:scroll.clientWidth/2,y:scroll.clientHeight/2};
    const anchor=world||localAnchor(p);
    zoom=next;updateProjection();svg.setAttribute('aria-label',projectionMode.value==='equal-area'?'World timezones in a cylindrical equal-area projection':'World timezones with latitude spacing that expands on zoom');svg.style.width=(WORLD+2*overlap)*zoom+'px';svg.style.height=P.height(blend)*zoom+'px';
    scroll.scrollLeft=anchor.x*zoom-p.x;scroll.scrollTop=P.y(anchor.lat,blend)*zoom-p.y;
    $('map-zoom-level').textContent=Math.round(zoom*100)+'%';$('map-zoom-in').disabled=zoom>=4;$('map-zoom-out').disabled=zoom<=1;
    updateBadgeRail();
  }
  let zoomFrame=0,pendingZoom=null;
  function queueZoom(factor,point){
    if(!pendingZoom)pendingZoom={value:zoom,point,anchor:localAnchor(point)};
    pendingZoom.value=Math.max(1,Math.min(4,pendingZoom.value*factor));pendingZoom.point=point;
    scheduleZoom();
  }
  function scheduleZoom(){if(!zoomFrame)zoomFrame=requestAnimationFrame(()=>{zoomFrame=0;const next=pendingZoom;pendingZoom=null;setZoom(next.value,next.point,next.anchor);});}
  function queueAbsoluteZoom(value,point,anchor){pendingZoom={value,point,anchor};scheduleZoom();}
  $('map-zoom-in').onclick=()=>setZoom((focus?.active?focus.zoom:zoom)*1.4);$('map-zoom-out').onclick=()=>setZoom((focus?.active?focus.zoom:zoom)/1.4);
  $('map-reset').onclick=()=>{if(focus?.active)focus.reset();else{setZoom(1);panTo(field,'instant');}};
  scroll.addEventListener('wheel',e=>{
    e.preventDefault();
    if(e.ctrlKey||e.metaKey){const rect=scroll.getBoundingClientRect();queueZoom(Math.exp(-e.deltaY*.01),{x:e.clientX-rect.left,y:e.clientY-rect.top});}
    else if(zoom>1&&!e.shiftKey){scroll.scrollLeft+=e.deltaX;scroll.scrollTop+=e.deltaY;}
    else scroll.scrollLeft+=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY;
  },{passive:false});
  const pointers=new Map();let pinch=null,dragStart=null,suppressClickUntil=0;
  function pointerPoint(e){const r=scroll.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  function startPinch(){
    const [a,b]=[...pointers.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};
    pinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),zoom,world:localAnchor(mid)};
    dragStart=null;suppressClickUntil=Date.now()+600;for(const id of pointers.keys())scroll.setPointerCapture(id);
  }
  scroll.addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'&&e.button!==0)return;
    clearHover();const p=pointerPoint(e);pointers.set(e.pointerId,p);
    if(pointers.size===2)startPinch();else if(pointers.size===1)dragStart={...p,left:scroll.scrollLeft,top:scroll.scrollTop,moved:false};
  });
  scroll.addEventListener('pointermove',e=>{
    if(!pointers.has(e.pointerId)){
      setHover(e.pointerType==='touch'||e.buttons?null:hoverGroups.get(e.target.closest?.('.map-region'))||null);
      return;
    }const p=pointerPoint(e);pointers.set(e.pointerId,p);
    if(pinch&&pointers.size>=2){const [a,b]=[...pointers.values()];queueAbsoluteZoom(pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/pinch.distance,{x:(a.x+b.x)/2,y:(a.y+b.y)/2},pinch.world);suppressClickUntil=Date.now()+600;e.preventDefault();}
    else if(dragStart){const dx=p.x-dragStart.x,dy=p.y-dragStart.y;if(dragStart.moved||Math.hypot(dx,dy)>5){dragStart.moved=true;scroll.classList.add('is-panning');scroll.setPointerCapture(e.pointerId);scroll.scrollLeft=dragStart.left-dx;scroll.scrollTop=dragStart.top-dy;suppressClickUntil=Date.now()+600;e.preventDefault();}}
  });
  function releasePointer(e){
    if(!pointers.has(e.pointerId))return;pointers.delete(e.pointerId);
    if(pinch||dragStart?.moved)suppressClickUntil=Date.now()+600;
    pinch=null;dragStart=null;scroll.classList.remove('is-panning');
    if(scroll.hasPointerCapture(e.pointerId))scroll.releasePointerCapture(e.pointerId);
    if(pointers.size===1){const p=[...pointers.values()][0];dragStart={...p,left:scroll.scrollLeft,top:scroll.scrollTop,moved:false};}
  }
  scroll.addEventListener('pointerup',releasePointer);scroll.addEventListener('pointercancel',releasePointer);scroll.addEventListener('lostpointercapture',e=>{if(pointers.has(e.pointerId))releasePointer(e);});
  scroll.addEventListener('click',e=>{if(Date.now()<suppressClickUntil){e.preventDefault();e.stopPropagation();}},{capture:true});
  // WebKit trackpads supply gesture events instead of the Ctrl+wheel used by Chromium.
  let trackpadGesture=null;
  function gesturePoint(e){const rect=scroll.getBoundingClientRect();return {x:Number.isFinite(e.clientX)?e.clientX-rect.left:scroll.clientWidth/2,y:Number.isFinite(e.clientY)?e.clientY-rect.top:scroll.clientHeight/2};}
  scroll.addEventListener('gesturestart',e=>{e.preventDefault();if(pointers.size>=2)return;const p=gesturePoint(e);trackpadGesture={zoom,world:localAnchor(p)};},{passive:false});
  scroll.addEventListener('gesturechange',e=>{e.preventDefault();if(!trackpadGesture||pointers.size>=2)return;queueAbsoluteZoom(trackpadGesture.zoom*e.scale,gesturePoint(e),trackpadGesture.world);suppressClickUntil=Date.now()+600;},{passive:false});
  scroll.addEventListener('gestureend',e=>{e.preventDefault();trackpadGesture=null;},{passive:false});
  scroll.setAttribute('aria-label','Timezone map. Drag to pan, pinch to zoom, or use the zoom buttons. Click a region or city to set the selected person’s timezone.');
  scroll.addEventListener('keydown',e=>{if(e.target!==scroll)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();scroll.scrollBy({left:e.key==='ArrowLeft'?-180:180,behavior:'smooth'});}});
  scroll.addEventListener('pointerleave',clearHover);
  scroll.addEventListener('pointercancel',clearHover);
  scroll.addEventListener('lostpointercapture',clearHover);
  window.addEventListener('blur',clearHover);
  document.addEventListener('visibilitychange',clearHover);
  scroll.addEventListener('scroll',()=>{if(focus?.active)return;clearHover();updateBadgeRail();},{passive:true});
  document.addEventListener('zonechange',e=>{const d=e.detail;if(Number.isFinite(d.lat)&&Number.isFinite(d.lon))selectedPoints[d.field]=[d.lat,d.lon];else delete selectedPoints[d.field];if(focus?.active){focus.panTo(d.field);return;}updateProjection();redraw();panTo(d.field);$('map-hint').textContent=`Click a region or city to set ${field==='source'?'my':'their'} timezone.`;});
  new ResizeObserver(()=>{if(focus?.active)return;const next=scroll.clientWidth/4;if(Math.abs(next-overlap)<5)return;overlap=next;world.setAttribute('transform',`translate(${overlap} 0)`);svg.setAttribute('viewBox',`0 0 ${WORLD+2*overlap} ${P.height(blend)}`);svg.style.width=(WORLD+2*overlap)*zoom+'px';panTo(field,'instant');}).observe(scroll);
  focus=createFocusMap({scroll,legacySvg:svg,getPoint,getField:()=>field,choose:select});
  focus.enable(projectionMode.value==='focus');
  if(new URLSearchParams(location.search).has('profile')){
    const panel=document.createElement('details');panel.className='projection-profile';panel.open=true;
    panel.innerHTML='<summary>Projection profiling</summary><button id="profile-zoom">Run zoom comparison</button><pre id="profile-result" role="status">Ready</pre>';
    $('settings').before(panel);
    $('profile-zoom').onclick=async()=>{
      const button=$('profile-zoom'),output=$('profile-result'),savedMode=projectionMode.value,savedFocus=focus.metrics(),savedZoom=zoom,savedLeft=scroll.scrollLeft,savedTop=scroll.scrollTop;
      button.disabled=true;const savedPageY=window.scrollY;scroll.parentElement.scrollIntoView({block:'start'});const reports=[];const quantile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*p)];
      try{
        for(const mode of ['equal-area','adaptive','focus']){
          projectionMode.value=mode;focus.enable(mode==='focus');setZoom(1);panTo(field,'instant');
          const durations=[],build=[],apply=[],frames=[];let previous=await new Promise(requestAnimationFrame);
          for(let i=0;i<90;i++){
            const now=await new Promise(requestAnimationFrame);if(i>5)frames.push(now-previous);previous=now;
            const value=1+3*(1-Math.cos(i/89*Math.PI*2))/2,start=performance.now();projectionTimings={build:0,apply:0};if(mode==='focus')focus.profileMove(10,85*Math.sin(i/89*Math.PI*2),value);else setZoom(value);
            if(i>5){durations.push(performance.now()-start);build.push(projectionTimings.build);apply.push(projectionTimings.apply);}
          }
          reports.push({mode,frames:frames.length,updateMedianMs:+quantile(durations,.5).toFixed(2),updateP95Ms:+quantile(durations,.95).toFixed(2),buildMedianMs:+quantile(build,.5).toFixed(2),applyMedianMs:+quantile(apply,.5).toFixed(2),frameMedianMs:+quantile(frames,.5).toFixed(2),frameP95Ms:+quantile(frames,.95).toFixed(2),framesOver50ms:frames.filter(v=>v>50).length});
          output.textContent=JSON.stringify({viewport:{width:innerWidth,height:innerHeight},source:UI.state.source,target:UI.state.target,latitudes:selectedLatitudes(),focusPreparationMs:+focus.metrics().prepareMs.toFixed(2),compileMs:+compileMs.toFixed(2),vertices:projector.vertexCount,uniqueLatitudes:projector.uniqueLatitudes,reports},null,2);
        }
      }finally{projectionMode.value=savedMode;focus.enable(savedMode==='focus');if(focus.active)focus.profileMove(savedFocus.center.lon,savedFocus.center.lat,savedFocus.zoom);else setZoom(savedZoom);scroll.scrollLeft=savedLeft;scroll.scrollTop=savedTop;window.scrollTo(0,savedPageY);button.disabled=false;}
    };
  }
  if(!focus.active){setZoom(1);redraw();requestAnimationFrame(()=>panTo('target','instant'));}
})();
