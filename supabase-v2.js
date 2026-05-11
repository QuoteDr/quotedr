// supabase.js - QuoteDr.io Supabase client and helpers

// Run this in Supabase SQL Editor:
// CREATE TABLE IF NOT EXISTS items (
//   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
//   user_id uuid REFERENCES auth.users(id),
//   data jsonb NOT NULL,
//   updated_at timestamptz DEFAULT now()
// );
// ALTER TABLE items ENABLE ROW LEVEL SECURITY;
// CREATE POLICY "Users manage own items" ON items FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

const SUPABASE_URL = 'https://axmoffknvblluibuitrq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso';

// Initialize Supabase client
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Current user state
let currentUser = null;

// Check if user is authenticated
async function checkAuthStatus() {
    const { data: { session }, error } = await _supabase.auth.getSession();
    if (error) {
        console.error('Auth error:', error);
        return null;
    }
    if (session?.user) qdIdentifyAnalyticsUser(session.user);
    return session?.user || null;
}

// Get current user (cached)
async function getCurrentUser() {
    if (!currentUser) {
        currentUser = await checkAuthStatus();
    }
    return currentUser;
}

// Auth headers for Supabase Edge Functions that need the current signed-in user.
async function getSupabaseFunctionAuthHeaders() {
    const { data: { session }, error } = await _supabase.auth.getSession();
    if (error) throw error;
    if (!session?.access_token) throw new Error('Please sign in again before using this feature.');
    return {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + session.access_token
    };
}

// Sign in with email and password
async function signInWithEmail(email, password) {
    const { data, error } = await _supabase.auth.signInWithPassword({
        email: email,
        password: password
    });
    if (error) throw error;
    currentUser = data.user;
    qdIdentifyAnalyticsUser(currentUser);
    return data;
}

// Sign up with email and password
async function signUpWithEmail(email, password) {
    const { data, error } = await _supabase.auth.signUp({
        email: email,
        password: password
    });
    if (error) throw error;
    currentUser = data.user;
    qdIdentifyAnalyticsUser(currentUser);
    return data;
}

// Sign out
async function signOut() {
    const { error } = await _supabase.auth.signOut();
    if (error) console.error('Sign out error:', error);
    currentUser = null;
    if (window.QuoteDrAnalytics && typeof window.QuoteDrAnalytics.reset === 'function') window.QuoteDrAnalytics.reset();
    window.location.href = 'login.html';
}

// Get user's profile data
async function getUserProfile() {
    const user = await getCurrentUser();
    if (!user) return null;
    
    const { data, error } = await _supabase
        .from('user_data')
        .select('*')
        .eq('id', user.id)
        .single();
        
    if (error) {
        console.error('Profile fetch error:', error);
        return null;
    }
    return data;
}

// Update user's profile (legacy — kept for compatibility)
async function updateUserProfile(profileData) {
    // If called with onboarding_complete, route to the proper KV save
    if ('onboarding_complete' in profileData) {
        return saveOnboardingComplete(profileData.onboarding_complete);
    }
    return { error: 'updateUserProfile: unsupported fields' };
}

// Save onboarding complete flag to user_data key/value store
async function saveOnboardingComplete(value) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const result = await _supabase
        .from('user_data')
        .upsert({ user_id: user.id, key: 'onboarding_complete', value: { complete: value }, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    if (!result.error) localStorage.setItem('ald_onboarding_complete', value ? '1' : '');
    return result;
}

// Load onboarding complete flag from user_data
async function loadOnboardingComplete() {
    const user = await getCurrentUser();
    if (!user) return false;
    const { data, error } = await _supabase
        .from('user_data')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'onboarding_complete')
        .maybeSingle();
    if (!error && data && data.value && data.value.complete) {
        localStorage.setItem('ald_onboarding_complete', '1');
        return true;
    }
    return false;
}

// Get all templates for current user
async function listTemplates() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await _supabase
        .from('templates')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
        
    if (error) {
        console.error('Template list error:', error);
        return { error };
    }
    return { data };
}

// Save a template
async function saveTemplate(templateData) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await _supabase
        .from('templates')
        .upsert({
            user_id: user.id,
            name: templateData.name || '',
            rooms: templateData.rooms || [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,name' })
        .select();
        
    if (error) {
        console.error('Template save error:', error);
        return { error };
    }
    return { data };
}

// Delete a template
async function deleteTemplate(templateName) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await _supabase
        .from('templates')
        .delete()
        .eq('user_id', user.id)
        .eq('name', templateName);
        
    if (error) {
        console.error('Template delete error:', error);
        return { error };
    }
    return { data };
}

// Get all terms for current user
async function listTerms() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await _supabase
        .from('terms')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
        
    if (error) {
        console.error('Terms list error:', error);
        return { error };
    }
    return { data };
}

// Save a term
async function saveTerm(termData) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await _supabase
        .from('terms')
        .upsert({
            user_id: user.id,
            name: termData.name || '',
            text: termData.text || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,name' })
        .select();
        
    if (error) {
        console.error('Term save error:', error);
        return { error };
    }
    return { data };
}

// Delete a term
async function deleteTerm(termName) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await _supabase
        .from('terms')
        .delete()
        .eq('user_id', user.id)
        .eq('name', termName);
        
    if (error) {
        console.error('Term delete error:', error);
        return { error };
    }
    return { data };
}

// Get all items for current user
async function listItems() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await _supabase
        .from('items')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });
        
    if (error) {
        console.error('Items list error:', error);
        return { error };
    }
    return { data };
}

// Save an item
async function saveItem(itemData) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await _supabase
        .from('items')
        .upsert({
            user_id: user.id,
            name: itemData.name || '',
            category: itemData.category || '',
            unit_type: itemData.unitType || '',
            rate: itemData.rate || 0,
            material_cost: itemData.materialCost || 0,
            supplier_url: itemData.supplierUrl || '',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,name' })
        .select();
        
    if (error) {
        console.error('Item save error:', error);
        return { error };
    }
    return { data };
}

// Delete an item
async function deleteItem(itemName) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await _supabase
        .from('items')
        .delete()
        .eq('user_id', user.id)
        .eq('name', itemName);
        
    if (error) {
        console.error('Item delete error:', error);
        return { error };
    }
    return { data };
}

// Get all quotes for current user
async function listQuotes() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await _supabase
        .from('quotes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
        
    if (error) {
        console.error('Quotes list error:', error);
        return { error };
    }
    return { data };
}

