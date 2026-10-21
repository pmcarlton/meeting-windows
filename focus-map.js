(function(root){
  'use strict';
  root.createFocusMap=function({scroll,legacySvg,getPoint,getField,choose}){
    const $=id=>document.getElementById(id),UI=MeetingUI,P=MeetingFocusProjection,T=MeetingTime,ns='http://www.w3.org/2000/svg';
    let active=false,zoom=1,minimumZoom=1,center={lon:getPoint('target')?.[1]||0,lat:0},width=scroll.clientWidth,height=scroll.clientHeight,frame=0,hovered=null,savedScroll=null;
    let projection=null,path=null,features=null,land=null,groups=[],cityNodes=[],selectionNodes=[],lastRenderMs=0,prepareMs=0,pending=null,lastPeriod=-1,lastZones='';
    const svg=document.createElementNS(ns,'svg');svg.id='focus-map';svg.setAttribute('role','img');svg.setAttribute('aria-label','Viewport-centered world timezones. The center line has undistorted local scale.');svg.style.display='none';scroll.append(svg);
    function el(name,attrs={},parent=svg){const e=document.createElementNS(ns,name);for(const [key,value] of Object.entries(attrs))e.setAttribute(key,value);parent.append(e);return e;}
    const centerLabel=document.createElement('span');centerLabel.className='map-center-label';centerLabel.hidden=true;$('map-hint').parentElement.append(centerLabel);
    const background=el('rect',{fill:'#deebeb'}),geoLayer=el('g'),gridLayer=el('g',{'pointer-events':'none'}),coastLayer=el('g',{'pointer-events':'none'}),pinLayer=el('g'),selectedLayer=el('g',{'pointer-events':'none'});
    const crosshair=el('path',{d:'M-5,0H5M0,-5V5',stroke:'#183c35','stroke-opacity':.35,'pointer-events':'none',fill:'none'});
    const graticule={type:'MultiLineString',coordinates:[]};
    for(let lon=-180;lon<180;lon+=30)graticule.coordinates.push(Array.from({length:91},(_,i)=>[lon,-90+i*2]));
    for(let lat=-60;lat<=60;lat+=30)graticule.coordinates.push(Array.from({length:181},(_,i)=>[-180+i*2,lat]));
    const grid=el('path',{fill:'none',stroke:'#446d67','stroke-opacity':.18,'stroke-width':.6},gridLayer);
    const landFill=el('path',{fill:'#fffef2',stroke:'#8ca39d','stroke-width':.5},geoLayer),coast=el('path',{fill:'none',stroke:'#345e57','stroke-opacity':.6,'stroke-width':.7},coastLayer);
    function prepare(){
      if(projection)return;
      const start=performance.now();projection=d3.geoProjection(P.raw).precision(.4);path=d3.geoPath(projection).digits(1);
      land=P.decode(MapData.land,d3);
      features=MapData.regions.filter(([zone])=>{try{T.offset(Date.now(),zone);return true;}catch{return false;}}).map(([zone,data])=>({zone,geometry:P.decode(data,d3)}));
      features.forEach(feature=>{
        const offset=T.offset(Date.now(),feature.zone),hue=180+offset/20;
        const node=el('path',{fill:`hsl(${hue} 32% 60%)`,'fill-opacity':.32,'fill-rule':'evenodd',stroke:'#638e88','stroke-opacity':.55,'stroke-width':.55,'data-zone':feature.zone,'class':'map-region'},geoLayer);
        el('title',{},node).textContent=`${feature.zone} · ${T.zoneLabel(Date.now(),feature.zone)}`;
        node.id='focus-zone-'+groups.length;
        const nodes=[node,...[-1,1].map(copy=>el('use',{href:'#'+node.id,'data-zone':feature.zone,'class':'map-region','aria-hidden':'true','data-copy':copy},geoLayer))];groups.push({...feature,node,nodes});
      });
      for(const original of [landFill,coast,grid]){original.id='focus-'+(original===landFill?'land':original===coast?'coast':'grid');for(const copy of [-1,1])el('use',{href:'#'+original.id,'data-copy':copy},original.parentNode);}
      buildPins();prepareMs=performance.now()-start;
    }
    function buildPins(){
      pinLayer.replaceChildren();cityNodes=[];lastPeriod=-1;
      for(const entry of UI.state.favorites){
        if(!Number.isFinite(entry.lat)||!Number.isFinite(entry.lon))continue;
        const name=entry.label==='New York City'?'New York':entry.label,g=el('g',{'class':'city-pin','data-city':name,role:'button',tabindex:0,'aria-label':`Set ${name} timezone, ${entry.zone}`},pinLayer);
        el('circle',{r:10,fill:'transparent'},g);el('circle',{r:3.2,'class':'pin-dot'},g);
        const placements={London:[-8,-6,'end'],Paris:[8,13,'start'],Beijing:[-7,-5,'end'],Seoul:[-5,-10,'end'],Tokyo:[8,12,'start']},[dx,dy,align]=placements[name]||[7,4,'start'];
        el('text',{x:dx,y:dy,'text-anchor':align,'class':'pin-label'},g).textContent=name;
        const nodes=[g];g.id='focus-city-'+cityNodes.length;
        for(const copy of [-1,1])nodes.push(el('use',{href:'#'+g.id,'class':'city-pin','aria-hidden':'true','data-copy':copy},pinLayer));
        nodes.forEach(node=>{node.addEventListener('click',e=>{e.stopPropagation();if(Date.now()>suppressUntil)choose(entry);});node.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();choose(entry);}});});
        cityNodes.push({entry,g,nodes});
      }
    }
    function clearHover(){if(hovered)hovered.nodes.forEach(node=>node.classList.remove('is-hover'));hovered=null;}
    function configure(){P.camera(projection,center,zoom,width,height).clipExtent([[-1440*zoom,-4],[width+1440*zoom,height+4]]);}
    function wrapX(x){const period=1440*zoom;return width/2+P.wrap((x-width/2)/period*360)/360*period;}
    function position(lat,lon){const p=projection([lon,lat]);p[0]=wrapX(p[0]);return p;}
    function render(){
      if(!active)return;const start=performance.now();clearHover();configure();
      const landPath=path(land)||'';landFill.setAttribute('d',landPath);coast.setAttribute('d',landPath);
      for(const feature of groups)feature.node.setAttribute('d',path(feature.geometry)||'');
      const zoneKey=UI.state.source+'|'+UI.state.target;if(zoneKey!==lastZones){lastZones=zoneKey;const source=UI.canonical(UI.state.source),target=UI.canonical(UI.state.target);for(const feature of groups){const canonical=UI.canonical(feature.zone);feature.nodes.forEach(node=>{node.classList.toggle('is-source',canonical===source);node.classList.toggle('is-target',canonical===target);});}}
      grid.setAttribute('d',path(graticule)||'');
      for(const {entry,g} of cityNodes){const [x,y]=position(entry.lat,entry.lon);g.setAttribute('transform',`translate(${x} ${y})`);}
      if(lastPeriod!==1440*zoom){lastPeriod=1440*zoom;svg.querySelectorAll('[data-copy]').forEach(node=>node.setAttribute('x',Number(node.dataset.copy)*lastPeriod));}
      selectedLayer.replaceChildren();selectionNodes=[];
      for(const field of ['source','target']){
        const point=getPoint(field),badge=$(field+'-map-badge');if(!point){badge.hidden=true;continue;}
        const [x,y]=position(...point),g=el('g',{transform:`translate(${x} ${y})`,'class':field==='source'?'selected-me':'selected-them','data-field':field},selectedLayer);
        el('circle',{r:7,'fill-opacity':.22},g);el('circle',{r:4,stroke:'#fff','stroke-width':1.5},g);
        const positions=[x-1440*zoom,x,x+1440*zoom].filter(v=>v>=0&&v<=width);badge.hidden=!positions.length||y<0||y>height;
        if(positions.length)badge.style.left=P.clamp(positions[0],23,width-23)+'px';badge.title=`${field==='source'?'My':'Their'} timezone: ${UI.state[field]}`;
        selectionNodes.push(g);
      }
      const a=$('source-map-badge'),b=$('target-map-badge');if(!a.hidden&&!b.hidden&&Math.abs(parseFloat(a.style.left)-parseFloat(b.style.left))<48){const mid=P.clamp((parseFloat(a.style.left)+parseFloat(b.style.left))/2,46,width-46);a.style.left=mid-23+'px';b.style.left=mid+23+'px';}
      crosshair.setAttribute('transform',`translate(${width/2} ${height/2})`);
      $('map-zoom-level').textContent=Math.round(zoom*100)+'%';$('map-zoom-in').disabled=zoom>=4;$('map-zoom-out').disabled=zoom<=minimumZoom+1e-9;
      svg.dataset.centerLatitude=center.lat.toFixed(6);svg.dataset.centerLongitude=center.lon.toFixed(6);svg.dataset.zoom=zoom.toFixed(6);
      svg.dataset.roll=(center.roll||0).toFixed(6);
      svg.dataset.centerScale=(P.RADIUS*zoom).toFixed(4);
      const latitude=Math.abs(center.lat).toFixed(1)+(center.lat<0?'°S':'°N');centerLabel.textContent=`Center: ${latitude} · ${Math.abs(center.lon).toFixed(1)}${center.lon<0?'°W':'°E'}${Math.abs(center.roll||0)>.01?' · rotated':''}`;svg.setAttribute('aria-label',`Viewport-centered world timezones. Center latitude ${latitude}. Drag in any direction; both poles can be centered.`);
      lastRenderMs=performance.now()-start;
    }
    function schedule(){if(!frame)frame=requestAnimationFrame(()=>{frame=0;if(pending){const work=pending;pending=null;work();}render();});}
    function localAt(p,z=zoom){return P.raw.invert((p.x-width/2)/(P.RADIUS*z),-(p.y-height/2)/(P.RADIUS*z));}
    function geoAt(p){configure();const raw=localAt(p);return d3.geoRotation([-center.lon,-center.lat,center.roll||0]).invert(raw.map(v=>v/P.DEG));}
    function anchored(point,p,z){const local=d3.geoRotation([0,0,center.roll||0]).invert(localAt(p,z).map(v=>v/P.DEG)).map(v=>v*P.DEG),next=P.anchored(center,point,local);if(next)center={lon:next.lon,lat:next.lat,roll:center.roll||0};}
    function cancelPending(){if(frame)cancelAnimationFrame(frame);frame=0;pending=null;}
    function setZoom(value,p,anchor){cancelPending();if(!active)return;if(!p)p={x:width/2,y:height/2};const geographic=anchor||geoAt(p);zoom=P.clamp(value,minimumZoom,4);anchored(geographic,p,zoom);render();}
    function panPixels(dx,dy){
      const roll=(center.roll||0)*P.DEG,east=dx*Math.cos(roll)-dy*Math.sin(roll),north=dx*Math.sin(roll)+dy*Math.cos(roll);
      center.lat=P.clamp(center.lat+north/(P.RADIUS*zoom)/P.DEG,-90,90);
      center.lon=P.wrap(center.lon-east/(P.RADIUS*zoom*Math.max(.12,Math.cos(center.lat*P.DEG)))/P.DEG);schedule();
    }
    function panTo(field){cancelPending();const point=getPoint(field);if(point){center={lon:point[1],lat:zoom===1?0:point[0]};render();}}
    function resize(){if(!active)return;width=scroll.clientWidth;height=scroll.clientHeight;svg.setAttribute('viewBox',`0 0 ${width} ${height}`);background.setAttribute('width',width);background.setAttribute('height',height);render();}
    function enable(value){
      if(value===active)return;active=value;centerLabel.hidden=!active;clearHover();
      if(active){savedScroll={left:scroll.scrollLeft,top:scroll.scrollTop};prepare();legacySvg.style.display='none';svg.style.display='block';scroll.classList.add('focus-active');scroll.scrollLeft=scroll.scrollTop=0;resize();}
      else{if(frame)cancelAnimationFrame(frame);frame=0;pending=null;pointers.clear();dragging=null;pinch=null;gesture=null;scroll.classList.remove('is-panning');svg.style.display='none';legacySvg.style.display='';scroll.classList.remove('focus-active');scroll.scrollLeft=savedScroll?.left||0;scroll.scrollTop=savedScroll?.top||0;}
    }
    let dragging=null,suppressUntil=0,pinch=null;const pointers=new Map();
    const point=e=>{const r=scroll.getBoundingClientRect();return {x:Number.isFinite(e.clientX)?e.clientX-r.left:width/2,y:Number.isFinite(e.clientY)?e.clientY-r.top:height/2};};
    function stop(e){e.preventDefault();e.stopImmediatePropagation();}
    scroll.addEventListener('pointerdown',e=>{
      if(!active||e.button>0)return;clearHover();const p=point(e);pointers.set(e.pointerId,p);
      if(pointers.size===1)dragging={start:p,last:p,anchor:geoAt(p),moved:false};
      if(pointers.size===2){const [a,b]=[...pointers.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};pinch={distance:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),zoom,anchor:geoAt(mid)};dragging=null;suppressUntil=Date.now()+700;for(const id of pointers.keys())scroll.setPointerCapture(id);}
      e.stopImmediatePropagation();
    },{capture:true});
    scroll.addEventListener('pointermove',e=>{
      if(!active)return;const p=point(e);
      if(pointers.has(e.pointerId)){
        pointers.set(e.pointerId,p);
        if(pinch&&pointers.size>=2){const [a,b]=[...pointers.values()],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},value=P.clamp(pinch.zoom*Math.hypot(a.x-b.x,a.y-b.y)/pinch.distance,minimumZoom,4),anchor=pinch.anchor;pending=()=>{zoom=value;anchored(anchor,mid,value);};schedule();suppressUntil=Date.now()+700;stop(e);}
        else if(dragging&&(dragging.moved||Math.hypot(p.x-dragging.start.x,p.y-dragging.start.y)>4)){
          dragging.moved=true;const dx=p.x-dragging.last.x,dy=p.y-dragging.last.y;dragging.last=p;panPixels(dx,dy);scroll.setPointerCapture(e.pointerId);suppressUntil=Date.now()+700;scroll.classList.add('is-panning');stop(e);
        }else e.stopImmediatePropagation();
      }else{
        const node=e.target.closest?.('[data-zone]'),group=node&&groups.find(g=>g.zone===node.dataset.zone);if(group!==hovered){clearHover();if(group&&e.pointerType!=='touch'){hovered=group;group.nodes.forEach(n=>n.classList.add('is-hover'));$('map-hint').textContent=`${group.zone} · ${T.offsetLabel(Date.now(),group.zone)} now`;}}e.stopImmediatePropagation();
      }
    },{capture:true});
    function release(e){if(!active)return;pointers.delete(e.pointerId);if(dragging?.moved||pinch)suppressUntil=Date.now()+700;dragging=null;pinch=null;scroll.classList.remove('is-panning');if(scroll.hasPointerCapture(e.pointerId))scroll.releasePointerCapture(e.pointerId);if(pointers.size===1){const p=[...pointers.values()][0];dragging={start:p,last:p,anchor:geoAt(p),moved:false};}e.stopImmediatePropagation();}
    for(const type of ['pointerup','pointercancel','lostpointercapture'])scroll.addEventListener(type,release,{capture:true});
    scroll.addEventListener('pointerleave',()=>{if(active)clearHover();});window.addEventListener('blur',clearHover);document.addEventListener('visibilitychange',clearHover);
    scroll.addEventListener('click',e=>{if(active&&Date.now()<suppressUntil)stop(e);},{capture:true});
    svg.addEventListener('click',e=>{const node=e.target.closest('[data-zone]');if(node){clearHover();choose({zone:node.dataset.zone,label:UI.city(node.dataset.zone)});}});
    scroll.addEventListener('wheel',e=>{
      if(!active)return;stop(e);clearHover();
      if(e.ctrlKey||e.metaKey){const p=point(e),anchor=geoAt(p),value=P.clamp((pending?.zoomValue||zoom)*Math.exp(-e.deltaY*.01),minimumZoom,4);const action=()=>{zoom=value;anchored(anchor,p,value);};action.zoomValue=value;pending=action;schedule();}
      else panPixels(e.shiftKey?e.deltaY:e.deltaX,e.shiftKey?0:-e.deltaY);
    },{capture:true,passive:false});
    let gesture=null;
    scroll.addEventListener('gesturestart',e=>{if(!active)return;stop(e);if(pointers.size>=2)return;const p=point(e);gesture={zoom,anchor:geoAt(p)};},{capture:true,passive:false});
    scroll.addEventListener('gesturechange',e=>{if(!active||!gesture)return;stop(e);if(pointers.size>=2)return;const p=point(e),value=P.clamp(gesture.zoom*e.scale,minimumZoom,4),anchor=gesture.anchor;pending=()=>{zoom=value;anchored(anchor,p,value);};schedule();},{capture:true,passive:false});
    scroll.addEventListener('gestureend',e=>{if(active){stop(e);gesture=null;}},{capture:true,passive:false});
    scroll.addEventListener('keydown',e=>{if(!active||e.target!==scroll)return;const step=60;if(e.key==='ArrowUp')panPixels(0,step);else if(e.key==='ArrowDown')panPixels(0,-step);else if(e.key==='ArrowLeft')panPixels(step,0);else if(e.key==='ArrowRight')panPixels(-step,0);else if(e.key==='Home'){center.lat=0;center.roll=0;render();}else return;stop(e);},{capture:true});
    document.addEventListener('favoriteschange',()=>{if(active){buildPins();render();}});new ResizeObserver(resize).observe(scroll);
    function alignCities(result){
      if(!result.available||!active)return;cancelPending();clearHover();center={...result.center};
      const fit=Math.max(.1,(width-64)/(P.RADIUS*result.angle));minimumZoom=Math.min(1,fit);zoom=Math.min(4,fit);render();
      $('map-hint').textContent='Cities aligned · North Pole toward the top where possible. Reset restores north-up.';
    }
    const api={get active(){return active;},get zoom(){return zoom;},enable,setZoom,panTo,alignCities,update:()=>render(),west:()=>panPixels(150,0),east:()=>panPixels(-150,0),reset:()=>{cancelPending();zoom=1;minimumZoom=1;center.lat=0;center.roll=0;center.lon=getPoint(getField())?.[1]||0;render();},metrics:()=>({prepareMs,lastRenderMs,center:{...center},zoom}),profileMove:(lon,lat,z,roll=0)=>{center={lon,lat,roll};zoom=z;render();return lastRenderMs;}};
    return api;
  };
})(globalThis);
