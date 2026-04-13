// supabase.js - QuoteDr.io Supabase client and helpers

const SUPABASE_URL = 'https://axmoffknvblluibuitrq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso';

// Initialize Supabase client
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── AUTH HELPERS ────────────────────────────────────────────────────────────

async function requireAuth() {
    const { data: { session } } = await _supabase.auth.getSession();
    if (!session) {
        window.location.href = 'login.html';
        return null;
    }
    return session.user;
}

async function signOut() {
    await _supabase.auth.signOut();
    window.location.href = 'login.html';
}

async function getCurrentUser() {
    const { data: { session } } = await _supabase.auth.getSession();
    return session ? session.user : null;
}

// ─── QUOTE HELPERS ───────────────────────────────────────────────────────────

async function saveQuoteToSupabase(quoteData) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };

    const payload = {
        user_id: user.id,
        quote_number: quoteData.quoteNumber || null,
        client_name: quoteData.clientName || '',
        client_address: quoteData.clientAddress || '',
        client_city: quoteData.clientCity || '',
        client_phone: quoteData.clientPhone || '',
        client_email: quoteData.clientEmail || '',
        project_description: quoteData.projectDescription || '',
        quote_date: quoteData.quoteDate || new Date().toISOString().split('T')[0],
        valid_until: quoteData.validUntil || null,
        subtotal: quoteData.subtotal || 0,
        tax_rate: quoteData.taxRate || 0.13,
        tax_amount: quoteData.taxAmount || 0,
        total: quoteData.total || 0,
        status: quoteData.status || 'draft',
        notes: quoteData.notes || '',
        data: quoteData,
        updated_at: new Date().toISOString()
    };

    if (quoteData.supabaseId) {
        // Update existing
        const { data, error } = await _supabase
            .from('quotes')
            .update(payload)
            .eq('id', quoteData.supabaseId)
            .eq('user_id', user.id)
            .select()
            .single();
        return { data, error };
    } else {
        // Insert new
        payload.created_at = new Date().toISOString();
        const { data, error } = await _supabase
            .from('quotes')
            .insert(payload)
            .select()
            .single();
        return { data, error };
    }
}

async function loadQuoteFromSupabase(quoteId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };

    const { data, error } = await _supabase
        .from('quotes')
        .select('*')
        .eq('id', quoteId)
        .eq('user_id', user.id)
        .single();
    return { data, error };
}

async function listQuotesFromSupabase() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };

    const { data, error } = await _supabase
        .from('quotes')
        .select('id, quote_number, client_name, quote_date, total, status, updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
    return { data, error };
}

async function deleteQuoteFromSupabase(quoteId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };

    const { error } = await _supabase
        .from('quotes')
        .delete()
        .eq('id', quoteId)
        .eq('user_id', user.id);
    return { error };
}

// ─── BUSINESS PROFILE HELPERS ────────────────────────────────────────────────

async function getBusinessProfile() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };

    const { data, error } = await _supabase
        .from('business_profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
    return { data, error };
}

async function saveBusinessProfile(profile) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };

    const payload = { ...profile, user_id: user.id, updated_at: new Date().toISOString() };

    // Upsert (insert or update)
    const { data, error } = await _supabase
        .from('business_profiles')
        .upsert(payload, { onConflict: 'user_id' })
        .select()
        .single();
    return { data, error };
}

// ─── CLIENT HELPERS ──────────────────────────────────────────────────────────

async function saveClientToSupabase(clientData) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };

    const payload = {
        user_id: user.id,
        name: clientData.name || '',
        address: clientData.address || '',
        city: clientData.city || '',
        phone: clientData.phone || '',
        email: clientData.email || '',
        notes: clientData.notes || '',
        updated_at: new Date().toISOString()
    };

    const { data, error } = await _supabase
        .from('clients')
        .upsert(payload, { onConflict: 'user_id,name' })
        .select()
        .single();
    return { data, error };
}

async function listClientsFromSupabase() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };

    const { data, error } = await _supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });
    return { data, error };
}
