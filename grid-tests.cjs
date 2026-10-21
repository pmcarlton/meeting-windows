// Exercise the application's actual grid commit path, including its civil-time
// helpers. No browser or package installation is needed for this regression.
const assert=require('node:assert/strict'),fs=require('node:fs'),T=require('./time.js');
const app=fs.readFileSync('app.js','utf8');
const helpers=app.slice(app.indexOf('  function monday('),app.indexOf('  const shadingCache'));
const commit=app.slice(app.indexOf('  function commitDrag('),app.indexOf("  document.addEventListener('pointerup'"));
const execute=new Function('T','initial','zone','start','end','erase',`
  const state={ranges:initial.map(r=>({...r})),source:zone};let idCounter=1000,drag={start,end,erase},output='',remembered=false;
  const cloneRanges=()=>state.ranges.map(r=>({...r}));
  function mergeRanges(){state.ranges=T.mergeRanges(state.ranges,state.source);}
  function remember(){remembered=true;}
  function update(){output=T.describe(T.normalize(state.ranges,state.source),'UTC');}
  ${helpers}\n${commit}
  commitDrag();return {ranges:state.ranges,output,remembered};
`);
const serial=(date,time)=>T.stamp(T.civil(date,time))/60000;
const run=(ranges,date,a,b=a,erase=false,zone='UTC',endDate=date)=>execute(T,ranges,zone,serial(date,a),serial(endDate,b),erase);
const first=run([],'2026-10-21','09:00');assert.equal(first.ranges.length,1);assert.equal(first.ranges[0].endTime,'09:30');assert.match(first.output,/9am to 9:30am/);assert.equal(first.remembered,true);
const second=run(first.ranges,'2026-10-22','11:00');assert.equal(second.ranges.length,2);assert.match(second.output,/Oct\. 21/);assert.match(second.output,/Oct\. 22/);
const adjacent=run(second.ranges,'2026-10-21','09:30');assert.equal(adjacent.ranges.length,2);assert.equal(adjacent.ranges[0].endTime,'10:00');
const rectangle=run([],'2026-10-21','09:00','10:30',false,'UTC','2026-10-23');assert.equal(rectangle.ranges.length,3);for(const r of rectangle.ranges){assert.equal(r.startTime,'09:00');assert.equal(r.endTime,'11:00');}
const erased=run(adjacent.ranges,'2026-10-21','09:00','09:00',true);assert.equal(erased.ranges.length,2);assert.equal(erased.ranges[0].startTime,'09:30');assert.match(erased.output,/Oct\. 22/);
const skipped=run([],'2026-03-08','01:30','03:00',false,'America/Los_Angeles');assert.equal(skipped.ranges.length,1);assert.equal(skipped.ranges[0].endTime,'03:30');
console.log('Passed grid commits: fresh clicks generate text, later selections retain earlier windows, adjacent merging, rectangular dragging, erasing, and skipped-hour selection.');
