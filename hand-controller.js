/* Camera lifecycle, worker inference, and a mirrored local preview. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const bones=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];
  class HandController{
    constructor(callbacks){
      this.callbacks=callbacks;this.session=0;this.enabled=false;this.video=$('hand-video');
      this.preview=$('hand-preview').getContext('2d');
      const forwarded={};for(const name of ['guide','pinchStart','pinchMove','pinchEnd','cancel','stretchStart','stretchMove','stretchEnd'])forwarded[name]=value=>callbacks[name]?.(value);
      forwarded.hands=hands=>{callbacks.hands?.(hands);if(this.enabled)this.status(hands.length?`已识别 ${hands.length} 只手`:'寻找双手…');};
      this.gestures=new HandGestures(forwarded);
      $('hands').addEventListener('click',()=>this.enabled?this.stop():this.start());
      $('hand-close').addEventListener('click',()=>this.stop());
      window.addEventListener('pagehide',()=>this.stop());
      document.addEventListener('visibilitychange',()=>{if(document.hidden)this.cancelInteraction();});
    }
    status(text){if($('hand-status').textContent!==text)$('hand-status').textContent=text;}
    hint(text){if($('gesture-feedback').textContent!==text)$('gesture-feedback').textContent=text;}
    cancelInteraction(){this.gestures.clear();this.callbacks.cancelAll?.();}
    stop(hide=true){
      this.session++;this.enabled=false;this.cancelInteraction();
      cancelAnimationFrame(this.raf);clearTimeout(this.initTimer);clearTimeout(this.frameTimer);
      this.rejectReady?.(new DOMException('已取消','AbortError'));this.rejectReady=null;
      this.worker?.terminate();this.worker=null;
      this.stream?.getTracks().forEach(track=>{track.onended=null;track.stop();});this.stream=null;
      this.video.pause();this.video.srcObject=null;
      this.preview.clearRect(0,0,320,240);
      $('hands').setAttribute('aria-pressed','false');$('hands-label').textContent='开启手势';
      this.callbacks.modeChanged?.();$('hand-panel').hidden=hide;
    }
    fail(error){
      this.lastError=error.message;
      this.stop(false);
      const messages={NotAllowedError:'摄像头未获授权，请允许后重试。',NotFoundError:'没有找到摄像头，仍可用鼠标体验。',NotReadableError:'摄像头正被占用，请关闭其他相机应用。',SecurityError:'请通过本机 Live Server 或 HTTPS 打开。'};
      if(/activeTexture|WebGL|OpenGL|GPU context/i.test(error.message))error.userMessage='浏览器图形加速不可用，请在 Chrome 或 Edge 开启硬件加速后重试。';
      if(/^ASSET_/.test(error.code||''))error.userMessage=error.message;
      if(error.code==='MODEL_INIT'&&!error.userMessage)error.userMessage='资源已下载，但识别引擎启动失败。请使用新版 Chrome 或 Edge，确认已开启图形加速。';
      this.status('手势暂未开启');this.hint(messages[error.name]||error.userMessage||`识别启动失败：${error.message.slice(0,160)}。可再次点击开启手势。`);
      if(!messages[error.name]&&!error.userMessage)console.warn('Hand tracking:',error.message);
    }
    async start(){
      if(this.enabled)return;
      this.stop();const session=++this.session;this.enabled=true;this.lastError=null;
      $('hand-panel').hidden=false;$('hands').setAttribute('aria-pressed','true');$('hands-label').textContent='关闭手势';
      this.status('加载手势识别…');this.hint('正在准备本地识别模型');
      try{
        if(location.protocol==='file:'||!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){const e=new Error('Local HTTP server required');e.userMessage='请在 VS Code 中用 Live Server 打开网页，再开启手势。';throw e;}
        if(!window.Worker||!window.createImageBitmap){const e=new Error('Browser unsupported');e.userMessage='当前浏览器不支持手势识别，请使用新版 Chrome 或 Edge。';throw e;}
        this.status('等待摄像头授权…');this.hint('请允许摄像头；识别资源将在授权后加载');
        const stream=await navigator.mediaDevices.getUserMedia({video:{width:{ideal:640},height:{ideal:480},facingMode:'user',frameRate:{ideal:24,max:30}},audio:false});
        if(session!==this.session){stream.getTracks().forEach(t=>t.stop());return;}
        this.stream=stream;this.video.srcObject=stream;await this.video.play();
        if(session!==this.session)return;
        for(const track of stream.getVideoTracks())track.onended=()=>{if(this.enabled)this.fail(Object.assign(new Error('Camera disconnected'),{userMessage:'摄像头已断开，可重新开启或继续用鼠标。'}));};
        this.status('准备识别资源…');this.hint('摄像头已开启。首次需加载约 19 MB，下载完成的资源会保存在本机。');
        this.worker=new Worker(new URL('hands-worker.js?v=20261022-2',document.baseURI));
        await new Promise((resolve,reject)=>{
          this.rejectReady=reject;
          this.initTimer=setTimeout(()=>reject(Object.assign(new Error('Model loading timed out'),{userMessage:'资源加载超过 5 分钟，请再次开启手势；已下载完成的文件会保留。'})),300000);
          this.worker.onerror=e=>{const error=new Error(e.message||'Worker failed');if(this.rejectReady){reject(error);}else if(this.enabled)this.fail(error);};
          this.worker.onmessage=({data})=>{
            if(session!==this.session)return;
            if(data.type==='ready'){clearTimeout(this.initTimer);this.rejectReady=null;resolve();}
            else if(data.type==='progress'){
              if(data.phase==='initialize'){
                this.status('资源已就绪，正在启动识别…');this.hint('正在准备手势识别，请稍候');
                clearTimeout(this.initTimer);this.initTimer=setTimeout(()=>reject(Object.assign(new Error('Model initialization timed out'),{code:'MODEL_INIT'})),60000);
              }else{
                const percent=Math.min(100,Math.floor(data.loaded/data.total*100));
                this.status(`下载识别资源 ${percent}%`);this.hint(`${(data.loaded/1048576).toFixed(1)} / ${(data.total/1048576).toFixed(1)} MB · 已完成的资源会自动保留`);
              }
            }
            else if(data.type==='error'){const error=Object.assign(new Error(data.message),{code:data.code});if(this.rejectReady)reject(error);else this.fail(error);}
            else if(data.type==='result'){
              clearTimeout(this.frameTimer);this.processing=false;
              this.drawPreview(data.result);
              if(this.callbacks.isInteractive())this.gestures.update(data.result,performance.now());
              else{this.cancelInteraction();this.status('已暂停');this.hint('点击继续，恢复手势控制');}
            }
          };
          this.worker.postMessage({type:'init'});
        });
        if(session!==this.session)return;
        this.processing=false;this.lastFrame=0;
        this.callbacks.modeChanged?.();this.status('寻找双手…');this.hint('食指引路，捏合牵丝');
        const pump=async now=>{
          if(session!==this.session)return;
          this.raf=requestAnimationFrame(pump);
          if(document.hidden||this.processing||this.video.readyState<2||now-this.lastFrame<66)return;
          this.processing=true;this.lastFrame=now;
          try{
            const bitmap=await createImageBitmap(this.video,{resizeWidth:480,resizeHeight:Math.round(480*this.video.videoHeight/this.video.videoWidth)});
            if(session!==this.session){bitmap.close();return;}
            this.worker.postMessage({type:'frame',bitmap,timestamp:now},[bitmap]);
            this.frameTimer=setTimeout(()=>{if(session===this.session)this.fail(new Error('Inference timed out'));},12000);
          }catch(error){if(session===this.session)this.fail(error);}
        };
        this.raf=requestAnimationFrame(pump);
      }catch(error){if(session===this.session&&error.name!=='AbortError')this.fail(error);}
    }
    drawPreview(result){
      const c=this.preview;c.clearRect(0,0,320,240);
      for(const lm of result.landmarks||[]){
        c.strokeStyle='rgba(210,222,191,.65)';c.lineWidth=1.2;c.beginPath();
        for(const [a,b]of bones){c.moveTo((1-lm[a].x)*320,lm[a].y*240);c.lineTo((1-lm[b].x)*320,lm[b].y*240);}c.stroke();
        for(let i=0;i<lm.length;i++){c.fillStyle=i===4||i===8?'#e8cc90':'#c5d4c2';c.beginPath();c.arc((1-lm[i].x)*320,lm[i].y*240,i===8?3.5:1.8,0,Math.PI*2);c.fill();}
      }
    }
  }
  window.HandController=HandController;
})();
