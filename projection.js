(function(root){
  'use strict';
  const HALF=108,CENTER=Math.sin(84*Math.PI/180)*HALF+22,RAD=Math.PI/180;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function y(lat,blend=0){const p=clamp(lat,-90,90)*RAD;return CENTER-HALF+HALF*((1-blend)*(1-Math.sin(p))+blend*(Math.PI/2-p));}
  const height=blend=>240+216*(Math.PI/2-1)*blend;
  function latitude(value,blend=0){
    if(!blend)return Math.asin(clamp((CENTER-value)/HALF,-1,1))/RAD;
    let low=-90,high=90;for(let i=0;i<36;i++){const mid=(low+high)/2;if(y(mid,blend)>value)low=mid;else high=mid;}return (low+high)/2;
  }
  function amount(zoom,mode='adaptive'){
    if(mode==='equal-area')return 0;
    const t=clamp((zoom-1)/2,0,1),smooth=t*t*(3-2*t);
    return smooth;
  }
  function compile(paths){
    const values=[],indices=new Map();let vertexCount=0;
    const compiled=paths.map(original=>{
      const chunks=[],ys=[];let cursor=0;
      for(const m of original.matchAll(/([ML])(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)){
        chunks.push(original.slice(cursor,m.index)+m[1]+m[2]+',');cursor=m.index+m[0].length;
        const base=+m[3];if(!indices.has(base)){indices.set(base,values.length);const linear=y(latitude(base),1);values.push([base,linear-base]);}
        ys.push(indices.get(base));vertexCount++;
      }
      chunks.push(original.slice(cursor));return {original,chunks,ys};
    });
    let previous=-1,result=[];
    return {vertexCount,uniqueLatitudes:values.length,project(blend){
      if(blend===previous)return result;
      const table=values.map(([base,delta])=>(base+blend*delta).toFixed(1));
      result=compiled.map(({original,chunks,ys})=>{
        if(!blend)return original;
        const pieces=new Array(ys.length*2+1);for(let i=0;i<ys.length;i++){pieces[2*i]=chunks[i];pieces[2*i+1]=table[ys[i]];}pieces[pieces.length-1]=chunks.at(-1);return pieces.join('');
      });previous=blend;return result;
    }};
  }
  const api={y,height,latitude,amount,compile};root.MeetingProjection=api;if(typeof module!=='undefined')module.exports=api;
})(globalThis);
