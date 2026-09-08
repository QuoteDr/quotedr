// Private dashboard report: consumes an already-authorized saved snapshot only.
// No client viewer, network requests, persistence, or quote mutations.
(function(root) {
    'use strict';
    const num = (v, fallback = 0) => Number.isFinite(parseFloat(v)) ? parseFloat(v) : fallback;
    const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const money = v => '$' + num(v).toLocaleString('en-CA', {minimumFractionDigits:2, maximumFractionDigits:2});
    function selected(item) {
        if (item.upgradeGroups?.length) return item.upgradeGroups.flatMap(g => (g.options || []).filter(o => (g.selectedOptionIds || []).includes(o.id)));
        return item.upgraded && item.upgrade ? [item.upgrade] : [];
    }
    function material(item) {
        const qty = num(item.quantity, num(item._baseQuantity));
        const captured = item._itemUpgradeBaseCaptured === true || (item.upgraded === true && item._baseRate != null && Number.isFinite(Number(item._baseRate)));
        let total = qty * num(captured ? (item._baseMaterialCost ?? item.materialCost) : item.materialCost);
        selected(item).forEach(o => {
            const type = String(o.upgradeType || o.type || o.mode || 'replacement').toLowerCase().replace(/[ -]/g, '_');
            if (o.requiresConsultation || type === 'consultation') return;
            const q = o.quantityMode === 'manual' ? num(o.manualQuantity) : o.quantityMode === 'override' ? num(o.quantityOverride) : o.quantityMode === 'multiplier' ? qty * num(o.quantityMultiplier, 1) : qty;
            const cost = q * num(o.materialCost ?? o.material_cost);
            total = type === 'replacement' ? cost : total + cost;
        });
        return total;
    }
    function calculate(quote) {
        const data = quote.data || {};
        const rooms = (data.rooms || []).map(room => ({name:room.name, scope:room.scope || room.notes, lines:(room.items || []).filter(i => !i._removed).map(item => {
            const included = !item.optional || item.optionalSelectedByDefault !== false;
            const tbd = item.priceTbd === true || item.pricingMode === 'tbd';
            const factor = 1 + (Math.min(100, Math.max(0,num(room.markup))) + Math.max(0,num(item.markup))) / 100;
            const revenue = tbd ? 0 : root.QuoteDrDiscounts.chargedTotal(item) * factor;
            const materials = material(item);
            return {item, included, tbd, revenue, materials, remainder:revenue-materials, upgrades:selected(item)};
        })}));
        const lines = rooms.flatMap(r => r.lines).filter(l => l.included);
        return {rooms, revenue:lines.reduce((s,l)=>s+l.revenue,0), materials:lines.reduce((s,l)=>s+l.materials,0)};
    }
    function html(quote) {
        const data = quote.data || {};
        if (data.documentType === 'change_order' || data.type === 'change_order') return '<p>Change-order profit requires original-versus-revised cost comparisons. This report does not estimate profit for change orders yet.</p>';
        const report = calculate(quote);
        let out = '<p class="text-muted">Private, read-only saved quote. No client view is recorded. Amounts exclude tax. Remainder is revenue less materials—not net profit; your labour and overhead are not deducted. Selected options follow the saved builder selections.</p>';
        out += '<div class="alert alert-light border"><strong>Included lines:</strong> Revenue '+money(report.revenue)+' · Materials '+money(report.materials)+' · <strong>Before labour &amp; overhead '+money(report.revenue-report.materials)+'</strong></div>';
        out += '<p class="small text-muted">Line figures include line discounts and room/item markups. Quote-wide adjustments, tax and payments are not allocated to individual lines. Saved document total: '+money(quote.total ?? data.grandTotal)+'. Zero material estimates may mean costs have not been entered.</p>';
        report.rooms.forEach(room => {
            out += '<h3 class="h5 mt-4">'+esc(room.name || 'Room')+'</h3>';
            const included = room.lines.filter(l => l.included);
            const revenue = included.reduce((s,l) => s+l.revenue,0);
            const costs = included.reduce((s,l) => s+l.materials,0);
            out += '<p class="small">Room revenue '+money(revenue)+' · Materials '+money(costs)+' · Before labour &amp; overhead '+money(revenue-costs)+'</p>';
            if (room.scope) out += '<p>'+esc(room.scope)+'</p>';
            let category;
            room.lines.forEach(l => {
                const i = l.item;
                if (i.category !== category) {category=i.category; out += '<h4 class="h6 bg-light p-2 mt-3">'+esc(category || 'Uncategorized')+'</h4>';}
                out += '<article class="border rounded p-3 mb-2"><strong>'+esc(i.description || i.serviceName || i.name || 'Line item')+'</strong>';
                out += '<div class="small text-muted">'+esc(i.quantity)+' '+esc(i.unitType || i.unit || '')+(l.included ? '' : ' · Optional—not included in totals')+'</div>';
                if (i.itemDescription) out += '<p class="mt-2" style="white-space:pre-wrap">'+esc(i.itemDescription)+'</p>';
                if (i.notes) out += '<p class="small" style="white-space:pre-wrap">'+esc(i.notes)+'</p>';
                l.upgrades.forEach(o => {out += '<div class="small">Selected: '+esc(o.name)+' ('+esc(o.upgradeType || o.type || 'replacement')+')</div>';});
                out += '<div class="d-flex flex-wrap gap-3 mt-2"><span>Revenue: <strong>'+ (l.tbd ? 'Price TBD' : money(l.revenue))+'</strong></span><span>Materials: <strong>'+money(l.materials)+'</strong></span><span>Before labour &amp; overhead: <strong>'+money(l.remainder)+'</strong> ('+(l.revenue ? (l.remainder/l.revenue*100).toFixed(1)+'%' : 'margin N/A')+')</span></div></article>';
            });
        });
        return out;
    }
    function open(quote) {
        const dialog = document.createElement('dialog');
        dialog.style.cssText = 'box-sizing:border-box;width:min(1100px,96vw);max-height:90vh;border:1px solid #ccc;border-radius:12px;padding:24px;overflow:auto;overflow-wrap:anywhere';
        dialog.innerHTML = '<div class="d-flex justify-content-between gap-3"><h2 class="h4">'+esc(quote.data?.fileName || quote.quote_number || 'Quote')+' — Private Profit Report</h2><button type="button" class="btn btn-outline-secondary align-self-start">Close</button></div>'+html(quote);
        dialog.querySelector('button').onclick = () => dialog.close();
        dialog.addEventListener('close', () => dialog.remove());
        document.body.appendChild(dialog);
        dialog.showModal();
    }
    root.QuoteDrProfitReport = {calculate, material, html, open};
})(typeof window !== 'undefined' ? window : globalThis);