// Save a quote
async function saveQuote(quoteData) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };

    const now = new Date().toISOString();
    if ((quoteData.type === 'change_order' || quoteData.documentType === 'change_order') &&
        quoteData.supabaseId &&
        quoteData.parentQuoteId &&
        quoteData.supabaseId === quoteData.parentQuoteId) {
        quoteData.supabaseId = null;
    }
    const clientEmail = quoteData.clientEmail || quoteData.email || '';
    const clientPhone = quoteData.clientPhone || quoteData.phone || '';
    const projectAddress = quoteData.projectAddress || '';
    const payload = {
        user_id: user.id,
        client_name: quoteData.clientName || '',
        quote_number: quoteData.quoteNumber || '',
        total: quoteData.grandTotal || 0,
        status: quoteData.status || 'draft',
        type: quoteData.type || quoteData.documentType || 'quote',
        parent_quote_id: quoteData.parentQuoteId || null,
        change_order_number: quoteData.changeOrderNumber || null,
        data: {
            type: quoteData.type || quoteData.documentType || 'quote',
            documentType: quoteData.type || quoteData.documentType || 'quote',
            parentQuoteId: quoteData.parentQuoteId || '',
            parentQuoteNumber: quoteData.parentQuoteNumber || '',
            parentQuoteTotal: quoteData.parentQuoteTotal || 0,
            changeOrderNumber: quoteData.changeOrderNumber || null,
            changeReason: quoteData.changeReason || '',
            status: quoteData.status || 'draft',
            quoteTitle: quoteData.quoteTitle || '',
            clientName: quoteData.clientName || '',
            quoteNumber: quoteData.quoteNumber || '',
            projectAddress: projectAddress,
            clientEmail: clientEmail,
            clientPhone: clientPhone,
            rooms: quoteData.rooms || [],
            terms: quoteData.terms || [],
            style: quoteData.style || {},
            notes: quoteData.notes || '',
            paymentStatus: quoteData.paymentStatus || '',
            payments: quoteData.payments || [],
            savedAt: quoteData.savedAt || now
        },
        updated_at: now
    };

    let data, error;
    async function runSave(savePayload) {
    if (quoteData.supabaseId) {
        // Update existing quote
        return await _supabase
            .from('quotes')
            .update(savePayload)
            .eq('id', quoteData.supabaseId)
            .eq('user_id', user.id)
            .select();
    } else {
        // Insert new quote
        savePayload.created_at = new Date().toISOString();
        return await _supabase
            .from('quotes')
            .insert(savePayload)
            .select();
    }
    }
    ({ data, error } = await runSave(payload));
    if (error && /type|parent_quote_id|change_order_number|schema cache/i.test(error.message || '')) {
        delete payload.type;
        delete payload.parent_quote_id;
        delete payload.change_order_number;
        ({ data, error } = await runSave(payload));
    }

    if (error) {
        console.error('Quote save error:', error);
        return { error };
    }
    var savedQuote = Array.isArray(data) ? data[0] : data;
    var quoteKey = (savedQuote && savedQuote.id) || quoteData.supabaseId || quoteData.quoteNumber || now;
    var roomCount = Array.isArray(quoteData.rooms) ? quoteData.rooms.length : 0;
    var itemCount = Array.isArray(quoteData.rooms) ? quoteData.rooms.reduce(function(sum, room) { return sum + ((room.items || []).length); }, 0) : 0;
    var quoteProps = {
        quote_id: savedQuote && savedQuote.id,
        status: quoteData.status || 'draft',
        room_count: roomCount,
        item_count: itemCount,
        total_bucket: qdAnalyticsBucketMoney(quoteData.grandTotal || 0)
    };
    if (!quoteData.supabaseId) qdCaptureOnce('quote_started', quoteKey, quoteProps);
    if (roomCount > 0 && itemCount > 0 && (parseFloat(quoteData.grandTotal) || 0) > 0) {
        qdCaptureOnce('quote_completed', quoteKey, quoteProps);
    }
    return { data };
}

// Get all invoices for current user
async function listInvoices() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await _supabase
        .from('invoices')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
        
    if (error) {
        console.error('Invoices list error:', error);
        return { error };
    }
    return { data };
}

// Save an invoice for cross-device sharing (stored in quotes table)
async function saveInvoiceForSharing(invoiceData) {
    const user = await getCurrentUser();
    const now = new Date().toISOString();
    const payload = {
        user_id: user ? user.id : null,
        data: { ...invoiceData, _type: 'invoice' },
        client_name: invoiceData.clientName || '',
        quote_number: (invoiceData.quoteNumber || '') + '-INV',
        total: invoiceData.grandTotal || 0,
        status: 'invoiced',
        updated_at: now
    };
    let data, error;
    if (invoiceData.supabaseId) {
        // Update existing invoice row
        ({ data, error } = await _supabase.from('quotes').update(payload).eq('id', invoiceData.supabaseId).select().single());
    } else {
        // Insert new invoice row
        payload.created_at = now;
        ({ data, error } = await _supabase.from('quotes').insert(payload).select().single());
        // If unique constraint hit (same quote number), update existing instead
        if (error && error.code === '23505') {
            console.warn('Invoice row exists, updating instead...');
            var existing = await _supabase.from('quotes').select('id').eq('user_id', payload.user_id).eq('quote_number', payload.quote_number).single();
            if (existing.data) {
                ({ data, error } = await _supabase.from('quotes').update(payload).eq('id', existing.data.id).select().single());
            }
        }
    }
    if (error) console.error('saveInvoiceForSharing error:', error);
    if (!error && data) {
        qdCaptureOnce('invoice_created', data.id || invoiceData.supabaseId || invoiceData.id || now, {
            invoice_id: data.id,
            total_bucket: qdAnalyticsBucketMoney(invoiceData.grandTotal || 0),
            room_count: Array.isArray(invoiceData.rooms) ? invoiceData.rooms.length : 0
        });
    }
    return { data, error };
}

// Save client to Supabase
async function saveClientToSupabase(client) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const { data, error } = await _supabase
        .from('clients')
        .upsert({
            user_id: user.id,
            name: client.name || '',
            phone: client.phone || '',
            email: client.email || '',
            address: client.address || '',
            city: client.city || '',
            notes: client.notes || '',
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,name' })
        .select();
    return { data, error };
}

// List clients from Supabase
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

// Aliases for consistent naming
var listQuotesFromSupabase = listQuotes;
var listInvoicesFromSupabase = listInvoices;
var listTemplatesFromSupabase = listTemplates;
var listTermsFromSupabase = listTerms;
var listItemsFromSupabase = listItems;

// Save/load aliases
var saveQuoteToSupabase = saveQuote;
var saveInvoice = saveInvoiceForSharing; // alias — saveInvoice was missing from v2
var saveInvoiceToSupabase = saveInvoice;
var loadQuoteFromSupabase = function(quoteId) {
    return listQuotes().then(function(result) {
        if (result.error) return { error: result.error };
        var found = (result.data || []).find(function(q) { return q.id === quoteId || (q.data && q.data.id === quoteId); });
        return { data: found || null };
    });
};

// Save a quote to Supabase for sharing
async function saveQuoteForSharing(quoteData) {
    const user = await getCurrentUser();
    const now = new Date().toISOString();
    if ((quoteData.type === 'change_order' || quoteData.documentType === 'change_order') &&
        quoteData.supabaseId &&
        quoteData.parentQuoteId &&
        quoteData.supabaseId === quoteData.parentQuoteId) {
        quoteData.supabaseId = null;
    }
    const payload = {
            id: quoteData.supabaseId || undefined,
            user_id: user ? user.id : null,
            client_name: quoteData.clientName || '',
            quote_number: quoteData.quoteNumber || '',
            total: quoteData.grandTotal || quoteData.total || 0,
            data: quoteData,
            status: (quoteData.type === 'change_order' || quoteData.documentType === 'change_order') ? (quoteData.status === 'draft' ? 'pending_approval' : (quoteData.status || 'pending_approval')) : 'sent',
            type: quoteData.type || quoteData.documentType || 'quote',
            parent_quote_id: quoteData.parentQuoteId || null,
            change_order_number: quoteData.changeOrderNumber || null,
            updated_at: now
        };
    var data, error;
    ({ data, error } = await _supabase
        .from('quotes')
        .upsert(payload, { onConflict: 'id' })
        .select()
        .single());
    if (error && /type|parent_quote_id|change_order_number|schema cache/i.test(error.message || '')) {
        delete payload.type;
        delete payload.parent_quote_id;
        delete payload.change_order_number;
        ({ data, error } = await _supabase
            .from('quotes')
            .upsert(payload, { onConflict: 'id' })
            .select()
            .single());
    }
    return { data, error };
}

// Delete a quote from Supabase
async function deleteQuoteFromSupabase(quoteId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };

    const { error } = await _supabase
        .from('quotes')
        .delete()
        .eq('id', quoteId)
        .eq('user_id', user.id);

    if (error) {
        console.error('Delete quote error:', error);
        return { error };
    }
    return { success: true };
}

// Load a quote from Supabase for viewing
// Load a quote for editing in the quote builder
async function loadQuoteFromSupabase(supabaseId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const { data, error } = await _supabase
        .from('quotes')
        .select('*')
        .eq('id', supabaseId)
        .eq('user_id', user.id)
        .single();
    return { data, error };
}

async function loadQuoteForViewing(supabaseId) {
    const { data, error } = await _supabase
        .from('quotes')
        .select('*')
        .eq('id', supabaseId)
        .single();
    return { data, error };
}

