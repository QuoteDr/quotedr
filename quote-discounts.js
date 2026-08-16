// Shared QuoteDr line-item discount math.
(function(global) {
    'use strict';

    function number(value, fallback) {
        var parsed = parseFloat(value);
        return isFinite(parsed) ? parsed : (fallback || 0);
    }

    function quantity(item) {
        return Math.max(0, number(item && item.quantity, 0));
    }

    function hasMutatedUpgradeRate(item) {
        return !!item && (
            item._baseRate !== undefined ||
            item._baseTotal !== undefined ||
            item._baseMaterialCost !== undefined ||
            item._baseUnitType !== undefined
        );
    }

    function upgradeType(item) {
        var raw = item && item.upgrade ? (item.upgrade.type || item.upgrade.upgradeType || item.upgrade.mode || '') : '';
        raw = String(raw || '').toLowerCase().replace(/[\s-]+/g, '_');
        return raw === 'add_on' || raw === 'addon' || raw === 'addition' ? 'add_on' : 'replacement';
    }

    function activeRate(item) {
        if (!item) return 0;
        var rate = Math.max(0, number(item.rate, 0));
        if (item.upgraded && item.upgrade && item.upgrade.rate !== undefined) {
            if (hasMutatedUpgradeRate(item)) return rate;
            var upgradeRate = Math.max(0, number(item.upgrade.rate, 0));
            return upgradeType(item) === 'add_on' ? rate + upgradeRate : upgradeRate;
        }
        return rate;
    }

    function roundMoney(value) {
        return Math.round(number(value, 0) * 100) / 100;
    }

    function originalTotal(item) {
        if (!item) return 0;
        if (item._undiscountedTotal !== undefined && item._undiscountedTotal !== null && item._undiscountedTotal !== '') {
            return roundMoney(Math.max(0, number(item._undiscountedTotal, 0)));
        }
        if (item.upgraded && item._itemUpgradeBaseCaptured === true && Array.isArray(item.upgradeGroups) && item.upgradeGroups.length) {
            var upgradedGroupTotal = explicitTotal(item);
            if (upgradedGroupTotal !== null) return Math.max(0, upgradedGroupTotal);
        }
        if (item.upgraded && item.upgrade && !hasMutatedUpgradeRate(item) && item.upgrade.total !== undefined && item.upgrade.total !== null && item.upgrade.total !== '') {
            return roundMoney(Math.max(0, number(item.upgrade.total, 0)));
        }
        return roundMoney(quantity(item) * activeRate(item));
    }

    function baseTotal(item) {
        if (!item) return 0;
        if (item._basePriceTbd === true) return 0;
        var baseQuantity = item._baseQuantity !== undefined && item._baseQuantity !== null
            ? Math.max(0, number(item._baseQuantity, 0))
            : quantity(item);
        var baseRate = item._baseRate !== undefined && item._baseRate !== null
            ? Math.max(0, number(item._baseRate, 0))
            : Math.max(0, number(item.rate, 0));
        return roundMoney(baseQuantity * baseRate);
    }

    function appliesToUpgrades(item) {
        return !item || item.discountAppliesToUpgrades !== false;
    }

    function discountableTotal(item) {
        var total = originalTotal(item);
        if (appliesToUpgrades(item)) return total;
        return roundMoney(Math.min(total, baseTotal(item)));
    }

    function discountAmount(item) {
        var total = originalTotal(item);
        if (!item || total <= 0) return 0;

        var type = String(item.discountType || 'none').toLowerCase();
        var value = Math.max(0, number(item.discountValue, 0));
        var eligibleTotal = discountableTotal(item);
        var discount = 0;

        if (type === 'amount') {
            discount = value;
        } else if (type === 'percent') {
            discount = eligibleTotal * (value / 100);
        }

        return roundMoney(Math.min(total, eligibleTotal, Math.max(0, discount)));
    }

    function explicitTotal(item) {
        if (!item || item.total === undefined || item.total === null || item.total === '') return null;
        var total = number(item.total, NaN);
        return isFinite(total) ? roundMoney(total) : null;
    }

    function chargedTotal(item) {
        if (!hasDiscount(item)) {
            var total = explicitTotal(item);
            return total !== null ? total : originalTotal(item);
        }
        return roundMoney(originalTotal(item) - discountAmount(item));
    }

    function hasDiscount(item) {
        return discountAmount(item) > 0;
    }

    function discountLabel(item) {
        return (item && item.discountLabel ? String(item.discountLabel).trim() : '') || 'Courtesy discount';
    }

    function applyMakeFree(item, label) {
        if (!item) return item;
        item.discountType = 'percent';
        item.discountValue = 100;
        item.discountLabel = label || item.discountLabel || 'Courtesy discount';
        item.discountAppliesToUpgrades = true;
        item.total = chargedTotal(item);
        return item;
    }

    global.QuoteDrDiscounts = {
        activeRate: activeRate,
        originalTotal: originalTotal,
        baseTotal: baseTotal,
        discountableTotal: discountableTotal,
        appliesToUpgrades: appliesToUpgrades,
        discountAmount: discountAmount,
        chargedTotal: chargedTotal,
        hasDiscount: hasDiscount,
        discountLabel: discountLabel,
        applyMakeFree: applyMakeFree
    };
})(typeof window !== 'undefined' ? window : globalThis);
