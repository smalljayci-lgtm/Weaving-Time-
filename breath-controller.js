/* Local, heuristic breath-sound detection. No recording or audio output. */
(function(root){
  'use strict';
  class BreathDetector{
    constructor(sensitivity=.6){this.sensitivity=sensitivity;this.calibrate();}
    calibrate(){this.samples=[];this.calibrationStart=null;this.noise=.002;this.ready=false;this.resetGate();}
    resetGate(){this.lastTime=null;this.candidateMs=0;this.releaseMs=0;this.active=false;this.lastPush=-Infinity;this.cooldown=0;}
    process(wave,spectrum,sampleRate,now){
      const dt=this.lastTime===null?0:Math.max(0,Math.min(100,now-this.lastTime));this.lastTime=now;
      let sum=0,mean=0;for(const v of wave)mean+=v;mean/=wave.length;
      for(const v of wave)sum+=(v-mean)**2;const rms=Math.sqrt(sum/wave.length);
      const binHz=sampleRate/(spectrum.length*2);
      let total=0,log=0,count=0,peak=0,low=0,lowLog=0,lowCount=0,lowPeak=0;
      for(let i=Math.max(1,Math.ceil(80/binHz));i<Math.min(spectrum.length,Math.floor(6500/binHz));i++){
        const energy=Math.max(1e-14,10**((Number.isFinite(spectrum[i])?spectrum[i]:-140)/10));
        total+=energy;log+=Math.log(energy);count++;peak=Math.max(peak,energy);
        if(i*binHz<500){low+=energy;lowLog+=Math.log(energy);lowCount++;lowPeak=Math.max(lowPeak,energy);}
      }
      const flatness=count&&total?Math.exp(log/count)/(total/count):0;
      const lowFlatness=lowCount&&low?Math.exp(lowLog/lowCount)/(low/lowCount):0;
      if(!this.ready){
        this.calibrationStart??=now;this.samples.push(rms);
        if(now-this.calibrationStart>=1300&&this.samples.length>=10){
          this.samples.sort((a,b)=>a-b);this.noise=Math.min(.04,Math.max(.0002,this.samples[Math.floor(this.samples.length*.55)]));
          this.ready=true;this.resetGate();
        }
        return{calibrating:!this.ready,rms,level:Math.min(1,rms*10),blowing:false,push:false,progress:Math.min(1,(now-this.calibrationStart)/1300)};
      }
      const s=Math.min(1,Math.max(0,this.sensitivity));
      const threshold=Math.min(.2,Math.max(.0045+(1-s)*.015,this.noise*(4-s*2.4)));
      const noisy=flatness>.12&&peak/Math.max(1e-14,total)<.25;
      const rumble=low/Math.max(1e-14,total)>.7&&lowFlatness>.18&&lowPeak/Math.max(1e-14,low)<.55&&rms>threshold*1.4;
      const candidate=rms>threshold&&(noisy||rumble);
      let start=false,push=false;
      if(candidate){
        this.releaseMs=0;this.candidateMs+=dt;
        if(!this.active&&now>=this.cooldown&&this.candidateMs>=200){this.active=true;start=true;}
      }else{
        this.candidateMs=Math.max(0,this.candidateMs-dt*2);this.releaseMs+=dt;
        if(this.active&&this.releaseMs>=240){this.active=false;this.cooldown=now+300;}
        if(!this.active&&rms<threshold*.7)this.noise=this.noise*.998+Math.max(.0002,rms)*.002;
      }
      const strength=Math.max(.35,Math.min(1.4,.35+Math.max(0,rms/threshold-1)*.24));
      if(this.active&&candidate&&(start||now-this.lastPush>=120)){push=true;this.lastPush=now;}
      return{calibrating:false,rms,threshold,flatness,candidate,blowing:this.active,push,start,strength,level:Math.min(1,rms/(threshold*4))};
    }
  }
  root.BreathDetector=BreathDetector;
  if(typeof module!=='undefined')module.exports={BreathDetector};
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id);
  class BreathController{
    constructor(callbacks){
      this.callbacks=callbacks;this.enabled=false;this.session=0;this.detector=new BreathDetector();
      $('breath').addEventListener('click',()=>this.enabled?this.stop():this.start());
      $('breath-close').addEventListener('click',()=>this.stop());
      $('breath-calibrate').addEventListener('click',()=>{if(this.enabled){this.detector.calibrate();this.status('校准环境声…');this.hint('先保持安静，稍后再吹气');}});
      $('breath-sensitivity').addEventListener('input',e=>{this.detector.sensitivity=Number(e.target.value)/100;$('breath-sensitivity-value').value=e.target.value;});
      window.addEventListener('pagehide',()=>this.stop());
      document.addEventListener('visibilitychange',()=>this.resetGate());
    }
    status(text){if($('breath-status').textContent!==text)$('breath-status').textContent=text;}
    hint(text){if($('breath-hint').textContent!==text)$('breath-hint').textContent=text;}
    resetGate(){this.detector.resetGate();}
    stop(hide=true){
      this.session++;this.enabled=false;cancelAnimationFrame(this.raf);this.resetGate();
      this.stream?.getTracks().forEach(t=>{t.onended=null;t.stop();});this.stream=null;
      this.source?.disconnect();this.analyser?.disconnect();this.source=null;this.analyser=null;
      const context=this.context;this.context=null;if(context&&context.state!=='closed')context.close().catch(()=>{});
      $('breath').setAttribute('aria-pressed','false');$('breath-label').textContent='开启吹气';
      $('breath-panel').hidden=hide;$('breath-meter-fill').style.transform='scaleX(0)';$('breath-meter').setAttribute('aria-valuenow','0');
      $('breath-panel').classList.remove('is-blowing');
      this.callbacks.modeChanged?.();
    }
    fail(error){
      this.lastError=error.message;this.stop(false);this.status('吹气暂未开启');
      const messages={NotAllowedError:'麦克风未获授权，请允许后重试。',NotFoundError:'没有找到麦克风，可使用“吹一阵风”按钮。',NotReadableError:'麦克风暂时不可用，请检查设备或其他应用。'};
      this.hint(messages[error.name]||error.userMessage||'麦克风启动失败，仍可点击按钮吹风。');
      $('breath-feedback').textContent='未连接';
    }
    async start(){
      if(this.enabled)return;this.stop();const session=++this.session;this.enabled=true;this.lastError=null;
      $('breath-panel').hidden=false;$('breath').setAttribute('aria-pressed','true');$('breath-label').textContent='关闭吹气';
      $('breath-feedback').textContent='等待授权';this.status('等待麦克风授权…');this.hint('请允许麦克风；摄像头可以保持关闭');
      try{
        const AudioContext=root.AudioContext||root.webkitAudioContext;
        if(!root.isSecureContext||!navigator.mediaDevices?.getUserMedia||!AudioContext){const e=new Error('Secure audio capture unavailable');e.userMessage='请用 Live Server 在本机打开网页，再开启吹气。';throw e;}
        const context=new AudioContext();this.context=context;await context.resume();
        if(session!==this.session)return;
        const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false},video:false});
        if(session!==this.session){stream.getTracks().forEach(t=>t.stop());return;}
        this.stream=stream;this.source=context.createMediaStreamSource(stream);this.analyser=context.createAnalyser();
        this.analyser.fftSize=2048;this.analyser.smoothingTimeConstant=.2;this.source.connect(this.analyser);
        // The analyser is deliberately not connected to speakers.
        for(const track of stream.getAudioTracks())track.onended=()=>{if(this.enabled)this.fail(Object.assign(new Error('Disconnected'),{userMessage:'麦克风已断开，请重新开启。'}));};
        const wave=new Float32Array(this.analyser.fftSize),spectrum=new Float32Array(this.analyser.frequencyBinCount);
        this.detector.calibrate();this.status('校准环境声…');this.hint('先安静一小会儿，让它听清环境声');this.callbacks.modeChanged?.();
        let last=0,uiTime=0;
        const pump=now=>{
          if(session!==this.session)return;this.raf=requestAnimationFrame(pump);
          if(now-last<30)return;last=now;
          if(document.hidden||!this.callbacks.isInteractive()){
            this.resetGate();this.status('吹气已暂停');$('breath-feedback').textContent='暂停';return;
          }
          if(context.state!=='running'){this.resetGate();this.status('麦克风待恢复');this.hint('点击关闭后重新开启吹气');return;}
          this.analyser.getFloatTimeDomainData(wave);this.analyser.getFloatFrequencyData(spectrum);
          const sample=this.detector.process(wave,spectrum,context.sampleRate,now);this.lastSample=sample;
          if(sample.push)this.callbacks.wind({strength:sample.strength,start:sample.start});
          if(now-uiTime<90)return;uiTime=now;
          $('breath-meter-fill').style.transform=`scaleX(${sample.level})`;$('breath-meter').setAttribute('aria-valuenow',String(Math.round(sample.level*100)));
          $('breath-panel').classList.toggle('is-blowing',sample.blowing);
          if(sample.calibrating){this.status('校准环境声…');$('breath-feedback').textContent=`${Math.round(sample.progress*100)}%`;}
          else{
            this.status(sample.blowing?'气息化成了风':'吹气已就绪');
            $('breath-feedback').textContent=sample.blowing?'正在吹风':sample.candidate?'再吹久一点':'等待吹气';
            this.hint(sample.blowing?'继续吹，风会经过整张网。':'朝麦克风轻吹约半秒；气流声越强，风越大。');
          }
        };
        this.raf=requestAnimationFrame(pump);
      }catch(error){if(session===this.session)this.fail(error);}
    }
  }
  root.BreathController=BreathController;
})(typeof window!=='undefined'?window:globalThis);
