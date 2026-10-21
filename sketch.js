/* Weaving Time — first study: silk, wind, and a persistent little spider. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let web,ctx,spider,drag=null,hover=null,dust=[],ornaments=[],ripples=[],scraps=[];
  let paused=reduced,time=0,pointer={x:-100,y:-100},lastStatus='',resizeTimer,toastTimer;
  let canvasElement,entered=false;
  let handControl,breathControl,handPoints=[],handGrabs=[],handAnchors=new Map(),weaveQueue=[],guideTarget=null,lastGuide=0;
  let wovenThreads=[],manualWeave=null;
  function repairBusy(){return web&&(web.broken.length>0||spider.target||spider.repairing);}
  function showLaunch(show){
    if(show){handControl?.stop();breathControl?.stop();}
    entered=!show;drag=null;hover=null;
    document.body.classList.toggle('is-launch',show);
    $('launch-screen').inert=!show;
    $('launch-screen').setAttribute('aria-hidden',String(!show));
    for(const id of ['canvas-holder','web-readout','experience-controls']){
      $(id).inert=show;$(id).setAttribute('aria-hidden',String(show));
    }
    $('cursor-ring').style.opacity='0';$('cursor-ring').classList.remove('grabbing');
    $('toast').classList.remove('visible');clearTimeout(toastTimer);
    if(show)requestAnimationFrame(()=>{if(!entered)$('start').focus({preventScroll:true});});
    else canvasElement.focus({preventScroll:true});
  }
  function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),2800);}
  function newWorld(w,h){
    handControl?.cancelInteraction();breathControl?.resetGate();weaveQueue=[];wovenThreads=[];manualWeave=null;guideTarget=null;
    web=new SilkWeb(w,h,1701);drag=null;hover=null;ripples=[];scraps=[];
    spider={node:web.nearest(w*.66,h*.65,Infinity),path:[],next:null,walkEdge:null,progress:0,target:null,approach:null,repairing:false,repairProgress:0,x:0,y:0,angle:0,wait:1};
    spider.x=spider.node.x;spider.y=spider.node.y;
    dust=Array.from({length:95},()=>({x:web.random()*w,y:web.random()*h,r:.3+web.random()*1.2,speed:.7+web.random()*1.2,phase:web.random()*6.28}));
    ornaments=[];
    for(let i=0;i<34;i++){const n=web.nodes[1+Math.floor(web.random()*24+3)*web.spokes+Math.floor(web.random()*web.spokes)];ornaments.push({node:n,size:2+web.random()*3.2,angle:web.random()*6.28,phase:web.random()*6.28,kind:i%3,fall:null});}
  }
  function planConnection(edge){
    let best=null;
    for(const [start,end]of [[edge.a,edge.b],[edge.b,edge.a]]){
      const path=web.route(spider.node,start);if(path===null)continue;
      let cost=0,previous=spider.node;
      for(const node of path){cost+=Math.hypot(node.x-previous.x,node.y-previous.y);previous=node;}
      if(!best||cost<best.cost)best={edge,start,end,path,cost};
    }
    return best;
  }
  function routeToRepair(){
    for(const e of web.broken){
      const ra=web.route(spider.node,e.a),rb=web.route(spider.node,e.b);
      if(!ra&&!rb)continue;
      const useA=ra!==null&&(rb===null||ra.length<=rb.length);
      spider.target=e;spider.path=useA?ra:rb;spider.bridgeTo=useA?e.b:e.a;return true;
    }
    return false;
  }
  function queueWeave(a,b){
    if(repairBusy()){handControl?.hint('蜘蛛正在修补破口，补好后再牵新丝');return false;}
    if(a===b||Math.hypot(a.x-b.x,a.y-b.y)<28){handControl?.hint('移动远一点，再松开手指');return false;}
    if(weaveQueue.length>=6){handControl?.hint('小蜘蛛正在忙，等它织完几根丝');return false;}
    let edge=a.adj.find(e=>e.a===b||e.b===b)||wovenThreads.find(e=>(e.a===a&&e.b===b)||(e.a===b&&e.b===a));
    if(edge?.active||edge?.pending){handControl?.hint('这里已经有丝了，试着连接更远的节点');return false;}
    if(web.route(spider.node,a)===null&&web.route(spider.node,b)===null){handControl?.hint('这里暂时无法到达，换一个起点');return false;}
    // Gesture-made silk is a separate visual layer: it must never become
    // a spring or a repair target in the original web.
    if(!edge){edge={a,b,rest:Math.hypot(a.x-b.x,a.y-b.y),kind:'woven',active:false,pending:true,age:999};wovenThreads.push(edge);}
    if(!weaveQueue.includes(edge)&&manualWeave?.edge!==edge)weaveQueue.push(edge);
    if(!spider.target)spider.path=[];
    guideTarget=null;handControl?.hint('已交给小蜘蛛，正在赶来牵丝');addRipple(a.x,a.y);return true;
  }
  function routeToWeave(){
    for(let i=0;i<weaveQueue.length;i++){
      const e=weaveQueue[i];if(e.active){weaveQueue.splice(i--,1);continue;}
      const plan=planConnection(e);if(!plan)continue;
      manualWeave={edge:e,start:plan.start,end:plan.end,phase:'approach',progress:0};
      spider.path=plan.path;weaveQueue.splice(i,1);return true;
    }
    return false;
  }
  function setupHands(){
    const position=t=>({x:t.point.x*web.w,y:t.point.y*web.h});
    handControl=new HandController({
      isInteractive:()=>entered&&!paused,
      modeChanged:updateInputMode,
      hands:hands=>{handPoints=hands;if(!hands.length&&handControl?.enabled)handControl.hint('让双手进入画面');},
      guide:t=>{
        if(repairBusy()){handControl.hint('正在修补，食指引导会在补好后恢复');return;}
        if(performance.now()-lastGuide<350)return;lastGuide=performance.now();
        const p=position(t),n=web.nearest(p.x,p.y,100);
        if(n&&Math.hypot(n.x-spider.x,n.y-spider.y)>18)guideTarget=n;
        handControl.hint('食指引路 · 捏合后移动，松开牵丝');
      },
      pinchStart:t=>{
        if(repairBusy()){handControl.hint('蜘蛛正在修补破口，补好后再牵新丝');return;}
        const p=position(t),node=web.nearest(p.x,p.y,100);
        if(node){handAnchors.set(t.id,{node,point:p});addRipple(node.x,node.y);handControl.hint('已捏住起点，移动后松开');}
      },
      pinchMove:t=>{const a=handAnchors.get(t.id);if(a)a.point=position(t);},
      pinchEnd:t=>{
        const a=handAnchors.get(t.id);handAnchors.delete(t.id);if(!a)return;
        const p=position(t),b=web.nearest(p.x,p.y,100);if(b)queueWeave(a.node,b);
      },
      cancel:({id})=>handAnchors.delete(id),
      cancelAll:()=>{handAnchors.clear();handGrabs=[];handPoints=[];guideTarget=null;},
      stretchStart:tracks=>{
        if(repairBusy()){handGrabs=[];return;}
        handAnchors.clear();const selected=new Set();handGrabs=[];
        for(const t of tracks){const p=position(t),node=web.nearest(p.x,p.y,90);if(node&&!selected.has(node.id)){selected.add(node.id);handGrabs.push({id:t.id,node,...p});}}
        if(handGrabs.length!==2){handGrabs=[];handControl.hint('双手稍微分开，再捏住蛛网');}
      },
      stretchMove:tracks=>{if(repairBusy()){handGrabs=[];return;}for(const grab of handGrabs){const t=tracks.find(t=>t.id===grab.id);if(t)Object.assign(grab,position(t));}if(handGrabs.length)handControl.hint('双手拉开，感受蛛丝的张力');},
      stretchEnd:()=>{handGrabs=[];}
    });
  }
  function updateInputMode(){
    const modes=[];
    if(handControl?.enabled&&handControl.stream)modes.push('手势');
    if(breathControl?.enabled&&breathControl.stream)modes.push('吹气');
    modes.push('鼠标');$('input-mode').textContent=modes.length>1?modes.join(' + '):'鼠标模式';
  }
  function setupBreath(){
    breathControl=new BreathController({
      isInteractive:()=>entered&&!paused,
      modeChanged:updateInputMode,
      wind:({strength,start})=>{
        if(!entered||paused)return;
        web.blow(strength);if(start)toast('气息化成了风。');
      }
    });
  }
  function updateOriginalRepair(dt){
    if(spider.target?.active){spider.target=null;spider.repairing=false;}
    if(spider.repairing){
      const target=spider.bridgeTo,from=spider.node;
      spider.repairProgress=Math.min(1,spider.repairProgress+dt/Math.max(1.2,Math.hypot(target.x-from.x,target.y-from.y)/38));
      const t=spider.repairProgress;spider.x=from.x+(target.x-from.x)*t;spider.y=from.y+(target.y-from.y)*t;
      spider.angle=Math.atan2(target.y-from.y,target.x-from.x)+Math.PI/2;
      if(t>=1){web.repair(spider.target);spider.node=target;spider.target=null;spider.repairing=false;spider.wait=.3;}
      return;
    }
    if(!spider.next&&web.broken.length&&!spider.target){spider.path=[];routeToRepair();}
    if(!spider.next&&spider.path.length){
      const next=spider.path.shift();
      if(!spider.node.adj.some(e=>e.active&&(e.a===next||e.b===next))){spider.path=[];spider.target=null;return;}
      spider.next=next;spider.progress=0;
    }
    if(spider.next){
      const target=spider.next,from=spider.node,dist=Math.hypot(target.x-from.x,target.y-from.y);
      spider.progress=Math.min(1,spider.progress+dt*48/Math.max(1,dist));
      spider.x=from.x+(target.x-from.x)*spider.progress;spider.y=from.y+(target.y-from.y)*spider.progress;
      const desired=Math.atan2(target.y-from.y,target.x-from.x)+Math.PI/2;
      spider.angle+=Math.atan2(Math.sin(desired-spider.angle),Math.cos(desired-spider.angle))*.14;
      if(spider.progress>=1){spider.node=target;spider.next=null;}
      return;
    }
    spider.x=spider.node.x;spider.y=spider.node.y;
    if(spider.target){spider.repairing=true;spider.repairProgress=0;return;}
    spider.wait-=dt;if(spider.wait>0)return;
    const candidates=web.nodes.filter(n=>n.x>web.w*.38&&n.x<web.w*.94&&n.y>web.h*.13&&n.y<web.h*.83&&!n.fixed);
    if(candidates.length)spider.path=web.route(spider.node,candidates[Math.floor(web.random()*candidates.length)])||[];
    spider.wait=1+web.random()*2;
  }
  function updateSpider(dt){
    if(manualWeave&&repairBusy()&&manualWeave.phase!=='return'){
      if(manualWeave.phase==='approach'){
        weaveQueue.unshift(manualWeave.edge);manualWeave=null;spider.path=[];
      }else manualWeave.phase='return';
    }
    if(manualWeave){
      const task=manualWeave;
      if(task.phase==='approach'){
        if(!spider.next&&spider.node===task.start){task.phase='weave';spider.path=[];}
        else{
          if(!spider.next&&!spider.path.length){
            const path=web.route(spider.node,task.start);
            if(path===null){weaveQueue.unshift(task.edge);manualWeave=null;return;}
            spider.path=path;
          }
          updateOriginalRepair(dt);return;
        }
      }
      const length=Math.max(1,Math.hypot(task.end.x-task.start.x,task.end.y-task.start.y));
      task.progress=Math.max(0,Math.min(1,task.progress+dt*(task.phase==='return'?-90:38)/length));
      spider.x=task.start.x+(task.end.x-task.start.x)*task.progress;
      spider.y=task.start.y+(task.end.y-task.start.y)*task.progress;
      spider.angle=Math.atan2((task.end.y-task.start.y)*(task.phase==='return'?-1:1),(task.end.x-task.start.x)*(task.phase==='return'?-1:1))+Math.PI/2;
      if(task.phase==='return'&&task.progress===0){spider.node=task.start;weaveQueue.unshift(task.edge);manualWeave=null;spider.path=[];}
      else if(task.progress===1){task.edge.active=true;task.edge.pending=false;task.edge.age=0;spider.node=task.end;manualWeave=null;spider.path=[];spider.wait=.3;}
      return;
    }
    if(repairBusy()){
      // A camera frame cannot replace the old repair target, stretch its
      // endpoints, or add work while the original repair routine is running.
      guideTarget=null;handAnchors.clear();handGrabs=[];
      updateOriginalRepair(dt);return;
    }
    if(weaveQueue.length&&!spider.next&&routeToWeave())return;
    if(guideTarget&&!spider.next){spider.path=web.route(spider.node,guideTarget)||[];guideTarget=null;}
    updateOriginalRepair(dt);
  }
  function addRipple(x,y){ripples.push({x,y,age:0});}
  function blow(strength=1){if(!entered)return;if(typeof strength!=='number')strength=1;if(paused)setPaused(false);web.blow(strength);toast('风经过了，留一点时间让它修补。');}
  function setPaused(value){paused=value;if(value){drag=null;handControl?.cancelInteraction();breathControl?.resetGate();}$('pause').setAttribute('aria-pressed',String(paused));$('pause').setAttribute('aria-label',paused?'继续动画':'暂停动画');$('pause').innerHTML=paused?'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 10 7-10 7Z"/></svg>':'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>';}
  function update(dt){
    const oldBroken=new Set(web.broken.map(e=>e.id));
    web.step(dt*60,drag?[drag]:handGrabs);
    for(const e of web.broken)if(!oldBroken.has(e.id)){
      const x=(e.a.x+e.b.x)/2,y=(e.a.y+e.b.y)/2;
      addRipple(x,y);for(let i=0;i<4;i++)scraps.push({x,y,vx:(web.random()-.5)*55,vy:-web.random()*30,age:0});
    }
    updateSpider(dt);
    for(const e of wovenThreads)e.age+=dt;
    for(const d of dust){d.x+=(2+web.gust*95)*dt*d.speed;d.y+=Math.sin(time*.3+d.phase)*dt*2;if(d.x>web.w+10)d.x=-10;}
    for(const r of ripples)r.age+=dt;ripples=ripples.filter(r=>r.age<1.5);
    for(const s of scraps){s.age+=dt;s.x+=s.vx*dt;s.y+=s.vy*dt;s.vy+=30*dt;}scraps=scraps.filter(s=>s.age<3);
    for(const o of ornaments){
      if(!o.fall&&o.node.adj.every(e=>!e.active))o.fall={x:o.node.x,y:o.node.y,vy:0};
      if(o.fall){o.fall.vy+=24*dt;o.fall.y+=o.fall.vy*dt;o.fall.x+=(8+web.gust*45)*dt;}
    }
  }
  function background(w,h){
    ctx.fillStyle='#202225';ctx.fillRect(0,0,w,h);
    const g=ctx.createRadialGradient(w*.55,h*.43,0,w*.55,h*.43,Math.max(w,h)*.8);
    g.addColorStop(0,'#333a39');g.addColorStop(.45,'#282e2e');g.addColorStop(1,'#1d2023');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    for(const d of dust){const a=(.14+Math.sin(time*.35+d.phase)*.07);ctx.fillStyle=`rgba(205,214,190,${a})`;ctx.beginPath();ctx.arc(d.x,d.y,d.r,0,Math.PI*2);ctx.fill();}
  }
  function strokeEdge(e){
    const a=e.a,b=e.b,mx=(a.x+b.x)*.5,my=(a.y+b.y)*.5;
    const sag=e.kind==='ring'?Math.min(3,e.rest*.055):.35;
    ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(mx,my+sag,b.x,b.y);
  }
  function drawWeb(){
    ctx.lineCap='round';ctx.lineWidth=.65;
    const batches=[[],[],[]];
    for(const e of web.edges){if(!e.active)continue;const i=e.tension>.18||e.age<2?2:(e.kind==='radial'?1:0);batches[i].push(e);}
    const colors=['rgba(186,207,201,.33)','rgba(205,218,208,.47)','rgba(219,224,185,.8)'];
    for(let i=0;i<3;i++){ctx.strokeStyle=colors[i];ctx.lineWidth=i===2?.95:.65;ctx.beginPath();for(const e of batches[i])strokeEdge(e);ctx.stroke();}
    // Recoiling ends remain visible briefly, then fade into the web's history.
    for(const e of web.broken){
      const a=e.a,b=e.b,dx=b.x-a.x,dy=b.y-a.y;
      ctx.strokeStyle=`rgba(192,208,192,${Math.max(.06,.35-e.age*.03)})`;ctx.lineWidth=.55;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.quadraticCurveTo(a.x+dx*.17,a.y+dy*.14+3,a.x+dx*.24,a.y+dy*.19+7);ctx.moveTo(b.x,b.y);ctx.quadraticCurveTo(b.x-dx*.16,b.y-dy*.17+3,b.x-dx*.22,b.y-dy*.2+6);ctx.stroke();
    }
    // Dew catches the light only at a scattering of intersections.
    for(let i=5;i<web.nodes.length;i+=7){const n=web.nodes[i];ctx.fillStyle=`rgba(231,235,209,${.28+.16*Math.sin(i+time*.6)})`;ctx.beginPath();ctx.arc(n.x,n.y,i%11===0?1.45:.7,0,Math.PI*2);ctx.fill();}
    if(spider.repairing){ctx.strokeStyle='#f5e3ad';ctx.lineWidth=1.15;ctx.shadowColor='#e9e0ae';ctx.shadowBlur=7;ctx.beginPath();ctx.moveTo(spider.node.x,spider.node.y);ctx.lineTo(spider.x,spider.y);ctx.stroke();ctx.shadowBlur=0;}
  }
  function drawOrnaments(){
    for(const o of ornaments){const n=o.fall||o.node;if(n.y>web.h+30)continue;
      ctx.save();ctx.translate(n.x,n.y);ctx.rotate(o.angle+Math.sin(time*.7+o.phase)*.18+(o.fall?time*.5:0));
      const s=o.size;
      ctx.shadowColor='#d3bb7a';ctx.shadowBlur=3;
      if(o.kind===0){
        ctx.fillStyle='#d8c394';for(let k=0;k<5;k++){ctx.rotate(Math.PI*2/5);ctx.beginPath();ctx.ellipse(0,-s*.65,s*.43,s*.78,0,0,Math.PI*2);ctx.fill();}ctx.fillStyle='#f3dfb0';ctx.beginPath();ctx.arc(0,0,s*.32,0,Math.PI*2);ctx.fill();
      }else if(o.kind===1){ctx.strokeStyle='#d1b680';ctx.lineWidth=s*.55;ctx.beginPath();ctx.arc(0,0,s,0,Math.PI*1.35);ctx.stroke();}
      else{ctx.fillStyle='#bcb098';ctx.beginPath();ctx.ellipse(0,0,s*.5,s,Math.PI/4,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#e1d3b6';ctx.lineWidth=.45;ctx.beginPath();ctx.moveTo(-s*.5,s*.6);ctx.lineTo(s*.5,-s*.6);ctx.stroke();}
      ctx.restore();
    }
  }
  function drawSpider(){
    ctx.save();ctx.translate(spider.x,spider.y);ctx.rotate(spider.angle);
    const walking=spider.next||spider.repairing||manualWeave?.phase==='weave'||manualWeave?.phase==='return';const phase=walking?time*13:0;
    ctx.strokeStyle='rgba(215,226,215,.9)';ctx.lineWidth=.95;ctx.shadowColor='#dcebd0';ctx.shadowBlur=3;
    for(let side=-1;side<=1;side+=2){for(let leg=0;leg<4;leg++){
      const walk=walking?Math.sin(phase+leg*1.65+side)*1.8:Math.sin(time*1.4+leg)*.25;
      const by=-4+leg*2.3,kx=side*(8+(leg===1||leg===2?3:0)),ky=-14+leg*8+walk;
      const tx=side*(13+Math.sin(leg)*2),ty=-21+leg*13+walk*1.5;
      ctx.beginPath();ctx.moveTo(side*2,by);ctx.lineTo(kx,ky);ctx.lineTo(tx,ty);ctx.stroke();
    }}
    const body=ctx.createRadialGradient(-1.5,3,0,0,4,8);body.addColorStop(0,'#dce7d4');body.addColorStop(.5,'#a7b8ac');body.addColorStop(1,'#50615a');ctx.fillStyle=body;ctx.beginPath();ctx.ellipse(0,4.5,4,6.2,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#cbd7c7';ctx.beginPath();ctx.ellipse(0,-3,2.6,3.4,0,0,Math.PI*2);ctx.fill();
    ctx.shadowBlur=0;ctx.strokeStyle='#71887b';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(0,1);ctx.lineTo(0,8);ctx.stroke();ctx.restore();
  }
  function drawEffects(){
    for(const r of ripples){ctx.strokeStyle=`rgba(205,221,191,${(1-r.age/1.5)*.15})`;ctx.lineWidth=.6;ctx.beginPath();ctx.arc(r.x,r.y,5+r.age*65,0,Math.PI*2);ctx.stroke();}
    for(const s of scraps){ctx.fillStyle=`rgba(224,224,192,${(1-s.age/3)*.65})`;ctx.fillRect(s.x,s.y,1.4,1.4);}
    if(web.gust>.02){ctx.strokeStyle=`rgba(182,203,188,${web.gust*.07})`;ctx.lineWidth=.7;ctx.beginPath();for(let i=0;i<9;i++){const y=web.h*(i+.5)/9,x=((time*410+i*161)%(web.w+400))-250;ctx.moveTo(x,y);ctx.bezierCurveTo(x+65,y-18,x+140,y+12,x+220,y-9);}ctx.stroke();}
    if(hover&&!drag){ctx.strokeStyle='#d7dcb67a';ctx.lineWidth=.7;ctx.beginPath();ctx.arc(hover.x,hover.y,5,0,Math.PI*2);ctx.stroke();}
  }
  function drawHandInteraction(){
    ctx.save();ctx.lineWidth=.65;
    for(const e of wovenThreads)if(e.active){ctx.strokeStyle=e.age<2?'rgba(232,218,177,.7)':'rgba(184,205,193,.3)';ctx.beginPath();strokeEdge(e);ctx.stroke();}
    if(manualWeave&&(manualWeave.phase==='weave'||manualWeave.phase==='return')){
      ctx.strokeStyle='#e7d6aa';ctx.lineWidth=.9;ctx.beginPath();ctx.moveTo(manualWeave.start.x,manualWeave.start.y);ctx.lineTo(spider.x,spider.y);ctx.stroke();
    }
    ctx.restore();
    ctx.save();ctx.lineWidth=.8;ctx.setLineDash([3,6]);ctx.strokeStyle='rgba(225,210,161,.3)';
    ctx.beginPath();for(const e of wovenThreads)if(e.pending&&e!==manualWeave?.edge){ctx.moveTo(e.a.x,e.a.y);ctx.lineTo(e.b.x,e.b.y);}ctx.stroke();
    ctx.strokeStyle='rgba(239,219,166,.8)';ctx.beginPath();
    for(const a of handAnchors.values()){ctx.moveTo(a.node.x,a.node.y);ctx.lineTo(a.point.x,a.point.y);}ctx.stroke();ctx.setLineDash([]);
    for(const t of handPoints){
      const x=t.point.x*web.w,y=t.point.y*web.h;
      ctx.strokeStyle=t.pinch?'#e9ce91':'rgba(207,225,202,.7)';ctx.shadowColor='#e5d5a5';ctx.shadowBlur=t.pinch?12:5;
      ctx.beginPath();ctx.arc(x,y,t.pinch?8:12,0,Math.PI*2);ctx.stroke();
      ctx.fillStyle=t.pinch?'#eddbac':'#cddac4';ctx.beginPath();ctx.arc(x,y,2,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
  }
  function status(){
    const percent=Math.round(web.integrity*1000)/10;
    $('integrity').textContent=percent===100?'100':percent.toFixed(1);$('integrity-bar').style.width=percent+'%';
    const message=paused?'时间暂时停留':spider.repairing?'小蜘蛛正在牵丝修补':spider.target?'小蜘蛛正在赶往破口':manualWeave?(manualWeave.phase==='return'?'正在返回网面，准备修补':manualWeave.phase==='approach'?'正在前往牵丝起点':'小蜘蛛正在牵新丝'):'小蜘蛛正在巡视';
    if(message!==lastStatus){$('spider-state').textContent=message;lastStatus=message;}
  }
  new p5(p=>{
    p.setup=()=>{
      const canvas=p.createCanvas(window.innerWidth,window.innerHeight);canvas.parent('canvas-holder');canvasElement=canvas.elt;
      p.pixelDensity(Math.min(window.devicePixelRatio||1,2));p.frameRate(60);ctx=p.drawingContext;
      newWorld(p.width,p.height);setPaused(paused);$('loading').classList.add('done');
      setupHands();
      setupBreath();
      canvasElement.tabIndex=0;canvasElement.setAttribute('aria-label','互动蛛网：按住拖动牵引蛛丝，W 吹风，R 重织，空格暂停，Esc 返回介绍');
      $('start').disabled=false;
      $('start').addEventListener('click',()=>showLaunch(false));
      $('home').addEventListener('click',()=>showLaunch(true));
      $('launch-screen').addEventListener('transitionend',e=>{
        if(e.target===$('launch-screen')&&e.propertyName==='opacity'&&!entered)$('start').focus({preventScroll:true});
      });
      canvasElement.addEventListener('pointerdown',e=>{
        if(!entered||e.button!==0)return;const rect=canvasElement.getBoundingClientRect();pointer={x:e.clientX-rect.left,y:e.clientY-rect.top};const node=web.nearest(pointer.x,pointer.y,48);
        if(!node)return;if(paused){toast('先点击继续，再轻牵蛛丝。');return;}
        drag={node,x:pointer.x,y:pointer.y};canvasElement.setPointerCapture(e.pointerId);$('cursor-ring').classList.add('grabbing');addRipple(node.x,node.y);
      });
      canvasElement.addEventListener('pointermove',e=>{const rect=canvasElement.getBoundingClientRect();pointer={x:e.clientX-rect.left,y:e.clientY-rect.top};hover=web.nearest(pointer.x,pointer.y,32);if(drag){drag.x=pointer.x;drag.y=pointer.y;}$('cursor-ring').style.left=e.clientX+'px';$('cursor-ring').style.top=e.clientY+'px';$('cursor-ring').style.opacity=hover||drag?'1':'0';});
      const release=()=>{drag=null;$('cursor-ring').classList.remove('grabbing');};
      canvasElement.addEventListener('pointerup',release);canvasElement.addEventListener('pointercancel',release);canvasElement.addEventListener('lostpointercapture',release);canvasElement.addEventListener('pointerleave',()=>{hover=null;$('cursor-ring').style.opacity='0';});
      $('wind').addEventListener('click',blow);
      $('reset').addEventListener('click',()=>{newWorld(p.width,p.height);toast('重新牵起一张网。');});
      $('pause').addEventListener('click',()=>setPaused(!paused));
      window.addEventListener('keydown',e=>{if(e.code==='Escape'&&entered){e.preventDefault();showLaunch(true);return;}if(!entered||e.repeat||e.ctrlKey||e.metaKey||e.altKey||/INPUT|TEXTAREA|BUTTON|A/.test(e.target.tagName))return;if(e.code==='KeyW')blow();if(e.code==='KeyR')$('reset').click();if(e.code==='Space'){e.preventDefault();setPaused(!paused);}});
      document.addEventListener('visibilitychange',()=>{if(document.hidden)drag=null;});
      window.__weaving={get web(){return web;},get spider(){return spider;},get paused(){return paused;},get drag(){return drag;},get controller(){return handControl;},get breath(){return breathControl;},get threads(){return wovenThreads;},queueWeave,blow,pause:setPaused,reset:()=>newWorld(p.width,p.height),get stats(){return{nodes:web.nodes.length,edges:web.edges.length,broken:web.broken.length,queued:weaveQueue.length,woven:wovenThreads.filter(e=>e.active).length,hands:handPoints.length,integrity:web.integrity,spider:{x:spider.x,y:spider.y,repairing:spider.repairing},fps:Math.round(p.frameRate())};}};
    };
    p.draw=()=>{
      if(!web)return;const dt=Math.min(p.deltaTime/1000,.033);
      if(entered&&!paused&&!document.hidden){time+=dt;update(dt);}
      background(p.width,p.height);drawWeb();drawOrnaments();drawEffects();drawSpider();drawHandInteraction();
      if(p.frameCount%12===0)status();
    };
    p.windowResized=()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{
      // Scale the existing web instead of erasing its history on rotation.
      handControl?.cancelInteraction();
      const oldW=web.w,oldH=web.h,w=window.innerWidth,h=window.innerHeight;
      p.resizeCanvas(w,h);ctx=p.drawingContext;web.w=w;web.h=h;web.cx*=w/oldW;web.cy*=h/oldH;
      for(const n of web.nodes){for(const k of ['x','px','ox'])n[k]*=w/oldW;for(const k of ['y','py','oy'])n[k]*=h/oldH;}
      for(const e of web.edges)e.rest=Math.hypot(e.a.ox-e.b.ox,e.a.oy-e.b.oy);
      for(const d of dust){d.x*=w/oldW;d.y*=h/oldH;}for(const o of ornaments)if(o.fall){o.fall.x*=w/oldW;o.fall.y*=h/oldH;}
      spider.x*=w/oldW;spider.y*=h/oldH;drag=null;
    },160);};
  });
  setTimeout(()=>{if(!window.__weaving){$('loading').textContent='画面未能加载，请刷新页面重试。';$('loading').style.pointerEvents='auto';}},12000);
})();
