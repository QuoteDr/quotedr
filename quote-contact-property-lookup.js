(function(window, document) {
    'use strict';

    var LOOKUP_FIELDS = {
        clientName: { dropdownId: 'clientDropdown', kind: 'name' },
        projectAddress: { dropdownId: 'projectAddressDropdown', kind: 'address' },
        clientPhone: { dropdownId: 'clientPhoneDropdown', kind: 'phone' },
        clientEmail: { dropdownId: 'clientEmailDropdown', kind: 'email' }
    };
    var lookupState = {};

    function clean(value) {
        return String(value == null ? '' : value).trim();
    }

    function normalizeSearchValue(value) {
        var normalized = clean(value).toLowerCase();
        if (typeof normalized.normalize === 'function') {
            normalized = normalized.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
        }
        return normalized.replace(/[^a-z0-9@]+/g, ' ').replace(/\s+/g, ' ').trim();
    }

    function phoneDigits(value) {
        return clean(value).replace(/\D/g, '');
    }

    function formatPropertyAddress(property) {
        property = property || {};
        var address = clean(property.displayAddress || property.address);
        var city = clean(property.city);
        if (!city || normalizeSearchValue(address).includes(normalizeSearchValue(city))) return address;
        return address ? address + ', ' + city : city;
    }

    function fallbackProperties(client) {
        var normalized = typeof window.normalizeClientRecord === 'function'
            ? window.normalizeClientRecord(client, client && client.name)
            : (client || {});
        var properties = typeof window.getClientProperties === 'function'
            ? window.getClientProperties(normalized)
            : (Array.isArray(normalized.properties) ? normalized.properties.slice() : []);
        if (!properties.length && (normalized.address || normalized.city)) {
            properties.push({
                id: '',
                address: normalized.address || '',
                city: normalized.city || '',
                phone: '',
                email: ''
            });
        }
        if (!properties.length) properties.push({ id: '', address: '', city: '', phone: '', email: '' });
        return { client: normalized, properties: properties };
    }

    function buildSearchRows(clients) {
        var rows = [];
        Object.entries(clients || {}).forEach(function(entry) {
            var clientKey = entry[0];
            var bundle = fallbackProperties(entry[1]);
            var client = bundle.client;
            var seen = {};
            bundle.properties.forEach(function(property, propertyIndex) {
                property = property || {};
                var displayAddress = formatPropertyAddress(property);
                var propertyKey = clean(property.id) || normalizeSearchValue(displayAddress) || 'no-address';
                if (seen[propertyKey]) return;
                seen[propertyKey] = true;
                rows.push({
                    clientKey: clientKey,
                    clientId: clean(client.id || client.clientId),
                    propertyId: clean(property.id),
                    clientName: clean(client.name || clientKey),
                    address: displayAddress,
                    city: clean(property.city || client.city),
                    phone: clean(property.phone || client.phone),
                    email: clean(property.email || client.email),
                    propertyLabel: clean(property.label),
                    propertyCount: bundle.properties.length,
                    propertyIndex: propertyIndex,
                    client: client,
                    property: Object.assign({}, property, { displayAddress: displayAddress })
                });
            });
        });
        return rows;
    }

    function textScore(query, value) {
        var needle = normalizeSearchValue(query);
        var haystack = normalizeSearchValue(value);
        if (!needle || !haystack) return 0;
        if (haystack === needle) return 120;
        if (haystack.startsWith(needle)) return 106;
        if (haystack.includes(needle)) return 92;
        var tokens = needle.split(' ').filter(Boolean);
        if (tokens.length > 1 && tokens.every(function(token) { return haystack.includes(token); })) return 84;
        return 0;
    }

    function phoneScore(query, value) {
        var needle = phoneDigits(query);
        var haystack = phoneDigits(value);
        if (needle.length < 2 || !haystack) return 0;
        if (haystack === needle) return 120;
        if (haystack.startsWith(needle)) return 106;
        return haystack.includes(needle) ? 94 : 0;
    }

    function scoreRow(query, activeKind, row) {
        var fieldScores = {
            name: textScore(query, row.clientName),
            address: Math.max(textScore(query, row.address), textScore(query, row.propertyLabel)),
            phone: phoneScore(query, row.phone),
            email: textScore(query, row.email)
        };
        var matchedField = '';
        var score = 0;
        Object.keys(fieldScores).forEach(function(field) {
            var candidate = fieldScores[field] + (field === activeKind && fieldScores[field] ? 8 : 0);
            if (candidate > score) {
                score = candidate;
                matchedField = field;
            }
        });
        return { score: score, matchedField: matchedField };
    }

    function searchClientProperties(query, activeFieldId, clients) {
        if (clean(query).length < 2) return [];
        var config = LOOKUP_FIELDS[activeFieldId] || LOOKUP_FIELDS.clientName;
        return buildSearchRows(clients).map(function(row) {
            var scored = scoreRow(query, config.kind, row);
            return Object.assign({}, row, scored);
        }).filter(function(row) {
            return row.score > 0;
        }).sort(function(a, b) {
            return b.score - a.score || a.clientName.localeCompare(b.clientName) || a.address.localeCompare(b.address);
        }).slice(0, 10);
    }

    function getInput(fieldId) {
        return document.getElementById(fieldId);
    }

    function getDropdown(fieldId) {
        var config = LOOKUP_FIELDS[fieldId];
        return config ? document.getElementById(config.dropdownId) : null;
    }

    function setExpanded(fieldId, expanded) {
        var input = getInput(fieldId);
        if (!input) return;
        input.setAttribute('aria-expanded', expanded ? 'true' : 'false');
        if (!expanded) input.removeAttribute('aria-activedescendant');
    }

    function hideSuggestions(fieldId) {
        var dropdown = getDropdown(fieldId);
        if (dropdown) {
            dropdown.style.display = 'none';
            dropdown.innerHTML = '';
        }
        lookupState[fieldId] = { results: [], activeIndex: -1 };
        setExpanded(fieldId, false);
    }

    function hideAllSuggestions() {
        Object.keys(LOOKUP_FIELDS).forEach(hideSuggestions);
    }

    function clearSelectedRelationship() {
        Object.keys(LOOKUP_FIELDS).forEach(function(fieldId) {
            var input = getInput(fieldId);
            if (!input) return;
            delete input.dataset.selectedClientId;
            delete input.dataset.selectedClientKey;
            delete input.dataset.selectedPropertyId;
        });
        window._selectedQuoteClient = null;
        window._selectedQuoteProperty = null;
    }

    function matchLabel(field) {
        return { name: 'Name match', address: 'Address match', phone: 'Phone match', email: 'Email match' }[field] || 'Saved contact';
    }

    function optionAccessibleLabel(result) {
        return [result.clientName || 'Saved client', result.address || 'No saved address', result.phone, result.email]
            .filter(Boolean)
            .join(', ');
    }

    function setActiveOption(fieldId, nextIndex) {
        var dropdown = getDropdown(fieldId);
        var state = lookupState[fieldId];
        if (!dropdown || !state || !state.results.length) return;
        var count = state.results.length;
        state.activeIndex = ((nextIndex % count) + count) % count;
        Array.from(dropdown.querySelectorAll('[role="option"]')).forEach(function(option, index) {
            var active = index === state.activeIndex;
            option.classList.toggle('active', active);
            option.setAttribute('aria-selected', active ? 'true' : 'false');
            if (active) {
                var input = getInput(fieldId);
                if (input) input.setAttribute('aria-activedescendant', option.id);
                option.scrollIntoView({ block: 'nearest' });
            }
        });
    }

    function selectSuggestion(result) {
        if (!result || typeof window.fillClientInfo !== 'function') return;
        window.fillClientInfo(result.clientName, result.client, result.property, result.clientKey);
        hideAllSuggestions();
    }

    function renderSuggestions(fieldId, results) {
        var dropdown = getDropdown(fieldId);
        if (!dropdown) return;
        dropdown.innerHTML = '';
        if (!results.length) {
            hideSuggestions(fieldId);
            return;
        }
        results.forEach(function(result, index) {
            var option = document.createElement('button');
            option.type = 'button';
            option.id = 'contactLookupOption-' + fieldId + '-' + index;
            option.className = 'autocomplete-item contact-lookup-option text-start w-100';
            option.setAttribute('role', 'option');
            option.setAttribute('aria-selected', 'false');
            option.setAttribute('aria-label', optionAccessibleLabel(result));

            var heading = document.createElement('span');
            heading.className = 'contact-lookup-option-heading';
            var name = document.createElement('strong');
            name.textContent = result.clientName || 'Saved client';
            var badge = document.createElement('span');
            badge.className = 'badge text-bg-light border contact-lookup-match-badge';
            badge.textContent = matchLabel(result.matchedField);
            heading.appendChild(name);
            heading.appendChild(badge);
            option.appendChild(heading);

            var address = document.createElement('span');
            address.className = 'contact-lookup-address';
            address.textContent = result.address || 'No saved property address';
            option.appendChild(address);

            var details = document.createElement('small');
            details.className = 'contact-lookup-details';
            details.textContent = [result.propertyLabel, result.phone, result.email].filter(Boolean).join(' | ');
            if (details.textContent) option.appendChild(details);

            option.addEventListener('mousedown', function(event) { event.preventDefault(); });
            option.addEventListener('click', function() { selectSuggestion(result); });
            dropdown.appendChild(option);
        });
        lookupState[fieldId] = { results: results, activeIndex: 0 };
        dropdown.style.display = 'block';
        setExpanded(fieldId, true);
        setActiveOption(fieldId, 0);
    }

    function showSuggestions(fieldId) {
        var input = getInput(fieldId);
        if (!input) return;
        var clients = typeof window.getAllClients === 'function' ? window.getAllClients() : {};
        renderSuggestions(fieldId, searchClientProperties(input.value, fieldId, clients));
    }

    function handleKeydown(fieldId, event) {
        var state = lookupState[fieldId];
        if (event.key === 'Escape') {
            hideSuggestions(fieldId);
            return;
        }
        if (!state || !state.results.length) return;
        if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActiveOption(fieldId, state.activeIndex + 1);
        } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActiveOption(fieldId, state.activeIndex - 1);
        } else if (event.key === 'Enter' && state.activeIndex >= 0) {
            event.preventDefault();
            selectSuggestion(state.results[state.activeIndex]);
        }
    }

    function bindField(fieldId) {
        var input = getInput(fieldId);
        if (!input || input.dataset.contactLookupBound === 'true') return;
        input.dataset.contactLookupBound = 'true';
        input.addEventListener('input', function() {
            clearSelectedRelationship();
            showSuggestions(fieldId);
        });
        input.addEventListener('focus', function() {
            if (clean(input.value).length >= 2) showSuggestions(fieldId);
        });
        input.addEventListener('keydown', function(event) { handleKeydown(fieldId, event); });
        input.addEventListener('blur', function() {
            window.setTimeout(function() { hideSuggestions(fieldId); }, 180);
        });
    }

    function init() {
        Object.keys(LOOKUP_FIELDS).forEach(bindField);
    }

    window.QuoteDrContactLookup = {
        showForField: showSuggestions,
        hideForField: hideSuggestions,
        hideAll: hideAllSuggestions,
        search: searchClientProperties,
        __test: {
            normalizeSearchValue: normalizeSearchValue,
            formatPropertyAddress: formatPropertyAddress,
            buildRows: buildSearchRows,
            search: searchClientProperties,
            selectSuggestion: selectSuggestion
        }
    };
    window.showClientSuggestions = function() { showSuggestions('clientName'); };
    window.hideClientDropdown = function() { hideSuggestions('clientName'); };

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})(window, document);
