// supabase.js - QuoteDr.io Supabase client and helpers

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
    return session?.user || null;
}

// Get current user (cached)
async function getCurrentUser() {
    if (!currentUser) {
        currentUser = await checkAuthStatus();
    }
    return currentUser;
}

// Sign in with email and password
async function signInWithEmail(email, password) {
    const { data, error } = await _supabase.auth.signInWithPassword({
        email: email,
        password: password
    });
    if (error) throw error;
    currentUser = data.user;
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
    return data;
}

// Sign out
async function signOut() {
    const { error } = await _supabase.auth.signOut();
    if (error) console.error('Sign out error:', error);
    currentUser = null;
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

// Update user's profile
async function updateUserProfile(profileData) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await _supabase
        .from('user_data')
        .update(profileData)
        .eq('id', user.id);
        
    if (error) {
        console.error('Profile update error:', error);
        return { error };
    }
    return { data };
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
        .order('created_at', { ascending: false });
        
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
    
    const { data, error } = await _supabase
        .from('quotes')
        .upsert({
            user_id: user.id,
            id: quoteData.id || '',
            client_name: quoteData.clientName || '',
            project_address: quoteData.projectAddress || '',
            email: quoteData.email || '',
            phone: quoteData.phone || '',
            quote_number: quoteData.quoteNumber || '',
            rooms: quoteData.rooms || [],
            grand_total: quoteData.grandTotal || 0,
            terms: quoteData.terms || [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,id' })
        .select();
        
    if (error) {
        console.error('Quote save error:', error);
        return { error };
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

// Save an invoice
async function saveInvoice(invoiceData) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    
    const { data, error } = await _supabase
        .from('invoices')
        .upsert({
            user_id: user.id,
            id: invoiceData.id || '',
            client_name: invoiceData.clientName || '',
            project_address: invoiceData.projectAddress || '',
            email: invoiceData.email || '',
            phone: invoiceData.phone || '',
            quote_number: invoiceData.quoteNumber || '',
            rooms: invoiceData.rooms || [],
            grand_total: invoiceData.grandTotal || 0,
            terms: invoiceData.terms || [],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,id' })
        .select();
        
    if (error) {
        console.error('Invoice save error:', error);
        return { error };
    }
    return { data };
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
    const { data, error } = await _supabase
        .from('quotes')
        .upsert({
            id: quoteData.supabaseId || undefined,
            user_id: user ? user.id : null,
            data: quoteData,
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' })
        .select()
        .single();
    return { data, error };
}

// Load a quote from Supabase for viewing
async function loadQuoteForViewing(supabaseId) {
    // Try invoices table first (invoice viewer), then quotes table (quote viewer)
    const { data: invData, error: invError } = await _supabase
        .from('invoices')
        .select('*')
        .eq('id', supabaseId)
        .single();
    if (!invError && invData) return { data: { data: invData, user_id: invData.user_id }, error: null };

    const { data, error } = await _supabase
        .from('quotes')
        .select('*')
        .eq('id', supabaseId)
        .single();
    return { data, error };
}

async function saveInvoiceForSharing(invoiceData) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const { data, error } = await _supabase
        .from('invoices')
        .upsert({
            user_id: user.id,
            client_name: invoiceData.clientName || '',
            project_address: invoiceData.projectAddress || '',
            email: invoiceData.email || '',
            phone: invoiceData.phone || '',
            quote_number: invoiceData.quoteNumber || '',
            rooms: invoiceData.rooms || [],
            grand_total: invoiceData.grandTotal || 0,
            terms: invoiceData.terms || [],
            data: invoiceData,
            created_at: new Date().toISOString()
        }, { onConflict: 'id' })
        .select()
        .single();
    if (error) { console.error('saveInvoiceForSharing error:', error); return { error }; }
    return { data };
}

// Supabase RLS policies needed:
/*
-- Allow anyone to read quotes (for sharing)
CREATE POLICY "Public quote viewing" ON quotes FOR SELECT USING (true);
-- Allow authenticated users to insert/update their own quotes  
CREATE POLICY "Users manage own quotes" ON quotes FOR ALL USING (auth.uid() = user_id);
*/
// ── Item Backup/Restore System ───────────────────────────────────────────────
// Stores full ald_custom_items snapshot in Supabase as a safety net.
// Uses the quotes table with a special marker so no extra table needed.

async function backupItemsToCloud(customItems) {
    const user = await getCurrentUser();
    if (!user) return { error: 'Not authenticated' };
    const snapshot = JSON.stringify(customItems || {});
    const { data, error } = await _supabase
        .from('quotes')
        .upsert({
            user_id: user.id,
            client_name: '__ITEMS_BACKUP__',
            quote_number: '__ITEMS_BACKUP__',
            status: 'backup',
            data: { items_snapshot: snapshot, backed_up_at: new Date().toISOString() },
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,quote_number' })
        .select();
    if (error) { console.error('Items backup error:', error); return { error }; }
    console.log('[Backup] Items backed up to cloud:', Object.keys(customItems || {}).length, 'categories');
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
    if (error || !data) return { error: error || 'No backup found' };
    try {
        const snapshot = JSON.parse(data.data.items_snapshot || '{}');
        return { data: snapshot, backed_up_at: data.data.backed_up_at };
    } catch(e) {
        return { error: 'Could not parse backup: ' + e.message };
    }
}
