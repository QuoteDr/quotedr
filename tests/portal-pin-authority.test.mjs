import assert from 'node:assert/strict';
import {currentDesignPortal,issueDesignSession,verifyDesignSession} from '../supabase/functions/_shared/portal-design-session.mjs';
function db(saved, rows, error=null){return {from(table){const q={select(){return q},eq(){return q},order(){return q},maybeSingle(){return q},then(resolve){return Promise.resolve({data:table==='quotes'?rows:{value:saved},error}).then(resolve)}};return q}}}
const quote=(pin,date)=>({data:{portal_visible:true,portal_pin:pin},updated_at:date});
const saved=[{id:'p',pin:'1847',name:'Portal',updatedAt:'2020-01-01'}];
for(const pin of ['', '9999'])assert.equal((await currentDesignPortal(db(saved,[quote(pin,'2026-09-28')]),'o','p')).pin,'1847');
assert.equal((await currentDesignPortal(db([{id:'p',pin:''}],[quote('9999','2026-09-28')]),'o','p')).pin,'');
assert.equal((await currentDesignPortal(db([],[quote('1234','2020-01-01'),quote('5678','2026-09-28')]),'o','p')).pin,'5678');
assert.equal(await currentDesignPortal(db([],[]),'o','p'),null);
await assert.rejects(()=>currentDesignPortal(db([],[],'failure'),'o','p'));
const token=await issueDesignSession('test','o','p','1847');
assert.equal(await verifyDesignSession('test',token,'o','p','9999'),false);
console.log('Portal PIN authority regression checks passed');
