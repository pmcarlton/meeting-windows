// Run the actual application bootstrap with saved preferences, without a DOM.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),T=require('./time.js');
const app=fs.readFileSync('app.js','utf8');
const bootstrap=app.slice(app.indexOf('  const T='),app.indexOf('  const defaultCities='));
const execute=new Function('MeetingTime','localStorage','document','window',bootstrap+'\nreturn state;');
const context={window:{}};vm.createContext(context);vm.runInContext(fs.readFileSync('cities.js','utf8'),context);
const cities=Array.from(context.window.CityData).filter(c=>['Kyoto','Sheffield','Tokyo','London','Springfield'].includes(c[0]));
const city=(label,zone)=>{const c=cities.find(c=>c[0]===label&&c[4]===zone);assert.ok(c,label);return {zone,label,lat:c[5],lon:c[6]};};
const kyoto=city('Kyoto','Asia/Tokyo'),sheffield=city('Sheffield','Europe/London');
const base={source:'Asia/Tokyo',sourcePlace:'Kyoto',defaultTimezone:'Asia/Tokyo',defaultPlace:'Kyoto',defaultCity:null,target:'Europe/London',targetPlace:'Sheffield'};
const load=saved=>execute(T,{getItem:()=>JSON.stringify(saved)},{},{CityData:cities});
function assertCities(state){assert.deepEqual(state.sourceCity,kyoto);assert.deepEqual(state.targetCity,sheffield);assert.equal(state.sourcePlace,'Kyoto');assert.equal(state.targetPlace,'Sheffield');}
assertCities(load({...base,sourceCity:kyoto,targetCity:sheffield}));
assertCities(load({...base,sourceCity:null,targetCity:null})); // metadata discarded by older versions
assertCities(load(base)); // older preferences have only labels and timezone IDs
const migrated=load(base);assert.deepEqual(migrated.defaultCity,kyoto);assertCities(load(JSON.parse(JSON.stringify(migrated))));
// A configured label must not prevent reuse of valid coordinates for that city.
assertCities(load({...base,defaultCity:null,defaultPlace:'Kyoto',sourceCity:kyoto,targetCity:sheffield}));
// Respect a configured default timezone instead of last session's temporary city.
const defaultRestored=load({...base,source:'America/New_York',sourcePlace:'Springfield',sourceCity:{zone:'America/New_York',label:'Springfield',lat:42.1,lon:-72.6},defaultCity:kyoto});
assert.deepEqual(defaultRestored.sourceCity,kyoto);assert.equal(defaultRestored.source,'Asia/Tokyo');
// Coordinates from another city or timezone must not contradict the visible label.
assertCities(load({...base,sourceCity:city('Tokyo','Asia/Tokyo'),targetCity:city('London','Europe/London')}));
assertCities(load({...base,sourceCity:sheffield,targetCity:kyoto}));
// Timezone display names alone remain timezone choices, including after reload.
const zonesOnly={source:'Asia/Tokyo',sourcePlace:'Tokyo',defaultTimezone:'Asia/Tokyo',defaultPlace:'Tokyo',defaultCity:null,sourceCity:null,target:'Europe/London',targetPlace:'London',targetCity:null};
const zoneState=load(zonesOnly);assert.equal(zoneState.sourceCity,null);assert.equal(zoneState.defaultCity,null);assert.equal(zoneState.targetCity,null);
assert.equal(load(zoneState).sourceCity,null);
// Actual selected cities that share their names with timezone labels retain metadata.
const explicit=load({...zonesOnly,defaultCity:city('Tokyo','Asia/Tokyo'),sourceCity:city('Tokyo','Asia/Tokyo'),targetCity:city('London','Europe/London')});
assert.equal(explicit.sourceCity.label,'Tokyo');assert.equal(explicit.targetCity.label,'London');
const ambiguous=load({...base,target:'America/New_York',targetPlace:'Springfield',targetCity:null});assert.equal(ambiguous.targetCity,null);
const unknown=load({...base,targetPlace:'Unknown town',targetCity:null});assert.equal(unknown.targetCity,null);
const missingLabels=load({...base,defaultPlace:'',sourcePlace:'',sourceCity:kyoto,targetPlace:'',targetCity:sheffield});assertCities(missingLabels);
console.log('Passed preferences: Kyoto/Sheffield reopening, metadata recovery, repeated reloads, configured defaults, label/zone matching, explicit cities, timezone-only choices, and ambiguous names.');
