// Local-only synthetic preview. Never included in the public artifact.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
function fixture() {
    const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
    const render = html.slice(html.indexOf('        function renderQuotes('), html.indexOf('        function filterQuotes('))
        .replace('if (window.QuoteDrDashboardUI) QuoteDrDashboardUI.compactCards(el);', '');
    const setup = `
    var allQuotes = [
      {id:'demo-draft',client_name:'Sample Client A',quote_number:'DEMO-001',total:103736.68,status:'draft',data:{quoteTitle:'Basement Renovation'}},
      {id:'demo-invoice',client_name:'Sample Client B',quote_number:'DEMO-002',total:4743.91,status:'invoiced',data:{quoteTitle:'Basement Doors — Phase 1',portal_visible:true,deposit_due_cents:37196,payments:[{type:'deposit',provider:'manual',payment_record_id:'proof-demo',amount_cents:200000,paid_at:'2026-09-25'}]}},
      {id:'demo-upgrades',client_name:'Sample Client C',quote_number:'DEMO-003',total:23181.46,status:'accepted',data:{quoteTitle:'Full Renovation',portal_visible:true,client_upgraded:true}},
      {id:'demo-notes',client_name:'Sample Client D',quote_number:'DEMO-004',total:8400,status:'in_review',data:{quoteTitle:'Kitchen — client notes'}},
      {id:'demo-invalid',client_name:'Sample Client E',quote_number:'DEMO-005',total:2200,status:'voided',data:{quoteTitle:'Superseded invoice',portal_visible:true}},
      {id:'demo-paid',client_name:'Sample Client F',quote_number:'DEMO-006',total:6780,status:'paid',data:{quoteTitle:'Completed bathroom',portal_visible:true}},
      {id:'demo-co',client_name:'Sample Client C',quote_number:'DEMO-007',total:500,status:'pending_approval',data:{quoteTitle:'Additional flooring',parent:'demo-upgrades',portal_visible:true}},
      {id:'demo-sent',client_name:'Sample Client G',quote_number:'DEMO-008',total:3400,status:'sent',data:{quoteTitle:'Deck repair',portal_visible:true,review_request_sent_at:'2026-09-25'}}
    ];
    var dashboardQuoteSelection = new Set(), dashboardBulkBusy = false;
    var dashboardPaymentEvidenceByRecord = {};
    var dashboardManualPaymentReports = {'demo-upgrades':{id:'manual-demo',amount_cents:100000,payment_type:'deposit'}};
    var currentQuotes = allQuotes;
    function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
    function jsAttr(s) { return escapeHtml(JSON.stringify(s)); }
    function getQuoteTitle(q) { return q.data.quoteTitle; }
    function formatDate() { return 'Sep 25, 2026'; }
    function formatPortalAddedAt() { return 'Sep 25, 2026, 12:50 PM'; }
    function dashboardIsInvoiceDocument(q) { return ['invoiced','voided'].includes(q.status); }
    function dashboardDocumentIsInvalid(q) { return q.status === 'voided'; }
    function dashboardPaymentMoney(c) { return '$' + (c / 100).toFixed(2); }
    function dashboardIsPaidForReviewRequest(q) { return q.status === 'paid'; }
    function shouldShowReviewNudge(q) { return q.status === 'paid'; }
    function dashboardManualPaymentLabel() { return 'e-transfer'; }
    function dashboardPaymentEvidenceMarkup() { return '<div class="small">Payment proof attachments</div>'; }
    window.QuoteDrChangeOrders = {isChangeOrder:q=>!!q.data.parent,parentQuoteId:q=>q.data.parent,number:()=>1};
    window.demoCalls = [];
    ['openQuote','deleteQuote','startEditTitle','shareDocumentThroughPortal','openQuoteProfitReport','openClientDocumentPreview','openNotesReview','openQuoteForChangeOrder','invalidateInvoice','restoreInvalidInvoice','sendGoogleReviewRequest','dismissGoogleReviewNudge','sendFollowUpReminder','decideDashboardManualPayment','addDashboardPaymentEvidence','reviewDashboardDepositDecision','updateQuoteStatus','openNewQuoteModal','openPortalManager','openJunkBox','setDefaultDashboardView','openClientFilesPicker','refreshQuotes','qdAlert'].forEach(name=>window[name]=(...args)=>{window.demoCalls.push({name,args});document.getElementById('demoNotice').textContent='Demo: '+name+' (no data changed)';});
    window.QuoteDrBackups={exportAll:()=>window.demoCalls.push({name:'exportAll'})};
    function handleDashboardQuoteCardClick(e,id) { if (!e.target.closest('button,a,input,select,label,summary,details')) openQuote(id); }
    function updateDashboardQuoteSelection() {
      document.getElementById('quoteSelectionCount').textContent = dashboardQuoteSelection.size+' selected';
      document.querySelectorAll('[data-quote-select]').forEach(box=>box.checked=dashboardQuoteSelection.has(box.dataset.quoteSelect));
      if(window.QuoteDrDashboardUI) QuoteDrDashboardUI.syncSelection(dashboardQuoteSelection.size);
    }
    function toggleDashboardQuoteSelection(id,on) { if(on)dashboardQuoteSelection.add(id);else dashboardQuoteSelection.delete(id); updateDashboardQuoteSelection(); }
    function clearDashboardQuoteSelection() { dashboardQuoteSelection.clear(); updateDashboardQuoteSelection(); }
    function selectVisibleDashboardQuotes() { currentQuotes.forEach(q=>dashboardQuoteSelection.add(q.id)); updateDashboardQuoteSelection(); }
    function setView(mode) { document.getElementById('demoNotice').textContent='Demo: '+mode+' view. Sign in locally to test your real board and client files.'; }
    function filterQuotes() { var term=document.getElementById('searchInput').value.toLowerCase(), status=document.getElementById('statusFilter').value; currentQuotes=allQuotes.filter(q=>(q.client_name+' '+q.data.quoteTitle+' '+q.quote_number).toLowerCase().includes(term)&&(status==='all'||q.status===status));renderQuotes(currentQuotes);QuoteDrDashboardUI.compactCards(document.getElementById('quotesList')); }
    ${render}
    renderQuotes(allQuotes);
    window.originalCardActions = Array.from(document.querySelectorAll('#quotesList [onclick], #quotesList [onchange]')).map(n=>n.getAttribute('onclick')||n.getAttribute('onchange'));
    document.getElementById('totalQuotesCount').textContent='8';
    document.getElementById('acceptedQuotesCount').textContent='1';
    document.getElementById('inReviewCount').textContent='1';
    document.getElementById('userName').textContent='Local preview';
    `;
    return html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace('</body>', () => '<script>' + setup + '</script><script src="https://cdn.jsdelivr.net/npm/sortablejs@1.15.3/Sortable.min.js"></script><script src="dashboard-compact.js"></script><script>QuoteDrDashboardUI.setUser("synthetic-preview");</script></body>')
        .replace('<body>', '<body><div id="demoNotice" role="status" style="padding:12px;text-align:center;background:#fff0c2;color:#543b00">LOCAL DESIGN PREVIEW — synthetic quotes only. Actions do not change data. <a href="dashboard.html">Open actual local dashboard</a></div>');
}
function start(port = 8876) {
    const server = http.createServer(async (req, res) => {
        const pathname = new URL(req.url, 'http://localhost').pathname;
        if (pathname === '/' || pathname === '/preview') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fixture()); return; }
        const config = await import('../config/public-artifact.mjs');
        const relative = decodeURIComponent(pathname.slice(1));
        if (!config.publicArtifactConfig.files.includes(relative)) { res.writeHead(404); res.end('Not found'); return; }
        try {
            const types = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
            res.setHeader('Content-Type',(types[path.extname(relative)] || 'application/octet-stream')+'; charset=utf-8');
            res.setHeader('Cache-Control','no-store'); res.end(fs.readFileSync(path.join(root,relative)));
        } catch (_) { res.writeHead(404); res.end('Not found'); }
    });
    return new Promise(resolve=>server.listen(port,'127.0.0.1',()=>resolve(server)));
}
module.exports={start,fixture};
if(require.main===module) start(Number(process.env.PORT)||8876).then(()=>console.log('Local dashboard preview: http://127.0.0.1:8876/preview'));
