// Exercise the actual rendering/copy handlers with clipboard success and failure.
const assert=require('node:assert/strict'),fs=require('node:fs'),T=require('./time.js');
const app=fs.readFileSync('app.js','utf8');
const render=app.slice(app.indexOf("  let myOutput="),app.indexOf("  $('output-style').value=state.style"));
const copy=app.slice(app.indexOf('  async function copyAvailability('),app.indexOf("  $('copy').onclick="));
assert.ok(render.includes('function renderOutput'));assert.ok(copy.includes('async function copyAvailability'));
const create=new Function('T','state','$','navigator','document','const escape=String;\n'+render+'\n'+copy+'\nreturn {renderOutput,copyAvailability};');
function harness(clipboard,legacyCopy=false){
  const elements=new Map(),$=id=>{if(!elements.has(id))elements.set(id,{value:'',textContent:'',innerHTML:'',hidden:true,disabled:false,focus(){this.focused=true;},select(){this.selected=true;}});return elements.get(id);};
  const state={source:'Asia/Tokyo',target:'America/Los_Angeles',style:'sentence',h24:false,ranges:[{startDate:'2026-10-21',startTime:'09:00',endDate:'2026-10-21',endTime:'09:30'},{startDate:'2026-10-22',startTime:'10:00',endDate:'2026-10-22',endTime:'11:00'}]};
  const api=create(T,state,$,{clipboard},{execCommand:()=>legacyCopy});api.renderOutput();return {...api,state,$};
}
(async()=>{
  const writes=[],ui=harness({writeText:async text=>writes.push(text)});
  assert.equal(ui.$('copy').disabled,false);assert.equal(ui.$('copy-my').disabled,false);
  await ui.copyAvailability('source');
  assert.equal(writes.at(-1),'my (Japan Standard Time) Wednesday Oct. 21, 9am to 9:30am; or my Thursday Oct. 22, 10am to 11am [2026]');
  assert.equal(ui.$('copy-status').textContent,'My times copied.');
  const theirOutput=ui.$('output').value;assert.match(theirOutput,/your \(Pacific Daylight Time\) Tuesday Oct\. 20/);
  await ui.copyAvailability('target');assert.equal(writes.at(-1),theirOutput);assert.equal(ui.$('output').value,theirOutput);
  ui.state.style='list';ui.state.h24=true;ui.renderOutput();await ui.copyAvailability('source');
  assert.equal(writes.at(-1),'• my (Japan Standard Time) Wednesday Oct. 21, 09:00 to 09:30\n• my Thursday Oct. 22, 10:00 to 11:00 [2026]');
  await ui.copyAvailability('target');assert.equal(writes.at(-1),ui.$('output').value);assert.ok(writes.at(-1).startsWith('• your '));
  const before=writes.length;ui.state.ranges=[];ui.renderOutput();assert.equal(ui.$('copy').disabled,true);assert.equal(ui.$('copy-my').disabled,true);await ui.copyAvailability('source');assert.equal(writes.length,before);
  ui.state.ranges=[{startDate:'2026-10-21',startTime:'11:00',endDate:'2026-10-21',endTime:'09:00'}];ui.renderOutput();assert.equal(ui.$('error').hidden,false);assert.equal(ui.$('copy').disabled,true);assert.equal(ui.$('copy-my').disabled,true);
  const fallback=harness({writeText:async()=>{throw Error('Denied');}});
  await fallback.copyAvailability('source');assert.equal(fallback.$('copy-fallback').hidden,false);assert.ok(fallback.$('copy-fallback-text').value.startsWith('my (Japan Standard Time)'));
  assert.equal(fallback.$('copy-fallback-label').textContent,'My available times (Asia/Tokyo)');assert.equal(fallback.$('copy-fallback-text').selected,true);assert.match(fallback.$('copy-status').textContent,/My times selected/);
  await fallback.copyAvailability('target');assert.equal(fallback.$('copy-fallback-text').value,fallback.$('output').value);assert.equal(fallback.$('copy-fallback-label').textContent,'Their available times (America/Los_Angeles)');
  const legacy=harness(undefined,true);await legacy.copyAvailability('source');assert.equal(legacy.$('copy-fallback').hidden,true);assert.equal(legacy.$('copy-status').textContent,'My times copied.');
  console.log('Passed copy: My/Their local dates, sentence/list and 12/24-hour formats, unchanged recipient preview, disabled empty/invalid ranges, clipboard writes, and correctly labeled manual fallback.');
})().catch(error=>{console.error(error);process.exitCode=1;});
