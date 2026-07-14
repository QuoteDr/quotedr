(function(global) {
    'use strict';

    const ADMIN_EMAILS = Object.freeze([
        'info@alddirect.ca',
        'ald.direct.contracting@gmail.com'
    ]);

    function normalizeEmail(value) {
        return String(value || '').trim().toLowerCase();
    }

    function isAdminUser(userOrEmail) {
        const email = typeof userOrEmail === 'string'
            ? userOrEmail
            : userOrEmail && userOrEmail.email;
        return ADMIN_EMAILS.indexOf(normalizeEmail(email)) !== -1;
    }

    global.QuoteDrAdmin = Object.freeze({
        emails: ADMIN_EMAILS,
        normalizeEmail: normalizeEmail,
        isAdminUser: isAdminUser
    });
})(window);
