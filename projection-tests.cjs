const assert=require('node:assert/strict'),P=require('./projection.js');
for(const blend of [0,.1,.5,.9,1]){
  let previous=Infinity;
  for(let lat=-90;lat<=90;lat+=.5){const y=P.y(lat,blend);assert.ok(y<previous);previous=y;assert.ok(Math.abs(P.latitude(y,blend)-lat)<1e-6);}
  assert.ok(Math.abs(P.y(90,blend)-P.y(90,0))<1e-9);
  assert.ok(Math.abs((P.y(-90,blend)-P.y(-90,0))-(P.height(blend)-P.height(0)))<1e-9);
}
assert.equal(P.amount(1,'adaptive'),0);assert.equal(P.amount(3,'adaptive'),1);
assert.equal(P.amount(4,'equal-area'),0);assert.equal(P.amount(1,'adaptive'),0);
const original='M10,21.4L20,129.4L30,237.4ZM10,76.3L25,129.4Z',compiled=P.compile([original]);
assert.equal(compiled.project(0)[0],original);assert.equal(compiled.vertexCount,5);
for(const blend of [.2,.5,1]){const result=compiled.project(blend)[0];const from=[...original.matchAll(/([ML])([\d.]+),([\d.]+)/g)],to=[...result.matchAll(/([ML])([\d.]+),([\d.]+)/g)];assert.equal(to.length,from.length);from.forEach((m,i)=>{assert.equal(to[i][2],m[2]);assert.ok(Math.abs(+to[i][3]-P.y(P.latitude(+m[3]),blend))<=.051);});}
// Screen anchor stays at the same latitude through nonlinear zoom, unless scroll limits clamp it.
for(const lat of [-70,0,65]){const oldBlend=.2,newBlend=.9,oldZoom=1.4,newZoom=2.7,screenY=100;const oldScroll=P.y(lat,oldBlend)*oldZoom-screenY,recovered=P.latitude((oldScroll+screenY)/oldZoom,oldBlend),newScroll=P.y(recovered,newBlend)*newZoom-screenY;assert.ok(Math.abs(P.y(lat,newBlend)*newZoom-newScroll-screenY)<1e-6);}
console.log('Passed projection: monotonicity, polar bounds, inverse and anchor accuracy, path vertices.');

assert.ok(Math.abs((P.y(59,1)-P.y(60,1))/(P.y(59,0)-P.y(60,0))-1/Math.cos(59.5*Math.PI/180))<.001);
