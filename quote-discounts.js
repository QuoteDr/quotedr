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

    function choiceBasis(item) {
        var group = item && item.choiceGroup;
        if (!group || !Array.isArray(group.options)) return null;
        var ids = Array.isArray(group.selectedOptionIds) ? group.selectedOptionIds : [];
        if (group.type === 'single') ids = [ids[0] || group.defaultOptionId].filter(Boolean);
        var selected = group.options.filter(function(option) { return ids.indexOf(option.id) !== -1; });
        var allowed = Array.isArray(item.discountChoiceOptionIds) ? item.discountChoiceOptionIds : [];
        var scoped = item.discountChoiceScope === 'selected';
        var result = {total:0, eligible:0, units:0, eligibleUnits:0, allEligible:selected.length > 0};
        selected.forEach(function(option) {
            var eligible = !scoped || allowed.indexOf(option.id) !== -1;
            if (!eligible) result.allEligible = false;
            if (option.priceTbd === true || option.pricingMode === 'tbd') return;
            var units = option.quantityMode === 'override' ? Math.max(0,number(option.quantityOverride)) : quantity(item);
            var total = units * Math.max(0,number(option.rate));
            result.total += total; result.units += units;
            if (eligible) { result.eligible += total; result.eligibleUnits += units; }
        });
        return result;
    }

    function discountableTotal(item) {
        var total = originalTotal(item);
        var basis = choiceBasis(item);
        if (basis) {
            // Common upgrades are eligible only when every selected base choice is eligible.
            if (appliesToUpgrades(item) && basis.allEligible) return total;
            return roundMoney(Math.min(total, basis.eligible));
        }
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
        } else if (type === 'per_unit') {
            // One discount per base line unit, not once per selected add-on.
            var units = !appliesToUpgrades(item) && item._baseQuantity !== undefined && item._baseQuantity !== null
                ? Math.max(0, number(item._baseQuantity, 0)) : quantity(item);
            var basis = choiceBasis(item);
            if (basis) units = basis.eligibleUnits;
            discount = value * units;
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
        if (choiceBasis(item) && ['amount','percent','per_unit'].indexOf(String(item.discountType || '').toLowerCase()) !== -1) {
            return roundMoney(originalTotal(item) - discountAmount(item));
        }
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
        choiceBasis: choiceBasis,
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
