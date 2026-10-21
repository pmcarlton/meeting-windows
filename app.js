(() => {
  'use strict';
  const T=MeetingTime,$=id=>document.getElementById(id),STORAGE='meeting-windows-v1';
  const browserZone=Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Tokyo';
  const today=()=>T.dateKey(Date.now(),state.source);
  let stored;try{stored=JSON.parse(localStorage.getItem(STORAGE));}catch{}
  const validityCache=new Map();
  const validZone=z=>{if(typeof z!=='string' || !z.trim())return false;if(validityCache.has(z))return validityCache.get(z);let valid;try{new Intl.DateTimeFormat('en',{timeZone:z}).format();valid=true;}catch{valid=false;}validityCache.set(z,valid);return valid;};
  const defaultTimezone=validZone(stored?.defaultTimezone)?stored.defaultTimezone:validZone(stored?.source)?stored.source:browserZone;
  const cleanHours=h=>({start:/^([01]\d|2[0-3]):[0-5]\d$/.test(h?.start)?h.start:'18:00',end:/^([01]\d|2[0-3]):[0-5]\d$/.test(h?.end)?h.end:'08:00',enabled:h?.enabled!==false});
  const state={source:defaultTimezone,target:validZone(stored?.target)?stored.target:'America/Los_Angeles',sourcePlace:stored?.defaultPlace||(defaultTimezone===stored?.source?stored?.sourcePlace:'')||'',targetPlace:stored?.targetPlace||'',defaultTimezone,defaultPlace:stored?.defaultPlace||'',sourceHours:cleanHours(stored?.sourceHours),targetHours:cleanHours(stored?.targetHours),favorites:Array.isArray(stored?.favorites)?stored.favorites.filter(f=>f&&typeof f.label==='string'&&validZone(f.zone)).slice(0,50):[],ranges:Array.isArray(stored?.ranges)?stored.ranges:[],style:stored?.style==='list'?'list':'sentence',h24:!!stored?.h24};
  state.mapProjection=['equal-area','adaptive','focus'].includes(stored?.mapProjection)?stored.mapProjection:'focus';
  state.ranges=state.ranges.filter(r=>r && ['startDate','startTime','endDate','endTime'].every(k=>typeof r[k]==='string'));
  let anchor=today(),drag=null,idCounter=0,axisDate=anchor;
  const history=[];
  const cloneRanges=()=>state.ranges.map(r=>({...r}));
  function remember(before){if(JSON.stringify(before)===JSON.stringify(state.ranges))return;history.push(before);if(history.length>40)history.shift();$('undo').disabled=false;}
  function mergeRanges(preferredId){state.ranges=T.mergeRanges(state.ranges,state.source,preferredId);}
  state.ranges.forEach(r=>r.id=++idCounter);
  const common=['Asia/Tokyo','America/Los_Angeles','America/New_York','Europe/London','Europe/Paris','Europe/Berlin','Asia/Kolkata','Asia/Shanghai','Asia/Singapore','Australia/Sydney','Pacific/Auckland','America/Chicago','America/Denver','Pacific/Honolulu','UTC'];
  const zones=[...new Set([...common,...(Intl.supportedValuesOf?Intl.supportedValuesOf('timeZone'):[]),state.source,state.target])];
  const aliases={'America/Los_Angeles':'Pacific California San Francisco Seattle Vancouver PST PDT','America/New_York':'Eastern Boston Toronto EST EDT','America/Chicago':'Central Dallas CST CDT','America/Denver':'Mountain MST MDT','Asia/Tokyo':'Japan JST','Europe/London':'UK Britain GMT BST','Asia/Kolkata':'India Mumbai Delhi IST','Asia/Calcutta':'India Mumbai Delhi IST','Europe/Paris':'France CET CEST','Asia/Shanghai':'China Beijing','Australia/Sydney':'Australia AEST AEDT','Pacific/Honolulu':'Hawaii HST','America/Phoenix':'Arizona MST'};
  const city=z=>z==='UTC'?'UTC':z.split('/').at(-1).replaceAll('_',' ');
  const canonicalCache=new Map();
  const canonical=z=>{if(!canonicalCache.has(z)){try{canonicalCache.set(z,new Intl.DateTimeFormat('en',{timeZone:z}).resolvedOptions().timeZone);}catch{canonicalCache.set(z,z);}}return canonicalCache.get(z);};
  // Keep actual city coordinates separate from a timezone's display name.
  const citySelection=(entry,zone=entry?.zone)=>entry&&typeof entry.zone==='string'&&validZone(entry.zone)&&Number.isFinite(entry.lat)&&Math.abs(entry.lat)<=90&&Number.isFinite(entry.lon)&&Math.abs(entry.lon)<=180&&canonical(entry.zone)===canonical(zone)?{zone,label:entry.label,lat:entry.lat,lon:entry.lon}:null;
  state.defaultCity=citySelection(stored?.defaultCity,state.defaultTimezone);
  state.sourceCity=state.defaultCity||(!stored?.defaultPlace&&state.source===stored?.source?citySelection(stored?.sourceCity,state.source):null);
  state.targetCity=citySelection(stored?.targetCity,state.target);
  const countryNames=new Intl.DisplayNames(['en'],{type:'region'}),norm=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[_−]/g,' ').replace(/\s+/g,' ').trim();
  const cityEntries=(window.CityData||[]).filter(c=>validZone(c[4])).map(c=>({zone:c[4],label:c[0],country:c[2],detail:`${countryNames.of(c[2])}${['US','CA'].includes(c[2])?' · '+c[3]:''} · ${c[4]}`,lat:c[5],lon:c[6],key:norm(c[0]+' '+c[1]+' '+countryNames.of(c[2])+' '+c[4]),name:norm(c[0]),ascii:norm(c[1])}));
  const defaultCities=[['Honolulu','US'],['Los Angeles','US'],['New York City','US'],['Chicago','US'],['Mexico City','MX'],['São Paulo','BR'],['Buenos Aires','AR'],['London','GB'],['Paris','FR'],['Cairo','EG'],['Cape Town','ZA'],['Dubai','AE'],['Mumbai','IN'],['Kathmandu','NP'],['Singapore','SG'],['Bangkok','TH'],['Beijing','CN'],['Tokyo','JP'],['Seoul','KR'],['Sydney','AU'],['Perth','AU'],['Auckland','NZ']];
  const defaults=defaultCities.map(([label,country])=>cityEntries.find(c=>c.label===label&&c.country===country)).filter(Boolean).map(c=>({zone:c.zone,label:c.label==='New York City'?'New York':c.label,detail:c.detail,lat:c.lat,lon:c.lon}));
  const favoriteKey=f=>`${canonical(f.zone)}|${Number(f.lat).toFixed(2)}|${Number(f.lon).toFixed(2)}`;
  const oldFavorites=state.favorites.map(f=>{if(Number.isFinite(f.lat)&&Number.isFinite(f.lon))return f;const c=cityEntries.find(c=>canonical(c.zone)===canonical(f.zone)&&(norm(c.label)===norm(f.label)||norm(city(c.zone))===norm(f.label)));return c?{zone:c.zone,label:f.label,detail:c.detail,lat:c.lat,lon:c.lon}:null;}).filter(Boolean);
  const initialFavorites=stored?.favoritesVersion===2?oldFavorites:[...oldFavorites,...defaults.filter(f=>!oldFavorites.some(old=>favoriteKey(old)===favoriteKey(f)))];
  state.favorites=[...new Map(initialFavorites.map(f=>[favoriteKey(f),f])).values()].slice(0,50);
  state.favoritesVersion=2;
  const zoneEntries=zones.filter(validZone).map(z=>{const names=[T.zoneName(Date.UTC(2026,0,15),z),T.zoneName(Date.UTC(2026,6,15),z)];const short=[0,6].map(m=>new Intl.DateTimeFormat('en-US',{timeZone:z,timeZoneName:'short'}).formatToParts(Date.UTC(2026,m,15)).find(p=>p.type==='timeZoneName').value);return {zone:z,label:city(z),detail:`${z} · ${names[0]}`,key:norm([z,aliases[z]||'',...names,...short,T.offsetLabel(Date.now(),z)].join(' '))};});
  function chooseZone(field,entry){
    if(field==='source'&&canonical(state.source)!==canonical(entry.zone)){history.length=0;$('undo').disabled=true;}
    state[field]=entry.zone;state[field+'Place']=entry.label||city(entry.zone);state[field+'City']=citySelection(entry);
    const which=field==='source'?'source':'target';$(which+'-zone').value=state[field+'Place'];$(which+'-options').hidden=true;$(which+'-zone').setAttribute('aria-expanded','false');
    if(field==='source'){anchor=today();axisDate=anchor;mergeRanges();$('week-date').value=anchor;renderRanges();}renderCalendar(field==='source');renderOutput();save();
    document.dispatchEvent(new CustomEvent('zonechange',{detail:{field,...entry}}));
  }
  window.MeetingUI={state,chooseZone,city,citySelection,canonical,setupZone,save,favoriteKey,refreshCalendar:renderCalendar};
  function save(){try{localStorage.setItem(STORAGE,JSON.stringify(state));}catch{$('copy-status').textContent='Browser storage unavailable; keep this tab open.';}}
  function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function setupZone(which,field,onPick=null,getValue=null,{cityOnly=false}={}){
    const input=$(which+'-zone'),box=$(which+'-options');let active=-1,options=[],currentQuery='';
    const display=()=>getValue?getValue():state[field+'Place']||city(state[field]);
    const close=()=>{box.hidden=true;input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');input.value=display();};
    const choose=entry=>{if(onPick)onPick(entry);else chooseZone(field,entry);close();};
    function show(query=''){
      currentQuery=query;
      const q=norm(query),tokens=q.split(' '),matches=entry=>tokens.every(t=>entry.key.includes(t));
      const cities=q?cityEntries.filter(matches):[];
      cities.sort((a,b)=>(a.name===q||a.ascii===q?0:a.name.startsWith(q)?1:2)-(b.name===q||b.ascii===q?0:b.name.startsWith(q)?1:2));
      const tz=zoneEntries.filter(e=>!q||matches(e));
      const exact=validZone(query)&&query.includes('/')?{zone:query,label:city(query),detail:query}:null;
      options=q?(cityOnly?cities.slice(0,30):[...(exact?[exact]:[]),...tz.filter(e=>norm(e.zone)===q),...cities.slice(0,18),...tz.filter(e=>norm(e.zone)!==q).slice(0,16)]):state.favorites;
      if(!cityOnly&&/^([+-]\d{2}:\d{2}|UTC[+-]\d{1,2}(:\d{2})?)$/i.test(query)){let offset=query.replace(/^UTC/i,'');const sign=offset[0];const [h,m='00']=offset.slice(1).split(':');offset=sign+h.padStart(2,'0')+':'+m;if(validZone(offset))options.unshift({zone:offset,label:'UTC'+offset,detail:'Fixed UTC offset · no daylight saving'});}
      options=options.filter((entry,i,all)=>all.findIndex(e=>e.zone===entry.zone&&e.label===entry.label)===i);
      active=-1;
      box.innerHTML=options.map((entry,i)=>{const favorite=state.favorites.findIndex(f=>favoriteKey(f)===favoriteKey(entry)||(f.zone===entry.zone&&f.label===entry.label));return `<div class="zone-option-row"><button type="button" role="option" aria-selected="${entry.zone===state[field]}" id="${which}-option-${i}" data-index="${i}">${escape(entry.label)}<small style="display:block;color:var(--muted);font-size:10px">${escape(entry.detail||entry.zone)}</small></button>${favorite>=0?`<button type="button" class="remove-map-city" data-remove-favorite="${favorite}" aria-label="Remove ${escape(state.favorites[favorite].label)} from map" title="Remove city from map">×</button>`:''}</div>`;}).join('') || `<p class="muted" style="padding:8px">${q?'No match. ':''}${cityOnly?'Search to add a city to the map.':'Search a city, timezone name, or UTC offset.'}</p>`;
      box.hidden=false;input.setAttribute('aria-expanded','true');
    }
    input.placeholder='City, timezone, or UTC offset';input.title='Search a city, timezone name, IANA identifier, or UTC offset';input.value=display();input.addEventListener('focus',()=>{input.select();show();});input.addEventListener('input',()=>show(input.value));
    input.addEventListener('keydown',e=>{
      if(e.key==='Escape'){close();input.blur();return;}
      if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();if(box.hidden)show();active=Math.max(0,Math.min(options.length-1,active+(e.key==='ArrowDown'?1:-1)));[...box.querySelectorAll('[role=option]')].forEach((b,i)=>b.classList.toggle('active',i===active));const option=$(which+'-option-'+active);if(option){input.setAttribute('aria-activedescendant',option.id);option.scrollIntoView({block:'nearest'});}}
      if(e.key==='Enter' && !box.hidden){e.preventDefault();if(options.length)choose(options[Math.max(0,active)]);}
    });
    box.addEventListener('mousedown',e=>e.preventDefault());box.addEventListener('click',e=>{const remove=e.target.closest('[data-remove-favorite]');if(remove){window.MeetingUI.removeFavorite(+remove.dataset.removeFavorite);return;}const b=e.target.closest('[data-index]');if(b)choose(options[+b.dataset.index]);});
    document.addEventListener('favoriteschange',()=>{if(!box.hidden)show(currentQuery);});
    input.addEventListener('blur',()=>setTimeout(()=>{if(!input.parentElement.contains(document.activeElement))close();},120));
    box.addEventListener('focusout',()=>queueMicrotask(()=>{if(!input.parentElement.contains(document.activeElement))close();}));
    box.addEventListener('keydown',e=>{if(e.key==='Escape'){input.focus();close();}});
    document.addEventListener('pointerdown',e=>{if(!input.parentElement.contains(e.target))close();});
  }
  setupZone('source','source');setupZone('target','target');
  function endpoint(r,prefix){
    const date=r[prefix+'Date'],time=r[prefix+'Time'];let choices=[];
    try{choices=T.candidates(date,time,state.source);}catch{}
    const label=prefix==='start'?'Start':'End';
    return `<div class="endpoint"><label for="${prefix}-date-${r.id}">${label}</label><div class="inputs"><input id="${prefix}-date-${r.id}" type="date" min="1900-01-01" max="2100-12-31" value="${escape(date)}" data-field="${prefix}Date" aria-label="Range ${state.ranges.indexOf(r)+1} ${prefix} date"><input type="time" value="${escape(time)}" data-field="${prefix}Time" aria-label="Range ${state.ranges.indexOf(r)+1} ${prefix} time" step="60"></div>${choices.length>1?`<select class="occurrence" data-field="${prefix}Occurrence" aria-label="Range ${state.ranges.indexOf(r)+1} ${prefix} repeated time"><option value="">Choose occurrence</option>${choices.map((ms,i)=>`<option value="${i?'second':'first'}" ${r[prefix+'Occurrence']===(i?'second':'first')?'selected':''}>${i?'Second':'First'} · ${escape(T.zoneLabel(ms,state.source))}</option>`).join('')}</select>`:''}</div>`;
  }
  function renderRanges(){
    $('range-count').textContent=state.ranges.length;$('range-zone').textContent=state.source;
    const container=$('ranges'),active=document.activeElement;
    if(!state.ranges.length){container.innerHTML='<div class="empty">Drag on the calendar or add an exact range.</div>';return;}
    container.querySelector('.empty')?.remove();
    const existing=new Map([...container.querySelectorAll('.range-card')].map(e=>[+e.dataset.id,e]));
    state.ranges.forEach((r,i)=>{
      let card=existing.get(r.id);existing.delete(r.id);
      if(!card){card=document.createElement('div');card.className='range-card';card.dataset.id=r.id;card.innerHTML=`<div class="range-top"><strong></strong><button class="remove" data-remove="${r.id}">×</button></div><div class="range-fields">${endpoint(r,'start')}${endpoint(r,'end')}</div><div class="range-error" hidden></div>`;}
      card.querySelector('.range-top strong').textContent=`Range ${i+1}`;card.querySelector('.remove').setAttribute('aria-label',`Remove range ${i+1}`);
      for(const prefix of ['start','end']){
        const inputs=card.querySelectorAll('.endpoint')[prefix==='start'?0:1];
        for(const part of ['Date','Time']){const input=inputs.querySelector(`[data-field="${prefix+part}"]`);if(input.value!==r[prefix+part])input.value=r[prefix+part];input.setAttribute('aria-label',`Range ${i+1} ${prefix} ${part.toLowerCase()}`);}
        let choices=[];try{choices=T.candidates(r[prefix+'Date'],r[prefix+'Time'],state.source);}catch{}
        let select=inputs.querySelector('select');
        if(choices.length>1){
          if(!select){select=document.createElement('select');select.className='occurrence';select.dataset.field=prefix+'Occurrence';inputs.append(select);}
          const options='<option value="">Choose occurrence</option>'+choices.map((ms,j)=>`<option value="${j?'second':'first'}">${j?'Second':'First'} · ${escape(T.zoneLabel(ms,state.source))}</option>`).join('');
          if(select.dataset.options!==options){select.innerHTML=options;select.dataset.options=options;}select.value=r[prefix+'Occurrence']||'';select.setAttribute('aria-label',`Range ${i+1} ${prefix} repeated time`);
        }else select?.remove();
      }
      let error='';try{T.normalize([r],state.source);}catch(e){error=e.message.replace(/^Range 1: /,'');}const message=card.querySelector('.range-error');message.hidden=!error;message.textContent=error;
      if(container.children[i]!==card)container.insertBefore(card,container.children[i]||null);
    });
    for(const card of existing.values())card.remove();
    if(active&&container.contains(active)&&document.activeElement!==active)active.focus({preventScroll:true});
  }
  $('ranges').addEventListener('change',e=>{
    const field=e.target.dataset.field;if(!field)return;const r=state.ranges.find(r=>r.id===+e.target.closest('[data-id]').dataset.id),before=cloneRanges();r[field]=e.target.value;
    if(!field.endsWith('Occurrence'))r[field.startsWith('start')?'startOccurrence':'endOccurrence']='';
    mergeRanges(r.id);remember(before);renderRanges();renderCalendar();renderOutput();save();
  });
  $('ranges').addEventListener('click',e=>{const b=e.target.closest('[data-remove]');if(!b)return;const before=cloneRanges();state.ranges=state.ranges.filter(r=>r.id!==+b.dataset.remove);remember(before);update();});
  function addRange(startDate,startTime,endDate,endTime){const before=cloneRanges();state.ranges.push({id:++idCounter,startDate,startTime,endDate,endTime,startOccurrence:'',endOccurrence:''});remember(before);update();}
  $('add-range').onclick=()=>{addRange(anchor,'09:00',anchor,'10:00');const last=$('ranges').lastElementChild;last.scrollIntoView({behavior:'smooth',block:'nearest'});last.querySelector('input').focus({preventScroll:true});};
  $('clear').onclick=()=>{const before=cloneRanges();state.ranges=[];remember(before);update();};
  function undo(){if(!history.length)return;state.ranges=history.pop();$('undo').disabled=!history.length;update();}
  $('undo').onclick=undo;
  document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&!e.altKey&&e.key.toLowerCase()==='z'&&!e.target.closest('input,textarea,select,[contenteditable="true"]')){if(history.length){e.preventDefault();undo();}}});
  function monday(date){const day=new Date(date+'T12:00:00Z').getUTCDay();return T.addDays(date,-((day+6)%7));}
  function localFromSerial(serial){const date=new Date(serial*60000);return {date:date.toISOString().slice(0,10),time:date.toISOString().slice(11,16)};}
  function serial(date,time){return T.stamp(T.civil(date,time))/60000;}
  const shadingCache=new Map(),axisCache=new Map(),clockChangeCache=new Map();
  function changeTitle(e){return `${e.side==='source'?'My':'Their'} clock changes ${e.oldName} (${T.offsetLabel(e.at-1000,e.zone)}) → ${e.newName} (${T.offsetLabel(e.at,e.zone)}), ${e.shift}. My time: ${T.dateLabel(e.at,state.source)} at ${T.clock(e.at,state.source,state.h24)}. Their time: ${T.dateLabel(e.at,state.target)} at ${T.clock(e.at,state.target,state.h24)}.`;}
  function changeClass(events){return events.length?' clock-day-'+(new Set(events.map(e=>e.side)).size>1?'both':events[0].side):'';}
  function renderTheirAxis(){
    const key=[axisDate,state.source,state.target,state.h24].join('|');
    if(!axisCache.has(key)){if(axisCache.size>100)axisCache.clear();axisCache.set(key,T.axisRows(axisDate,state.source,state.target,state.h24));}
    const rows=axisCache.get(key),boundaries=rows.flatMap((r,i)=>r.boundaries.map(b=>({...b,y:i*20+b.fraction*20})));
    const dayLabel=new Intl.DateTimeFormat('en-US',{weekday:'short',timeZone:'UTC'}).format(new Date(axisDate+'T12:00Z'))+' '+Number(axisDate.slice(8));
    $('their-axis-heading').innerHTML=`Their<small>${escape(dayLabel)} column</small>`;$('their-axis-heading').title=`Their clock for my ${axisDate}. Point to a different day to change the axis.`;
    $('calendar').querySelectorAll('.day-head[data-axis-date]').forEach(e=>e.classList.toggle('axis-day',e.dataset.axisDate===axisDate));
    $('calendar').querySelectorAll('[data-axis-row]').forEach((node,i)=>{
      const row=rows[i],labels=row.labels.join(' / ')||'—',nearMidnight=boundaries.some(b=>Math.abs(b.y-i*20)<16);
      node.title=row.title;
      node.innerHTML=(i%2===0&&!nearMidnight?`<span class="axis-clock ${row.labels.length>1?'multiple':''}">${escape(labels)}</span>`:'')+row.boundaries.map(b=>`<span class="axis-midnight" style="top:${(b.fraction*20).toFixed(3)}px" title="${escape(b.title)}"><span>${escape(b.label)} · ${escape(b.time)}</span></span>`).join('');
    });
  }
  function followDay(event){const date=event.target.closest('[data-axis-date]')?.dataset.axisDate;if(date&&date!==axisDate){axisDate=date;renderTheirAxis();}}

  function renderCalendar(scroll=false){
    const active=document.activeElement?.closest('#calendar [data-serial]')?.dataset.serial;
    const first=monday(anchor),days=Array.from({length:7},(_,i)=>T.addDays(first,i)),weekdays=['MON','TUE','WED','THU','FRI','SAT','SUN'];
    const shortDate=d=>new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
    $('week-title').textContent=`${shortDate(first)} – ${shortDate(days[6])}, ${first.slice(0,4)}`;
    if(!days.includes(axisDate))axisDate=anchor;
    const changeKey=[first,state.source,state.target].join('|');
    if(!clockChangeCache.has(changeKey)){if(clockChangeCache.size>100)clockChangeCache.clear();clockChangeCache.set(changeKey,T.clockChanges(first,state.source,state.target));}
    const clockEvents=clockChangeCache.get(changeKey),eventsFor=date=>clockEvents.filter(e=>e.date===date);
    $('calendar').classList.toggle('has-clock-changes',clockEvents.length>0);
    const selection=T.selectionState(state.ranges,state.source);
    let html='<div class="day-head corner">My</div>'+days.map((d,i)=>{const changes=eventsFor(d);return `<div class="day-head ${d===today()?'today':''}${changeClass(changes)}" data-axis-date="${d}">${weekdays[i]}<strong>${+d.slice(8)}</strong>${changes.map(e=>{const who=e.side==='source'?'My':'Their',names=e.oldShort+'→'+e.newShort,label=who+' '+(names.length>11?e.shift:names);return `<span class="clock-change-badge clock-${e.side}" role="img" aria-label="${escape(changeTitle(e))}" title="${escape(changeTitle(e))}">${escape(label)}</span>`;}).join('')}</div>`;}).join('')+'<div class="day-head their-corner" id="their-axis-heading">Their</div>',hasDST=false;
    for(let row=0;row<48;row++){
      const hour=Math.floor(row/2),time=String(hour).padStart(2,'0')+':'+(row%2?'30':'00');
      html+=`<div class="hour-label">${row%2?'':state.h24?String(hour).padStart(2,'0')+':00':(hour%12||12)+(hour<12?' am':' pm')}</div>`;
      days.forEach(d=>{let count=1;try{count=T.candidates(d,time,state.source).length;}catch{}if(count!==1)hasDST=true;
        const key=JSON.stringify([d,time,state.source,state.target,state.sourceHours,state.targetHours]);
        if(!shadingCache.has(key)){if(shadingCache.size>6000)shadingCache.clear();shadingCache.set(key,T.awaySegments(d,time,state.source,state.target,state.sourceHours,state.targetHours));}
        const shade=shadingCache.get(key),awayLabel=shade.mask===3?'My and their away hours':shade.mask===1?'My away hours':shade.mask===2?'Their away hours':'';
        const label=`${d} ${time} in ${state.source}${!count?' — skipped time':count>1?' — repeated time':''}`;
        const changes=eventsFor(d),inCell=changes.filter(e=>e.row===row),hover=T.hoverText(d,time,state.source,state.target,state.h24)+(inCell.length?'\n'+inCell.map(changeTitle).join('\n'):''),coverage=T.slotSelection(d,time,state.source,selection);
        const markers=[...new Set(inCell.map(e=>e.fraction))].map(fraction=>{const events=inCell.filter(e=>Math.abs(e.fraction-fraction)<1e-6);return `<span class="clock-transition${changeClass(events)}" style="top:${(fraction*100).toFixed(3)}%" aria-hidden="true"></span>`;}).join('');
        html+=`<button class="slot ${row%2?'half':''} ${shade.mask&1?'away-source':''} ${shade.mask&2?'away-target':''} ${shade.mask===3?'away-both':''} ${coverage.selected?'selected':''}${changeClass(changes)} ${!count?'missing':count>1?'repeated':''}" style="--away-shading:${shade.gradient};--selection-shading:${coverage.gradient}" data-axis-date="${d}" data-away="${shade.mask}" data-serial="${serial(d,time)}" aria-label="${label}" aria-description="${escape(hover)}${awayLabel?' — '+awayLabel:''}${count>1?'. Shading includes either occurrence.':''}" aria-pressed="${coverage.selected}" title="${escape(hover)}${awayLabel?'\n'+awayLabel:''}" ${!count?'aria-disabled="true"':''}>${markers}</button>`;
      });
      html+=`<div class="their-hour" data-axis-row="${row}"></div>`;
    }
    $('calendar').innerHTML=html;$('dst-key').hidden=!hasDST&&!clockEvents.length;renderTheirAxis();
    $('availability-title').textContent=`My available times (${state.source})`;
    if(active)$('calendar').querySelector(`[data-serial="${active}"]`)?.focus({preventScroll:true});
    if(scroll)$('calendar-scroll').scrollTop=20*14;
  }
  const grid=$('calendar');
  grid.addEventListener('pointerover',followDay);grid.addEventListener('focusin',followDay);
  grid.addEventListener('pointerdown',e=>{
    const b=e.target.closest('[data-serial]');if(!b || e.button!==0 || b.getAttribute('aria-disabled')==='true')return;
    if(e.pointerType==='touch')return; // Touch uses tap; dragging keeps native scrolling.
    e.preventDefault();drag={start:+b.dataset.serial,end:+b.dataset.serial,erase:b.classList.contains('selected')};paintDrag();
  });
  function paintDrag(){if(!drag)return;const rectangle=T.gridRectangle(drag.start,drag.end);grid.querySelectorAll('[data-serial]').forEach(b=>{const s=+b.dataset.serial,inside=b.getAttribute('aria-disabled')!=='true'&&rectangle.some(r=>s>=r.start&&s<r.end);b.classList.toggle('previewing',inside&&!drag.erase);b.classList.toggle('erasing',inside&&drag.erase);});}
  document.addEventListener('pointermove',e=>{if(!drag)return;const b=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-serial]');if(b){drag.end=+b.dataset.serial;paintDrag();}const sc=$('calendar-scroll'),rect=sc.getBoundingClientRect();if(e.clientY>rect.bottom-25 && e.clientY<rect.bottom+25)sc.scrollTop+=14;if(e.clientY<rect.top+65 && e.clientY>rect.top)sc.scrollTop-=14;});
  function commitDrag(){if(!drag)return;const rectangle=T.gridRectangle(drag.start,drag.end),erase=drag.erase,before=cloneRanges();drag=null;
    if(erase){
      state.ranges=T.eraseRanges(state.ranges,state.source,rectangle,()=>++idCounter);
    }else{
      for(const cut of rectangle){
        let a=cut.start,b=cut.end;
        const exists=s=>{const p=localFromSerial(s);return T.candidates(p.date,p.time,state.source).length>0;};
        while(a<b&&!exists(a))a+=30;
        if(a>=b)continue;
        while(!exists(b))b+=30;
        const s=localFromSerial(a),e=localFromSerial(b);
        state.ranges.push({id:++idCounter,startDate:s.date,startTime:s.time,endDate:e.date,endTime:e.time,startOccurrence:'',endOccurrence:''});
      }
    }
    mergeRanges();remember(before);update();
  }
  document.addEventListener('pointerup',commitDrag);document.addEventListener('pointercancel',()=>{drag=null;renderCalendar();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&drag){drag=null;renderCalendar();}});
  grid.addEventListener('click',e=>{if(e.detail!==0 && e.pointerType!=='touch')return;const b=e.target.closest('[data-serial]');if(!b || b.getAttribute('aria-disabled')==='true')return;drag={start:+b.dataset.serial,end:+b.dataset.serial,erase:b.classList.contains('selected')};commitDrag();});
  function setWeek(date){try{T.civil(date);anchor=date;axisDate=date;}catch{return;}$('week-date').value=anchor;renderCalendar(true);}
  $('week-date').value=anchor;$('week-date').onchange=e=>setWeek(e.target.value);$('prev-week').onclick=()=>setWeek(T.addDays(anchor,-7));$('next-week').onclick=()=>setWeek(T.addDays(anchor,7));$('today').onclick=()=>setWeek(today());
  function renderOutput(){
    const now=Date.now();$('source-detail').textContent=`${state.source} · ${T.offsetLabel(now,state.source)} now`;$('target-detail').textContent=`${state.target} · ${T.offsetLabel(now,state.target)} now`;
    $('error').hidden=true;$('error').textContent='';$('copy-status').textContent='';
    let intervals=[];
    try{intervals=T.normalize(state.ranges,state.source);$('output').value=T.describe(intervals,state.target,{h24:state.h24,list:state.style==='list'});$('copy').disabled=!intervals.length;}
    catch(e){$('output').value='';$('error').textContent=e.message;$('error').hidden=false;$('copy').disabled=true;}
    $('preview').innerHTML=intervals.map(({start,end})=>{
      const sameDate=T.dateKey(start,state.target)===T.dateKey(end,state.target),sameOffset=T.zoneLabel(start,state.target)===T.zoneLabel(end,state.target);
      return `<div class="preview-range"><strong>${escape(T.dateLabel(start,state.target))}</strong><span>${escape(T.clock(start,state.target,state.h24))} → ${sameDate?'':escape(T.dateLabel(end,state.target))+' · '}${escape(T.clock(end,state.target,state.h24))}</span><small>${escape(T.zoneLabel(start,state.target))}${sameOffset?'':' → '+escape(T.zoneLabel(end,state.target))}</small></div>`;
    }).join('') || `<p class="muted">${state.ranges.length?'Correct the ranges to see converted times.':'No ranges selected.'}</p>`;
    const hours=intervals.reduce((n,r)=>n+(r.end-r.start)/3600000,0);
    $('selection-summary').textContent=`${state.ranges.length} ${state.ranges.length===1?'range':'ranges'} selected${intervals.length?' · '+Number(hours.toFixed(2))+' hours available':''}`;
  }
  $('output-style').value=state.style;$('clock-style').value=state.h24?'24':'12';
  $('output-style').onchange=e=>{state.style=e.target.value;renderOutput();save();};$('clock-style').onchange=e=>{state.h24=e.target.value==='24';renderCalendar();renderOutput();save();};
  $('copy').onclick=async()=>{
    try{if(navigator.clipboard?.writeText)await navigator.clipboard.writeText($('output').value);else throw Error();$('copy-status').textContent='Copied.';}
    catch{$('output').focus();$('output').select();try{if(!document.execCommand('copy'))throw Error();$('copy-status').textContent='Copied.';}catch{$('copy-status').textContent='Text selected. Press ⌘C or Ctrl+C to copy.';}}
  };
  function update(){renderRanges();renderCalendar();renderOutput();save();}
  mergeRanges();renderRanges();renderCalendar(true);renderOutput();
})();