// Save all custom items to Supabase (stored as single JSON blob per user)
async function saveItemsToSupabase(itemsData) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not logged in' };
    // Check if row exists
    const { data: existing } = await _supabase
        .from('items')
        .select('id')
        .eq('user_id', user.id)
        .single();
    if (existing) {
        return await _supabase.from('items').update({ data: itemsData, updated_at: new Date().toISOString() }).eq('user_id', user.id);
    } else {
        return await _supabase.from('items').insert({ user_id: user.id, data: itemsData });
    }
}

// Load custom items from Supabase
async function loadItemsFromSupabase() {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'Not logged in' };
    const { data, error } = await _supabase
        .from('items')
        .select('data')
        .eq('user_id', user.id)
        .single();
    return { data: data ? data.data : null, error };
}

// Save all clients to Supabase (upsert by name per user)
async function saveAllClientsToSupabase(clientsArray) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not logged in' };
    // Delete existing and re-insert (simplest approach for full sync)
    await _supabase.from('clients').delete().eq('user_id', user.id);
    if (!clientsArray || clientsArray.length === 0) return { data: [], error: null };
    const rows = clientsArray.map(c => ({
        user_id: user.id,
        name: c.name || '',
        phone: c.phone || '',
        email: c.email || '',
        address: c.address || '',
        city: c.city || '',
        notes: c.notes || ''
    }));
    return await _supabase.from('clients').insert(rows);
}

// Load all clients from Supabase
async function loadClientsFromSupabase() {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'Not logged in' };
    const { data, error } = await _supabase
        .from('clients')
        .select('*')
        .eq('user_id', user.id)
        .order('name', { ascending: true });
    return { data, error };
}

// Save business profile to Supabase user_data table
// Uses check-then-update/insert to avoid relying on upsert + unique constraint
async function saveBusinessProfile(profile) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const result = await _supabase
        .from('user_data')
        .upsert({ user_id: user.id, key: 'business_profile', value: profile, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    if (!result.error) localStorage.setItem('ald_business_profile', JSON.stringify(profile));
    return result;
}

async function loadBusinessProfile() {
    const user = await getCurrentUser();
    if (!user) return JSON.parse(localStorage.getItem('ald_business_profile') || '{}');
    const { data, error } = await _supabase
        .from('user_data')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'business_profile')
        .maybeSingle();
    if (!error && data && data.value) {
        localStorage.setItem('ald_business_profile', JSON.stringify(data.value));
        return data.value;
    }
    return JSON.parse(localStorage.getItem('ald_business_profile') || '{}');
}

async function saveLogoToSupabase(base64) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const result = await _supabase
        .from('user_data')
        .upsert({ user_id: user.id, key: 'company_logo', value: { logo: base64 }, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    if (!result.error) localStorage.setItem('ald_company_logo', base64);
    return result;
}

async function loadLogoFromSupabase() {
    const user = await getCurrentUser();
    if (!user) return localStorage.getItem('ald_company_logo');
    const { data, error } = await _supabase
        .from('user_data')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'company_logo')
        .maybeSingle();
    if (!error && data && data.value && data.value.logo) {
        localStorage.setItem('ald_company_logo', data.value.logo);
        return data.value.logo;
    }
    return localStorage.getItem('ald_company_logo');
}

async function savePaymentSettings(settings) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const result = await _supabase
        .from('user_data')
        .upsert({ user_id: user.id, key: 'payment_settings', value: settings, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
    if (!result.error) localStorage.setItem('ald_payment_settings', JSON.stringify(settings));
    return result;
}

async function loadPaymentSettings() {
    const user = await getCurrentUser();
    if (!user) return JSON.parse(localStorage.getItem('ald_payment_settings') || 'null');
    const { data, error } = await _supabase
        .from('user_data')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'payment_settings')
        .maybeSingle();
    if (!error && data && data.value) {
        localStorage.setItem('ald_payment_settings', JSON.stringify(data.value));
        return data.value;
    }
    return JSON.parse(localStorage.getItem('ald_payment_settings') || 'null');
}

function normalizeAiPhraseKey(phrase) {
    return String(phrase || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

async function getUserLearnedMappings() {
    const user = await getCurrentUser();
    if (!user) return [];
    const { data, error } = await _supabase
        .from('ai_learned_mappings')
        .select('*')
        .eq('user_id', user.id)
        .order('usage_count', { ascending: false });
    if (error) {
        console.warn('AI learned mappings load failed:', error);
        return [];
    }
    return data || [];
}

async function checkLearnedMapping(spokenPhrase) {
    const user = await getCurrentUser();
    if (!user) return null;
    const phraseKey = normalizeAiPhraseKey(spokenPhrase);
    if (!phraseKey) return null;
    const { data, error } = await _supabase
        .from('ai_learned_mappings')
        .select('*')
        .eq('user_id', user.id)
        .eq('phrase_key', phraseKey)
        .maybeSingle();
    if (error) {
        console.warn('AI learned mapping check failed:', error);
        return null;
    }
    return data || null;
}

async function saveLearnedMapping(phrase, mappedItem, note) {
    const user = await getCurrentUser();
    if (!user || !mappedItem) return { data: null, error: 'Not authenticated' };
    const phraseKey = normalizeAiPhraseKey(phrase);
    if (!phraseKey) return { data: null, error: 'Missing phrase' };
    const { data: existing } = await _supabase
        .from('ai_learned_mappings')
        .select('usage_count')
        .eq('user_id', user.id)
        .eq('phrase_key', phraseKey)
        .maybeSingle();
    const payload = {
        user_id: user.id,
        spoken_phrase: String(phrase || '').trim(),
        phrase_key: phraseKey,
        mapped_item_category: mappedItem.category || 'Miscellaneous',
        mapped_item_name: mappedItem.name || mappedItem.description || '',
        mapped_unit: mappedItem.unitType || mappedItem.unit || 'ls',
        mapped_price: parseFloat(mappedItem.rate || mappedItem.price || 0) || 0,
        user_note: note || '',
        usage_count: (parseInt(existing && existing.usage_count, 10) || 0) + 1,
        updated_at: new Date().toISOString()
    };
    return await _supabase
        .from('ai_learned_mappings')
        .upsert(payload, { onConflict: 'user_id,phrase_key' })
        .select()
        .single();
}

async function incrementLearnedMappingUsage(mappingId) {
    if (!mappingId) return { data: null, error: 'Missing mapping id' };
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'Not authenticated' };
    const { data: existing, error: loadError } = await _supabase
        .from('ai_learned_mappings')
        .select('usage_count')
        .eq('id', mappingId)
        .eq('user_id', user.id)
        .maybeSingle();
    if (loadError || !existing) return { data: null, error: loadError || 'Mapping not found' };
    return await _supabase
        .from('ai_learned_mappings')
        .update({ usage_count: (parseInt(existing.usage_count, 10) || 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', mappingId)
        .eq('user_id', user.id)
        .select()
        .single();
}

async function updateLearnedMapping(mappingId, phrase, mappedItem, note) {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'Not authenticated' };
    if (!mappingId) return { data: null, error: 'Missing mapping id' };
    const phraseKey = normalizeAiPhraseKey(phrase);
    if (!phraseKey) return { data: null, error: 'Missing phrase' };
    const payload = {
        spoken_phrase: String(phrase || '').trim(),
        phrase_key: phraseKey,
        user_note: note || '',
        updated_at: new Date().toISOString()
    };
    if (mappedItem) {
        payload.mapped_item_category = mappedItem.category || 'Miscellaneous';
        payload.mapped_item_name = mappedItem.name || mappedItem.description || '';
        payload.mapped_unit = mappedItem.unitType || mappedItem.unit || 'ls';
        payload.mapped_price = parseFloat(mappedItem.rate || mappedItem.price || 0) || 0;
    }
    return await _supabase
        .from('ai_learned_mappings')
        .update(payload)
        .eq('id', mappingId)
        .eq('user_id', user.id)
        .select()
        .single();
}

async function deleteLearnedMapping(mappingId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    return await _supabase
        .from('ai_learned_mappings')
        .delete()
        .eq('id', mappingId)
        .eq('user_id', user.id);
}

async function getUserAiTradeRules() {
    const user = await getCurrentUser();
    if (!user) return [];
    const { data, error } = await _supabase
        .from('ai_trade_rules')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
    if (error) {
        console.warn('AI trade rules load failed:', error);
        return [];
    }
    return data || [];
}

async function saveAiTradeRule(rule) {
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'Not authenticated' };
    const phraseKey = normalizeAiPhraseKey(rule && rule.trigger_phrase);
    if (!phraseKey) return { data: null, error: 'Missing trigger phrase' };
    const payload = {
        user_id: user.id,
        trigger_phrase: String(rule.trigger_phrase || '').trim(),
        phrase_key: phraseKey,
        mapped_item_category: rule.mapped_item_category || rule.category || 'Miscellaneous',
        mapped_item_name: rule.mapped_item_name || rule.name || '',
        mapped_unit: rule.mapped_unit || rule.unitType || rule.unit || 'ls',
        mapped_price: parseFloat(rule.mapped_price !== undefined ? rule.mapped_price : rule.rate) || 0,
        quantity_mode: rule.quantity_mode || 'per_count',
        quantity_value: parseFloat(rule.quantity_value || 1) || 1,
        count_unit_label: rule.count_unit_label || '',
        default_count: parseFloat(rule.default_count || 1) || 1,
        user_note: rule.user_note || '',
        active: rule.active !== false,
        updated_at: new Date().toISOString()
    };
    if (rule.id) payload.id = rule.id;
    return await _supabase
        .from('ai_trade_rules')
        .upsert(payload, { onConflict: 'user_id,phrase_key' })
        .select()
        .single();
}

async function deleteAiTradeRule(ruleId) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    return await _supabase
        .from('ai_trade_rules')
        .delete()
        .eq('id', ruleId)
        .eq('user_id', user.id);
}

async function incrementAiTradeRuleUsage(ruleId) {
    if (!ruleId) return { data: null, error: 'Missing rule id' };
    const user = await getCurrentUser();
    if (!user) return { data: null, error: 'Not authenticated' };
    const { data: existing, error: loadError } = await _supabase
        .from('ai_trade_rules')
        .select('usage_count')
        .eq('id', ruleId)
        .eq('user_id', user.id)
        .maybeSingle();
    if (loadError || !existing) return { data: null, error: loadError || 'Rule not found' };
    return await _supabase
        .from('ai_trade_rules')
        .update({ usage_count: (parseInt(existing.usage_count, 10) || 0) + 1, updated_at: new Date().toISOString() })
        .eq('id', ruleId)
        .eq('user_id', user.id)
        .select()
        .single();
}

async function getUserAiVoiceTemplates() {
    const user = await getCurrentUser();
    if (!user) return JSON.parse(localStorage.getItem('ald_ai_voice_templates') || '[]');
    const { data, error } = await _supabase
        .from('user_data')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'ai_voice_templates')
        .maybeSingle();
    if (error) {
        console.warn('AI voice templates load failed:', error);
        return JSON.parse(localStorage.getItem('ald_ai_voice_templates') || '[]');
    }
    const templates = Array.isArray(data && data.value) ? data.value : [];
    localStorage.setItem('ald_ai_voice_templates', JSON.stringify(templates));
    return templates;
}

