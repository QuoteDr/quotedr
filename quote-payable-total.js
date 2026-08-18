(function(root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.QuoteDrPayableTotal = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
    function finite(value) {
        var number = Number(value);
        return Number.isFinite(number) ? number : 0;
    }

    function toCents(value) {
        return Math.round((finite(value) + Number.EPSILON) * 100);
    }

    function fromCents(value) {
        return Math.round(finite(value)) / 100;
    }

    function depositCents(totalCents, terms) {
        totalCents = Math.max(0, Math.round(finite(totalCents)));
        terms = terms || {};
        if (!terms.deposit_required || terms.kind === 'none' || !totalCents) return 0;
        if (terms.kind === 'fixed') {
            return Math.min(totalCents, Math.max(0, Math.round(finite(terms.fixed_cents))));
        }
        var percent = Math.min(100, Math.max(1, finite(terms.percent) || 50));
        return Math.min(totalCents, Math.max(1, Math.round(totalCents * percent / 100)));
    }

    function calculate(input) {
        input = input || {};
        var subtotalCents = toCents(input.subtotal);
        var adjustmentCents = toCents(input.adjustment);
        var taxableSubtotalCents = subtotalCents + adjustmentCents;
        var taxRate = Math.max(0, finite(input.taxRate));
        var taxCents = input.taxEnabled === false ? 0 : Math.round(taxableSubtotalCents * taxRate);
        var payableTotalCents = Math.max(0, taxableSubtotalCents + taxCents);
        var paidCents = Math.min(payableTotalCents, Math.max(0, toCents(input.paid)));
        var balanceDueCents = payableTotalCents - paidCents;
        var requiredDepositCents = depositCents(payableTotalCents, input.terms);
        var depositDueCents = Math.max(0, requiredDepositCents - paidCents);
        return {
            subtotalCents: subtotalCents,
            adjustmentCents: adjustmentCents,
            taxableSubtotalCents: taxableSubtotalCents,
            taxCents: taxCents,
            payableTotalCents: payableTotalCents,
            paidCents: paidCents,
            balanceDueCents: balanceDueCents,
            requiredDepositCents: requiredDepositCents,
            depositDueCents: depositDueCents,
            remainingAfterDepositCents: payableTotalCents - requiredDepositCents
        };
    }

    return {
        toCents: toCents,
        fromCents: fromCents,
        depositCents: depositCents,
        calculate: calculate
    };
});
