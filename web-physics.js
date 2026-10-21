/* Verlet nodes and distance constraints. Shared by the renderer and physics checks. */
(function(root){
  'use strict';
  class SilkWeb {
    constructor(width,height,seed=17){this.w=width;this.h=height;this.seed=seed;this.nodes=[];this.edges=[];this.broken=[];this.gust=0;this.clock=0;this.build();}
    random(){this.seed=(this.seed*1664525+1013904223)>>>0;return this.seed/4294967296;}
    addNode(x,y,fixed=false){const n={x,y,px:x,py:y,ox:x,oy:y,fixed,id:this.nodes.length,adj:[]};this.nodes.push(n);return n;}
    connect(a,b,kind='ring'){const e={a,b,rest:Math.hypot(a.x-b.x,a.y-b.y),kind,active:true,age:999,tension:0,id:this.edges.length};a.adj.push(e);b.adj.push(e);this.edges.push(e);return e;}
    build(){
      const mobile=this.w<650;this.cx=this.w*(mobile?.53:.55);this.cy=this.h*.43;
      const spokes=30,rings=29;this.spokes=spokes;this.rings=rings;
      const center=this.addNode(this.cx,this.cy);this.center=center;
      const angles=[],reach=[];
      for(let j=0;j<spokes;j++){angles.push(j/spokes*Math.PI*2-.4+(this.random()-.5)*.045);reach.push(.90+this.random()*.18+.09*Math.sin(j*1.7));}
      let prev=null;
      for(let r=1;r<=rings;r++){
        const row=[];
        for(let j=0;j<spokes;j++){
          const t=r/rings,angle=angles[j]+Math.sin(t*4+j*.65)*.022*t;
          const radius=Math.pow(t,1.07)*reach[j];
          const rx=this.w*(mobile?1.02:.88),ry=this.h*1.02;
          const x=this.cx+Math.cos(angle)*rx*radius+(this.random()-.5)*2.4*t;
          const y=this.cy+Math.sin(angle)*ry*radius+Math.sin(angle*2+t*2)*22*t+(this.random()-.5)*2.4*t;
          const n=this.addNode(x,y,r===rings);n.ring=r;n.spoke=j;row.push(n);
          this.connect(prev?prev[j]:center,n,'radial');
        }
        for(let j=0;j<spokes;j++)this.connect(row[j],row[(j+1)%spokes]);
        prev=row;
      }
    }
    nearest(x,y,maxDistance=38){let chosen=null,best=maxDistance*maxDistance;for(const n of this.nodes){if(n.fixed)continue;const d=(n.x-x)**2+(n.y-y)**2;if(d<best){best=d;chosen=n;}}return chosen;}
    breakEdge(e){if(!e.active)return;e.active=false;e.age=0;this.broken.push(e);const dx=(e.b.x-e.a.x)*.06,dy=(e.b.y-e.a.y)*.06;if(!e.a.fixed){e.a.px-=dx;e.a.py-=dy;}if(!e.b.fixed){e.b.px+=dx;e.b.py+=dy;}}
    repair(e){if(e.active)return;e.active=true;e.age=0;this.broken=this.broken.filter(b=>b!==e);}
    blow(strength=1){this.gust=Math.max(.35,Math.min(1.4,strength));}
    step(dt,drag=null,allowTearing=true){
      const speed=Math.min(dt,1.5);this.clock+=speed/60;
      const grabs=Array.isArray(drag)?drag:drag?[drag]:[];
      const gust=this.gust;this.gust=Math.max(0,this.gust-.009*speed);
      for(const n of this.nodes){
        if(n.fixed)continue;
        let vx=(n.x-n.px)*Math.pow(.955,speed),vy=(n.y-n.py)*Math.pow(.955,speed);
        n.px=n.x;n.py=n.y;
        const wave=Math.sin(n.oy*.009-this.clock*3);
        n.x+=vx+((n.ox-n.x)*.0014+Math.sin(this.clock*.7+n.oy*.007)*.004+gust*(.9+wave*.4))*speed*speed;
        n.y+=vy+((n.oy-n.y)*.0014+.018+gust*Math.sin(n.ox*.006-this.clock*3)*.3)*speed*speed;
      }
      let torn=0;
      if(allowTearing){
        for(const grab of grabs)for(const e of grab.node.adj){if(e.active&&Math.hypot(grab.x-(e.a===grab.node?e.b.x:e.a.x),grab.y-(e.a===grab.node?e.b.y:e.a.y))>Math.max(e.rest*3.4,100)&&torn<2){this.breakEdge(e);torn++;}}
      }
      if(allowTearing&&gust>.85&&this.broken.length<12&&this.random()<.12*speed){
        const candidates=this.edges.filter(e=>e.active&&!e.a.fixed&&!e.b.fixed&&e.a.ring>6&&e.a.ring<22);
        if(candidates.length)this.breakEdge(candidates[Math.floor(this.random()*candidates.length)]);
      }
      for(let iteration=0;iteration<5;iteration++){
        for(const e of this.edges){
          if(!e.active)continue;const dx=e.b.x-e.a.x,dy=e.b.y-e.a.y,dist=Math.hypot(dx,dy)||.0001;
          const diff=(dist-e.rest)/dist;const stiffness=e.kind==='radial'?.72:.58;
          const correction=diff*stiffness/(e.a.fixed||e.b.fixed?1:2);
          if(!e.a.fixed){e.a.x+=dx*correction;e.a.y+=dy*correction;}
          if(!e.b.fixed){e.b.x-=dx*correction;e.b.y-=dy*correction;}
          e.tension=Math.max(0,Math.min(1,(dist/e.rest-1)*4));
        }
        for(const grab of grabs){grab.node.x+=(grab.x-grab.node.x)*.6;grab.node.y+=(grab.y-grab.node.y)*.6;}
      }
      for(const e of this.edges)e.age+=speed/60;
    }
    get integrity(){return (this.edges.length-this.broken.length)/this.edges.length;}
    route(from,to){
      if(from===to)return[];const queue=[from],seen=new Set([from.id]),previous=new Map();let found=false;
      for(let i=0;i<queue.length;i++){const n=queue[i];if(n===to){found=true;break;}for(const e of n.adj){if(!e.active)continue;const next=e.a===n?e.b:e.a;if(!seen.has(next.id)){seen.add(next.id);previous.set(next.id,n);queue.push(next);}}}
      if(!found)return null;const result=[];let n=to;while(n!==from){result.unshift(n);n=previous.get(n.id);}return result;
    }
  }
  root.SilkWeb=SilkWeb;
  if(typeof module!=='undefined')module.exports={SilkWeb};
})(typeof window!=='undefined'?window:globalThis);
