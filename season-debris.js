/* Seasonal drift, silk contact, and weight. All art is drawn on the canvas. */
(function(root){
  'use strict';
  const TAU=Math.PI*2,SEASON_SECONDS=36;
  const seasons=[
    {name:'春 · 花瓣',en:'SPRING',light:'#ffd2de',color:'#df8fa9',dark:'#ad526d',wash:[197,107,138],mass:.38,gravity:22,size:13},
    {name:'夏 · 飞虫',en:'SUMMER',light:'#f1ed9d',color:'#b5d382',dark:'#586937',wash:[136,177,91],mass:1.05,gravity:9,size:11},
    {name:'秋 · 落叶',en:'AUTUMN',light:'#ffcb83',color:'#e88745',dark:'#a43e30',wash:[215,122,64],mass:1.85,gravity:37,size:17},
    {name:'冬 · 冰晶',en:'WINTER',light:'#e8faff',color:'#9bd7f1',dark:'#5f92bd',wash:[103,160,219],mass:1.26,gravity:17,size:12}
  ];
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const lerp=(a,b,t)=>a+(b-a)*t;
  function anchor(edge,t){
    const sag=edge.kind==='ring'?Math.min(3,edge.rest*.055):.35;
    return {x:lerp(edge.a.x,edge.b.x,t),y:lerp(edge.a.y,edge.b.y,t)+2*t*(1-t)*sag};
  }
  function contact(web,x,y,r){
    let best=null,d2=r*r;
    for(const edge of web.edges){
      const {a,b}=edge;
      if(!edge.active||a.fixed||b.fixed||edge.age<1.5||x<Math.min(a.x,b.x)-r||x>Math.max(a.x,b.x)+r||y<Math.min(a.y,b.y)-r-2||y>Math.max(a.y,b.y)+r+2)continue;
      const dx=b.x-a.x,dy=b.y-a.y;
      const t=clamp(((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1),.08,.92);
      const p=anchor(edge,t),d=(x-p.x)**2+(y-p.y)**2;
      if(d<d2){best={edge,t};d2=d;}
    }
    return best;
  }
  class SeasonDebris{
    constructor(seed=8317){
      this.seed=seed;this.index=0;this.elapsed=0;this.clock=0;this.untilSpawn=.25;this.wave=[];this.items=[];this.sparks=[];
      this.loads=new Map();this.stress=new Map();this.fromWash=seasons[0].wash;this.blend=1;
    }
    random(){this.seed=(Math.imul(this.seed,1664525)+1013904223)>>>0;return this.seed/4294967296;}
    get season(){return seasons[this.index];}
    get wash(){return this.season.wash.map((c,i)=>Math.round(lerp(this.fromWash[i],c,this.blend))).join(',');}
    next(){this.fromWash=this.wash.split(',').map(Number);this.blend=0;this.index=(this.index+1)%4;this.elapsed=0;this.wave=[];this.burst(.75);}
    burst(strength=1){
      for(let i=0;i<Math.round(4+strength*5)&&this.wave.length<18;i++)this.wave.push({due:this.clock+i*.135,strength,kind:this.index});
    }
    spawn(web,strength,kind=this.index){
      if(this.items.length>=50)return;
      const r=()=>this.random(),s=seasons[kind],top=r()<.24;
      const size=s.size*(.67+r()*.83)*clamp(web.w/700,.76,1);
      this.items.push({kind,size,mass:s.mass*(.65+r()*.75),x:top?web.w*(.12+r()*.55):-size-12,y:top?-size-12:web.h*(.17+r()*.64),
        vx:45+r()*55+strength*95,vy:13+r()*23,angle:r()*TAU,spin:(r()-.5)*3,phase:r()*TAU,age:0,held:0,holdLimit:14+r()*14,
        catchX:top?0:web.w*(.12+r()*.57),catchable:r()>.13,edge:null,t:0,falling:false});
    }
    release(item){item.edge=null;item.falling=true;item.vx=20+this.random()*35;item.vy=28+this.random()*22;}
    update(dt,web,{catchSilk,snapSilk}={}){
      this.clock+=dt;this.elapsed+=dt;this.blend=Math.min(1,this.blend+dt/3);
      if(this.elapsed>=SEASON_SECONDS)this.next();
      this.untilSpawn-=dt;
      if(this.untilSpawn<=0){this.spawn(web,0);this.untilSpawn=1.15+this.random()*1.7;}
      this.wave=this.wave.filter(event=>{if(event.due>this.clock)return true;this.spawn(web,event.strength,event.kind);return false;});
      const gust=web.gust,masses=new Map();this.loads.clear();
      for(const item of this.items){
        const s=seasons[item.kind];item.age+=dt;
        if(item.edge){
          Object.assign(item,anchor(item.edge,item.t));item.held+=dt;
          if(!item.edge.active||item.held>item.holdLimit)this.release(item);
          else{
            const pulse=item.kind===1?.75+.5*Math.sin(this.clock*24+item.phase):1;
            const mass=item.mass*pulse*(1+gust*.45);
            masses.set(item.edge,(masses.get(item.edge)||0)+mass);
            for(const [node,share] of [[item.edge.a,1-item.t],[item.edge.b,item.t]])this.loads.set(node,(this.loads.get(node)||0)+mass*share*.36);
            continue;
          }
        }
        item.vy+=s.gravity*dt*(item.falling?4:.17);
        const flutter=Math.sin(this.clock*(item.kind===1?10:3)+item.phase);
        const x=item.x,y=item.y;
        item.x+=(item.vx+gust*115+flutter*12)*dt;
        item.y+=(item.vy+flutter*(item.kind===1?60:20))*dt;item.angle+=item.spin*dt;
        if(item.falling||!item.catchable||item.age<.28||item.x<Math.max(12,item.catchX)||item.y<14||item.x>web.w-12||item.y>web.h-14)continue;
        const radius=Math.max(3,item.size*.27),steps=Math.max(1,Math.ceil(Math.hypot(item.x-x,item.y-y)/radius));
        for(let i=1;i<=steps;i++){
          const hit=contact(web,lerp(x,item.x,i/steps),lerp(y,item.y,i/steps),radius);
          if(!hit)continue;
          item.edge=hit.edge;item.t=hit.t;Object.assign(item,anchor(hit.edge,hit.t));
          catchSilk?.(item.x,item.y);break;
        }
      }
      for(const edge of this.stress.keys())if(!masses.has(edge)||!edge.active)this.stress.delete(edge);
      for(const [edge,mass] of masses){
        const fatigue=(this.stress.get(edge)||0)+dt*(mass/1.65)**2*(1+edge.tension*.55);
        this.stress.set(edge,fatigue);
        if(fatigue<2.15||web.broken.length>=10)continue;
        const at=anchor(edge,.5),kind=this.items.find(item=>item.edge===edge)?.kind??this.index;
        web.breakEdge(edge);this.stress.delete(edge);
        for(const item of this.items)if(item.edge===edge)this.release(item);
        for(let i=0;i<9;i++)this.sparks.push({x:at.x,y:at.y,vx:(this.random()-.5)*100,vy:(this.random()-.75)*75,life:.7+this.random()*.35,kind});
        snapSilk?.(at.x,at.y);
      }
      this.items=this.items.filter(item=>item.x<web.w+90&&item.y<web.h+80&&item.age<62);
      for(const s of this.sparks){s.life-=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vy+=35*dt;}
      this.sparks=this.sparks.filter(s=>s.life>0);
    }
    resize(sx,sy){
      for(const i of this.items){i.x*=sx;i.y*=sy;i.catchX*=sx;}
      for(const s of this.sparks){s.x*=sx;s.y*=sy;}
    }
    draw(ctx){
      ctx.save();
      for(const item of this.items){
        const s=seasons[item.kind],at=item.edge?.active?anchor(item.edge,item.t):item;
        if(item.edge?.active){
          const e=item.edge,tension=clamp((this.stress.get(e)||0)/2.15,0,1);
          ctx.strokeStyle=s.light;ctx.globalAlpha=.36+tension*.56;ctx.lineWidth=.8+tension*.8;ctx.shadowColor=s.color;ctx.shadowBlur=3+tension*9;
          ctx.beginPath();ctx.moveTo(e.a.x,e.a.y);ctx.lineTo(at.x,at.y);ctx.lineTo(e.b.x,e.b.y);ctx.stroke();
          ctx.globalAlpha=1;ctx.shadowBlur=0;
        }
        this.drawItem(ctx,item,s,at);
      }
      for(const s of this.sparks){ctx.globalAlpha=Math.min(1,s.life);ctx.fillStyle=seasons[s.kind].light;ctx.beginPath();ctx.arc(s.x,s.y,1.3,0,TAU);ctx.fill();}
      ctx.restore();
    }
    drawItem(ctx,item,s,at){
      const flutter=Math.sin(this.clock*4+item.phase),size=item.size;
      ctx.save();ctx.translate(at.x,at.y);ctx.rotate(item.angle+flutter*(item.edge?.13:.27));
      ctx.scale(size,size);ctx.shadowColor=s.color;ctx.shadowBlur=item.edge?9:4;
      if(item.kind===0){
        ctx.scale(.68+.28*Math.abs(flutter),1);const fill=ctx.createLinearGradient(-.7,-.8,.5,.9);fill.addColorStop(0,s.light);fill.addColorStop(.6,s.color);fill.addColorStop(1,s.dark);
        ctx.fillStyle=fill;ctx.beginPath();ctx.moveTo(0,.8);ctx.bezierCurveTo(-.8,.35,-.79,-.65,-.3,-.8);ctx.quadraticCurveTo(-.08,-.93,0,-.65);ctx.bezierCurveTo(.55,-1.1,.95,-.04,0,.8);ctx.fill();
        ctx.shadowBlur=0;ctx.strokeStyle='#ffe8edaa';ctx.lineWidth=.036;ctx.beginPath();ctx.moveTo(0,.58);ctx.quadraticCurveTo(-.18,.1,-.1,-.55);ctx.stroke();
      }else if(item.kind===1){
        const wing=.42+.35*Math.abs(Math.sin(this.clock*29+item.phase));
        ctx.strokeStyle=s.light;ctx.fillStyle='#d6ebaeaa';ctx.lineWidth=.06;
        for(const side of [-1,1]){ctx.beginPath();ctx.ellipse(side*.44,-.19,wing,.24,side*.52,0,TAU);ctx.fill();ctx.stroke();}
        ctx.fillStyle=s.dark;ctx.beginPath();ctx.ellipse(0,.15,.22,.56,0,0,TAU);ctx.fill();
        ctx.fillStyle=s.light;ctx.beginPath();ctx.arc(0,-.39,.14,0,TAU);ctx.fill();ctx.beginPath();ctx.ellipse(0,.45,.14,.23,0,0,TAU);ctx.fill();
      }else if(item.kind===2){
        const fill=ctx.createLinearGradient(-.65,-.7,.7,.8);fill.addColorStop(0,s.light);fill.addColorStop(.45,s.color);fill.addColorStop(1,s.dark);ctx.fillStyle=fill;
        ctx.beginPath();ctx.moveTo(0,-1);ctx.lineTo(.2,-.39);ctx.lineTo(.6,-.64);ctx.lineTo(.48,-.15);ctx.lineTo(.84,-.14);ctx.lineTo(.51,.22);ctx.lineTo(.67,.42);ctx.lineTo(.17,.67);ctx.lineTo(.04,.98);ctx.lineTo(-.04,.99);ctx.lineTo(-.03,.65);ctx.lineTo(-.62,.5);ctx.lineTo(-.46,.23);ctx.lineTo(-.8,-.05);ctx.lineTo(-.42,-.13);ctx.lineTo(-.59,-.56);ctx.lineTo(-.17,-.37);ctx.closePath();ctx.fill();
        ctx.shadowBlur=0;ctx.strokeStyle='#ffe1a7a0';ctx.lineWidth=.04;ctx.beginPath();ctx.moveTo(0,.66);ctx.lineTo(0,-.83);for(const side of [-1,1]){ctx.moveTo(0,.44);ctx.lineTo(side*.55,.08);ctx.moveTo(0,.1);ctx.lineTo(side*.37,-.33);}ctx.stroke();
      }else{
        ctx.strokeStyle=s.light;ctx.lineWidth=.064;ctx.lineCap='round';
        for(let j=0;j<6;j++){ctx.rotate(TAU/6);ctx.beginPath();ctx.moveTo(0,0);ctx.lineTo(0,-.94);for(const h of [.47,.71]){ctx.moveTo(-.18,-h-.15);ctx.lineTo(0,-h);ctx.lineTo(.18,-h-.15);}ctx.stroke();}
        ctx.fillStyle=s.color;ctx.beginPath();ctx.arc(0,0,.14,0,TAU);ctx.fill();
      }
      ctx.restore();
    }
  }
  root.SeasonDebris=SeasonDebris;
  if(typeof module!=='undefined')module.exports={SeasonDebris,SEASON_SECONDS};
})(typeof window!=='undefined'?window:globalThis);
