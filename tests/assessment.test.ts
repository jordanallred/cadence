import {describe,it,expect} from 'vitest';
import {assessContext} from '../src/fit/assessment';
import {defaultIntake} from '../src/domain/types';
describe('context before changes',()=>{
 it('NHS back emergency symptoms override fit experiments',()=>expect(assessContext({...defaultIntake,screen:'emergency-back'},[])[0]?.urgency).toBe('emergency'));
 it('NHS urgent knee symptoms request urgent assessment',()=>expect(assessContext({...defaultIntake,screen:'urgent-knee'},[])[0]?.urgency).toBe('urgent'));
 it('unknown screen requests information',()=>expect(assessContext(defaultIntake,[])[0]?.outcome).toBe('information'));
 it('worsening after a ride calls for reassessment',()=>expect(assessContext({...defaultIntake,screen:'none'},[{id:'a',at:'now',kind:'ride',detail:'',response:'worse'}])[0]?.outcome).toBe('assessment'));
 it('symptoms outside cycling do not become a fit diagnosis',()=>expect(assessContext({...defaultIntake,screen:'none',symptom:'back',outsideCycling:true},[])[0]?.outcome).toBe('assessment'));
 it('two unhelpful experiments stop endless adjustment',()=>expect(assessContext({...defaultIntake,screen:'none'},[{id:'a',at:'now',kind:'ride',detail:'',experimentId:'one',response:'same'},{id:'b',at:'now',kind:'ride',detail:'',experimentId:'two',response:'same'}])[0]?.outcome).toBe('assessment'));
 it('negative screen is no diagnosis or medical clearance',()=>expect(assessContext({...defaultIntake,screen:'none'},[])).toEqual([]));
});
