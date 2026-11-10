import {it,expect} from 'vitest';
import {parseSession} from '../src/storage/portable';
import {newSession} from '../src/domain/types';
it('portable metadata preserves rider text as data',()=>{const s=newSession();s.intake.name='<script>alert(1)</script>';expect(parseSession(JSON.stringify(s)).intake.name).toBe(s.intake.name);});
it('rejects an incompatible schema',()=>expect(()=>parseSession('{"schemaVersion":9}')).toThrow());
it('rejects invalid values instead of creating an empty fit',()=>{const s=newSession();s.intake.severity=99;expect(()=>parseSession(JSON.stringify(s))).toThrow();});