async function saveUserAiVoiceTemplates(templates) {
    const safeTemplates = Array.isArray(templates) ? templates : [];
    localStorage.setItem('ald_ai_voice_templates', JSON.stringify(safeTemplates));
    const user = await getCurrentUser();
    if (!user) return { data: safeTemplates, error: null };
    return await _supabase
        .from('user_data')
        .upsert({
            user_id: user.id,
            key: 'ai_voice_templates',
            value: safeTemplates,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,key' })
        .select()
        .single();
}

const QUOTEDR_PLAN_FEATURES = {
    basic: [
        'quotes',
        'invoices',
        'clients',
        'templates',
        'custom_branding',
        'stripe_payments',
        'client_quote_viewer',
        'cross_device_sync'
    ],
    pro: [
        'quotes',
        'invoices',
        'clients',
        'templates',
        'custom_branding',
        'stripe_payments',
        'client_quote_viewer',
        'cross_device_sync',
        'ai_voice_quote',
        'ai_assistant',
        'smart_import',
        'ai_refine',
        'ikea_quoter',
        'job_tracker',
        'floor_plan_scanner',
        'quote_upsells',
        'profit_tracking',
        'payment_reminders',
        'quickbooks',
        'bank_card_sync'
    ]
};

const QUOTEDR_PRO_FEATURE_LABELS = {
    ikea_quoter: 'IKEA Cabinet Quoter',
    job_tracker: 'Job Tracker',
    ai_refine: 'AI Refine',
    quickbooks: 'QuickBooks sync',
    bank_card_sync: 'Bank/card sync'
};

function normalizePlanName(plan) {
    plan = String(plan || 'basic').toLowerCase();
    if (plan === 'starter') return 'basic';
    return plan === 'pro' ? 'pro' : 'basic';
}

function subscriptionAllowsAccess(sub) {
    if (!sub || !sub.status) return false;
    return ['active', 'trialing'].includes(String(sub.status).toLowerCase());
}

async function loadSubscriptionStatus() {
    const user = await getCurrentUser();
    if (!user) return JSON.parse(localStorage.getItem('ald_subscription') || 'null');
    const { data, error } = await _supabase
        .from('user_data')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'subscription_status')
        .maybeSingle();
    if (!error && data && data.value) {
        localStorage.setItem('ald_subscription', JSON.stringify(data.value));
        return data.value;
    }
    return JSON.parse(localStorage.getItem('ald_subscription') || 'null');
}

async function getCurrentPlan() {
    const sub = await loadSubscriptionStatus();
    if (!subscriptionAllowsAccess(sub)) return 'basic';
    return normalizePlanName(sub.plan || 'basic');
}

async function hasFeature(feature) {
    const plan = await getCurrentPlan();
    return (QUOTEDR_PLAN_FEATURES[plan] || QUOTEDR_PLAN_FEATURES.basic).includes(feature);
}

async function isCurrentUserPro() {
    const sub = await loadSubscriptionStatus();
    return subscriptionAllowsAccess(sub) && normalizePlanName(sub.plan || 'basic') === 'pro';
}

async function loadProTrialUsage() {
    const user = await getCurrentUser();
    if (!user) return JSON.parse(localStorage.getItem('ald_pro_trial_usage') || '{}');
    const { data, error } = await _supabase
        .from('user_data')
        .select('value')
        .eq('user_id', user.id)
        .eq('key', 'pro_trial_usage')
        .maybeSingle();
    if (!error && data && data.value) {
        localStorage.setItem('ald_pro_trial_usage', JSON.stringify(data.value));
        return data.value;
    }
    return JSON.parse(localStorage.getItem('ald_pro_trial_usage') || '{}');
}

async function saveProTrialUsage(usage) {
    const user = await getCurrentUser();
    localStorage.setItem('ald_pro_trial_usage', JSON.stringify(usage || {}));
    if (!user) return { data: null, error: null };
    return await _supabase
        .from('user_data')
        .upsert({ user_id: user.id, key: 'pro_trial_usage', value: usage || {}, updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' });
}

function qdProPricingUrl(featureKey) {
    return 'pricing.html?plan=pro&feature=' + encodeURIComponent(featureKey || 'pro');
}

function qdCaptureEvent(name, props) {
    try {
        if (window.QuoteDrAnalytics && typeof window.QuoteDrAnalytics.capture === 'function') {
            window.QuoteDrAnalytics.capture(name, props || {});
            return;
        }
        if (window.posthog && typeof window.posthog.capture === 'function') {
            window.posthog.capture(name, props || {});
        }
    } catch(e) {}
}

function qdCaptureOnce(name, key, props) {
    try {
        if (window.QuoteDrAnalytics && typeof window.QuoteDrAnalytics.captureOnce === 'function') {
            window.QuoteDrAnalytics.captureOnce(name, key, props || {});
            return;
        }
    } catch(e) {}
    qdCaptureEvent(name, props);
}

function qdIdentifyAnalyticsUser(user) {
    try {
        if (window.QuoteDrAnalytics && typeof window.QuoteDrAnalytics.identifyUser === 'function') {
            window.QuoteDrAnalytics.identifyUser(user);
        }
    } catch(e) {}
}

function qdAnalyticsBucketMoney(value) {
    try {
        if (window.QuoteDrAnalytics && typeof window.QuoteDrAnalytics.bucketMoney === 'function') {
            return window.QuoteDrAnalytics.bucketMoney(value);
        }
    } catch(e) {}
    var amount = parseFloat(value) || 0;
    if (amount <= 0) return '0';
    if (amount < 500) return '<500';
    if (amount < 2500) return '500-2499';
    if (amount < 10000) return '2500-9999';
    if (amount < 25000) return '10000-24999';
    return '25000+';
}

const QD_PLAY_DAY_MS = 24 * 60 * 60 * 1000;
const QD_PLAY_DAY_GRACE_MS = 30 * 60 * 1000;
const QD_PLAY_DAY_WARNING_MS = 2 * 60 * 60 * 1000;

function qdEscapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function qdTrialLabel(featureKey, featureLabel) {
    return featureLabel || QUOTEDR_PRO_FEATURE_LABELS[featureKey] || 'this Pro tool';
}

function qdTrialActivationId(trial) {
    return trial && (trial.started_at || trial.expires_at || trial.used_at || 'unknown');
}

function qdGetTrialStatus(trial, now) {
    now = now || new Date();
    if (!trial) return 'none';
    if (trial.expires_at) {
        var expiresAt = new Date(trial.expires_at);
        if (isNaN(expiresAt.getTime())) return 'expired';
        if (now <= expiresAt) return 'active';
        if (now <= new Date(expiresAt.getTime() + QD_PLAY_DAY_GRACE_MS)) return 'grace';
        return 'expired';
    }
    return trial.used ? 'expired' : 'none';
}

function qdTrialTimeRemaining(trial, now) {
    now = now || new Date();
    if (!trial || !trial.expires_at) return 0;
    var expiresAt = new Date(trial.expires_at);
    if (isNaN(expiresAt.getTime())) return 0;
    return expiresAt.getTime() - now.getTime();
}

function qdFormatTrialRemaining(ms) {
    if (ms <= 0) return 'grace period';
    var minutes = Math.ceil(ms / 60000);
    if (minutes < 60) return minutes + ' min left';
    var hours = Math.floor(minutes / 60);
    var rem = minutes % 60;
    return hours + 'h' + (rem ? ' ' + rem + 'm' : '') + ' left';
}

function qdActiveTrialEntries(usage, includeGrace) {
    usage = usage || {};
    var now = new Date();
    return Object.entries(usage).map(function(pair) {
        var key = pair[0];
        var trial = pair[1] || {};
        var status = qdGetTrialStatus(trial, now);
        if (status !== 'active' && (!includeGrace || status !== 'grace')) return null;
        return {
            key: key,
            trial: trial,
            status: status,
            label: trial.label || trial.feature || QUOTEDR_PRO_FEATURE_LABELS[key] || key,
            remainingMs: qdTrialTimeRemaining(trial, now)
        };
    }).filter(Boolean).sort(function(a, b) {
        return a.remainingMs - b.remainingMs;
    });
}

function showProTrialModal(featureKey, featureLabel) {
    featureLabel = featureLabel || QUOTEDR_PRO_FEATURE_LABELS[featureKey] || 'this Pro tool';
    return new Promise(function(resolve) {
        var existing = document.getElementById('quotedrProTrialModal');
        if (existing) existing.remove();

        var modal = document.createElement('div');
        modal.id = 'quotedrProTrialModal';
        modal.className = 'modal fade';
        modal.tabIndex = -1;
        modal.innerHTML = '' +
            '<div class="modal-dialog modal-dialog-centered">' +
                '<div class="modal-content" style="border-radius:16px;border:0;box-shadow:0 18px 45px rgba(15,23,42,.2);">' +
                    '<div class="modal-header">' +
                        '<h5 class="modal-title d-flex align-items-center gap-2">' +
                            '<span style="width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#e8f2ff;color:#1a56a0;"><i class="fas fa-star"></i></span>' +
                            '<span>Play For a Day</span>' +
                        '</h5>' +
                        '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<p class="mb-2"><strong>' + qdEscapeHtml(featureLabel) + '</strong> is a Pro feature, but we will let you play with it for 24 hours.</p>' +
                        '<p class="text-muted small mb-0">The timer starts when you click start. No commitment, no credit card.</p>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button type="button" class="btn btn-outline-secondary" id="quotedrProBack">Go Back</button>' +
                        '<button type="button" class="btn btn-primary" id="quotedrProTry">Start 24-Hour Trial</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        function cleanup(value) {
            if (window.bootstrap && window.bootstrap.Modal) {
                var inst = window.bootstrap.Modal.getInstance(modal);
                if (inst) inst.hide();
            }
            setTimeout(function() { if (modal.parentNode) modal.remove(); }, 250);
            resolve(value);
        }

        modal.querySelector('#quotedrProTry').addEventListener('click', function() { cleanup('try'); });
        modal.querySelector('#quotedrProBack').addEventListener('click', function() { cleanup(false); });
        modal.querySelector('.btn-close').addEventListener('click', function() { cleanup(false); });
        document.body.appendChild(modal);

        if (window.bootstrap && window.bootstrap.Modal) {
            window.bootstrap.Modal.getOrCreateInstance(modal).show();
            modal.addEventListener('hidden.bs.modal', function() { resolve(false); }, { once: true });
        } else {
            modal.classList.add('show');
            modal.style.display = 'block';
            modal.style.background = 'rgba(15,23,42,.45)';
        }
    });
}

function qdShowProUpgradePrompt(featureKey, featureLabel, message, title) {
    featureLabel = qdTrialLabel(featureKey, featureLabel);
    var msg = message || ('Ready to unlock ' + featureLabel + ' permanently? Pro includes IKEA quoting, job tracking, AI tools, QuickBooks sync, and more.');
    var pricingUrl = qdProPricingUrl(featureKey);
    qdCaptureEvent('pro_upgrade_prompt_shown', { feature: featureKey, label: featureLabel, title: title || 'Unlock QuoteDr Pro' });
    if (typeof window.qdConfirm === 'function') {
        window.qdConfirm(msg, {
            title: title || 'Unlock QuoteDr Pro',
            okText: 'Upgrade to Pro',
            cancelText: 'Maybe later',
            okClass: 'btn-primary',
            type: 'info'
        }).then(function(confirmed) {
            if (confirmed) {
                qdCaptureEvent('pro_upgrade_clicked', { feature: featureKey });
                window.location.href = pricingUrl;
            }
        });
        return;
    }
    showUpgradePromptFallback(featureLabel, msg, pricingUrl);
}

function showProTrialCompletePrompt(featureKey, featureLabel) {
    qdShowProUpgradePrompt(featureKey, featureLabel, 'Nice. You have started using ' + qdTrialLabel(featureKey, featureLabel) + '. Upgrade whenever you are ready to keep it permanently.', 'Keep This Pro Tool');
}

async function startPlayForADayTrial(featureKey, featureLabel, metadata, source) {
    var usage = await loadProTrialUsage();
    var now = new Date();
    var expires = new Date(now.getTime() + QD_PLAY_DAY_MS);
    var due = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    var previous = usage[featureKey] || {};
    usage[featureKey] = Object.assign({}, usage[featureKey] || {}, {
        feature: featureKey,
        label: featureLabel || QUOTEDR_PRO_FEATURE_LABELS[featureKey] || featureKey,
        status: 'active',
        used: true,
        used_at: now.toISOString(),
        started_at: now.toISOString(),
        expires_at: expires.toISOString(),
        source: source || 'self_started',
        activations: (parseInt(previous.activations || 0, 10) || 0) + 1,
        followup_due_at: due.toISOString(),
        followup_sent_at: null,
        metadata: metadata || {}
    });
    var result = await saveProTrialUsage(usage);
    if (result && result.error) throw result.error;
    window._quotedrActiveProTrials = window._quotedrActiveProTrials || {};
    window._quotedrActiveProTrials[featureKey] = true;
    qdCaptureEvent('pro_play_day_started', { feature: featureKey, label: usage[featureKey].label, expires_at: usage[featureKey].expires_at });
    qdCaptureEvent('pro_trial_used', { feature: featureKey, label: usage[featureKey].label });
    refreshPlayForADayWidget(usage);
    return usage[featureKey];
}

async function markProTrialUsed(featureKey, featureLabel, metadata) {
    return startPlayForADayTrial(featureKey, featureLabel, metadata, 'self_started');
}

function qdOpenFeedbackForTrial(featureKey, featureLabel) {
    var subject = encodeURIComponent('QuoteDr feedback for ' + qdTrialLabel(featureKey, featureLabel));
    window.location.href = 'mailto:support@quotedr.io?subject=' + subject;
}

function showProGracePrompt(featureKey, featureLabel, trial) {
    var guardKey = 'quotedr_play_day_grace_' + featureKey + '_' + qdTrialActivationId(trial);
    try {
        if (sessionStorage.getItem(guardKey) === '1') return;
        sessionStorage.setItem(guardKey, '1');
    } catch(e) {}
    qdCaptureEvent('pro_play_day_grace_access', { feature: featureKey, label: qdTrialLabel(featureKey, featureLabel) });
    var msg = 'Your Play For a Day trial for ' + qdTrialLabel(featureKey, featureLabel) + ' ended, but you have 30 more minutes. Upgrade now to keep access, or send feedback about what worked and what did not.';
    if (typeof window.qdConfirm === 'function') {
        window.qdConfirm(msg, {
            title: 'Trial Grace Period',
            okText: 'Upgrade Now',
            cancelText: 'Send Feedback',
            okClass: 'btn-warning',
            type: 'warning'
        }).then(function(confirmed) {
            if (confirmed) {
                qdCaptureEvent('pro_upgrade_prompt_clicked', { feature: featureKey, trigger: 'grace' });
                window.location.href = qdProPricingUrl(featureKey);
            } else {
                qdOpenFeedbackForTrial(featureKey, featureLabel);
            }
        });
        return;
    }
    qdShowProUpgradePrompt(featureKey, featureLabel, msg, 'Trial Grace Period');
}

async function requireProFeature(featureKey, featureLabel, options) {
    options = options || {};
    featureLabel = featureLabel || QUOTEDR_PRO_FEATURE_LABELS[featureKey] || 'This feature';
    if (await isCurrentUserPro()) return true;

    var usage = await loadProTrialUsage();
    var passKey = 'quotedr_pro_trial_pass_' + featureKey;
    try {
        if (sessionStorage.getItem(passKey) === '1') {
            sessionStorage.removeItem(passKey);
            window._quotedrActiveProTrials = window._quotedrActiveProTrials || {};
            window._quotedrActiveProTrials[featureKey] = true;
            qdCaptureEvent('pro_play_day_active_access', { feature: featureKey, label: featureLabel, cross_page: true });
            return true;
        }
    } catch(e) {}

    var trial = usage && usage[featureKey] ? usage[featureKey] : null;
    var status = qdGetTrialStatus(trial);
    if (status === 'active') {
        window._quotedrActiveProTrials = window._quotedrActiveProTrials || {};
        window._quotedrActiveProTrials[featureKey] = true;
        qdCaptureEvent('pro_play_day_active_access', { feature: featureKey, label: featureLabel });
        refreshPlayForADayWidget(usage);
        return true;
    }
    if (status === 'grace') {
        window._quotedrActiveProTrials = window._quotedrActiveProTrials || {};
        window._quotedrActiveProTrials[featureKey] = true;
        showProGracePrompt(featureKey, featureLabel, trial);
        refreshPlayForADayWidget(usage);
        return true;
    }
    if (trial && (trial.used || trial.expires_at)) {
        qdCaptureEvent('pro_play_day_expired', { feature: featureKey, label: featureLabel });
        qdShowProUpgradePrompt(featureKey, featureLabel, 'Your Play For a Day access for ' + featureLabel + ' has ended. Upgrade to Pro to unlock it permanently.', 'Play For a Day Ended');
        return false;
    }

    qdCaptureEvent('pro_play_day_prompt_shown', { feature: featureKey, label: featureLabel });
    var choice = await showProTrialModal(featureKey, featureLabel);
    if (choice !== 'try') {
        qdCaptureEvent('pro_play_day_declined', { feature: featureKey, label: featureLabel });
        return false;
    }
    try {
        await startPlayForADayTrial(featureKey, featureLabel, options.metadata || {}, options.source || 'self_started');
    } catch(e) {
        if (typeof qdAlert === 'function') qdAlert('Could not start the 24-hour trial. Please try again.');
        else alert('Could not start the 24-hour trial. Please try again.');
        return false;
    }
    if (options.crossPage) {
        try { sessionStorage.setItem(passKey, '1'); } catch(e) {}
    }
    return true;
}

function completeProTrialFeature(featureKey, featureLabel) {
    if (!window._quotedrActiveProTrials || !window._quotedrActiveProTrials[featureKey]) return;
    qdMaybeShowProUpgradePrompt('feature_completed', {
        featureKey: featureKey,
        featureLabel: featureLabel,
        message: 'That was a Pro workflow. Upgrade when you are ready to keep ' + qdTrialLabel(featureKey, featureLabel) + ' permanently.'
    });
}

function qdSmartPromptKey(trigger, featureKey, trial) {
    return 'quotedr_smart_prompt_' + trigger + '_' + (featureKey || 'general') + '_' + qdTrialActivationId(trial || {});
}

async function qdMaybeShowProUpgradePrompt(trigger, options) {
    options = options || {};
    if (await isCurrentUserPro()) return false;
    try {
        if (sessionStorage.getItem('quotedr_smart_prompt_session') === '1') return false;
    } catch(e) {}
    var usage = await loadProTrialUsage();
    var entries = qdActiveTrialEntries(usage, true);
    if (!entries.length) return false;
    var featureKey = options.featureKey || entries[0].key;
    var entry = entries.find(function(item) { return item.key === featureKey; }) || entries[0];
    var key = qdSmartPromptKey(trigger, entry.key, entry.trial);
    try {
        if (localStorage.getItem(key) === '1') return false;
        localStorage.setItem(key, '1');
        sessionStorage.setItem('quotedr_smart_prompt_session', '1');
    } catch(e) {}
    var message = options.message || 'Get unlimited access with QuoteDr Pro.';
    qdCaptureEvent('pro_upgrade_prompt_shown', { trigger: trigger, feature: entry.key, label: entry.label });
    if (typeof window.qdConfirm === 'function') {
        window.qdConfirm(message, {
            title: options.title || 'Keep Building With Pro',
            okText: 'Upgrade to Pro',
            cancelText: 'Not now',
            okClass: 'btn-primary',
            type: 'info'
        }).then(function(confirmed) {
            if (confirmed) {
                qdCaptureEvent('pro_upgrade_prompt_clicked', { trigger: trigger, feature: entry.key });
                window.location.href = qdProPricingUrl(entry.key);
            }
        });
    } else {
        showUpgradePromptFallback(entry.label, message, qdProPricingUrl(entry.key));
    }
    return true;
}

async function qdMaybeShowSecondQuoteUpgradePrompt() {
    try {
        if (await isCurrentUserPro()) return false;
        var user = await getCurrentUser();
        if (!user) return false;
        var active = qdActiveTrialEntries(await loadProTrialUsage(), true);
        if (!active.length) return false;
        var res = await _supabase
            .from('quotes')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', user.id)
            .neq('quote_number', '__ITEMS_BACKUP__');
        if (!res.error && (res.count || 0) >= 2) {
            return qdMaybeShowProUpgradePrompt('second_quote_saved', {
                message: 'Love QuoteDr? Upgrade now and keep building with unlimited Pro tools.'
            });
        }
    } catch(e) {}
    return false;
}

function showPlayForADayStatusModal(entries) {
    var existing = document.getElementById('quotedrPlayDayStatusModal');
    if (existing) existing.remove();
    var rows = entries.map(function(entry) {
        var remaining = entry.status === 'grace' ? 'Grace period' : qdFormatTrialRemaining(entry.remainingMs);
        return '<div style="display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid #eef2f7;">' +
            '<div><strong>' + qdEscapeHtml(entry.label) + '</strong><div class="text-muted small">' + (entry.status === 'grace' ? 'Trial ended, grace access active' : 'Play For a Day active') + '</div></div>' +
            '<div style="font-weight:800;color:' + (entry.status === 'grace' ? '#b45309' : '#1a56a0') + ';white-space:nowrap;">' + remaining + '</div>' +
        '</div>';
    }).join('');
    var modal = document.createElement('div');
    modal.id = 'quotedrPlayDayStatusModal';
    modal.className = 'modal fade';
    modal.tabIndex = -1;
    modal.innerHTML = '' +
        '<div class="modal-dialog modal-dialog-centered">' +
            '<div class="modal-content" style="border-radius:16px;border:0;box-shadow:0 18px 45px rgba(15,23,42,.2);">' +
                '<div class="modal-header">' +
                    '<h5 class="modal-title"><i class="fas fa-hourglass-half me-2 text-warning"></i>Play For a Day</h5>' +
                    '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                '</div>' +
                '<div class="modal-body">' + rows + '</div>' +
                '<div class="modal-footer">' +
                    '<button type="button" class="btn btn-outline-secondary" id="quotedrPlayDayFeedback">Send Feedback</button>' +
                    '<button type="button" class="btn btn-primary" id="quotedrPlayDayUpgrade">Upgrade to Pro</button>' +
                '</div>' +
            '</div>' +
        '</div>';
    document.body.appendChild(modal);
    modal.querySelector('#quotedrPlayDayUpgrade').addEventListener('click', function() {
        qdCaptureEvent('pro_upgrade_prompt_clicked', { trigger: 'trial_status', feature: entries[0] && entries[0].key });
        window.location.href = qdProPricingUrl(entries[0] && entries[0].key);
    });
    modal.querySelector('#quotedrPlayDayFeedback').addEventListener('click', function() {
        qdOpenFeedbackForTrial(entries[0] && entries[0].key, entries[0] && entries[0].label);
    });
    qdCaptureEvent('pro_play_day_status_opened', { active_count: entries.length });
    if (window.bootstrap && window.bootstrap.Modal) {
        window.bootstrap.Modal.getOrCreateInstance(modal).show();
        modal.addEventListener('hidden.bs.modal', function() { modal.remove(); }, { once: true });
    } else {
        alert(entries.map(function(entry) { return entry.label + ': ' + qdFormatTrialRemaining(entry.remainingMs); }).join('\n'));
        modal.remove();
    }
}

async function refreshPlayForADayWidget(cachedUsage) {
    try {
        if (await isCurrentUserPro()) {
            var proExisting = document.getElementById('quotedrPlayDayWidget');
            if (proExisting) proExisting.remove();
            return;
        }
        var usage = cachedUsage || await loadProTrialUsage();
        var entries = qdActiveTrialEntries(usage, true);
        var existing = document.getElementById('quotedrPlayDayWidget');
        if (!entries.length) {
            if (existing) existing.remove();
            return;
        }
        var soonest = entries[0];
        if (!existing) {
            existing = document.createElement('button');
            existing.id = 'quotedrPlayDayWidget';
            existing.type = 'button';
            existing.style.cssText = 'position:fixed;left:18px;bottom:18px;z-index:1040;border:0;border-radius:999px;background:#0f3460;color:#fff;padding:10px 14px;box-shadow:0 8px 24px rgba(15,52,96,.28);font-weight:800;font-size:0.86rem;display:flex;align-items:center;gap:8px;';
            existing.addEventListener('click', function() { showPlayForADayStatusModal(entries); });
            document.body.appendChild(existing);
        }
        existing.innerHTML = '<i class="fas fa-hourglass-half"></i><span>Play Day: ' + qdEscapeHtml(qdFormatTrialRemaining(soonest.remainingMs)) + '</span>';
        existing.onclick = function() { showPlayForADayStatusModal(entries); };

        entries.forEach(function(entry) {
            if (entry.status === 'active' && entry.remainingMs > 0 && entry.remainingMs <= QD_PLAY_DAY_WARNING_MS) {
                qdMaybeShowProUpgradePrompt('two_hours_remaining', {
                    featureKey: entry.key,
                    featureLabel: entry.label,
                    title: 'Pro Access Expires Soon',
                    message: 'Your Play For a Day access to ' + entry.label + ' expires soon. Upgrade now to keep it.'
                });
            }
            if (entry.status === 'grace') {
                showProGracePrompt(entry.key, entry.label, entry.trial);
            }
        });
    } catch(e) {}
}

document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() { refreshPlayForADayWidget(); }, 900);
    setInterval(function() { refreshPlayForADayWidget(); }, 60000);
});

