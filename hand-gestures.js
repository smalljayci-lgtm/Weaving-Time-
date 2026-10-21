/* Hand landmark interpretation, independent of the camera and renderer. */
(function(root){
  'use strict';
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  class HandGestures{
    constructor(callbacks={}){this.callbacks=callbacks;this.nextId=0;this.reset();}
    reset(){this.tracks=[];this.lastTime=0;this.twoPinching=false;}
    emit(type,data){this.callbacks[type]?.(data);}
    clear(){for(const t of this.tracks)if(t.pinch)this.emit('cancel',{id:t.id});if(this.twoPinching)this.emit('stretchEnd');this.reset();this.emit('hands',[]);}
    update(result,now){
      const dt=Math.min(.15,Math.max(.01,(now-this.lastTime)/1000||.066));this.lastTime=now;
      const old=this.tracks,used=new Set(),next=[];
      const landmarks=result.landmarks||[];
      for(let i=0;i<Math.min(2,landmarks.length);i++){
        const lm=landmarks[i];if(lm.length<21)continue;
        const wrist={x:1-lm[0].x,y:lm[0].y},tip={x:1-lm[8].x,y:lm[8].y};
        const label=result.handedness?.[i]?.[0]?.categoryName||'';
        let prior=old.find(t=>!used.has(t.id)&&label&&t.label===label);
        if(!prior)prior=old.filter(t=>!used.has(t.id)).sort((a,b)=>distance(a.wrist,wrist)-distance(b.wrist,wrist))[0];
        if(prior&&distance(prior.wrist,wrist)>.5)prior=null;
        if(prior)used.add(prior.id);
        const alpha=1-Math.exp(-dt*13);
        const smooth=prior?{x:prior.point.x+(tip.x-prior.point.x)*alpha,y:prior.point.y+(tip.y-prior.point.y)*alpha}:tip;
        // Aspect-correct distances; hysteresis separates pinch and release.
        const metric=(a,b)=>Math.hypot((a.x-b.x)*4/3,a.y-b.y);
        const ratio=metric(lm[4],lm[8])/Math.max(.025,metric(lm[0],lm[9]));
        const pinch=prior?.pinch?ratio<.48:ratio<.28;
        const t={id:prior?.id??this.nextId++,label,wrist,point:smooth,pinch,wasPinch:!!prior?.pinch,consumed:!!prior?.consumed,landmarks:lm};
        next.push(t);
      }
      for(const t of old)if(!next.some(n=>n.id===t.id)&&t.pinch)this.emit('cancel',{id:t.id});
      this.tracks=next;
      const both=next.length===2&&next.every(t=>t.pinch);
      if(both){
        if(!this.twoPinching){for(const t of next){t.consumed=true;this.emit('cancel',{id:t.id});}this.emit('stretchStart',next);}
        this.twoPinching=true;this.emit('stretchMove',next);
      }else{
        if(this.twoPinching){this.emit('stretchEnd');for(const t of next)t.consumed=true;this.twoPinching=false;}
        for(const t of next){
          if(t.pinch&&!t.wasPinch&&!t.consumed)this.emit('pinchStart',t);
          if(t.pinch&&!t.consumed)this.emit('pinchMove',t);
          if(!t.pinch&&t.wasPinch&&!t.consumed)this.emit('pinchEnd',t);
          if(!t.pinch)t.consumed=false;
        }
        if(next.length&&next.every(t=>!t.pinch&&!t.wasPinch))this.emit('guide',next.reduce((a,b)=>a.id<b.id?a:b));
      }
      this.emit('hands',next);
    }
  }
  root.HandGestures=HandGestures;
  if(typeof module!=='undefined')module.exports={HandGestures};
})(typeof window!=='undefined'?window:globalThis);
