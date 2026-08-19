(function(root) {
    'use strict';

    var activeRecognition = null;

    function compactText(value, maxLength) {
        return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength || 500);
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, function(char) {
            return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
        });
    }

    function normalizeAssistantResult(value) {
        var parsed = value;
        if (typeof parsed === 'string') {
            try { parsed = JSON.parse(parsed); } catch (error) { return null; }
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        var status = parsed.status === 'needs_details' ? 'needs_details' : 'ready';
        var questions = Array.isArray(parsed.questions) ? parsed.questions.slice(0, 4).map(function(question, index) {
            question = question && typeof question === 'object' ? question : {};
            return {
                id: compactText(question.id || ('question_' + (index + 1)), 60),
                question: compactText(question.question, 240),
                why: compactText(question.why, 180),
                options: Array.isArray(question.options) ? question.options.slice(0, 5).map(function(option) {
                    return compactText(option, 100);
                }).filter(Boolean) : []
            };
        }).filter(function(question) { return question.question; }) : [];
        var draft = parsed.draft && typeof parsed.draft === 'object' ? parsed.draft : {};
        return {
            status: questions.length && status === 'needs_details' ? 'needs_details' : 'ready',
            questions: questions,
            draft: {
                name: compactText(draft.name, 140),
                category: compactText(draft.category, 100),
                unitType: compactText(draft.unitType, 40),
                description: compactText(draft.description, 1200)
            }
        };
    }

    function buildRequestContext(entry, state, forceReady) {
        var answers = {};
        Object.keys(state.answers || {}).slice(0, 8).forEach(function(key) {
            answers[compactText(key, 60)] = compactText(state.answers[key], 500);
        });
        return {
            phrase: compactText(entry.phrase, 280),
            parsedName: compactText(entry.parsedName, 140),
            roomName: compactText(entry.roomName, 140),
            quantity: Number(entry.quantity) || 1,
            unitType: compactText(entry.unitType || 'ls', 40),
            taskNotes: compactText(state.taskNotes, 1200),
            categories: (state.categories || []).slice(0, 40).map(function(category) { return compactText(category, 100); }).filter(Boolean),
            priorQuestions: (state.questions || []).slice(0, 4).map(function(question) {
                return { id: compactText(question.id, 60), question: compactText(question.question, 240) };
            }),
            answers: answers,
            round: Math.max(0, Math.min(3, Number(state.round) || 0)),
            forceReady: forceReady === true
        };
    }

    function wizardMarkup() {
        return ''
            + '<div class="modal fade" id="aiVoiceNewItemWizardModal" tabindex="-1" role="dialog" aria-modal="true" aria-labelledby="aiVoiceNewItemWizardTitle" data-bs-backdrop="static">'
            + '<div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable"><div class="modal-content">'
            + '<div class="modal-header text-white" style="background:linear-gradient(135deg,#1556a0,#7c3aed)">'
            + '<div><div class="small text-white-50" id="aiVoiceNewItemProgress"></div><h5 class="modal-title mb-0" id="aiVoiceNewItemWizardTitle"><i class="fas fa-wand-magic-sparkles me-2" aria-hidden="true"></i>Create new pricing item</h5></div>'
            + '<button type="button" class="btn-close btn-close-white" id="aiVoiceNewItemCancelTop" aria-label="Cancel new item wizard"></button>'
            + '</div>'
            + '<div class="modal-body">'
            + '<div class="alert alert-light border d-flex gap-2 align-items-start"><i class="fas fa-microphone text-primary mt-1" aria-hidden="true"></i><div><strong>What you said</strong><div id="aiVoiceNewItemPhrase"></div><div class="small text-muted" id="aiVoiceNewItemRoom"></div></div></div>'
            + '<div class="row g-4">'
            + '<div class="col-12 col-lg-5">'
            + '<div class="card h-100 border-primary-subtle"><div class="card-body">'
            + '<h6 class="fw-bold"><i class="fas fa-comments me-2 text-primary" aria-hidden="true"></i>Explain the job</h6>'
            + '<p class="small text-muted">Speak or type rough details. QuoteDr can ask only the questions it needs, then draft a professional description. You approve every field.</p>'
            + '<label class="form-label fw-semibold" for="aiVoiceNewItemTaskNotes">Task details</label>'
            + '<div class="input-group mb-2"><textarea class="form-control" id="aiVoiceNewItemTaskNotes" rows="5" placeholder="Example: Paint the living room ceiling. Repair minor nail pops, use two coats, and protect the floor."></textarea><button type="button" class="btn btn-outline-primary ai-voice-new-item-mic" data-target="aiVoiceNewItemTaskNotes" aria-label="Speak task details"><i class="fas fa-microphone" aria-hidden="true"></i></button></div>'
            + '<div id="aiVoiceNewItemQuestions" class="mb-3"></div>'
            + '<div id="aiVoiceNewItemAiStatus" class="small text-muted mb-2" aria-live="polite"></div>'
            + '<div class="d-flex flex-wrap gap-2"><button type="button" class="btn btn-primary" id="aiVoiceNewItemAskAi"><i class="fas fa-wand-magic-sparkles me-1" aria-hidden="true"></i><span>Ask AI to draft</span></button><button type="button" class="btn btn-outline-secondary d-none" id="aiVoiceNewItemDraftNow">Draft with what I provided</button></div>'
            + '</div></div></div>'
            + '<div class="col-12 col-lg-7">'
            + '<div class="card h-100"><div class="card-body">'
            + '<h6 class="fw-bold"><i class="fas fa-database me-2 text-success" aria-hidden="true"></i>Review the saved item</h6>'
            + '<div class="alert alert-warning py-2 small">AI never sets your price. Review the scope, choose the unit, and enter your own rate before saving.</div>'
            + '<div class="row g-3">'
            + '<div class="col-12 col-md-7"><label class="form-label fw-semibold" for="aiVoiceNewItemName">Item name</label><input class="form-control" id="aiVoiceNewItemName" maxlength="140"></div>'
            + '<div class="col-12 col-md-5"><label class="form-label fw-semibold" for="aiVoiceNewItemCategory">Category</label><input class="form-control" id="aiVoiceNewItemCategory" list="aiVoiceNewItemCategoryOptions" maxlength="100"><datalist id="aiVoiceNewItemCategoryOptions"></datalist></div>'
            + '<div class="col-6 col-md-4"><label class="form-label fw-semibold" for="aiVoiceNewItemUnit">Unit</label><input class="form-control" id="aiVoiceNewItemUnit" list="unitTypeOptions" maxlength="40" placeholder="ls, each, sq ft"></div>'
            + '<div class="col-6 col-md-4"><label class="form-label fw-semibold" for="aiVoiceNewItemRate">Rate</label><input type="number" class="form-control" id="aiVoiceNewItemRate" min="0" step="0.01" inputmode="decimal"></div>'
            + '<div class="col-12 col-md-4 d-flex align-items-end"><div class="form-check mb-2"><input class="form-check-input" type="checkbox" id="aiVoiceNewItemPriceTbd"><label class="form-check-label" for="aiVoiceNewItemPriceTbd">Price TBD</label></div></div>'
            + '<div class="col-12"><label class="form-label fw-semibold" for="aiVoiceNewItemDescription">Client-ready description</label><div class="input-group"><textarea class="form-control" id="aiVoiceNewItemDescription" rows="7" maxlength="4000"></textarea><button type="button" class="btn btn-outline-primary ai-voice-new-item-mic" data-target="aiVoiceNewItemDescription" aria-label="Speak description changes"><i class="fas fa-microphone" aria-hidden="true"></i></button></div></div>'
            + '</div><div class="invalid-feedback d-block mt-3 d-none" id="aiVoiceNewItemValidation" role="alert"></div>'
            + '</div></div></div>'
            + '</div></div>'
            + '<div class="modal-footer"><button type="button" class="btn btn-outline-secondary me-auto" id="aiVoiceNewItemCancel">Back to review</button><button type="button" class="btn btn-outline-primary d-none" id="aiVoiceNewItemPrevious"><i class="fas fa-arrow-left me-1" aria-hidden="true"></i>Previous</button><button type="button" class="btn btn-success" id="aiVoiceNewItemNext"><span>Save item &amp; continue</span><i class="fas fa-arrow-right ms-1" aria-hidden="true"></i></button></div>'
            + '</div></div></div>';
    }

    function setValue(id, value) {
        var element = document.getElementById(id);
        if (element) element.value = value == null ? '' : String(value);
    }

    function readValue(id) {
        var element = document.getElementById(id);
        return element ? String(element.value || '').trim() : '';
    }

    function stopDictation() {
        if (!activeRecognition) return;
        try { activeRecognition.stop(); } catch (error) {}
        activeRecognition = null;
        document.querySelectorAll('.ai-voice-new-item-mic').forEach(function(button) {
            button.classList.remove('btn-danger');
            button.classList.add('btn-outline-primary');
            button.removeAttribute('aria-pressed');
        });
    }

    function startDictation(button) {
        stopDictation();
        var target = document.getElementById(button.getAttribute('data-target'));
        var SpeechRecognition = root.SpeechRecognition || root.webkitSpeechRecognition;
        if (!target || !SpeechRecognition) {
            if (typeof root.qdAlert === 'function') root.qdAlert('Speech input is not available in this browser. You can type the details instead.');
            return;
        }
        var recognition = new SpeechRecognition();
        activeRecognition = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-CA';
        var original = target.value.trim();
        recognition.onresult = function(event) {
            var finalText = '';
            var interimText = '';
            for (var index = event.resultIndex; index < event.results.length; index++) {
                var text = event.results[index][0] && event.results[index][0].transcript || '';
                if (event.results[index].isFinal) finalText += text + ' ';
                else interimText += text;
            }
            if (finalText.trim()) {
                original = (original ? original + ' ' : '') + finalText.trim();
                target.value = original;
                target.dispatchEvent(new Event('input', { bubbles: true }));
            } else if (interimText.trim()) {
                target.value = (original ? original + ' ' : '') + interimText.trim();
            }
        };
        recognition.onerror = function(event) {
            var status = document.getElementById('aiVoiceNewItemAiStatus');
            if (status && event.error !== 'aborted' && event.error !== 'no-speech') status.textContent = 'Voice input stopped. You can keep typing.';
            stopDictation();
        };
        recognition.onend = function() {
            if (activeRecognition === recognition) stopDictation();
        };
        button.classList.remove('btn-outline-primary');
        button.classList.add('btn-danger');
        button.setAttribute('aria-pressed', 'true');
        try { recognition.start(); } catch (error) { stopDictation(); }
    }

    function collectAnswers(state) {
        state.answers = state.answers || {};
        document.querySelectorAll('.ai-voice-new-item-answer').forEach(function(input) {
            state.answers[input.getAttribute('data-question-id') || ''] = input.value.trim();
        });
    }

    function renderQuestions(state) {
        var host = document.getElementById('aiVoiceNewItemQuestions');
        var draftNow = document.getElementById('aiVoiceNewItemDraftNow');
        if (!host) return;
        if (!state.questions || !state.questions.length) {
            host.innerHTML = '';
            if (draftNow) draftNow.classList.add('d-none');
            return;
        }
        host.innerHTML = '<div class="border rounded p-3 bg-light"><div class="fw-semibold mb-2">A few details will make this item more accurate</div>'
            + state.questions.map(function(question, index) {
                var answer = state.answers && state.answers[question.id] || '';
                return '<div class="mb-3"><label class="form-label small fw-semibold" for="aiVoiceNewItemAnswer' + index + '">' + escapeHtml(question.question) + '</label>'
                    + (question.why ? '<div class="small text-muted mb-1">' + escapeHtml(question.why) + '</div>' : '')
                    + '<div class="input-group"><input class="form-control ai-voice-new-item-answer" id="aiVoiceNewItemAnswer' + index + '" data-question-id="' + escapeHtml(question.id) + '" value="' + escapeHtml(answer) + '"><button type="button" class="btn btn-outline-primary ai-voice-new-item-mic" data-target="aiVoiceNewItemAnswer' + index + '" aria-label="Speak answer"><i class="fas fa-microphone" aria-hidden="true"></i></button></div>'
                    + (question.options.length ? '<div class="d-flex flex-wrap gap-1 mt-2">' + question.options.map(function(option) { return '<button type="button" class="btn btn-outline-secondary btn-sm ai-voice-new-item-answer-option" data-target="aiVoiceNewItemAnswer' + index + '" data-value="' + escapeHtml(option) + '">' + escapeHtml(option) + '</button>'; }).join('') + '</div>' : '')
                    + '</div>';
            }).join('') + '</div>';
        if (draftNow) draftNow.classList.remove('d-none');
        host.querySelectorAll('.ai-voice-new-item-answer-option').forEach(function(button) {
            button.addEventListener('click', function() {
                var input = document.getElementById(this.getAttribute('data-target'));
                if (input) input.value = this.getAttribute('data-value') || '';
            });
        });
        host.querySelectorAll('.ai-voice-new-item-mic').forEach(function(button) {
            button.addEventListener('click', function() { startDictation(this); });
        });
    }

    function applyAssistantDraft(result) {
        if (!result || !result.draft) return;
        if (result.draft.name) setValue('aiVoiceNewItemName', result.draft.name);
        if (result.draft.category) setValue('aiVoiceNewItemCategory', result.draft.category);
        if (result.draft.unitType) setValue('aiVoiceNewItemUnit', result.draft.unitType);
        if (result.draft.description) setValue('aiVoiceNewItemDescription', result.draft.description);
    }

    async function requestAssistant(entry, state, options, forceReady) {
        collectAnswers(state);
        state.taskNotes = readValue('aiVoiceNewItemTaskNotes');
        var button = document.getElementById('aiVoiceNewItemAskAi');
        var status = document.getElementById('aiVoiceNewItemAiStatus');
        if (button) {
            button.disabled = true;
            button.setAttribute('aria-busy', 'true');
            button.querySelector('span').textContent = state.round ? 'Using your answers...' : 'Thinking about the scope...';
        }
        if (status) status.textContent = 'QuoteDr is reviewing the task and deciding whether it needs more detail.';
        try {
            if (typeof options.requireProFeature === 'function') {
                var allowed = await options.requireProFeature('ai_refine', 'AI guided item creation');
                if (!allowed) return null;
            }
            var headers = await options.getAuthHeaders();
            headers['Content-Type'] = 'application/json';
            var context = buildRequestContext(entry, state, forceReady);
            var response = await fetch(options.endpoint, {
                method: 'POST',
                headers: headers,
                body: JSON.stringify({
                    feature: 'voice_item_wizard',
                    messages: [{ role: 'user', content: 'Help create one saved pricing item from the supplied voice-item context.' }],
                    context: { pagePath: root.location && root.location.pathname || '/quote-builder', tool: 'voice_item_wizard', voiceItemWizard: context }
                })
            });
            var data = await response.json().catch(function() { return {}; });
            if (!response.ok) throw new Error(data.error || 'AI item guidance could not run.');
            var result = normalizeAssistantResult(data.voiceItemWizard || data.reply);
            if (!result) throw new Error('AI returned an unreadable item draft.');
            state.round += 1;
            state.questions = result.questions;
            applyAssistantDraft(result);
            renderQuestions(state);
            if (status) status.textContent = result.status === 'needs_details'
                ? 'Answer the questions by voice or typing, then ask AI to update the draft.'
                : 'Draft ready. Review the scope and enter your own rate.';
            if (typeof options.completeProTrialFeature === 'function') options.completeProTrialFeature('ai_refine', 'AI guided item creation');
            return result;
        } catch (error) {
            if (status) status.textContent = (error && error.message ? error.message : 'AI guidance is unavailable.') + ' You can still finish the item manually.';
            return null;
        } finally {
            if (button) {
                button.disabled = false;
                button.removeAttribute('aria-busy');
                button.querySelector('span').textContent = state.questions && state.questions.length ? 'Use answers & update draft' : 'Ask AI to draft';
            }
        }
    }

    function collectDraft(entry, allowIncomplete) {
        var priceTbd = document.getElementById('aiVoiceNewItemPriceTbd').checked;
        var draft = {
            name: readValue('aiVoiceNewItemName'),
            category: readValue('aiVoiceNewItemCategory'),
            unitType: readValue('aiVoiceNewItemUnit'),
            rate: priceTbd ? 0 : (parseFloat(readValue('aiVoiceNewItemRate')) || 0),
            priceTbd: priceTbd,
            pricingMode: priceTbd ? 'tbd' : 'fixed',
            itemDescription: readValue('aiVoiceNewItemDescription'),
            phrase: compactText(entry.phrase, 280)
        };
        if (!allowIncomplete) {
            if (!draft.name) throw new Error('Enter a name for this saved item.');
            if (!draft.category) throw new Error('Choose or enter a category.');
            if (!draft.unitType) throw new Error('Enter the pricing unit, such as ls, each, sq ft, or LF.');
            if (!priceTbd && (!readValue('aiVoiceNewItemRate') || draft.rate < 0)) throw new Error('Enter your rate or select Price TBD.');
        }
        return draft;
    }

    function run(entries, options) {
        entries = Array.isArray(entries) ? entries.filter(Boolean) : [];
        options = options || {};
        if (!entries.length) return Promise.resolve({ cancelled: false, drafts: [] });
        return new Promise(function(resolve) {
            var previous = document.getElementById('aiVoiceNewItemWizardModal');
            if (previous) previous.remove();
            document.body.insertAdjacentHTML('beforeend', wizardMarkup());
            var modalEl = document.getElementById('aiVoiceNewItemWizardModal');
            var modal = new bootstrap.Modal(modalEl, { backdrop: 'static', keyboard: false });
            var drafts = new Array(entries.length);
            var states = entries.map(function(entry) {
                return { round: 0, questions: [], answers: {}, taskNotes: compactText(entry.phrase || entry.parsedName, 1200), categories: options.categories || [] };
            });
            var currentIndex = 0;
            var settled = false;

            function finish(result) {
                if (settled) return;
                settled = true;
                stopDictation();
                modalEl.addEventListener('hidden.bs.modal', function() {
                    modalEl.remove();
                    resolve(result);
                }, { once: true });
                modal.hide();
            }

            function renderEntry(autoAsk) {
                stopDictation();
                var entry = entries[currentIndex];
                var state = states[currentIndex];
                document.getElementById('aiVoiceNewItemProgress').textContent = 'New item ' + (currentIndex + 1) + ' of ' + entries.length;
                document.getElementById('aiVoiceNewItemPhrase').textContent = entry.phrase || entry.parsedName || 'Unmatched work item';
                document.getElementById('aiVoiceNewItemRoom').textContent = entry.roomName ? 'Room: ' + entry.roomName : '';
                setValue('aiVoiceNewItemTaskNotes', state.taskNotes || entry.phrase || '');
                var draft = drafts[currentIndex] || {};
                setValue('aiVoiceNewItemName', draft.name || entry.parsedName || entry.phrase || '');
                setValue('aiVoiceNewItemCategory', draft.category || entry.category || 'Miscellaneous');
                setValue('aiVoiceNewItemUnit', draft.unitType || entry.unitType || 'ls');
                setValue('aiVoiceNewItemRate', draft.rate !== undefined ? draft.rate : '');
                document.getElementById('aiVoiceNewItemPriceTbd').checked = draft.priceTbd === true;
                document.getElementById('aiVoiceNewItemRate').disabled = draft.priceTbd === true;
                setValue('aiVoiceNewItemDescription', draft.itemDescription || '');
                var categoryOptions = document.getElementById('aiVoiceNewItemCategoryOptions');
                categoryOptions.innerHTML = (options.categories || []).map(function(category) { return '<option value="' + escapeHtml(category) + '"></option>'; }).join('');
                document.getElementById('aiVoiceNewItemPrevious').classList.toggle('d-none', currentIndex === 0);
                var next = document.getElementById('aiVoiceNewItemNext');
                next.querySelector('span').textContent = currentIndex === entries.length - 1 ? 'Review & save all items' : 'Save item & continue';
                document.getElementById('aiVoiceNewItemValidation').classList.add('d-none');
                renderQuestions(state);
                document.getElementById('aiVoiceNewItemAiStatus').textContent = '';
                if (autoAsk && options.autoAsk !== false) setTimeout(function() { requestAssistant(entry, state, options, false); }, 120);
            }

            function saveCurrentAndMove() {
                var validation = document.getElementById('aiVoiceNewItemValidation');
                try {
                    collectAnswers(states[currentIndex]);
                    states[currentIndex].taskNotes = readValue('aiVoiceNewItemTaskNotes');
                    drafts[currentIndex] = collectDraft(entries[currentIndex]);
                    validation.classList.add('d-none');
                    if (currentIndex < entries.length - 1) {
                        currentIndex += 1;
                        renderEntry(states[currentIndex].round === 0);
                    } else {
                        finish({ cancelled: false, drafts: drafts.slice() });
                    }
                } catch (error) {
                    validation.textContent = error.message || 'Review the required fields.';
                    validation.classList.remove('d-none');
                }
            }

            modalEl.querySelectorAll('.ai-voice-new-item-mic').forEach(function(button) {
                button.addEventListener('click', function() { startDictation(this); });
            });
            document.getElementById('aiVoiceNewItemAskAi').addEventListener('click', function() {
                requestAssistant(entries[currentIndex], states[currentIndex], options, false);
            });
            document.getElementById('aiVoiceNewItemDraftNow').addEventListener('click', function() {
                requestAssistant(entries[currentIndex], states[currentIndex], options, true);
            });
            document.getElementById('aiVoiceNewItemNext').addEventListener('click', saveCurrentAndMove);
            document.getElementById('aiVoiceNewItemPrevious').addEventListener('click', function() {
                collectAnswers(states[currentIndex]);
                states[currentIndex].taskNotes = readValue('aiVoiceNewItemTaskNotes');
                drafts[currentIndex] = collectDraft(entries[currentIndex], true);
                if (currentIndex > 0) currentIndex -= 1;
                renderEntry(false);
            });
            document.getElementById('aiVoiceNewItemCancel').addEventListener('click', function() { finish({ cancelled: true, drafts: [] }); });
            document.getElementById('aiVoiceNewItemCancelTop').addEventListener('click', function() { finish({ cancelled: true, drafts: [] }); });
            document.getElementById('aiVoiceNewItemPriceTbd').addEventListener('change', function() {
                document.getElementById('aiVoiceNewItemRate').disabled = this.checked;
            });
            modalEl.addEventListener('shown.bs.modal', function() {
                renderEntry(true);
                document.getElementById('aiVoiceNewItemTaskNotes').focus();
            }, { once: true });
            modal.show();
        });
    }

    root.QdAiVoiceNewItemWizard = {
        run: run,
        normalizeAssistantResult: normalizeAssistantResult,
        buildRequestContext: buildRequestContext
    };
})(window);
