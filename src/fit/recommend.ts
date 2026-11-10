import type {Intake,ClipAnalysis,FitEvent,Recommendation} from '../domain/types';
import {assessContext,advice} from './assessment';
export function recommend(i:Intake,clips:ClipAnalysis[],events:FitEvent[]):Recommendation[]{
 const context=assessContext(i,events);if(context.some(r=>r.outcome==='assessment'||r.id==='screen'))return context;
 const usable=clips.filter(c=>!c.quality.some(q=>q.severity==='reject')&&c.metrics.length);
 const has=(v:string)=>usable.some(c=>c.view===v);
 if(!(has('left')||has('right'))||!has('front')||!has('rear'))return [...context,advice('coverage','information','Complete your three-view assessment','One or more usable side, front or rear views are missing.','Import and analyze each required view before making fit changes. Partial measurements remain available below.')];
 if(usable.some(c=>!c.reviewed))return [...context,advice('review','information','Review the tracking overlays','Joint tracking has not been checked for every view.','Open each recording and check the skeleton throughout the clip. Correct misplaced joints or re-record if tracking is unreliable.')];
 if(i.symptom==='none')return [...context,advice('comfortable','no-change','Keep a comfortable position','You have not reported discomfort. Angle ranges alone do not establish a need to change your bike.','Keep this as your baseline. Use ride feedback to assess comfort over your usual duration.',{sources:['review','product']})];
 if(context.length)return context;
 const side=usable.filter(c=>c.view==='left'||c.view==='right');const values=side.map(c=>c.metrics.find(m=>m.id==='knee-min')?.value).filter((v):v is number=>v!==undefined);
 if(values.length>1&&Math.max(...values)-Math.min(...values)>8)return [advice('disagreement','information','Check the difference between side views','Left and right extension measurements differ substantially.','Check camera alignment and tracking; repeat both views. These videos cannot establish a structural asymmetry.')];
 const knee=values[0];
 if(i.symptom==='knee'&&['road','mountain'].includes(i.discipline)&&knee!==undefined&&(knee<25||knee>45)){
 if(!i.mechanicalLimits)return [advice('limits','information','Check adjustment limits first','A saddle-height experiment may be worth reviewing, but the mechanical limits are not confirmed.','Check seatpost insertion, rail markings and torque instructions; record your baseline and confirm the limits in your profile.')];
 return [advice('saddle','experiment',knee<25?'Consider a lower saddle position':'Consider a higher saddle position',`Your reviewed side view estimates ${knee}° of knee flexion near maximum extension. This is outside a deliberately broad 25–45° review band.`,`${knee<25?'Lower':'Raise'} the saddle by a small, measured amount within its manufacturer limits. Choose and record the actual amount; this video does not determine a precise millimeter correction. Change nothing else.`,{alternatives:'Camera angle, landmark placement, ankle movement, training load and non-fit causes may explain the finding. The review band is a product heuristic, not a validated treatment threshold.',prerequisites:'Known baseline, reliable overlays, manufacturer limits and correct torque. Stop if symptoms worsen.',recheck:'Repeat the three views and a comfortable easy ride. Judge symptoms as well as movement; revert an unhelpful change.',sources:['dynamic','review','product']})];
 }
 return [advice('individual','assessment','A specific adjustment needs more evidence','The available measurements and symptom context do not justify a particular hardware change.','Use the report with a qualified fitter or clinician to investigate contact points, load and symptoms. Keep the current setup until there is a supported reason to change it.',{sources:['review','product']})];
}
