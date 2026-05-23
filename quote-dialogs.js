// Branded Quote Dr dialogs and toasts.
(function() {
    'use strict';

    function ensureStyles() {
        if (document.getElementById('qdDialogStyles')) return;
        var style = document.createElement('style');
        style.id = 'qdDialogStyles';
        style.textContent = [
            '.qd-dialog-modal .modal-content{border:1px solid var(--qd-border,#d7e2ef);border-radius:8px;box-shadow:0 18px 48px rgba(15,52,96,.18);}',
            '.qd-dialog-modal .modal-header{background:linear-gradient(135deg,var(--qd-blue,#1a56a0),var(--qd-blue-dark,#0f3460));color:#fff;border-bottom:0;}',
            '.qd-dialog-modal .modal-title{font-weight:750;letter-spacing:0;}',
            '.qd-dialog-modal .btn-close{filter:invert(1) grayscale(100%);}',
            '.qd-dialog-icon{width:34px;height:34px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:rgba(242,122,26,.16);color:var(--qd-orange,#f27a1a);}',
            '.qd-toast-container{position:fixed;right:18px;bottom:18px;z-index:1095;display:flex;flex-direction:column;gap:10px;max-width:min(380px,calc(100vw - 32px));}',
            '.qd-toast{background:#fff;border:1px solid var(--qd-border,#d7e2ef);border-left:4px solid var(--qd-blue,#1a56a0);border-radius:8px;box-shadow:0 12px 30px rgba(15,52,96,.16);padding:11px 14px;display:flex;gap:10px;align-items:flex-start;}',
            '.qd-toast.qd-toast-success{border-left-color:var(--qd-success,#198754);}',
            '.qd-toast.qd-toast-warning{border-left-color:var(--qd-orange,#f27a1a);}',
            '.qd-toast.qd-toast-danger{border-left-color:var(--qd-danger,#dc3545);}',
            '.qd-toast-title{font-weight:750;color:var(--qd-blue-dark,#0f3460);line-height:1.2;}',
            '.qd-toast-message{font-size:.9rem;color:var(--qd-muted,#64748b);line-height:1.35;}'
        ].join('');
        document.head.appendChild(style);
    }

    function getModal() {
        ensureStyles();
        var el = document.getElementById('qdDialogModal');
        if (el) return ensureDialogButtons(el);
        el = document.createElement('div');
        el.className = 'modal fade qd-dialog-modal';
        el.id = 'qdDialogModal';
        el.tabIndex = -1;
        el.innerHTML =
            '<div class="modal-dialog modal-dialog-centered">' +
                '<div class="modal-content">' +
                    '<div class="modal-header">' +
                        '<h5 class="modal-title d-flex align-items-center gap-2"><span class="qd-dialog-icon"><i class="fas fa-info"></i></span><span id="qdDialogTitle">Quote Dr</span></h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<div id="qdDialogMessage" class="mb-0"></div>' +
                        '<div id="qdDialogInputWrap" class="mt-3" style="display:none;"><input type="text" class="form-control" id="qdDialogInput"></div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" id="qdDialogCancel">Cancel</button>' +
                        '<button type="button" class="btn btn-outline-primary" id="qdDialogSecondary" style="display:none;">No</button>' +
                        '<button type="button" class="btn btn-primary" id="qdDialogOk">OK</button>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(el);
        ensureDialogButtons(el);
        return el;
    }

    function ensureDialogButtons(el) {
        var footer = el.querySelector('.modal-footer');
        if (!footer) return el;
        if (!el.querySelector('#qdDialogSecondary')) {
            var secondary = document.createElement('button');
            secondary.type = 'button';
            secondary.className = 'btn btn-outline-primary';
            secondary.id = 'qdDialogSecondary';
            secondary.style.display = 'none';
            secondary.textContent = 'No';
            var ok = el.querySelector('#qdDialogOk');
            footer.insertBefore(secondary, ok || null);
        }
        return el;
    }

    function setIcon(type) {
        var icon = document.querySelector('#qdDialogModal .qd-dialog-icon i');
        if (!icon) return;
        var cls = 'fas fa-info';
        if (type === 'success') cls = 'fas fa-check';
        if (type === 'warning') cls = 'fas fa-exclamation';
        if (type === 'danger') cls = 'fas fa-trash-alt';
        if (type === 'prompt') cls = 'fas fa-pen';
        icon.className = cls;
    }

    function asOptions(message, options) {
        if (message && typeof message === 'object') return message;
        return Object.assign({ message: String(message || '') }, options || {});
    }

    function qdDialog(message, options) {
        var opts = asOptions(message, options);
        return new Promise(function(resolve) {
            var hasOtherOpenModal = !!document.querySelector('.modal.show:not(#qdDialogModal)');
            if (!hasOtherOpenModal) {
                document.querySelectorAll('.modal-backdrop').forEach(function(backdrop) { backdrop.remove(); });
                document.body.classList.remove('modal-open');
                document.body.style.removeProperty('overflow');
                document.body.style.removeProperty('padding-right');
            }
            var el = getModal();
            var existingModal = bootstrap.Modal.getInstance(el);
            if (existingModal) existingModal.dispose();
            var modal = new bootstrap.Modal(el);
            var title = el.querySelector('#qdDialogTitle');
            var msg = el.querySelector('#qdDialogMessage');
            var inputWrap = el.querySelector('#qdDialogInputWrap');
            var input = el.querySelector('#qdDialogInput');
            var ok = el.querySelector('#qdDialogOk');
            var cancel = el.querySelector('#qdDialogCancel');
            var secondary = el.querySelector('#qdDialogSecondary');
            var settled = false;

            setIcon(opts.type || (opts.prompt ? 'prompt' : 'info'));
            title.textContent = opts.title || 'Quote Dr';
            msg.textContent = opts.message || '';
            inputWrap.style.display = opts.prompt ? '' : 'none';
            input.value = opts.defaultValue || '';
            cancel.style.display = opts.cancelText === null ? 'none' : '';
            cancel.textContent = opts.cancelText || 'Cancel';
            secondary.style.display = opts.secondaryText ? '' : 'none';
            secondary.textContent = opts.secondaryText || 'No';
            secondary.className = 'btn ' + (opts.secondaryClass || 'btn-outline-primary');
            ok.textContent = opts.okText || 'OK';
            ok.className = 'btn ' + (opts.okClass || (opts.type === 'danger' ? 'btn-danger' : 'btn-primary'));

            function cleanup(value, hideFirst) {
                if (settled) return;
                settled = true;
                ok.onclick = null;
                cancel.onclick = null;
                secondary.onclick = null;
                var finish = function() {
                    el.removeEventListener('hidden.bs.modal', onHidden);
                    resolve(value);
                };
                if (hideFirst) {
                    el.addEventListener('hidden.bs.modal', finish, { once: true });
                    modal.hide();
                } else {
                    finish();
                }
            }
            function onHidden() {
                cleanup(opts.prompt ? null : false, false);
            }
            ok.onclick = function() {
                var value = opts.prompt ? input.value : true;
                cleanup(value, true);
            };
            cancel.onclick = function() {
                cleanup(opts.prompt ? null : false, true);
            };
            secondary.onclick = function() {
                cleanup(opts.secondaryValue !== undefined ? opts.secondaryValue : 'secondary', true);
            };
            el.addEventListener('hidden.bs.modal', onHidden, { once: true });
            modal.show();
            if (opts.prompt) setTimeout(function(){ input.focus(); input.select(); }, 180);
        });
    }

    function toastContainer() {
        ensureStyles();
        var el = document.getElementById('qdToastContainer');
        if (!el) {
            el = document.createElement('div');
            el.id = 'qdToastContainer';
            el.className = 'qd-toast-container';
            document.body.appendChild(el);
        }
        return el;
    }

    function qdToast(message, type, title) {
        var opts = asOptions(message, typeof type === 'object' ? type : { type: type, title: title });
        var el = document.createElement('div');
        var toastType = opts.type || 'info';
        var icon = toastType === 'success' ? 'fa-check-circle' : toastType === 'danger' ? 'fa-exclamation-triangle' : toastType === 'warning' ? 'fa-exclamation-circle' : 'fa-info-circle';
        el.className = 'qd-toast qd-toast-' + toastType;
        el.innerHTML = '<i class="fas ' + icon + ' mt-1" style="color:var(--qd-orange,#f27a1a);"></i><div><div class="qd-toast-title">' + (opts.title || 'Quote Dr') + '</div><div class="qd-toast-message"></div></div>';
        el.querySelector('.qd-toast-message').textContent = opts.message || '';
        toastContainer().appendChild(el);
        setTimeout(function() {
            el.style.opacity = '0';
            el.style.transform = 'translateY(6px)';
            el.style.transition = 'opacity .18s ease, transform .18s ease';
            setTimeout(function(){ el.remove(); }, 220);
        }, opts.delay || 3200);
    }

    window.qdAlert = function(message, options) {
        var opts = asOptions(message, options);
        opts.cancelText = null;
        opts.okText = opts.okText || 'Got it';
        return qdDialog(opts);
    };
    window.qdConfirm = function(message, options) {
        return qdDialog(message, options);
    };
    window.qdPrompt = function(message, defaultValue, options) {
        var opts = asOptions(message, options);
        opts.prompt = true;
        opts.defaultValue = defaultValue || '';
        opts.okText = opts.okText || 'Save';
        return qdDialog(opts);
    };
    window.qdToast = qdToast;
    window.showToast = function(message, type) {
        qdToast({ message: message, type: type || 'info' });
    };
    window.qdLeavePage = async function(url) {
        if (typeof unsavedChanges !== 'undefined' && unsavedChanges) {
            var ok = await window.qdConfirm('You have unsaved changes. Leave anyway?', {
                title: 'Unsaved Changes',
                okText: 'Leave',
                okClass: 'btn-warning',
                type: 'warning'
            });
            if (!ok) return;
        }
        if (typeof saveSessionQuote === 'function') saveSessionQuote();
        window.location.href = url;
    };
    window.qdRunAfterLeaveConfirm = async function(fnName) {
        if (typeof unsavedChanges !== 'undefined' && unsavedChanges) {
            var ok = await window.qdConfirm('You have unsaved changes. Continue anyway?', {
                title: 'Unsaved Changes',
                okText: 'Continue',
                okClass: 'btn-warning',
                type: 'warning'
            });
            if (!ok) return;
        }
        if (typeof saveSessionQuote === 'function') saveSessionQuote();
        if (typeof window[fnName] === 'function') window[fnName]();
    };
})();
