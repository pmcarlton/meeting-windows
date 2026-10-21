const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{}};vm.createContext(context);
for(const file of ['vendor/d3-array.min.js','vendor/d3-geo.min.js','map-data.js','focus-projection.js'])vm.runInContext(fs.readFileSync('./'+file,'utf8'),context);
const d3=context.d3,P=context.MeetingFocusProjection,projection=d3.geoProjection(P.raw).precision(.4);
for(let lat=-90;lat<=90;lat+=.5){const point=P.raw(.7,lat*P.DEG),inverse=P.raw.invert(...point);assert.ok(Math.abs(inverse[1]/P.DEG-lat)<1e-7);}
const epsilon=1e-5,vertical=(P.raw(0,epsilon)[1]-P.raw(0,-epsilon)[1])/(2*epsilon);
assert.ok(Math.abs(vertical-1)<1e-8);
for(const lat of [.2,.5,1])assert.ok((P.raw(0,lat+epsilon)[1]-P.raw(0,lat-epsilon)[1])/(2*epsilon)<vertical);
for(const center of [{lon:10.746,lat:59.913},{lon:-68.3,lat:-54.8},{lon:0,lat:90},{lon:179.99,lat:-90},{lon:-179.99,lat:0}]){
  P.camera(projection,center,2,1200,256);const p=projection([center.lon,center.lat]);assert.ok(Math.abs(p[0]-600)<1e-7&&Math.abs(p[1]-128)<1e-7);
  if(Math.abs(center.lat)<85){
    const north=projection([center.lon,center.lat+.0001]),east=projection([center.lon+.0001/Math.cos(center.lat*P.DEG),center.lat]);
    assert.ok(Math.abs(Math.hypot(north[0]-p[0],north[1]-p[1])/Math.hypot(east[0]-p[0],east[1]-p[1])-1)<.0001);
    const screen=[640,150],geographic=projection.invert(screen),local=P.raw.invert((screen[0]-600)/(P.RADIUS*2.8),-(screen[1]-128)/(P.RADIUS*2.8)),next=P.anchored(center,geographic,local);
    assert.ok(next);P.camera(projection,next,2.8,1200,256);const after=projection(geographic);assert.ok(Math.hypot(after[0]-screen[0],after[1]-screen[1])<1e-6);
  }
}
const geometries=context.window.MapData.regions.map(([zone,path])=>({zone,geometry:P.decode(path,d3)}));
for(const {zone,geometry} of geometries){assert.ok(d3.geoArea(geometry)<2*Math.PI,zone+' must not cover the world');}
for(const [point,zone] of [[[139.76,35.69],'Asia/Tokyo'],[[-150,0],'Etc/GMT+10'],[[-100,40],'America/Chicago']])assert.equal(Array.from(geometries.filter(g=>d3.geoContains(g.geometry,point)),g=>g.zone).join(','),zone);
const path=d3.geoPath(projection).digits(1);
for(const lat of [-90,-54.8,0,59.913,90]){P.camera(projection,{lon:lat?10.746:179.9,lat},1,1200,256);for(const {zone,geometry} of geometries){const value=path(geometry);assert.ok(!value||!/(NaN|Infinity)/.test(value),zone);}}
console.log('Passed focus: invertibility, peak center scale, local shape proportions, both polar centers, zoom anchors, polygon winding, region containment, seam/pole rendering.');
