const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('dashboard.html', 'utf8');
function section(start, end) { return source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))); }
const route = section('async function shareDocumentThroughPortal(', 'async function confirmDashboardPortalZeroPricedItems(');
const open = section('async function shareClientPortal(', 'function copyPortalUrl(');
const readiness = require('../quote-portal-readiness.js');
(async () => {
  for (const date of ['2000-01-01', 'invalid', '2999-01-01']) {
    const quote = {id:'existing',data:{portal_visible:true,style:{expiryDate:date},rooms:[]}};
    const before = JSON.stringify(quote);
    let opened=0;
    const context={allQuotes:[quote],loadDashboardFullQuote:async q=>q,resolveDashboardChangeOrderLockedPortal:async()=>{},configureDashboardChangeOrderContinuePayment:async()=>{throw Error('Must not review payments when viewing');},shareClientPortal:async()=>{opened++;}};
    vm.runInNewContext(route+';this.run=shareDocumentThroughPortal;',context);
    await context.run('existing','Client','');
    assert.equal(opened,1);
    assert.equal(JSON.stringify(quote),before);
  }
  // Execute the real modal opener up to its first DOM operation. No send check
  // or data preparation may run before the existing-portal modal can open.
  const sentinel = Error('Reached modal');
  const context={document:{querySelectorAll(){throw sentinel;}},confirmDashboardPortalZeroPricedItems(){throw Error('Unexpected send check');}};
  vm.runInNewContext(open+';this.run=shareClientPortal;',context);
  await assert.rejects(context.run('existing','Client',''),error=>error===sentinel);
  assert(open.includes('selectedData.portal_visible !== true'),'Existing portal membership is still required');
  assert(!open.includes('confirmDashboardPortalZeroPricedItems('));
  for(const [start,end] of [['async function assignQuoteToPortal(', 'async function createPortalForQuote('],['async function createPortalForQuote(', 'async function confirmRemoveDocumentFromPortal('],['async function sendFollowUpReminder(', 'function normalizeClientName(']]) {
    const begin=source.indexOf(start); const finish=source.indexOf(end,begin);
    assert(source.slice(begin,finish<0?undefined:finish).includes('confirmDashboardPortalZeroPricedItems('),start+' must preserve send checks');
  }
  assert.equal(await readiness.confirmZeroPricedItems({style:{expiryDate:'2000-01-01'},rooms:[]},async()=>true),false);
  console.log('Existing expired/invalid portal opens without send review; publication and follow-up remain guarded.');
})();
