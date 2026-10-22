/* Download validated, cached assets before starting off-thread inference. */
let model,initializing=false;
const cacheName='weaving-hands-0.10.32-v2';
const sizes={'vision_bundle.js':137315,'hand_landmarker.task':7819105,'vision_wasm_internal.js':204816,'vision_wasm_internal.wasm':11453626,'vision_wasm_nosimd_internal.js':204669,'vision_wasm_nosimd_internal.wasm':10647962};
const loaded=new Map();
let total=sizes['vision_bundle.js']+sizes['hand_landmarker.task']+sizes['vision_wasm_internal.js']+sizes['vision_wasm_internal.wasm'];
function progress(phase='download'){self.postMessage({type:'progress',phase,loaded:[...loaded.values()].reduce((a,b)=>a+b,0),total});}
function failure(message,code){return Object.assign(new Error(message),{code});}
function validate(bytes,name){
  if(bytes.length!==sizes[name])throw failure(`${name} 文件不完整，请重新加载。`,'ASSET_INVALID');
  if(name.endsWith('.wasm')&&!(bytes[0]===0&&bytes[1]===97&&bytes[2]===115&&bytes[3]===109))throw failure(`${name} 不是有效的识别引擎文件。`,'ASSET_INVALID');
  if(name.endsWith('.task')&&!(bytes[0]===0&&bytes[1]===0&&bytes[2]===80&&bytes[3]===75))throw failure('识别模型内容不正确，请检查部署文件。','ASSET_INVALID');
  if(name.endsWith('.js')&&/^\s*<!?html/i.test(new TextDecoder().decode(bytes.subarray(0,100))))throw failure(`${name} 返回了网页，请检查部署路径。`,'ASSET_INVALID');
}
async function asset(path){
  const url=new URL(path,self.location.href).href,name=path.split('/').pop();
  let cache;
  try{
    cache=await caches.open(cacheName);const saved=await cache.match(url);
    if(saved){const bytes=new Uint8Array(await saved.arrayBuffer());try{validate(bytes,name);loaded.set(name,bytes.length);progress();return bytes;}catch{await cache.delete(url);}}
  }catch{/* Storage may be unavailable; downloading must still work. */}
  for(let attempt=0;attempt<2;attempt++){
    const controller=new AbortController();let timer;
    const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>controller.abort(),60000);};
    try{
      loaded.set(name,0);progress();touch();
      const response=await fetch(url,{signal:controller.signal,cache:attempt?'reload':'default'});
      if(!response.ok)throw failure(`${name} 下载失败（HTTP ${response.status}）。`,'ASSET_HTTP');
      if(/text\/html/i.test(response.headers.get('content-type')||''))throw failure(`${name} 返回了网页，请检查 Cloudflare 输出目录。`,'ASSET_INVALID');
      const chunks=[];let length=0;
      if(response.body){const reader=response.body.getReader();while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);length+=value.length;loaded.set(name,length);touch();progress();}}
      else{const value=new Uint8Array(await response.arrayBuffer());chunks.push(value);length=value.length;}
      const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      validate(bytes,name);loaded.set(name,length);progress();
      if(cache){try{await cache.put(url,new Response(bytes,{headers:{'Content-Type':name.endsWith('.wasm')?'application/wasm':name.endsWith('.js')?'application/javascript':'application/octet-stream'}}));}catch{/* Cache quota must not prevent recognition. */}}
      return bytes;
    }catch(error){
      controller.abort();if(error.code==='ASSET_HTTP'||error.code==='ASSET_INVALID')throw error;
      if(attempt===1)throw failure(`${name} 下载连接中断。请再次开启手势；已下载完成的文件会保留。`,'ASSET_NETWORK');
    }finally{clearTimeout(timer);}
  }
}
function blobURL(bytes,type){return URL.createObjectURL(new Blob([bytes],{type}));}
async function initialize(){
  const urls=[];
  try{
    const bundle=await asset('./vendor/mediapipe/vision_bundle.js');
    self.exports={};const bundleURL=blobURL(bundle,'application/javascript');urls.push(bundleURL);importScripts(bundleURL);
    const {FilesetResolver,HandLandmarker}=self.exports;
    if(!FilesetResolver||!HandLandmarker)throw failure('识别脚本未能启动，请检查浏览器兼容性。','RUNTIME_UNSUPPORTED');
    const files=await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',self.location.href).href);
    total=sizes['vision_bundle.js']+sizes['hand_landmarker.task']+sizes[files.wasmLoaderPath.split('/').pop()]+sizes[files.wasmBinaryPath.split('/').pop()];progress();
    const [loader,wasm,buffer]=await Promise.all([asset(files.wasmLoaderPath),asset(files.wasmBinaryPath),asset('./vendor/mediapipe/hand_landmarker.task')]);
    files.wasmLoaderPath=blobURL(loader,'application/javascript');files.wasmBinaryPath=blobURL(wasm,'application/wasm');urls.push(files.wasmLoaderPath,files.wasmBinaryPath);
    progress('initialize');
    model=await HandLandmarker.createFromOptions(files,{
      baseOptions:{modelAssetBuffer:buffer,delegate:'CPU'},
      runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55
    });self.postMessage({type:'ready'});
  }finally{for(const url of urls)URL.revokeObjectURL(url);}
}
self.onmessage=async({data})=>{
  if(data.type==='init'&&!initializing){
    initializing=true;try{await initialize();}catch(error){self.postMessage({type:'error',message:error.message,code:error.code||'MODEL_INIT'});}finally{initializing=false;}
  }else if(data.type==='frame'){
    try{
      if(!model)throw failure('识别模型尚未准备完成。','MODEL_NOT_READY');
      const result=model.detectForVideo(data.bitmap,data.timestamp);
      self.postMessage({type:'result',result:{landmarks:result.landmarks,handedness:result.handedness}});
    }catch(error){self.postMessage({type:'error',message:error.message,code:error.code||'INFERENCE'});}
    finally{data.bitmap.close();}
  }
};
