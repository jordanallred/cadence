import type {PoseFrame,View,Metric,QualityIssue} from '../domain/types';
import {angle,quantile} from './geometry';
export const joints:Record<string,number>={leftShoulder:11,rightShoulder:12,leftElbow:13,rightElbow:14,leftWrist:15,rightWrist:16,leftHip:23,rightHip:24,leftKnee:25,rightKnee:26,leftAnkle:27,rightAnkle:28,leftHeel:29,rightHeel:30,leftToe:31,rightToe:32};
export function measureClip(frames:PoseFrame[],view:View,w:number,h:number):{metrics:Metric[];quality:QualityIssue[]}{
 const quality:QualityIssue[]=[],metrics:Metric[]=[];
 const reject=(code:string,message:string)=>({metrics:[],quality:[...quality,{code,severity:'reject' as const,message}]});
 if(frames.length<40)return reject('duration','Record at least 8 seconds of steady pedaling with the whole rider visible.');
 if(frames.some((f,n)=>n>0&&f.timeMs<=frames[n-1].timeMs))return reject('timestamps','Frame timestamps are not increasing. Reimport the original video.');
 if(frames.some(f=>f.people>1))return reject('people','More than one person was detected. Record only the rider.');
 const side=view==='left'||view==='right',off=view==='right'?1:0;
 const required=side?[11+off,23+off,25+off,27+off]:[11,12,23,24,25,26,27,28];
 const usable=frames.filter(f=>f.people===1&&required.every(j=>{const p=f.points[j];return p&&p.visibility>=0.65&&p.x>0.01&&p.x<0.99&&p.y>0.01&&p.y<0.99;}));
 if(usable.length/frames.length<0.8)return reject('visibility','Too many joints are hidden, cropped or uncertain. Improve lighting, camera placement or clothing contrast.');
 if(usable.some((f,n)=>n>0&&f.timeMs-usable[n-1].timeMs>350))return reject('gaps','Tracking has gaps. Re-record without obstructions.');
 const ankles=usable.map(f=>f.points[27+off].y),span=quantile(ankles,0.95)-quantile(ankles,0.05);
 const smooth=ankles.map((_,n)=>quantile(ankles.slice(Math.max(0,n-1),n+2),0.5));
 const peaks:number[]=[];
 for(let n=2;n<smooth.length-2;n++)if(smooth[n]>=smooth[n-1]&&smooth[n]>smooth[n+1]&&smooth[n]>quantile(ankles,0.65)&&(peaks.length===0||usable[n].timeMs-usable[peaks.at(-1)!].timeMs>400))peaks.push(n);
 if(span<0.025||peaks.length<4)return reject('cycles','Could not identify at least three complete pedal cycles. Use a steady 10–20 second recording.');
 const periods=peaks.slice(1).map((p,n)=>usable[p].timeMs-usable[peaks[n]].timeMs);
 if(periods.some(p=>p<400||p>2500)||Math.max(...periods)/Math.min(...periods)>1.6)return reject('cycles','Pedal cycles were inconsistent. Check tracking and record at a steady cadence.');
 quality.push({code:'projection',severity:'warning',message:'2D estimates. Camera perspective, clothing and landmark errors affect every measurement; review overlays before using results.'});
 const add=(id:string,label:string,value:number,unit:string,sampleCount:number)=>metrics.push({id,label,value:Math.round(value*10)/10,unit,sampleCount,confidence:'moderate',limitations:['Projected measurement; not clinical validation.','Tracking confidence is not an angle-error bound.']});
 add('cycles','Complete cycles',peaks.length-1,'cycles',peaks.length-1);
 add('cadence','Estimated cadence',60000/quantile(periods,0.5),'rpm',periods.length);
 if(side){
  const flex=usable.map(f=>{const p=f.points;const a=angle(p[23+off],p[25+off],p[27+off],w,h);return a===null?NaN:180-a;});
  const mins:number[]=[],maxs:number[]=[];
  for(let n=1;n<peaks.length;n++){const cycle=flex.slice(peaks[n-1],peaks[n]+1);mins.push(quantile(cycle,0.05));maxs.push(quantile(cycle,0.95));}
  add('knee-min','Knee flexion · extension',quantile(mins,0.5),'°',mins.length);
  add('knee-max','Knee flexion · top',quantile(maxs,0.5),'°',maxs.length);
  const torso=usable.map(f=>Math.atan2(Math.abs((f.points[11+off].y-f.points[23+off].y)*h),Math.abs((f.points[11+off].x-f.points[23+off].x)*w))*180/Math.PI);
  add('torso','Torso to horizontal',quantile(torso,0.5),'°',usable.length);
  const hips=usable.map(f=>angle(f.points[11+off],f.points[23+off],f.points[25+off],w,h)).filter((x):x is number=>x!==null);
  add('hip','Minimum projected hip angle',quantile(hips,0.05),'°',hips.length);
 }else{
  const width=quantile(usable.map(f=>Math.abs(f.points[23].x-f.points[24].x)*w),0.5);
  if(width<0.04*w)return reject('view','The hips are too narrow in this view. Place the camera directly in front or behind.');
  const pelvis=usable.map(f=>Math.atan2((f.points[24].y-f.points[23].y)*h,Math.abs((f.points[24].x-f.points[23].x)*w))*180/Math.PI);
  add('pelvic-rock','Pelvic tilt excursion',quantile(pelvis,0.95)-quantile(pelvis,0.05),'°',usable.length);
  for(const [name,j] of [['Left',25],['Right',26]] as const){const d=usable.map(f=>(f.points[j].x-(f.points[23].x+f.points[24].x)/2)*w/width*100);add(name.toLowerCase()+'-knee',name+' knee lateral excursion',quantile(d,0.95)-quantile(d,0.05),'% hip width',usable.length);}
  const shoulder=usable.map(f=>Math.atan2((f.points[12].y-f.points[11].y)*h,Math.abs((f.points[12].x-f.points[11].x)*w))*180/Math.PI);
  add('shoulder','Shoulder tilt excursion',quantile(shoulder,0.95)-quantile(shoulder,0.05),'°',usable.length);
 }
 return {metrics,quality};
}
