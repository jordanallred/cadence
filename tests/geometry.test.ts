import {it,expect} from 'vitest';
import {angle} from '../src/analysis/geometry';
const p=(x:number,y:number)=>({x,y,visibility:1});
it('measures a right angle',()=>expect(angle(p(0,0),p(0,1),p(1,1),1920,1080)).toBeCloseTo(90));
it('uses pixel aspect ratio rather than normalized square angles',()=>expect(angle(p(0,0),p(0,1),p(1,0),200,100)).toBeCloseTo(63.4349488));
it('rejects zero length bones',()=>expect(angle(p(0,0),p(0,0),p(1,1),100,100)).toBeNull());
