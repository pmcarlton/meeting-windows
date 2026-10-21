(function(root){
  'use strict';
  const DEG=Math.PI/180,RADIUS=1440/(2*Math.PI),K=2.12;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const wrap=lon=>((lon+180)%360+360)%360-180;
  function raw(lon,lat){return [lon,Math.tanh(K*lat)/K];}
  raw.invert=(x,y)=>[x,Math.atanh(clamp(K*y,-Math.tanh(K*Math.PI/2),Math.tanh(K*Math.PI/2)))/K];
  function camera(projection,center,zoom,width,height){return projection.rotate([-center.lon,-center.lat,center.roll||0]).scale(RADIUS*zoom).translate([width/2,height/2]);}
  // The midpoint of the shorter arc becomes the camera center. Rotate its
  // tangent to latitude 0, choosing the half-turn that keeps the North Pole
  // above the arc. City order may reverse; a meridional arc puts the pole on it.
  function alignment(a,b){
    const valid=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
    if(!valid(a)||!valid(b))return {available:false,reason:'Choose a city for both My timezone and Their timezone.'};
    const vector=([lat,lon])=>[Math.cos(lat*DEG)*Math.cos(lon*DEG),Math.cos(lat*DEG)*Math.sin(lon*DEG),Math.sin(lat*DEG)];
    const u=vector(a),v=vector(b),sum=u.map((x,i)=>x+v[i]),length=Math.hypot(...sum);
    if(length<1e-6)return {available:false,reason:'Opposite cities do not define a unique shorter great-circle arc.'};
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],sine=Math.hypot(...cross);
    if(sine<1e-7)return {available:false,reason:'These cities are too close to define an alignment.'};
    const m=sum.map(x=>x/length),lon=Math.atan2(m[1],m[0]),lat=Math.atan2(m[2],Math.hypot(m[0],m[1]));
    const east=-Math.sin(lon)*v[0]+Math.cos(lon)*v[1];
    const north=-Math.sin(lat)*Math.cos(lon)*v[0]-Math.sin(lat)*Math.sin(lon)*v[1]+Math.cos(lat)*v[2];
    let roll=Math.atan2(-north,east)/DEG;
    if(roll>90)roll-=180;else if(roll< -90)roll+=180;
    // At the meridian tie either orientation is equally northward. Snap to a
    // consistent choice so swapping cities cannot flip the view due to rounding.
    if(Math.abs(Math.abs(roll)-90)<1e-9)roll=-90;
    return {available:true,center:{lon:lon/DEG,lat:lat/DEG,roll},angle:Math.atan2(sine,u.reduce((sum,x,i)=>sum+x*v[i],0))};
  }
  function decode(path,d3){
    const rings=path.split('M').slice(1).map(part=>{
      const xy=[...part.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(m=>[+m[1],+m[2]]);
      const signed=xy.reduce((sum,p,i)=>{const q=xy[(i+1)%xy.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
      const ring=xy.map(([x,y])=>[x/4-180,Math.asin(clamp((Math.sin(84*DEG)*108+22-y)/108,-1,1))/DEG]);
      return {ring,signed};
    }).filter(r=>r.ring.length>=4&&Math.abs(r.signed)>1e-7);
    const largest=rings.reduce((a,b)=>Math.abs(a.signed)>Math.abs(b.signed)?a:b,{signed:0}),polygons=[];
    for(const {ring,signed} of rings){
      const outer=Math.sign(signed)===Math.sign(largest.signed),small=d3.geoArea({type:'Polygon',coordinates:[ring]})<2*Math.PI;
      if((outer&&!small)||(!outer&&small))ring.reverse();
      if(outer||!polygons.length)polygons.push([ring]);else polygons.at(-1).push(ring);
    }
    return {type:'MultiPolygon',coordinates:polygons};
  }
  // Solve the north-up camera that keeps a geographic point under a screen anchor.
  function anchored(center,point,local){
    const phi=point[1]*DEG,lambda=point[0]*DEG,lr=local[0],pr=local[1];
    const x=Math.cos(pr)*Math.sin(lr),y=Math.sin(pr),z=Math.cos(pr)*Math.cos(lr),c=Math.cos(phi);
    if(Math.abs(c)<1e-8||Math.abs(x/c)>1)return null;
    const delta=Math.asin(clamp(x/c,-1,1)),options=[];
    for(const d of [delta,Math.PI-delta]){
      let lat=(Math.atan2(Math.sin(phi),c*Math.cos(d))-Math.atan2(y,z))/DEG;lat=wrap(lat);
      if(lat < -90.00001||lat>90.00001)continue;
      const lon=wrap((lambda-d)/DEG),cost=(wrap(lon-center.lon)*Math.max(.05,Math.cos(center.lat*DEG)))**2+(lat-center.lat)**2;
      options.push({lon,lat:clamp(lat,-90,90),cost});
    }
    options.sort((a,b)=>a.cost-b.cost);return options[0]||null;
  }
  const api={DEG,RADIUS,K,raw,camera,alignment,decode,anchored,wrap,clamp};root.MeetingFocusProjection=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
