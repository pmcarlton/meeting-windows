(function(root){
  'use strict';
  const DEG=Math.PI/180,RADIUS=1440/(2*Math.PI),K=2.12;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const wrap=lon=>((lon+180)%360+360)%360-180;
  function raw(lon,lat){return [lon,Math.tanh(K*lat)/K];}
  raw.invert=(x,y)=>[x,Math.atanh(clamp(K*y,-Math.tanh(K*Math.PI/2),Math.tanh(K*Math.PI/2)))/K];
  function camera(projection,center,zoom,width,height){return projection.rotate([-center.lon,-center.lat,0]).scale(RADIUS*zoom).translate([width/2,height/2]);}
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
  const api={DEG,RADIUS,K,raw,camera,decode,anchored,wrap,clamp};root.MeetingFocusProjection=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
