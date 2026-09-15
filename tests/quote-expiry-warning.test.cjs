const assert=require('node:assert/strict');
const api=require('../quote-portal-readiness.js');
const today=new Date(2026,8,15);
for(const [date,pattern] of [['2026-09-14',/already expired/],['2026-09-15',/today/],['2026-09-21',/6 days/]])assert.match(api.expiryWarningMessage({style:{expiryDate:date}},today),pattern);
assert.equal(api.expiryWarningMessage({style:{expiryDate:'2026-09-22'}},today),'');
assert.equal(api.expiryWarningMessage({},today),'');
assert.equal(api.expiryWarningMessage({type:'invoice',style:{expiryDate:'2026-09-14'}},today),'');
(async()=>{assert.equal(await api.confirmZeroPricedItems({style:{expiryDate:'2000-01-01'},rooms:[]},async()=>false),false);console.log('Expiry warning boundaries and cancellation passed');})();
