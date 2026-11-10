import {FilesetResolver,PoseLandmarker} from '@mediapipe/tasks-vision';
let model:PoseLandmarker|null=null;
self.onmessage=async(e:MessageEvent)=>{
 const {id,bitmap,timeMs,base}=e.data;
 try{
  if(!model){const files=await FilesetResolver.forVisionTasks(base+'wasm');model=await PoseLandmarker.createFromOptions(files,{baseOptions:{modelAssetPath:base+'models/pose.task',delegate:'CPU'},runningMode:'VIDEO',numPoses:2,minPoseDetectionConfidence:0.6,minPosePresenceConfidence:0.6,minTrackingConfidence:0.6});}
  if(!bitmap){self.postMessage({id,ready:true});return;}
  const r=model.detectForVideo(bitmap,timeMs);
  self.postMessage({id,frame:{timeMs,people:r.landmarks.length,points:r.landmarks[0]?.map(p=>({x:p.x,y:p.y,visibility:p.visibility??0}))??[]}});
 }catch(error){self.postMessage({id,error:error instanceof Error?error.message:String(error)});}
 finally{bitmap?.close();}
};
