(function initQuoteDrSpellcheck(root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory(root);
    } else {
        root.QuoteDrSpellcheck = factory(root);
    }
})(typeof window !== 'undefined' ? window : globalThis, function quoteDrSpellcheckFactory(root) {
    'use strict';

    var COMMON_RULES = [
        ['recieve', 'receive'],
        ['seperate', 'separate'],
        ['definately', 'definitely'],
        ['occured', 'occurred'],
        ['accomodate', 'accommodate'],
        ['wierd', 'weird'],
        ['teh', 'the'],
        ['gaurd', 'guard'],
        ['thier', 'their'],
        ['adress', 'address'],
        ['availible', 'available'],
        ['begining', 'beginning'],
        ['bathrom', 'bathroom'],
        ['bedrom', 'bedroom'],
        ['buisness', 'business'],
        ['calender', 'calendar'],
        ['ceilling', 'ceiling'],
        ['cieling', 'ceiling'],
        ['comming', 'coming'],
        ['demoliton', 'demolition'],
        ['dimention', 'dimension'],
        ['eletrical', 'electrical'],
        ['extention', 'extension'],
        ['furnature', 'furniture'],
        ['hieght', 'height'],
        ['instalation', 'installation'],
        ['kitcen', 'kitchen'],
        ['lenght', 'length'],
        ['maintainance', 'maintenance'],
        ['measurment', 'measurement'],
        ['neccessary', 'necessary'],
        ['preperation', 'preparation'],
        ['recomend', 'recommend'],
        ['recomendation', 'recommendation'],
        ['rennovation', 'renovation'],
        ['responsability', 'responsibility'],
        ['succesful', 'successful'],
        ['untill', 'until'],
        ['wich', 'which']
    ];

    var currentState = null;
    var currentOptions = null;
    var currentFields = [];
    var currentSuggestions = [];
    var aiScanRunning = false;

    function escapeRegExp(value) {
        return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function escapeHtml(value) {
        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function preserveCase(original, replacement) {
        var source = String(original || '');
        var target = String(replacement || '');
        if (!source || !target) return target;
        if (source === source.toUpperCase()) return target.toUpperCase();
        if (source.charAt(0) === source.charAt(0).toUpperCase()) {
            return target.charAt(0).toUpperCase() + target.slice(1);
        }
        return target;
    }

    function fieldIdFromPath(path) {
        return path.map(function encodePart(part) {
            return encodeURIComponent(String(part));
        }).join('/');
    }

    function addField(fields, path, label, value, kind) {
        if (typeof value !== 'string' || !value.trim()) return;
        var id = fieldIdFromPath(path);
        if (fields.some(function duplicate(field) { return field.id === id; })) return;
        fields.push({
            id: id,
            path: path.slice(),
            label: label,
            text: value,
            kind: kind || 'text'
        });
    }

    function collectOptionFields(fields, option, path, labelPrefix) {
        if (!option || typeof option !== 'object') return;
        addField(fields, path.concat('name'), labelPrefix + ' name', option.name || '', 'item-name');
        addField(fields, path.concat('description'), labelPrefix + ' description', option.description || '', 'description');
        addField(fields, path.concat('itemDescription'), labelPrefix + ' description', option.itemDescription || '', 'description');
        addField(fields, path.concat('notes'), labelPrefix + ' note', option.notes || '', 'note');
        collectUpgradeGroupFields(fields, option.upgradeGroups, path.concat('upgradeGroups'), labelPrefix);
    }

    function collectUpgradeGroupFields(fields, groups, path, labelPrefix) {
        if (!Array.isArray(groups)) return;
        groups.forEach(function collectGroup(group, groupIndex) {
            if (!group || typeof group !== 'object') return;
            var groupPath = path.concat(groupIndex);
            var groupLabel = labelPrefix + ' upgrade group';
            addField(fields, groupPath.concat('name'), groupLabel + ' name', group.name || '', 'item-name');
            addField(fields, groupPath.concat('description'), groupLabel + ' description', group.description || '', 'description');
            (Array.isArray(group.options) ? group.options : []).forEach(function collectUpgradeOption(option, optionIndex) {
                collectOptionFields(fields, option, groupPath.concat('options', optionIndex), labelPrefix + ' upgrade option');
            });
        });
    }

    function collectChoiceGroupFields(fields, choiceGroup, path, labelPrefix) {
        if (!choiceGroup || typeof choiceGroup !== 'object') return;
        addField(fields, path.concat('name'), labelPrefix + ' option group name', choiceGroup.name || '', 'item-name');
        addField(fields, path.concat('description'), labelPrefix + ' option group description', choiceGroup.description || '', 'description');
        (Array.isArray(choiceGroup.options) ? choiceGroup.options : []).forEach(function collectChoice(option, optionIndex) {
            collectOptionFields(fields, option, path.concat('options', optionIndex), labelPrefix + ' choice');
        });
        (Array.isArray(choiceGroup.enhancementGroups) ? choiceGroup.enhancementGroups : []).forEach(function collectEnhancement(group, groupIndex) {
            var groupPath = path.concat('enhancementGroups', groupIndex);
            addField(fields, groupPath.concat('name'), labelPrefix + ' add-on group name', group && group.name || '', 'item-name');
            (group && Array.isArray(group.options) ? group.options : []).forEach(function collectEnhancementOption(option, optionIndex) {
                collectOptionFields(fields, option, groupPath.concat('options', optionIndex), labelPrefix + ' add-on');
            });
        });
    }

    function collectQuoteTextFields(state) {
        state = state || {};
        var fields = [];
        addField(fields, ['quoteTitle'], 'Quote title', state.quoteTitle || '', 'title');
        addField(fields, ['clientName'], 'Client name', state.clientName || '', 'proper-name');
        addField(fields, ['projectAddress'], 'Project address', state.projectAddress || '', 'address');
        addField(fields, ['changeOrderReason'], 'Change order reason', state.changeOrderReason || '', 'note');
        addField(fields, ['quoteAdjustment', 'name'], 'Client-visible adjustment label', state.quoteAdjustment && state.quoteAdjustment.name || '', 'label');
        addField(fields, ['paymentsReceived', 'name'], 'Payment received label', state.paymentsReceived && state.paymentsReceived.name || '', 'label');

        (Array.isArray(state.rooms) ? state.rooms : []).forEach(function collectRoom(room, roomIndex) {
            if (!room || typeof room !== 'object') return;
            var roomPath = ['rooms', roomIndex];
            var roomLabel = 'Room ' + (roomIndex + 1);
            addField(fields, roomPath.concat('name'), roomLabel + ' name', room.name || '', 'room-name');
            addField(fields, roomPath.concat('scopeNotes'), roomLabel + ' scope / notes', room.scopeNotes || '', 'note');
            addField(fields, roomPath.concat('notes'), roomLabel + ' note', room.notes || '', 'note');
            addField(fields, roomPath.concat('note'), roomLabel + ' note', room.note || '', 'note');
            addField(fields, roomPath.concat('timeline'), roomLabel + ' timeline', room.timeline || '', 'timeline');

            (Array.isArray(room.items) ? room.items : []).forEach(function collectItem(item, itemIndex) {
                if (!item || typeof item !== 'object') return;
                var itemPath = roomPath.concat('items', itemIndex);
                var itemLabel = roomLabel + ', item ' + (itemIndex + 1);
                addField(fields, itemPath.concat('category'), itemLabel + ' category', item.category || '', 'category');
                addField(fields, itemPath.concat('description'), itemLabel + ' name', item.description || '', 'item-name');
                addField(fields, itemPath.concat('itemDescription'), itemLabel + ' description', item.itemDescription || '', 'description');
                addField(fields, itemPath.concat('notes'), itemLabel + ' note', item.notes || '', 'note');
                addField(fields, itemPath.concat('note'), itemLabel + ' note', item.note || '', 'note');
                addField(fields, itemPath.concat('jobNote'), itemLabel + ' job note', item.jobNote || '', 'note');
                addField(fields, itemPath.concat('jobSpecificNote'), itemLabel + ' job note', item.jobSpecificNote || '', 'note');
                collectChoiceGroupFields(fields, item.choiceGroup, itemPath.concat('choiceGroup'), itemLabel);
                collectUpgradeGroupFields(fields, item.upgradeGroups, itemPath.concat('upgradeGroups'), itemLabel);
                if (item.upgrade && typeof item.upgrade === 'object') {
                    collectOptionFields(fields, item.upgrade, itemPath.concat('upgrade'), itemLabel + ' selected upgrade');
                }
            });
        });
        return fields;
    }

    function hasContractorBorderContext(text, start, end) {
        var source = String(text || '').toLowerCase();
        var nearby = source.slice(Math.max(0, start - 100), Math.min(source.length, end + 100));
        return /\b(trim|baseboard|moulding|molding|wall|ceiling|floor|tile|deck|paint|perimeter|edge|frame|install|room|scope|border)\b/.test(nearby);
    }

    function findTextSuggestions(text) {
        var source = String(text || '');
        var suggestions = [];
        if (!source.trim()) return suggestions;

        var boarderPattern = /\bboarders?\b/gi;
        var boarderMatch;
        while ((boarderMatch = boarderPattern.exec(source)) !== null) {
            if (!hasContractorBorderContext(source, boarderMatch.index, boarderMatch.index + boarderMatch[0].length)) continue;
            var boarderReplacement = /s$/i.test(boarderMatch[0]) ? 'borders' : 'border';
            suggestions.push({
                original: boarderMatch[0],
                replacement: preserveCase(boarderMatch[0], boarderReplacement),
                reason: 'In construction wording, "border" means an edge or trim detail.',
                start: boarderMatch.index,
                end: boarderMatch.index + boarderMatch[0].length,
                source: 'local'
            });
        }

        COMMON_RULES.forEach(function scanRule(rule) {
            var pattern = new RegExp('\\b' + escapeRegExp(rule[0]) + '\\b', 'gi');
            var match;
            while ((match = pattern.exec(source)) !== null) {
                suggestions.push({
                    original: match[0],
                    replacement: preserveCase(match[0], rule[1]),
                    reason: 'Spelling correction.',
                    start: match.index,
                    end: match.index + match[0].length,
                    source: 'local'
                });
            }
        });

        return suggestions.sort(function byPosition(a, b) { return a.start - b.start; });
    }

    function findLocalQuoteSuggestions(fields) {
        var suggestions = [];
        (Array.isArray(fields) ? fields : []).forEach(function scanField(field) {
            findTextSuggestions(field.text).forEach(function attachField(suggestion) {
                suggestions.push(Object.assign({}, suggestion, {
                    id: 'local-' + field.id + '-' + suggestion.start,
                    fieldId: field.id,
                    fieldLabel: field.label
                }));
            });
        });
        return suggestions;
    }

    function getValueAtPath(object, path) {
        return path.reduce(function readPath(value, key) {
            return value === undefined || value === null ? undefined : value[key];
        }, object);
    }

    function setValueAtPath(object, path, value) {
        if (!object || !Array.isArray(path) || !path.length) return false;
        var owner = object;
        for (var index = 0; index < path.length - 1; index += 1) {
            if (owner[path[index]] === undefined || owner[path[index]] === null) return false;
            owner = owner[path[index]];
        }
        owner[path[path.length - 1]] = value;
        return true;
    }

    function replaceSuggestionInText(text, suggestion) {
        var source = String(text || '');
        if (Number.isInteger(suggestion.start) && Number.isInteger(suggestion.end)
            && source.slice(suggestion.start, suggestion.end) === suggestion.original) {
            return source.slice(0, suggestion.start) + suggestion.replacement + source.slice(suggestion.end);
        }
        var exactIndex = source.indexOf(suggestion.original);
        if (exactIndex !== -1) {
            return source.slice(0, exactIndex) + suggestion.replacement + source.slice(exactIndex + suggestion.original.length);
        }
        var insensitive = new RegExp(escapeRegExp(suggestion.original), 'i');
        return source.replace(insensitive, suggestion.replacement);
    }

    function applyQuoteSuggestion(state, fields, suggestion) {
        var field = (fields || []).find(function findField(candidate) {
            return candidate.id === suggestion.fieldId;
        });
        if (!field) return false;
        var currentValue = getValueAtPath(state, field.path);
        if (typeof currentValue !== 'string') return false;
        var nextValue = replaceSuggestionInText(currentValue, suggestion);
        if (nextValue === currentValue) return false;
        if (!setValueAtPath(state, field.path, nextValue)) return false;
        field.text = nextValue;
        return true;
    }

    function buildQuoteSpellcheckPrompt(fields) {
        var payload = (Array.isArray(fields) ? fields : []).map(function compactField(field) {
            return { id: field.id, label: field.label, text: field.text };
        });
        return [
            'Proofread every supplied QuoteDr field.',
            'Return only JSON using this shape:',
            '{"suggestions":[{"fieldId":"exact supplied id","original":"exact text from that field","replacement":"correction","reason":"short reason"}]}',
            'Only report high-confidence spelling, grammar, punctuation, or construction-context word errors.',
            'Do not rewrite for style. Preserve names, addresses, brands, measurements, prices, and trade terminology.',
            'The original value must be an exact substring of the matching field text.',
            '',
            'FIELDS:',
            JSON.stringify(payload)
        ].join('\n');
    }

    function parseAiSuggestions(reply, fields) {
        var raw = String(reply || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        var parsed;
        try {
            parsed = JSON.parse(raw);
        } catch (error) {
            var objectMatch = raw.match(/\{[\s\S]*\}/);
            if (!objectMatch) return [];
            try { parsed = JSON.parse(objectMatch[0]); } catch (innerError) { return []; }
        }
        var allowedFields = {};
        (fields || []).forEach(function allowField(field) { allowedFields[field.id] = field; });
        var values = Array.isArray(parsed) ? parsed : parsed.suggestions;
        if (!Array.isArray(values)) return [];
        return values.filter(function validSuggestion(suggestion) {
            var field = suggestion && allowedFields[suggestion.fieldId];
            return field
                && typeof suggestion.original === 'string'
                && typeof suggestion.replacement === 'string'
                && suggestion.original.trim()
                && suggestion.replacement.trim()
                && suggestion.original !== suggestion.replacement
                && field.text.indexOf(suggestion.original) !== -1;
        }).slice(0, 30).map(function normalizeSuggestion(suggestion, index) {
            return {
                id: 'ai-' + suggestion.fieldId + '-' + index,
                fieldId: suggestion.fieldId,
                fieldLabel: allowedFields[suggestion.fieldId].label,
                original: suggestion.original,
                replacement: suggestion.replacement,
                reason: suggestion.reason || 'Suggested correction.',
                source: 'ai'
            };
        });
    }

    function chunkFields(fields, maxChars) {
        var chunks = [];
        var current = [];
        var currentSize = 0;
        (fields || []).forEach(function addToChunk(field) {
            var size = field.text.length + field.label.length + field.id.length + 80;
            if (current.length && currentSize + size > maxChars) {
                chunks.push(current);
                current = [];
                currentSize = 0;
            }
            current.push(field);
            currentSize += size;
        });
        if (current.length) chunks.push(current);
        return chunks;
    }

    function getSupabaseUrl() {
        if (root.SUPABASE_CONFIG && root.SUPABASE_CONFIG.url) return root.SUPABASE_CONFIG.url;
        if (root.SUPABASE_URL) return root.SUPABASE_URL;
        return 'https://axmoffknvblluibuitrq.supabase.co';
    }

    async function fetchAiSuggestions(fields) {
        if (typeof root.getSupabaseFunctionAuthHeaders !== 'function') {
            throw new Error('QuoteDr sign-in is not ready yet.');
        }
        var headers = await root.getSupabaseFunctionAuthHeaders();
        headers['Content-Type'] = 'application/json';
        var response = await fetch(getSupabaseUrl() + '/functions/v1/ai-assistant', {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                feature: 'writing_suggestions',
                messages: [{ role: 'user', content: buildQuoteSpellcheckPrompt(fields) }],
                context: { pagePath: root.location && root.location.pathname, tool: 'quote_spellcheck' }
            })
        });
        var data = await response.json().catch(function emptyResponse() { return {}; });
        if (!response.ok) throw new Error(data.error || 'Quote spell check could not run.');
        return parseAiSuggestions(data.reply || data.content || '', fields);
    }

    function mergeSuggestions(existing, incoming) {
        var merged = (existing || []).slice();
        (incoming || []).forEach(function addSuggestion(suggestion) {
            var duplicate = merged.some(function sameSuggestion(candidate) {
                return candidate.fieldId === suggestion.fieldId
                    && candidate.original.toLowerCase() === suggestion.original.toLowerCase()
                    && candidate.replacement.toLowerCase() === suggestion.replacement.toLowerCase();
            });
            if (!duplicate) merged.push(suggestion);
        });
        return merged;
    }

    function ensureStyles() {
        if (!root.document || root.document.getElementById('quoteSpellcheckStyles')) return;
        var style = root.document.createElement('style');
        style.id = 'quoteSpellcheckStyles';
        style.textContent = [
            '.qd-spell-summary{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem}',
            '.qd-spell-summary span{border:1px solid #d7e2ef;background:#f6f9fc;border-radius:6px;padding:.35rem .6rem;font-size:.82rem;font-weight:700;color:#18324d}',
            '.qd-spell-issue{border:1px solid #d7e2ef;border-left:4px solid #f59e0b;border-radius:6px;padding:.8rem;margin-bottom:.65rem;background:#fff}',
            '.qd-spell-field{font-size:.76rem;font-weight:800;text-transform:uppercase;color:#52677c;margin-bottom:.35rem}',
            '.qd-spell-change{display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}',
            '.qd-spell-actions{display:flex;align-items:center;gap:.35rem;flex:0 0 auto}',
            '.qd-spell-old{color:#b42318;text-decoration:line-through}',
            '.qd-spell-new{color:#067647;font-weight:800}',
            '.qd-spell-reason{font-size:.82rem;color:#667085;margin-top:.35rem}',
            '.qd-spell-manual-editor{margin-top:.7rem;padding-top:.7rem;border-top:1px solid #e5e7eb}',
            '.qd-spell-manual-editor label{font-size:.78rem;font-weight:800;color:#344054;margin-bottom:.3rem}',
            '.qd-spell-empty{border:1px dashed #b8c8d9;border-radius:6px;padding:1rem;text-align:center;color:#52677c;background:#f8fafc}',
            '.qd-spell-status{min-height:1.5rem}',
            '.qd-spell-source{font-size:.7rem;font-weight:800;color:#175cd3;background:#eff8ff;border-radius:999px;padding:.12rem .42rem}'
        ].join('\n');
        root.document.head.appendChild(style);
    }

    function ensureModal() {
        if (!root.document) return null;
        var existing = root.document.getElementById('quoteSpellcheckModal');
        if (existing) return existing;
        ensureStyles();
        var modal = root.document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'quoteSpellcheckModal';
        modal.tabIndex = -1;
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = [
            '<div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">',
            '  <div class="modal-content">',
            '    <div class="modal-header bg-primary text-white">',
            '      <h5 class="modal-title"><i class="fas fa-spell-check me-2"></i>Check Entire Quote</h5>',
            '      <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>',
            '    </div>',
            '    <div class="modal-body">',
            '      <div id="quoteSpellcheckSummary" class="qd-spell-summary"></div>',
            '      <div id="quoteSpellcheckStatus" class="qd-spell-status small text-muted mb-2" aria-live="polite"></div>',
            '      <div id="quoteSpellcheckIssues"></div>',
            '    </div>',
            '    <div class="modal-footer">',
            '      <button type="button" class="btn btn-outline-primary" id="quoteSpellcheckRunAgain"><i class="fas fa-rotate me-1"></i>Check Again</button>',
            '      <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>',
            '      <button type="button" class="btn btn-primary" id="quoteSpellcheckApplyAll"><i class="fas fa-check-double me-1"></i>Apply All</button>',
            '    </div>',
            '  </div>',
            '</div>'
        ].join('');
        root.document.body.appendChild(modal);
        modal.querySelector('#quoteSpellcheckRunAgain').addEventListener('click', runFullScan);
        modal.querySelector('#quoteSpellcheckApplyAll').addEventListener('click', applyAllSuggestions);
        return modal;
    }

    function setStatus(message, className) {
        var status = root.document && root.document.getElementById('quoteSpellcheckStatus');
        if (!status) return;
        status.className = 'qd-spell-status small mb-2 ' + (className || 'text-muted');
        status.innerHTML = message || '';
    }

    function renderSuggestions() {
        var modal = ensureModal();
        if (!modal) return;
        var summary = modal.querySelector('#quoteSpellcheckSummary');
        var issues = modal.querySelector('#quoteSpellcheckIssues');
        var applyAll = modal.querySelector('#quoteSpellcheckApplyAll');
        summary.innerHTML = '<span><i class="fas fa-file-lines me-1"></i>' + currentFields.length + ' text fields scanned</span>'
            + '<span><i class="fas fa-triangle-exclamation me-1"></i>' + currentSuggestions.length + ' possible correction' + (currentSuggestions.length === 1 ? '' : 's') + '</span>';
        applyAll.disabled = currentSuggestions.length === 0 || aiScanRunning;
        if (!currentSuggestions.length) {
            issues.innerHTML = '<div class="qd-spell-empty"><i class="fas fa-circle-check me-1 text-success"></i>No spelling issues found in the quote text.</div>';
            return;
        }
        issues.innerHTML = currentSuggestions.map(function issueHtml(suggestion, index) {
            return [
                '<div class="qd-spell-issue">',
                '  <div class="d-flex justify-content-between align-items-start gap-2">',
                '    <div>',
                '      <div class="qd-spell-field">' + escapeHtml(suggestion.fieldLabel) + ' <span class="qd-spell-source">' + (suggestion.source === 'ai' ? 'AI' : 'Local') + '</span></div>',
                '      <div class="qd-spell-change"><span class="qd-spell-old">' + escapeHtml(suggestion.original) + '</span><i class="fas fa-arrow-right text-muted"></i><span class="qd-spell-new">' + escapeHtml(suggestion.replacement) + '</span></div>',
                '      <div class="qd-spell-reason">' + escapeHtml(suggestion.reason || 'Suggested correction.') + '</div>',
                '    </div>',
                '    <div class="qd-spell-actions">',
                '      <button type="button" class="btn btn-sm btn-outline-secondary qd-spell-edit" data-index="' + index + '" title="Type a different correction"><i class="fas fa-pen me-1"></i>Edit</button>',
                '      <button type="button" class="btn btn-sm btn-primary qd-spell-apply" data-index="' + index + '">Apply</button>',
                '    </div>',
                '  </div>',
                '  <div class="qd-spell-manual-editor d-none" data-editor-index="' + index + '">',
                '    <label for="quoteSpellcheckManual_' + index + '">Correct wording</label>',
                '    <div class="input-group input-group-sm">',
                '      <input type="text" class="form-control qd-spell-manual-input" id="quoteSpellcheckManual_' + index + '" data-index="' + index + '" value="' + escapeHtml(suggestion.replacement) + '" spellcheck="true" autocomplete="off">',
                '      <button type="button" class="btn btn-success qd-spell-apply-manual" data-index="' + index + '"><i class="fas fa-check me-1"></i>Use My Wording</button>',
                '    </div>',
                '  </div>',
                '</div>'
            ].join('');
        }).join('');
        issues.querySelectorAll('.qd-spell-apply').forEach(function bindApply(button) {
            button.addEventListener('click', function applyOne() {
                applySuggestionAt(Number(button.dataset.index));
            });
        });
        issues.querySelectorAll('.qd-spell-edit').forEach(function bindEdit(button) {
            button.addEventListener('click', function editSuggestion() {
                openManualCorrectionEditor(Number(button.dataset.index));
            });
        });
        issues.querySelectorAll('.qd-spell-apply-manual').forEach(function bindManualApply(button) {
            button.addEventListener('click', function applyManual() {
                applyManualSuggestion(Number(button.dataset.index));
            });
        });
        issues.querySelectorAll('.qd-spell-manual-input').forEach(function bindManualEnter(input) {
            input.addEventListener('keydown', function applyManualOnEnter(event) {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                applyManualSuggestion(Number(input.dataset.index));
            });
        });
    }

    function openManualCorrectionEditor(index) {
        var modal = ensureModal();
        if (!modal || !currentSuggestions[index]) return;
        var editor = modal.querySelector('[data-editor-index="' + index + '"]');
        var input = modal.querySelector('.qd-spell-manual-input[data-index="' + index + '"]');
        if (!editor || !input) return;
        editor.classList.remove('d-none');
        input.focus();
        input.select();
    }

    function applyManualSuggestion(index) {
        var modal = ensureModal();
        var suggestion = currentSuggestions[index];
        var input = modal && modal.querySelector('.qd-spell-manual-input[data-index="' + index + '"]');
        if (!suggestion || !input) return;
        var replacement = String(input.value || '').trim();
        if (!replacement) {
            input.classList.add('is-invalid');
            setStatus('Type the correct wording before applying it.', 'text-warning');
            return;
        }
        suggestion.replacement = replacement;
        suggestion.reason = 'Manually corrected wording.';
        applySuggestionAt(index);
    }

    function notifyChanged() {
        if (currentOptions && typeof currentOptions.onApply === 'function') {
            currentOptions.onApply(currentState);
        }
    }

    function applySuggestionAt(index) {
        var suggestion = currentSuggestions[index];
        if (!suggestion) return;
        if (applyQuoteSuggestion(currentState, currentFields, suggestion)) {
            currentSuggestions.splice(index, 1);
            notifyChanged();
            setStatus('Correction applied and the quote was marked for autosave.', 'text-success');
        } else {
            currentSuggestions.splice(index, 1);
            setStatus('That text changed after the scan, so the old suggestion was removed.', 'text-warning');
        }
        renderSuggestions();
    }

    function applyAllSuggestions() {
        var applied = 0;
        currentSuggestions.slice().sort(function reverseLocalPositions(a, b) {
            if (a.fieldId === b.fieldId && Number.isInteger(a.start) && Number.isInteger(b.start)) return b.start - a.start;
            return 0;
        }).forEach(function applySuggestion(suggestion) {
            if (applyQuoteSuggestion(currentState, currentFields, suggestion)) applied += 1;
        });
        currentSuggestions = [];
        if (applied) notifyChanged();
        setStatus(applied + ' correction' + (applied === 1 ? '' : 's') + ' applied and queued for autosave.', applied ? 'text-success' : 'text-muted');
        renderSuggestions();
    }

    async function runAiScan() {
        if (aiScanRunning || !currentFields.length) return;
        if (typeof root.requireProFeature === 'function') {
            var allowed = await root.requireProFeature('writing_suggestions', 'Quote Spell Check');
            if (!allowed) {
                setStatus('Local quote scan complete. The deeper AI scan is available with Pro.', 'text-muted');
                return;
            }
        }
        aiScanRunning = true;
        renderSuggestions();
        var chunks = chunkFields(currentFields, 7000);
        var aiSuggestions = [];
        try {
            for (var index = 0; index < chunks.length; index += 1) {
                setStatus('<span class="spinner-border spinner-border-sm me-1"></span>Checking all quote wording ' + (index + 1) + ' of ' + chunks.length + '...', 'text-primary');
                aiSuggestions = aiSuggestions.concat(await fetchAiSuggestions(chunks[index]));
            }
            currentSuggestions = mergeSuggestions(currentSuggestions, aiSuggestions);
            setStatus('Full quote scan complete. Review each suggested change below.', 'text-success');
            if (typeof root.completeProTrialFeature === 'function') {
                root.completeProTrialFeature('writing_suggestions', 'Quote Spell Check');
            }
        } catch (error) {
            setStatus('The local scan completed, but the deeper AI scan is temporarily unavailable. ' + escapeHtml(error.message || ''), 'text-warning');
        } finally {
            aiScanRunning = false;
            renderSuggestions();
        }
    }

    function runFullScan() {
        if (!currentOptions) return;
        currentState = currentOptions.state || {};
        currentFields = collectQuoteTextFields(currentState);
        currentSuggestions = findLocalQuoteSuggestions(currentFields);
        setStatus('Local scan complete. Starting the deeper full-quote check...', 'text-primary');
        renderSuggestions();
        runAiScan();
    }

    function open(options) {
        currentOptions = options || {};
        currentState = currentOptions.state || {};
        var modal = ensureModal();
        if (!modal) return;
        if (root.bootstrap && root.bootstrap.Modal) {
            root.bootstrap.Modal.getOrCreateInstance(modal).show();
        } else {
            modal.style.display = 'block';
            modal.classList.add('show');
            modal.removeAttribute('aria-hidden');
        }
        runFullScan();
    }

    return {
        collectQuoteTextFields: collectQuoteTextFields,
        findTextSuggestions: findTextSuggestions,
        findLocalQuoteSuggestions: findLocalQuoteSuggestions,
        buildQuoteSpellcheckPrompt: buildQuoteSpellcheckPrompt,
        parseAiSuggestions: parseAiSuggestions,
        applyQuoteSuggestion: applyQuoteSuggestion,
        chunkFields: chunkFields,
        open: open
    };
});
