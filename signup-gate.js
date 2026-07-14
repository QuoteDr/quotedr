(function(window, document) {
    'use strict';

    var scriptElement = document.currentScript;
    var assetBase = scriptElement && scriptElement.src
        ? new URL('.', scriptElement.src)
        : new URL('.', window.location.href);
    var loginUrl = new URL('login.html', assetBase).href;
    var instagramUrl = 'https://www.instagram.com/quotedr.io/';
    var modal = null;
    var lastFocusedElement = null;
    var activeSource = 'unknown';
    var focusableSelector = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function capture(name, properties) {
        try {
            if (window.QuoteDrAnalytics && typeof window.QuoteDrAnalytics.capture === 'function') {
                window.QuoteDrAnalytics.capture(name, properties || {});
            }
        } catch (error) {}
    }

    function buildModal() {
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = 'quoteDrSignupGate';
        modal.className = 'qd-signup-gate';
        modal.hidden = true;
        modal.innerHTML =
            '<div class="qd-signup-gate__backdrop" data-qd-signup-close></div>' +
            '<section class="qd-signup-gate__dialog" role="dialog" aria-modal="true" aria-labelledby="quoteDrSignupGateTitle" aria-describedby="quoteDrSignupGateDescription">' +
                '<button type="button" class="qd-signup-gate__close" data-qd-signup-close aria-label="Close early access details">&times;</button>' +
                '<p class="qd-signup-gate__eyebrow">Public signup is temporarily closed</p>' +
                '<h2 class="qd-signup-gate__title" id="quoteDrSignupGateTitle">QuoteDr is opening soon.</h2>' +
                '<p class="qd-signup-gate__lead" id="quoteDrSignupGateDescription">We are preparing QuoteDr for its first public members. New accounts are not open just yet, but the early-adopter launch is coming.</p>' +
                '<div class="qd-signup-gate__offer">' +
                    '<strong>A 15-day early-adopter offer</strong>' +
                    '<span>When the offer opens, early adopters can lock in QuoteDr Pro for $49 CAD/month for as long as the subscription remains continuously active.</span>' +
                '</div>' +
                '<p class="qd-signup-gate__lead">Follow <strong>@QuoteDr.io</strong> on Instagram so you do not miss the launch window.</p>' +
                '<div class="qd-signup-gate__actions">' +
                    '<a class="qd-signup-gate__action qd-signup-gate__action--primary" data-qd-signup-instagram href="' + instagramUrl + '" target="_blank" rel="noopener noreferrer">Follow @QuoteDr.io</a>' +
                    '<a class="qd-signup-gate__action qd-signup-gate__action--secondary" data-qd-signup-signin href="' + loginUrl + '">Existing Member Sign In</a>' +
                '</div>' +
                '<p class="qd-signup-gate__footnote">The 15-day clock has not started. Full reservation details are coming soon.</p>' +
            '</section>';

        document.body.appendChild(modal);
        modal.addEventListener('click', function(event) {
            if (event.target.closest('[data-qd-signup-close]')) close();
        });
        modal.querySelector('[data-qd-signup-instagram]').addEventListener('click', function() {
            capture('signup_gate_instagram_clicked', { source: activeSource });
        });
        modal.querySelector('[data-qd-signup-signin]').addEventListener('click', function() {
            capture('signup_gate_existing_signin_clicked', { source: activeSource });
        });
        return modal;
    }

    function open(source) {
        var gate = buildModal();
        if (!gate.hidden) return;
        activeSource = String(source || 'public_signup_cta');
        lastFocusedElement = document.activeElement;
        gate.hidden = false;
        document.body.classList.add('qd-signup-gate-open');
        gate.querySelector('.qd-signup-gate__close').focus();
        capture('signup_gate_opened', { source: activeSource });
    }

    function close() {
        if (!modal || modal.hidden) return;
        modal.hidden = true;
        document.body.classList.remove('qd-signup-gate-open');
        if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
            lastFocusedElement.focus();
        }
    }

    function isSignupLink(anchor) {
        if (!anchor) return false;
        if (anchor.hasAttribute('data-qd-signup-gate')) return true;
        var href = anchor.getAttribute('href') || '';
        if (!href) return false;
        try {
            var url = new URL(href, window.location.href);
            return /\/login\.html$/i.test(url.pathname) && url.searchParams.has('signup');
        } catch (error) {
            return false;
        }
    }

    document.addEventListener('click', function(event) {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        var anchor = event.target.closest('a, button');
        if (!isSignupLink(anchor)) return;
        event.preventDefault();
        open(anchor.getAttribute('data-qd-signup-source') || 'public_signup_cta');
    });

    document.addEventListener('keydown', function(event) {
        if (!modal || modal.hidden) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            close();
            return;
        }
        if (event.key !== 'Tab') return;

        var focusable = Array.prototype.slice.call(modal.querySelectorAll(focusableSelector));
        if (!focusable.length) return;
        var first = focusable[0];
        var last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
        }
    });

    document.addEventListener('DOMContentLoaded', function() {
        buildModal();
        var params = new URLSearchParams(window.location.search);
        if (params.has('signup')) open('direct_signup_link');
    });

    window.QuoteDrSignupGate = {
        open: open,
        close: close,
        instagramUrl: instagramUrl
    };
})(window, document);
