/* Inference stays off the animation thread. All assets are served locally. */
self.exports={};
importScripts('./vendor/mediapipe/vision_bundle.js');
const {FilesetResolver,HandLandmarker}=self.exports;
let model;
self.onmessage=async({data})=>{
  if(data.type==='init'){
    try{
      const files=await FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',self.location.href).href);
      model=await HandLandmarker.createFromOptions(files,{
        baseOptions:{modelAssetPath:new URL('./vendor/mediapipe/hand_landmarker.task',self.location.href).href,delegate:'CPU'},
        runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.55,minHandPresenceConfidence:.55,minTrackingConfidence:.55
      });
      self.postMessage({type:'ready'});
    }catch(error){self.postMessage({type:'error',message:error.message});}
  }else if(data.type==='frame'){
    try{
      const result=model.detectForVideo(data.bitmap,data.timestamp);
      self.postMessage({type:'result',result:{landmarks:result.landmarks,handedness:result.handedness}});
    }catch(error){self.postMessage({type:'error',message:error.message});}
    finally{data.bitmap.close();}
  }
};