window.qdMaybeShowProUpgradePrompt = qdMaybeShowProUpgradePrompt;
window.qdMaybeShowSecondQuoteUpgradePrompt = qdMaybeShowSecondQuoteUpgradePrompt;
window.refreshPlayForADayWidget = refreshPlayForADayWidget;

function getMeasurementSystem() {
    try {
        var prefs = JSON.parse(localStorage.getItem('ald_quote_prefs') || '{}');
        return prefs.measurementSystem === 'metric' ? 'metric' : 'imperial';
    } catch(e) {
        return 'imperial';
    }
}

function qdNormalizeUnit(unit) {
    return String(unit || '').trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, '');
}

function qdMeasurementDecimals(value) {
    value = Math.abs(parseFloat(value) || 0);
    if (value >= 100) return 0;
    if (value >= 10) return 1;
    return 2;
}

function qdFormatMeasurementNumber(value, decimals) {
    value = parseFloat(value) || 0;
    return value.toLocaleString(undefined, {
        minimumFractionDigits: 0,
        maximumFractionDigits: decimals !== undefined ? decimals : qdMeasurementDecimals(value)
    });
}

function qdDisplayUnit(unit) {
    var system = getMeasurementSystem();
    var normalized = qdNormalizeUnit(unit);
    if (system === 'metric') {
        if (['sqft','sf','sqfeet','squarefeet','sqft'].includes(normalized)) return 'm\u00b2';
        if (['lf','linearft','linearfeet','ft','feet','foot'].includes(normalized)) return 'm';
        if (['in','inch','inches'].includes(normalized)) return 'cm';
        if (['m2','m\u00b2','sqm','squaremeter','squaremeters'].includes(normalized)) return 'm\u00b2';
        if (['m','meter','meters','metre','metres'].includes(normalized)) return 'm';
        if (['cm','centimeter','centimeters','centimetre','centimetres'].includes(normalized)) return 'cm';
    }
    if (['m2','m\u00b2','sqm','squaremeter','squaremeters'].includes(normalized)) return 'sq ft';
    if (['m','meter','meters','metre','metres'].includes(normalized)) return 'LF';
    if (['cm','centimeter','centimeters','centimetre','centimetres'].includes(normalized)) return 'in';
    if (['sqft','sf','sqfeet','squarefeet'].includes(normalized)) return 'sq ft';
    if (['lf','linearft','linearfeet'].includes(normalized)) return 'LF';
    if (['ft','feet','foot'].includes(normalized)) return 'ft';
    if (['in','inch','inches'].includes(normalized)) return 'in';
    return unit || '';
}

