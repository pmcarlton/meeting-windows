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
  function zoneName(ms,zone) { return fmt(zone,{timeZoneName:'long'}).formatToParts(ms).find(p=>p.type==='timeZoneName').value; }
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
    const names=[...new Set(endpoints.map(ms=>zoneName(ms,zone)))];
    const years=[...new Set(endpoints.map(ms=>parts(ms,zone).year))];
    const offsetsUsed=new Set(endpoints.map(ms=>offset(ms,zone)));
    const changingOffset=offsetsUsed.size>1;
    const months=['Jan.','Feb.','Mar.','Apr.','May','June','July','Aug.','Sept.','Oct.','Nov.','Dec.'];
    const shortDate=(ms,weekday=false)=>{
      const p=parts(ms,zone);
      return `${weekday?fmt(zone,{weekday:'long'}).format(ms)+' ':''}${months[p.month-1]} ${p.day}${years.length>1?', '+p.year:''}`;
    };
    const shortClock=ms=>{
      const value=clock(ms,zone,h24).replace(/\s/g,'');
      if(!changingOffset)return value;
      const abbreviation=fmt(zone,{timeZoneName:'short'}).formatToParts(ms).find(p=>p.type==='timeZoneName').value;
      // Offset labels distinguish repeated hours when a browser supplies the same abbreviation.
      const distinctShortNames=new Set(endpoints.map(t=>fmt(zone,{timeZoneName:'short'}).formatToParts(t).find(p=>p.type==='timeZoneName').value));
      return `${value} ${distinctShortNames.size>1?abbreviation:offsetLabel(ms,zone)}`;
    };
    const groups=[];
    for(const {start,end} of intervals) {
      const sameDay=dateKey(start,zone)===dateKey(end,zone), sameZone=zoneLabel(start,zone)===zoneLabel(end,zone);
      if(sameDay && sameZone) {
        const key=dateKey(start,zone)+zoneLabel(start,zone), previous=groups.at(-1);
        const range=`${shortClock(start)} to ${shortClock(end)}`;
        if(previous && previous.key===key) previous.ranges.push(range);
        else groups.push({key,label:shortDate(start,true),ranges:[range]});
      } else {
        const a=`${shortDate(start,true)}, ${shortClock(start)}`,b=`${sameDay?'':shortDate(end)+', '}${shortClock(end)}`;
        const text=`${a} to ${b}`;
        groups.push({text});
      }
    }
    const clauses=groups.map((g,i)=>`your ${i===0?'('+names.join(' / ')+') ':''}${g.text || `${g.label}, ${g.ranges.join(' or ')}`}`);
    const yearSuffix=years.length===1?` [${years[0]}]`:'';
    return (list?clauses.map(s=>'• '+s).join('\n'):clauses.join('; or '))+yearSuffix;
  }
  const api={parts,stamp,civil,offset,candidates,resolve,dateKey,addDays,clock,dateLabel,zoneName,offsetLabel,zoneLabel,gridRectangle,hoverText,inAwayHours,awaySegments,normalize,describe};
  root.MeetingTime=api;
  if(typeof module!=='undefined') module.exports=api;
})(globalThis);
