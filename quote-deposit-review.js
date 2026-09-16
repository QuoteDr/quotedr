// Contractor-only deposit review. No payment is taken by this dialog.
(function(root) {
    'use strict';
    function quoteKey(data) { return String(data.quoteNumber || data._localBackupId || data.supabaseId || ''); }
    function needsReview(data, settings) {
        data = data || {};
        var type = data.documentType || data.type || 'quote';
        return type === 'quote' && data.portal_visible !== true &&
            settings && settings.deposit_ask_each_quote === true &&
            !(data.style && data.style.depositReviewed === true && data.style.depositReviewedFor === quoteKey(data) && ['show', 'hide'].includes(data.style.depositMode));
    }
    function applyChoice(data, choice) {
        if (!choice || !['show', 'hide'].includes(choice.mode)) throw new Error('Choose whether to request a deposit.');
        var amount = Number(choice.amount);
        var kind = choice.kind === 'fixed' ? 'fixed' : 'percent';
        if (choice.mode === 'show' && (!Number.isFinite(amount) || amount <= 0 || (kind === 'percent' && amount > 100))) {
            throw new Error(kind === 'percent' ? 'Enter a percentage greater than 0 and no more than 100.' : 'Enter a deposit amount greater than $0.');
        }
        data.style = Object.assign({}, data.style, {
            depositReviewed: true, depositReviewedFor: quoteKey(data), depositMode: choice.mode, depositKind: kind,
            depositPercent: kind === 'percent' && choice.mode === 'show' ? amount : 50,
            depositFixedCents: kind === 'fixed' && choice.mode === 'show' ? Math.round(amount * 100) : 0
        });
        data.payment_terms = {
            version: 2, deposit_required: choice.mode === 'show',
            kind: choice.mode === 'hide' ? 'none' : kind,
            percent: choice.mode === 'show' && kind === 'percent' ? amount : null,
            fixed_cents: choice.mode === 'show' && kind === 'fixed' ? Math.round(amount * 100) : null,
            currency: String(data.currency || 'CAD').toUpperCase(), due: 'after_acceptance', source: 'document'
        };
        var total = Number.isFinite(Number(data.quoted_total_cents)) && data.quoted_total_cents != null
            ? Math.max(0, Math.round(Number(data.quoted_total_cents))) : Math.max(0, Math.round(Number(data.grandTotal || 0) * 100));
        data.deposit_due_cents = choice.mode === 'hide' ? 0 : Math.min(total, kind === 'fixed' ? Math.round(amount * 100) : Math.max(1, Math.round(total * amount / 100)));
        return data;
    }
    function choose(data, settings) {
        return new Promise(function(resolve) {
            var dialog = document.createElement('dialog');
            dialog.style.cssText = 'border:0;border-radius:12px;padding:24px;width:min(480px,90vw);box-shadow:0 12px 60px #0006';
            dialog.setAttribute('aria-labelledby', 'depositReviewTitle');
            dialog.innerHTML = '<h4 id="depositReviewTitle">Deposit for this quote</h4><p>Choose before sharing. This does not charge the client. Payment options appear after acceptance.</p>' +
                '<label class="form-label" for="depositReviewMode">Request a deposit?</label><select id="depositReviewMode" class="form-select mb-3"><option value="">Choose an option</option><option value="show">Request a deposit</option><option value="hide">No deposit</option></select>' +
                '<div id="depositReviewAmounts"><label for="depositReviewKind">Deposit type</label><select id="depositReviewKind" class="form-select mb-2"><option value="percent">Percentage</option><option value="fixed">Fixed amount</option></select><label for="depositReviewAmount">Amount (% or currency amount)</label><input id="depositReviewAmount" class="form-control" type="number" min="0.01" step="0.01"></div>' +
                '<p id="depositReviewError" class="text-danger mt-2" role="alert"></p><div class="d-flex gap-2 justify-content-end"><button type="button" class="btn btn-outline-secondary" data-cancel>Cancel</button><button type="button" class="btn btn-primary" data-apply>Use for this quote</button></div>';
            document.body.appendChild(dialog);
            var mode = dialog.querySelector('#depositReviewMode'), kind = dialog.querySelector('#depositReviewKind'), amount = dialog.querySelector('#depositReviewAmount');
            var style = data.style || {};
            mode.value = style.depositReviewed ? style.depositMode : '';
            kind.value = style.depositReviewed ? style.depositKind : (settings.deposit_default_kind || 'percent');
            function suggestedAmount() {
                amount.value = kind.value === 'fixed' ? Number(settings.deposit_default_fixed_cents || 0) / 100 : Number(settings.deposit_default_pct || 50);
            }
            suggestedAmount();
            if (style.depositReviewed) amount.value = kind.value === 'fixed' ? Number(style.depositFixedCents || 0) / 100 : Number(style.depositPercent || 50);
            kind.onchange = suggestedAmount;
            mode.onchange = function() { dialog.querySelector('#depositReviewAmounts').hidden = mode.value !== 'show'; };
            mode.onchange();
            function finish(result) { dialog.close(); dialog.remove(); resolve(result); }
            dialog.addEventListener('cancel', function(event) { event.preventDefault(); finish(null); });
            dialog.querySelector('[data-cancel]').onclick = function() { finish(null); };
            dialog.querySelector('[data-apply]').onclick = function() {
                var choice = {mode:mode.value, kind:kind.value, amount:amount.value};
                try { applyChoice({}, choice); finish(choice); }
                catch(error) { dialog.querySelector('#depositReviewError').textContent = error.message; }
            };
            dialog.showModal();
            mode.focus();
        });
    }
    async function review(data, force) {
        if (!data || (data.documentType || data.type || 'quote') !== 'quote') return true;
        if (data.portal_visible === true) {
            if (force && typeof root.qdAlert === 'function') await root.qdAlert('This quote is already shared. Remove it from the portal to edit, or create a new revision. Its existing deposit terms have not changed.');
            return true;
        }
        var settings;
        try {
            settings = typeof root.loadPaymentSettings === 'function' ? await root.loadPaymentSettings() : null;
            if (typeof root.loadPaymentSettings !== 'function') throw new Error('Payment settings could not be verified. Please refresh and try again.');
            settings = settings || {};
            if (!force && !needsReview(data, settings)) return true;
            var choice = await choose(data, settings);
            if (!choice) return false;
            applyChoice(data, choice);
            if (typeof root.collectQuoteData === 'function') {
                [root._loadedQuoteData, root._currentQuoteData].forEach(function(current) {
                    if (current) { current.style = data.style; current.payment_terms = data.payment_terms; current.deposit_due_cents = data.deposit_due_cents; }
                });
                if (typeof root.applyQuoteStyleToControls === 'function') root.applyQuoteStyleToControls(data.style);
                if (typeof root.markUnsaved === 'function') root.markUnsaved();
            }
            return true;
        } catch(error) {
            if (typeof root.qdAlert === 'function') await root.qdAlert(error.message || 'Deposit review is unavailable. Please try again.');
            else root.alert(error.message || 'Deposit review is unavailable.');
            return false;
        }
    }
    root.QuoteDrDepositReview = {quoteKey:quoteKey, needsReview:needsReview, applyChoice:applyChoice, review:review};
    if (typeof module !== 'undefined') module.exports = root.QuoteDrDepositReview;
})(typeof window !== 'undefined' ? window : globalThis);
