// Adds contextual Help buttons to QuoteDr modals.
(function() {
    const HELP_MODAL_ID = 'quoteDrContextHelpModal';
    const DECORATED_ATTR = 'data-qd-help-decorated';

    function injectStyles() {
        if (document.getElementById('quoteDrModalHelpStyles')) return;
        const style = document.createElement('style');
        style.id = 'quoteDrModalHelpStyles';
        style.textContent = `
            .qd-modal-help-btn {
                display: inline-flex;
                align-items: center;
                gap: 0.35rem;
                border-radius: 999px;
                font-size: 0.8rem;
                font-weight: 700;
                line-height: 1;
                padding: 0.42rem 0.7rem;
                white-space: nowrap;
            }
            .qd-inline-help-btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                width: 24px;
                height: 24px;
                border-radius: 50%;
                border: 1px solid var(--qd-border, #d7e2ef);
                background: #fff;
                color: var(--qd-blue, #1a56a0);
                font-size: 0.78rem;
                line-height: 1;
                padding: 0;
                margin-left: 0.35rem;
                vertical-align: middle;
            }
            .qd-inline-help-btn:hover,
            .qd-inline-help-btn:focus {
                background: var(--qd-blue, #1a56a0);
                border-color: var(--qd-blue, #1a56a0);
                color: #fff;
            }
            .modal-header.bg-dark .qd-modal-help-btn,
            .modal-header.bg-primary .qd-modal-help-btn,
            .modal-header.bg-success .qd-modal-help-btn,
            .modal-header[style*="color:white"] .qd-modal-help-btn,
            .modal-header[style*="color: white"] .qd-modal-help-btn {
                border-color: rgba(255,255,255,0.65);
                color: #fff;
                background: rgba(255,255,255,0.12);
            }
            .modal-header.bg-dark .qd-modal-help-btn:hover,
            .modal-header.bg-primary .qd-modal-help-btn:hover,
            .modal-header.bg-success .qd-modal-help-btn:hover,
            .modal-header[style*="color:white"] .qd-modal-help-btn:hover,
            .modal-header[style*="color: white"] .qd-modal-help-btn:hover {
                background: rgba(255,255,255,0.22);
                color: #fff;
            }
            .qd-help-actions {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                margin-left: auto;
            }
            .qd-help-summary {
                border-left: 4px solid var(--qd-blue, #1a56a0);
                background: var(--qd-surface-soft, #f8fbff);
                border-radius: 8px;
                padding: 0.9rem 1rem;
            }
            .qd-help-section-title {
                color: var(--qd-blue-dark, #0f3460);
                font-weight: 800;
                font-size: 0.9rem;
                text-transform: uppercase;
                letter-spacing: 0;
                margin: 1rem 0 0.45rem;
            }
            .qd-help-video-placeholder {
                border: 1px dashed var(--qd-border, #d7e2ef);
                background: #fff;
                border-radius: 8px;
                padding: 0.75rem;
                color: var(--qd-muted, #64748b);
                font-size: 0.9rem;
            }
            @media (max-width: 575.98px) {
                .qd-modal-help-btn span { display: none; }
                .qd-modal-help-btn { width: 34px; height: 34px; justify-content: center; padding: 0; }
            }
        `;
        document.head.appendChild(style);
    }

    function getTopic(modalId, modal) {
        const registered = modalId && window.QuoteDrHelpContent ? window.QuoteDrHelpContent.getTopic(modalId) : null;
        if (registered) return registered;

        const title = modal ? (modal.querySelector('.modal-title')?.textContent || '').trim() : '';
        return {
            title: title || 'This Tool',
            summary: 'This window helps you complete the current QuoteDr task. Follow the fields from top to bottom, review anything that affects the client, then use the main action button when you are ready.',
            steps: [
                'Read the title and field labels to confirm what this tool is for.',
                'Fill in the required details first.',
                'Review totals, links, client-visible text, or warnings before continuing.',
                'Use Cancel or Close if you are unsure and want to return without changes.'
            ],
            tips: [
                'Most QuoteDr windows save or apply changes only after you click the primary action button.',
                'For detailed help, open the Help Center or ask the AI Assistant.'
            ],
            helpUrl: 'help.html'
        };
    }

    function getInlineTopic(topicId) {
        if (!topicId || !window.QuoteDrHelpContent || !window.QuoteDrHelpContent.getInlineTopic) return null;
        return window.QuoteDrHelpContent.getInlineTopic(topicId);
    }

    function ensureHelpModal() {
        let modal = document.getElementById(HELP_MODAL_ID);
        if (modal) return modal;

        modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = HELP_MODAL_ID;
        modal.tabIndex = -1;
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = `
            <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header" style="background:linear-gradient(135deg,#1a56a0,#0f3460);color:white;">
                        <h5 class="modal-title" id="quoteDrContextHelpTitle"><i class="fas fa-circle-question me-2"></i>Help</h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body" id="quoteDrContextHelpBody"></div>
                    <div class="modal-footer">
                        <a class="btn btn-outline-primary" id="quoteDrContextHelpFullLink" href="help.html" target="_blank" rel="noopener">
                            <i class="fas fa-book-open me-1"></i>Open Help Center
                        </a>
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        return modal;
    }

    function listHtml(items) {
        if (!items || !items.length) return '';
        return '<ol class="mb-0 ps-3">' + items.map(item => '<li class="mb-2">' + escapeHtml(item) + '</li>').join('') + '</ol>';
    }

    function tipsHtml(items) {
        if (!items || !items.length) return '';
        return '<ul class="mb-0 ps-3">' + items.map(item => '<li class="mb-2">' + escapeHtml(item) + '</li>').join('') + '</ul>';
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function openHelp(modalId) {
        const sourceModal = document.getElementById(modalId);
        const topic = getTopic(modalId, sourceModal);
        if (!topic) return;

        const modal = ensureHelpModal();
        const title = document.getElementById('quoteDrContextHelpTitle');
        const body = document.getElementById('quoteDrContextHelpBody');
        const fullLink = document.getElementById('quoteDrContextHelpFullLink');

        title.innerHTML = '<i class="fas fa-circle-question me-2"></i>' + escapeHtml(topic.title || 'Help');
        body.innerHTML = `
            <div class="qd-help-summary">${escapeHtml(topic.summary || 'Quick guidance for this QuoteDr tool.')}</div>
            <div class="qd-help-section-title">Steps</div>
            ${listHtml(topic.steps || [])}
            ${topic.tips && topic.tips.length ? '<div class="qd-help-section-title">Tips</div>' + tipsHtml(topic.tips) : ''}
            ${topic.videoUrl
                ? '<div class="qd-help-section-title">Walkthrough Video</div><a class="btn btn-primary btn-sm" href="' + escapeHtml(topic.videoUrl) + '" target="_blank" rel="noopener"><i class="fas fa-play me-1"></i>Watch Video</a>'
                : '<div class="qd-help-section-title">Walkthrough Video</div><div class="qd-help-video-placeholder"><i class="fas fa-video me-1"></i>Video walkthrough coming soon.</div>'}
        `;
        fullLink.href = topic.helpUrl || 'help.html';

        if (window.bootstrap) {
            bootstrap.Modal.getOrCreateInstance(modal).show();
        } else {
            window.location.href = fullLink.href;
        }
    }

    function openInlineHelp(topicId) {
        const topic = getInlineTopic(topicId);
        if (!topic) return;

        const modal = ensureHelpModal();
        const title = document.getElementById('quoteDrContextHelpTitle');
        const body = document.getElementById('quoteDrContextHelpBody');
        const fullLink = document.getElementById('quoteDrContextHelpFullLink');

        title.innerHTML = '<i class="fas fa-circle-question me-2"></i>' + escapeHtml(topic.title || 'Help');
        body.innerHTML = `
            <div class="qd-help-summary">${escapeHtml(topic.summary || 'Quick guidance for this field.')}</div>
            <div class="qd-help-section-title">What To Do</div>
            ${listHtml(topic.steps || [])}
            ${topic.tips && topic.tips.length ? '<div class="qd-help-section-title">Tips</div>' + tipsHtml(topic.tips) : ''}
            ${topic.videoUrl
                ? '<div class="qd-help-section-title">Walkthrough Video</div><a class="btn btn-primary btn-sm" href="' + escapeHtml(topic.videoUrl) + '" target="_blank" rel="noopener"><i class="fas fa-play me-1"></i>Watch Video</a>'
                : '<div class="qd-help-section-title">Walkthrough Video</div><div class="qd-help-video-placeholder"><i class="fas fa-video me-1"></i>Video walkthrough coming soon.</div>'}
        `;
        fullLink.href = topic.helpUrl || 'help.html';

        if (window.bootstrap) {
            bootstrap.Modal.getOrCreateInstance(modal).show();
        } else {
            window.location.href = fullLink.href;
        }
    }

    function inlineButton(topicId, label) {
        const text = label || 'Help';
        return '<button type="button" class="qd-inline-help-btn" title="' + escapeHtml(text) + '" aria-label="' + escapeHtml(text) + '" onclick="if(window.QuoteDrModalHelp){window.QuoteDrModalHelp.openInline(\'' + escapeHtml(topicId) + '\');} return false;"><i class="fas fa-question"></i></button>';
    }

    function decorateModal(modal) {
        if (!modal || modal.getAttribute(DECORATED_ATTR) === '1') return;
        if (modal.id === HELP_MODAL_ID) return;

        if (!modal.id) modal.id = 'qdHelpModal_' + Math.random().toString(36).slice(2, 10);
        const topic = getTopic(modal.id, modal);

        const header = modal.querySelector('.modal-header');
        const closeBtn = header ? header.querySelector('[data-bs-dismiss="modal"], .btn-close') : null;
        if (!header || !closeBtn) return;

        modal.setAttribute(DECORATED_ATTR, '1');

        let actions = header.querySelector('.qd-help-actions');
        if (!actions) {
            actions = document.createElement('div');
            actions.className = 'qd-help-actions';
            header.insertBefore(actions, closeBtn);
        }

        if (actions.querySelector('.qd-modal-help-btn')) return;

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-sm btn-outline-secondary qd-modal-help-btn';
        button.title = 'Help for ' + (topic.title || 'this tool');
        button.setAttribute('aria-label', 'Help for ' + (topic.title || 'this tool'));
        button.innerHTML = '<i class="fas fa-circle-question"></i><span>Help</span>';
        button.addEventListener('click', function(event) {
            event.preventDefault();
            event.stopPropagation();
            openHelp(modal.id);
        });
        actions.appendChild(button);
    }

    function decorateAll() {
        injectStyles();
        document.querySelectorAll('.modal[id]').forEach(decorateModal);
    }

    function initObserver() {
        const observer = new MutationObserver(function(mutations) {
            for (const mutation of mutations) {
                if (!mutation.addedNodes || !mutation.addedNodes.length) continue;
                for (const node of mutation.addedNodes) {
                    if (!node || node.nodeType !== 1) continue;
                    if (node.matches && node.matches('.modal[id]')) decorateModal(node);
                    if (node.querySelectorAll) node.querySelectorAll('.modal[id]').forEach(decorateModal);
                }
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function init() {
        decorateAll();
        initObserver();
    }

    window.QuoteDrModalHelp = {
        decorateAll: decorateAll,
        open: openHelp,
        openInline: openInlineHelp,
        inlineButton: inlineButton
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