function qdConvertMeasurementValue(value, unit) {
    var system = getMeasurementSystem();
    var normalized = qdNormalizeUnit(unit);
    value = parseFloat(value) || 0;
    if (system !== 'metric') {
        if (['m2','m\u00b2','sqm','squaremeter','squaremeters'].includes(normalized)) return value / 0.09290304;
        if (['m','meter','meters','metre','metres'].includes(normalized)) return value / 0.3048;
        if (['cm','centimeter','centimeters','centimetre','centimetres'].includes(normalized)) return value / 2.54;
        return value;
    }
    if (['sqft','sf','sqfeet','squarefeet'].includes(normalized)) return value * 0.09290304;
    if (['lf','linearft','linearfeet','ft','feet','foot'].includes(normalized)) return value * 0.3048;
    if (['in','inch','inches'].includes(normalized)) return value * 2.54;
    return value;
}

function qdFormatQuantity(quantity, unit) {
    var converted = qdConvertMeasurementValue(quantity, unit);
    var displayUnit = qdDisplayUnit(unit);
    return qdFormatMeasurementNumber(converted) + (displayUnit ? ' ' + displayUnit : '');
}

function qdConvertMetricInputToImperial(value, unit) {
    if (getMeasurementSystem() !== 'metric') return parseFloat(value) || 0;
    var normalized = qdNormalizeUnit(unit);
    value = parseFloat(value) || 0;
    if (['sqft','sf','sqfeet','squarefeet'].includes(normalized)) return value / 0.09290304;
    if (['lf','linearft','linearfeet','ft','feet','foot'].includes(normalized)) return value / 0.3048;
    if (['in','inch','inches'].includes(normalized)) return value / 2.54;
    return value;
}

