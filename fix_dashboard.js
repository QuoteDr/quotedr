// This file contains the fix for dashboard authentication retry issue
// Bug 1: Dashboard shows 0 quotes even though quotes are saved

// The fix is to modify refreshQuotes function in dashboard.html to handle "Not authenticated" error with a retry
// This should be applied by replacing the refreshQuotes function in dashboard.html

async function refreshQuotes() {
    try {
        const { data, error } = await listQuotesFromSupabase();
        if (error && error === 'Not authenticated') {
            // Session may not be ready yet — retry once after delay
            setTimeout(async function() {
                const retry = await listQuotesFromSupabase();
                if (retry.error) {
                    document.getElementById('quotesList').innerHTML = '<div class="alert alert-warning">Please <a href="login.html">log in</a> to see your quotes.</div>';
                    return;
                }
                renderQuotes(retry.data);
                updateStats(retry.data);
            }, 1500);
            return;
        }
        if (error) throw error;
        renderQuotes(data);
        updateStats(data);
    } catch (err) {
        console.error('Error loading quotes:', err.message);
        alert('Error loading quotes: ' + err.message);
    }
}