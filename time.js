(function (root) {
  'use strict';
  const formatters = new Map(), offsets = new Map();
  function fmt(zone, options) {
    const key = zone + JSON.stringify(options);
    if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat('en-US', { timeZone: zone, ...options }));
    return formatters.get(key);
  }
  function parts(ms, zone) {
    const p = Object.fromEntries(fmt(zone, { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).formatToParts(ms).map(p => [p.type, p.value]));
    return { year:+p.year, month:+p.month, day:+p.day, hour:+p.hour, minute:+p.minute, second:+p.second };
  }
  function stamp(p) { return Date.UTC(p.year, p.month-1, p.day, p.hour || 0, p.minute || 0, p.second || 0); }
  function civil(date, time='00:00') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw Error('Enter a complete date and time.');
    const [year,month,day] = date.split('-').map(Number), [hour,minute] = time.split(':').map(Number);
    const p = {year,month,day,hour,minute}, d = new Date(stamp(p));
    if (year<1900 || year>2100 || d.getUTCFullYear()!==year || d.getUTCMonth()+1!==month || d.getUTCDate()!==day || hour>23 || minute>59) throw Error('Use a valid date between 1900 and 2100.');
    return p;
  }
  function offset(ms, zone) { return (stamp(parts(ms,zone))-Math.floor(ms/1000)*1000)/60000; }
  function candidates(date,time,zone) {
    const wall = stamp(civil(date,time)), key=zone+date;
    if (!offsets.has(key)) {
      const sample=stamp(civil(date)), possible=new Set();
      for(let h=-48;h<=48;h+=6) possible.add(offset(sample+h*3600000,zone));
      offsets.set(key,[...possible]);
    }
    return offsets.get(key).map(o=>wall-o*60000).filter(ms=>stamp(parts(ms,zone))===wall).sort((a,b)=>a-b);
  }
  function resolve(date,time,zone,occurrence) {
    const c=candidates(date,time,zone);
    if (!c.length) throw Error(`${date} at ${time} does not exist in ${zone} because the clocks move forward. Choose another time.`);
    if (c.length>1 && !['first','second'].includes(occurrence)) throw Error(`${date} at ${time} occurs twice in ${zone}. Choose the first or second occurrence.`);
    return c[occurrence==='second'?c.length-1:0];
  }
  function dateKey(ms,zone) { const p=parts(ms,zone); return `${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`; }
  function addDays(date,n) { const d=new Date(stamp(civil(date))+n*86400000); return d.toISOString().slice(0,10); }
  function time(ms,zone,h24=false) { return fmt(zone,{hour:'numeric',minute:'2-digit',hourCycle:h24?'h23':'h12'}).format(ms).replace(':00','').replace(/AM/g,'am').replace(/PM/g,'pm'); }
  function clock(ms,zone,h24=false) { if(h24) return fmt(zone,{hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(ms); return time(ms,zone); }
  function dateLabel(ms,zone) { return fmt(zone,{weekday:'long',month:'long',day:'numeric',year:'numeric'}).format(ms); }
  function zoneName(ms,zone) {
    const name=fmt(zone,{timeZoneName:'long'}).formatToParts(ms).find(p=>p.type==='timeZoneName').value;
    // Some browsers return a numeric GMT label for London even with long names requested.
    if(['Europe/London','Europe/Belfast','GB','GB-Eire'].includes(zone)&&/^(GMT|UTC)(?:[+−-].*)?$/.test(name)){
      const n=offset(ms,zone);if(n===0)return 'Greenwich Mean Time';if(n===60)return 'British Summer Time';
    }
    return name;
  }
  function offsetLabel(ms,zone) { const n=offset(ms,zone), abs=Math.abs(n); return `UTC${n<0?'−':'+'}${String(Math.floor(abs/60)).padStart(2,'0')}:${String(Math.round(abs%60)).padStart(2,'0')}`; }
  function zoneLabel(ms,zone) { return `${zoneName(ms,zone)}, ${offsetLabel(ms,zone)}`; }
  function gridRectangle(start,end){
    const aDay=Math.floor(start/1440),bDay=Math.floor(end/1440),aMinute=start-aDay*1440,bMinute=end-bDay*1440;
    const firstDay=Math.min(aDay,bDay),lastDay=Math.max(aDay,bDay),firstMinute=Math.min(aMinute,bMinute),lastMinute=Math.max(aMinute,bMinute)+30;
    return Array.from({length:lastDay-firstDay+1},(_,i)=>({start:(firstDay+i)*1440+firstMinute,end:(firstDay+i)*1440+lastMinute}));
  }
  function hoverText(date,time,source,target,h24=false){
    const instants=candidates(date,time,source);
    if(!instants.length)return `My time (${source}): ${date} ${time} — skipped when clocks move forward.\nTheir time (${target}): no corresponding time.`;
    const local=(ms,z)=>`${dateLabel(ms,z)} at ${clock(ms,z,h24)} (${offsetLabel(ms,z)})`;
    return instants.map((ms,i)=>`${instants.length>1?(i===0?'First':'Second')+' occurrence\n':''}My time (${source}): ${local(ms,source)}\nTheir time (${target}): ${local(ms,target)}`).join('\n\n');
  }
  function inAwayHours(minute,hours) {
    if(!hours || !hours.enabled || hours.start===hours.end)return false;
    const toMinute=s=>{const [h,m]=s.split(':').map(Number);return h*60+m;};
    const start=toMinute(hours.start),end=toMinute(hours.end);
    return start<end?minute>=start&&minute<end:minute>=start||minute<end;
  }
  function awaySegments(date,time,source,target,sourceHours,targetHours) {
    const starts=candidates(date,time,source),colors=['transparent','#f9e5d4','#dceee2','#e6e1c7'];
    if(!starts.length)return {mask:0,gradient:'none'};
    const wall=civil(date,time),first=wall.hour*60+wall.minute;
    let mask=0,previous=-1,runStart=0;const runs=[];
    for(let m=0;m<=30;m++) {
      let value=-1;
      if(m<30){
        const mine=inAwayHours((first+m)%1440,sourceHours);
        const theirs=!!targetHours.enabled&&starts.some(start=>{const p=parts(start+m*60000,target);return inAwayHours(p.hour*60+p.minute,targetHours);});
        value=(mine?1:0)|(theirs?2:0);mask|=value;
      }
      if(value!==previous){if(previous>=0)runs.push(`${colors[previous]} ${(runStart/30*100).toFixed(2)}% ${(m/30*100).toFixed(2)}%`);runStart=m;previous=value;}
    }
    return {mask,gradient:`linear-gradient(to bottom,${runs.join(',')})`};
  }
  function normalize(ranges,source) {
    const resolved=ranges.map((r,i)=>{
      try {
        const start=resolve(r.startDate,r.startTime,source,r.startOccurrence),end=resolve(r.endDate,r.endTime,source,r.endOccurrence);
        if(end<=start) throw Error('End must be after start. For an overnight range, use the next end date.');
        return {start,end};
      } catch(e) { throw Error(`Range ${i+1}: ${e.message}`); }
    }).sort((a,b)=>a.start-b.start);
    const merged=[];
    for (const r of resolved) { const prev=merged.at(-1); if(prev && r.start<=prev.end) prev.end=Math.max(prev.end,r.end); else merged.push({...r}); }
    return merged;
  }
  function describe(intervals,zone,{h24=false,list=false}={}) {
    if(!intervals.length) return '';
    const endpoints=intervals.flatMap(r=>[r.start,r.end]);
    const years=[...new Set(endpoints.map(ms=>parts(ms,zone).year))];
    const nameOffsets=new Map();
    for(const ms of endpoints){const name=zoneName(ms,zone);if(!nameOffsets.has(name))nameOffsets.set(name,new Set());nameOffsets.get(name).add(offset(ms,zone));}
    // Keep full names concise, adding an offset only when the same name is ambiguous.
    const zoneText=ms=>{const name=zoneName(ms,zone);return nameOffsets.get(name).size>1?zoneLabel(ms,zone):name;};
    const months=['Jan.','Feb.','Mar.','Apr.','May','June','July','Aug.','Sept.','Oct.','Nov.','Dec.'];
    const shortDate=(ms,weekday=false)=>{
      const p=parts(ms,zone);
      return `${weekday?fmt(zone,{weekday:'long'}).format(ms)+' ':''}${months[p.month-1]} ${p.day}${years.length>1?', '+p.year:''}`;
    };
    const shortClock=ms=>clock(ms,zone,h24).replace(/\s/g,'');
    const groups=[];
    for(const {start,end} of intervals) {
      const sameDay=dateKey(start,zone)===dateKey(end,zone), sameZone=zoneLabel(start,zone)===zoneLabel(end,zone);
      if(sameDay && sameZone) {
        const key=dateKey(start,zone)+zoneLabel(start,zone), previous=groups.at(-1);
        const range=`${shortClock(start)} to ${shortClock(end)}`;
        if(previous && previous.key===key) previous.ranges.push(range);
        else groups.push({key,start,end,label:shortDate(start,true),ranges:[range]});
      } else {
        const a=`${shortDate(start,true)}, ${shortClock(start)}`,b=`${sameZone?'':'('+zoneText(end)+') '}${sameDay?'':shortDate(end)+', '}${shortClock(end)}`;
        const text=`${a} to ${b}`;
        groups.push({start,end,text});
      }
    }
    let previousZone=null;
    const clauses=groups.map(g=>{
      const currentZone=zoneLabel(g.start,zone),label=currentZone!==previousZone?'('+zoneText(g.start)+') ':'';
      previousZone=zoneLabel(g.end,zone);
      return `your ${label}${g.text || `${g.label}, ${g.ranges.join(' or ')}`}`;
    });
    const yearSuffix=years.length===1?` [${years[0]}]`:'';
    return (list?clauses.map(s=>'• '+s).join('\n'):clauses.join('; or '))+yearSuffix;
  }
  // Merge by actual instants, retaining invalid drafts and explicit fold choices.
  // Prefer the actively edited card's ID so its input controls can stay mounted.
  function mergeRanges(ranges,zone,preferredId) {
    const valid=[],invalid=[];
    ranges.forEach((range,index)=>{try{const start=resolve(range.startDate,range.startTime,zone,range.startOccurrence),end=resolve(range.endDate,range.endTime,zone,range.endOccurrence);if(end<=start)throw Error();valid.push({range,index,start,end});}catch{invalid.push({index,range});}});
    valid.sort((a,b)=>a.start-b.start);const clusters=[];
    for(const entry of valid){const last=clusters.at(-1);if(last&&entry.start<=last.end){last.entries.push(entry);last.end=Math.max(last.end,entry.end);}else clusters.push({entries:[entry],end:entry.end});}
    const result=clusters.map(({entries})=>{
      const first=entries[0],last=entries.reduce((a,b)=>a.end>=b.end?a:b),keep=entries.find(e=>e.range.id===preferredId)||entries.reduce((a,b)=>a.index<=b.index?a:b);
      return {index:Math.min(...entries.map(e=>e.index)),range:{...keep.range,startDate:first.range.startDate,startTime:first.range.startTime,startOccurrence:first.range.startOccurrence||'',endDate:last.range.endDate,endTime:last.range.endTime,endOccurrence:last.range.endOccurrence||''}};
    });
    return [...result,...invalid].sort((a,b)=>a.index-b.index).map(e=>e.range);
  }
  function eraseRanges(ranges,zone,rectangles,nextId){
    const cuts=[];
    for(const cut of rectangles)for(let wall=cut.start;wall<cut.end;wall+=30){const date=new Date(wall*60000),key=date.toISOString().slice(0,10),time=date.toISOString().slice(11,16);for(const start of candidates(key,time,zone))cuts.push({start,end:start+1800000});}
    cuts.sort((a,b)=>a.start-b.start);const merged=[];for(const cut of cuts){const last=merged.at(-1);if(last&&cut.start<=last.end)last.end=Math.max(last.end,cut.end);else merged.push({...cut});}
    const subtract=(pieces,cuts)=>{for(const cut of cuts)pieces=pieces.flatMap(p=>p.end<=cut.start||p.start>=cut.end?[p]:[...(p.start<cut.start?[{start:p.start,end:cut.start}]:[]),...(p.end>cut.end?[{start:cut.end,end:p.end}]:[])]);return pieces;};
    const endpoint=(ms,prefix,wall=false)=>{
      const p=wall?{year:new Date(ms).getUTCFullYear(),month:new Date(ms).getUTCMonth()+1,day:new Date(ms).getUTCDate(),hour:new Date(ms).getUTCHours(),minute:new Date(ms).getUTCMinutes()}:parts(ms,zone);
      const date=`${p.year}-${String(p.month).padStart(2,'0')}-${String(p.day).padStart(2,'0')}`,time=`${String(p.hour).padStart(2,'0')}:${String(p.minute).padStart(2,'0')}`;
      const options=wall?[]:candidates(date,time,zone),occurrence=options.length>1?(options.indexOf(ms)===0?'first':'second'):'';
      return {[prefix+'Date']:date,[prefix+'Time']:time,[prefix+'Occurrence']:occurrence};
    };
    return ranges.flatMap(r=>{
      let start,end,wall=false;
      try{start=resolve(r.startDate,r.startTime,zone,r.startOccurrence);end=resolve(r.endDate,r.endTime,zone,r.endOccurrence);if(end<=start)return [r];}
      catch{try{start=stamp(civil(r.startDate,r.startTime));end=stamp(civil(r.endDate,r.endTime));if(end<=start)return [r];wall=true;}catch{return [r];}}
      const pieces=subtract([{start,end}],wall?rectangles.map(c=>({start:c.start*60000,end:c.end*60000})):merged);
      return pieces.map((p,i)=>({...r,id:i?nextId():r.id,...(p.start!==start?endpoint(p.start,'start',wall):{}),...(p.end!==end?endpoint(p.end,'end',wall):{})}));
    });
  }
  function selectionState(ranges,zone){
    const intervals=[],drafts=[];
    for(const r of ranges){try{const start=resolve(r.startDate,r.startTime,zone,r.startOccurrence),end=resolve(r.endDate,r.endTime,zone,r.endOccurrence);if(end>start)intervals.push({start,end});}catch{try{const start=stamp(civil(r.startDate,r.startTime)),end=stamp(civil(r.endDate,r.endTime));if(end>start)drafts.push({start,end});}catch{}}}
    return {intervals,drafts};
  }
  function slotSelection(date,time,zone,selection){
    const duration=1800000,segments=[];
    const intersect=(base,interval)=>{const a=Math.max(0,(interval.start-base)/duration),b=Math.min(1,(interval.end-base)/duration);if(b>a)segments.push([a,b]);};
    const starts=candidates(date,time,zone);if(!starts.length)return {selected:false,segments:[],gradient:'none'};
    for(const base of starts)for(const interval of selection.intervals)intersect(base,interval);
    const wall=stamp(civil(date,time));for(const interval of selection.drafts)intersect(wall,interval);
    segments.sort((a,b)=>a[0]-b[0]);const merged=[];
    for(const [start,end] of segments){const last=merged.at(-1);if(last&&start<=last[1])last[1]=Math.max(last[1],end);else merged.push([start,end]);}
    if(!merged.length)return {selected:false,segments:[],gradient:'none'};
    const stops=[];let previous=0;
    for(const [start,end] of merged){if(start>previous)stops.push(`transparent ${(previous*100).toFixed(3)}% ${(start*100).toFixed(3)}%`);stops.push(`#c3d9ed ${(start*100).toFixed(3)}% ${(end*100).toFixed(3)}%`);previous=end;}
    if(previous<1)stops.push(`transparent ${(previous*100).toFixed(3)}% 100%`);
    return {selected:true,segments:merged,gradient:`linear-gradient(to bottom,${stops.join(',')})`};
  }
  // Locate offset changes on the actual timeline, then place them in the
  // appropriate date and wall-clock row of the source calendar.
  function clockChanges(firstDay,source,target){
    const start=stamp(civil(firstDay))-172800000,end=stamp(civil(addDays(firstDay,7)))+172800000,events=[];
    const short=(ms,zone)=>fmt(zone,{timeZoneName:'short'}).formatToParts(ms).find(p=>p.type==='timeZoneName').value;
    for(const [side,zone] of [['source',source],['target',target]]){
      let previous=start,oldOffset=offset(start,zone);
      for(let sample=start+21600000;sample<=end;sample+=21600000){
        const newOffset=offset(sample,zone);
        if(newOffset!==oldOffset){
          let low=previous,high=sample;
          while(high-low>1000){const mid=Math.floor((low+high)/2000)*1000;if(offset(mid,zone)===oldOffset)low=mid;else high=mid;}
          const at=Math.ceil(high/1000)*1000,date=dateKey(at,source),p=parts(at,source);
          if(date>=firstDay&&date<addDays(firstDay,7)){
            const delta=newOffset-oldOffset,amount=Math.abs(delta),shift=(delta>0?'+':'−')+(amount%60===0?amount/60+'h':amount+'m');
            events.push({side,zone,at,date,row:Math.floor((p.hour*60+p.minute)/30),fraction:(p.minute%30+p.second/60)/30,oldOffset,newOffset,oldShort:short(at-1000,zone),newShort:short(at,zone),oldName:zoneName(at-1000,zone),newName:zoneName(at,zone),shift});
          }
        }
        previous=sample;oldOffset=newOffset;
      }
    }
    return events.sort((a,b)=>a.at-b.at||a.side.localeCompare(b.side));
  }
  function axisRows(date,source,target,h24=false){
    return Array.from({length:48},(_,row)=>{
      const wall=String(Math.floor(row/2)).padStart(2,'0')+':'+(row%2?'30':'00'),starts=candidates(date,wall,source),labels=[...new Set(starts.map(ms=>clock(ms,target,h24)))],boundaries=[];
      for(const start of starts){
        const before=dateKey(start-1,target),last=dateKey(start+1800000-1,target);
        if(before===last)continue;
        let delta=0;
        if(dateKey(start,target)===before){let low=0,high=1800000-1;while(high-low>1){const mid=Math.floor((low+high)/2);if(dateKey(start+mid,target)===before)low=mid;else high=mid;}delta=high;}
        const ms=start+delta,key=dateKey(ms,target),fraction=delta/1800000;
        if(!boundaries.some(b=>b.date===key&&Math.abs(b.fraction-fraction)<1e-5))boundaries.push({fraction,date:key,label:fmt(target,{weekday:'short'}).format(ms)+' '+parts(ms,target).day,time:clock(ms,target,h24),title:dateLabel(ms,target)+' · '+clock(ms,target,h24)});
      }
      return {time:wall,labels,boundaries,title:hoverText(date,wall,source,target,h24)};
    });
  }
  const api={parts,stamp,civil,offset,candidates,resolve,dateKey,addDays,clock,dateLabel,zoneName,offsetLabel,zoneLabel,gridRectangle,mergeRanges,eraseRanges,selectionState,slotSelection,clockChanges,axisRows,hoverText,inAwayHours,awaySegments,normalize,describe};
  root.MeetingTime=api;
  if(typeof module!=='undefined') module.exports=api;
})(globalThis);
