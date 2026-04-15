// QuoteDr Error Reporter - catches unhandled errors and logs to Supabase
(function() {
    var SUPABASE_URL = 'https://axmoffknvblluibuitrq.supabase.co';
    var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso';

    function getUser() {
        try {
            var s = localStorage.getItem('supabase.auth.token') || localStorage.getItem('sb-axmoffknvblluibuitrq-auth-token');
            if (!s) return null;
            var d = JSON.parse(s);
            return (d && d.user && d.user.email) || (d && d.currentSession && d.currentSession.user && d.currentSession.user.email) || null;
        } catch(e) { return null; }
    }

    function reportError(message, source, stack) {
        // Don't report extension errors or network errors
        if (source && source.includes('chrome-extension')) return;
        if (source && source.includes('moz-extension')) return;
        if (!message) return;

        var payload = {
            message: String(message).slice(0, 500),
            source: String(source || window.location.pathname).slice(0, 200),
            stack: String(stack || '').slice(0, 1000),
            page: window.location.pathname,
            user_email: getUser(),
            user_agent: navigator.userAgent.slice(0, 200),
            created_at: new Date().toISOString()
        };

        fetch(SUPABASE_URL + '/rest/v1/error_logs', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': ANON_KEY,
                'Authorization': 'Bearer ' + ANON_KEY,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify(payload)
        }).catch(function() {}); // silently fail - don't create error loops
    }

    // Catch unhandled JS errors
    window.addEventListener('error', function(event) {
        reportError(event.message, event.filename, event.error && event.error.stack);
    });

    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', function(event) {
        var msg = event.reason && event.reason.message ? event.reason.message : String(event.reason);
        var stack = event.reason && event.reason.stack ? event.reason.stack : '';
        reportError('Unhandled Promise: ' + msg, window.location.pathname, stack);
    });

    console.log('[QuoteDr] Error reporter active');
})();