window.getMeasurementSystem = getMeasurementSystem;
window.qdDisplayUnit = qdDisplayUnit;
window.qdFormatQuantity = qdFormatQuantity;
window.qdConvertMeasurementValue = qdConvertMeasurementValue;
window.qdConvertMetricInputToImperial = qdConvertMetricInputToImperial;

function showUpgradePrompt(featureName) {
    var label = featureName || 'This feature';
    var msg = label + ' is included with QuoteDr Pro. Upgrade to unlock this tool.';
    var pricingUrl = 'pricing.html?feature=' + encodeURIComponent(label);

    if (typeof window.qdConfirm === 'function') {
        window.qdConfirm(msg, {
            title: 'Upgrade Required',
            okText: 'View Plans',
            cancelText: 'Not now',
            okClass: 'btn-primary',
            type: 'warning'
        }).then(function(confirmed) {
            if (confirmed) window.location.href = pricingUrl;
        });
        return;
    }

    showUpgradePromptFallback(label, msg, pricingUrl);
}

function showUpgradePromptFallback(label, msg, pricingUrl) {
    var existing = document.getElementById('quotedrUpgradePromptModal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'quotedrUpgradePromptModal';
    modal.className = 'modal fade';
    modal.tabIndex = -1;
    modal.setAttribute('aria-labelledby', 'quotedrUpgradePromptTitle');
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = '' +
        '<div class="modal-dialog modal-dialog-centered">' +
            '<div class="modal-content" style="border-radius:16px;border:0;box-shadow:0 18px 45px rgba(15,23,42,.2);">' +
                '<div class="modal-header">' +
                    '<h5 class="modal-title d-flex align-items-center gap-2" id="quotedrUpgradePromptTitle">' +
                        '<span style="width:32px;height:32px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:#fff7ed;color:#f27a1a;"><i class="fas fa-exclamation"></i></span>' +
                        '<span>Upgrade Required</span>' +
                    '</h5>' +
                    '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>' +
                '</div>' +
                '<div class="modal-body"><p class="mb-0"></p></div>' +
                '<div class="modal-footer">' +
                    '<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Not now</button>' +
                    '<button type="button" class="btn btn-primary" id="quotedrUpgradePromptPlans">View Plans</button>' +
                '</div>' +
            '</div>' +
        '</div>';

    modal.querySelector('.modal-body p').textContent = msg;
    modal.querySelector('#quotedrUpgradePromptPlans').addEventListener('click', function() {
        window.location.href = pricingUrl;
    });
    document.body.appendChild(modal);

    if (window.bootstrap && window.bootstrap.Modal) {
        window.bootstrap.Modal.getOrCreateInstance(modal).show();
        modal.addEventListener('hidden.bs.modal', function() {
            modal.remove();
        }, { once: true });
        return;
    }

    modal.classList.add('show');
    modal.style.display = 'block';
    modal.style.background = 'rgba(15,23,42,.45)';
    modal.removeAttribute('aria-hidden');
    var closeButtons = modal.querySelectorAll('[data-bs-dismiss="modal"], .btn-close');
    closeButtons.forEach(function(button) {
        button.addEventListener('click', function() {
            modal.remove();
        });
    });
}

async function requireFeature(feature, featureName) {
    if (await hasFeature(feature)) return true;
    showUpgradePrompt(featureName);
    return false;
}

async function refreshSubscriptionBanner() {
    var sub = await loadSubscriptionStatus();
    var existing = document.getElementById('subscriptionStatusBanner');
    if (existing) existing.remove();
    if (!sub || subscriptionAllowsAccess(sub)) return;
    var banner = document.createElement('div');
    banner.id = 'subscriptionStatusBanner';
    banner.style.cssText = 'background:#fff3cd;border-bottom:1px solid #ffc107;text-align:center;padding:8px;font-size:0.9rem;';
    banner.innerHTML = 'Your QuoteDr subscription needs attention. <a href="pricing.html" style="color:#1a56a0;font-weight:600;">View plans</a>';
    document.body.insertBefore(banner, document.body.firstChild);
}

// Supabase RLS policies needed:
/*
-- Allow anyone to read quotes (for sharing)
CREATE POLICY "Public quote viewing" ON quotes FOR SELECT USING (true);
-- Allow authenticated users to insert/update their own quotes  
CREATE POLICY "Users manage own quotes" ON quotes FOR ALL USING (auth.uid() = user_id);
*/
// ============================================================
// Items Cloud Backup (moved from supabase.js - available in quote-builder)
// ============================================================
async function backupItemsToCloud(customItems) {
    // Use getUser() directly to ensure fresh session token is used
    const { data: { user }, error: authErr } = await _supabase.auth.getUser();
    if (authErr || !user) return { error: 'Not authenticated' };
    const snapshot = JSON.stringify(customItems || {});
    const payload = {
        user_id: user.id,
        client_name: '__ITEMS_BACKUP__',
        quote_number: '__ITEMS_BACKUP__',
        status: 'backup',
        data: { items_snapshot: snapshot, backed_up_at: new Date().toISOString() },
        updated_at: new Date().toISOString()
    };
    const { data: upd, error: updErr } = await _supabase
        .from('quotes')
        .update(payload)
        .eq('user_id', user.id)
        .eq('quote_number', '__ITEMS_BACKUP__')
        .select();
    if (!updErr && upd && upd.length > 0) {
        console.log('[Backup] Items backup updated:', Object.keys(customItems || {}).length, 'categories');
        _supabase.from('item_history').insert({ user_id: user.id, snapshot: customItems, created_at: new Date().toISOString() }).then(() => {}).catch(() => {});
        return { data: upd };
    }
    const { data, error } = await _supabase
        .from('quotes')
        .insert(payload)
        .select();
    if (error) { console.error('Items backup error:', error); return { error }; }
    console.log('[Backup] Items backup created:', Object.keys(customItems || {}).length, 'categories');
    _supabase.from('item_history').insert({ user_id: user.id, snapshot: customItems, created_at: new Date().toISOString() }).then(() => {}).catch(() => {});
    return { data };
}

async function restoreItemsFromCloud() {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const { data, error } = await _supabase
        .from('quotes')
        .select('data, updated_at')
        .eq('user_id', user.id)
        .eq('quote_number', '__ITEMS_BACKUP__')
        .single();
    if (!error && data) {
        try {
            const snapshot = JSON.parse(data.data.items_snapshot || '{}');
            if (Object.keys(snapshot).length > 0) return { data: snapshot, backed_up_at: data.data.backed_up_at };
        } catch(e) {}
    }
    const { data: hist, error: histErr } = await _supabase
        .from('item_history')
        .select('snapshot, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
    if (!histErr && hist && hist.snapshot) {
        return { data: hist.snapshot, backed_up_at: hist.created_at };
    }
    return { error: 'No backup found' };
}

async function getItemHistory(limit = 10) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const { data, error } = await _supabase
        .from('item_history')
        .select('id, created_at, snapshot')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(limit);
    return error ? { error } : { data };
}
