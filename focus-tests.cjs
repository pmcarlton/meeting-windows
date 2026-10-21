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

// An aligned shorter great-circle arc must be horizontal along its entire
// length, centered at its spherical midpoint, and ordered My -> Their.
const cityPairs=[
  [[35.676,139.65],[34.05,-118.24]], // Tokyo / Los Angeles, crossing the date line
  [[59.913,10.746],[-54.8,-68.3]], // Oslo / Ushuaia, substantial roll
  [[45,0],[45,180]], // midpoint at the North Pole
  [[-45,0],[-45,180]], // midpoint at the South Pole
  [[90,0],[-25,140]], // endpoint at a pole
  [[0,179],[0,-179]], // use the short date-line crossing, not 358 degrees
  [[10,0],[-10,179.999]], // almost opposite, still a unique arc
  [[35.68,139.69],[35.681,139.691]] // nearby distinct cities
];
for(let i=0;i<80;i++)cityPairs.push([[Math.sin(i*2.1)*89,Math.sin(i*1.7)*180],[Math.cos(i*.7)*89,Math.cos(i*2.7)*180]]);
for(const [a,b] of cityPairs){
  const result=P.alignment(a,b);assert.ok(result.available);
  for(const width of [340,1200]){
    const zoom=Math.min(4,(width-64)/(P.RADIUS*result.angle));P.camera(projection,result.center,zoom,width,256);
    const start=projection([a[1],a[0]]),end=projection([b[1],b[0]]);
    assert.ok(start[0]>=32-1e-5&&end[0]<=width-32+1e-5);assert.ok(start[0]<end[0]);
    assert.ok(Math.abs((start[0]+end[0])/2-width/2)<1e-5);
    const arc=d3.geoInterpolate([a[1],a[0]],[b[1],b[0]]);
    for(let step=0;step<=20;step++)assert.ok(Math.abs(projection(arc(step/20))[1]-128)<1e-5);
    // Pointer-anchored zoom must unroll the local coordinates before using
    // the north-up solver, then retain the roll on the new camera.
    const screen=[width/2+12,134],point=projection.invert(screen),nextZoom=zoom*1.2;
    const local=P.raw.invert((screen[0]-width/2)/(P.RADIUS*nextZoom),-(screen[1]-128)/(P.RADIUS*nextZoom));
    const unrolled=d3.geoRotation([0,0,result.center.roll]).invert(local.map(x=>x/P.DEG)).map(x=>x*P.DEG);
    const next=P.anchored(result.center,point,unrolled);
    if(next){P.camera(projection,{...next,roll:result.center.roll},nextZoom,width,256);assert.ok(Math.hypot(...projection(point).map((x,i)=>x-screen[i]))<1e-5);}
  }
}
for(const [a,b] of [[null,[0,0]],[[0,0],null],[[NaN,0],[0,0]],[[91,0],[0,0]],[[0,0],[0,0]],[[45,25],[-45,-155]],[[90,10],[90,90]]])assert.equal(P.alignment(a,b).available,false);
console.log('Passed city alignment: shorter arcs, midpoint, horizontal samples, date line, poles, near antipodes, narrow-screen fit, rolled zoom anchors, invalid/ambiguous pairs.');
