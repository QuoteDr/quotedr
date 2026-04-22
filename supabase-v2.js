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

    const payload = {
        user_id: user.id,
        client_name: quoteData.clientName || '',
        quote_number: quoteData.quoteNumber || '',
        total: quoteData.grandTotal || 0,
        status: quoteData.status || 'draft',
        data: {
            project_address: quoteData.projectAddress || '',
            email: quoteData.email || '',
            phone: quoteData.phone || '',
            rooms: quoteData.rooms || [],
            terms: quoteData.terms || [],
            style: quoteData.style || {},
            notes: quoteData.notes || ''
        },
        updated_at: new Date().toISOString()
    };

    let data, error;
    if (quoteData.supabaseId) {
        // Update existing quote
        ({ data, error } = await _supabase
            .from('quotes')
            .update(payload)
            .eq('id', quoteData.supabaseId)
            .eq('user_id', user.id)
            .select());
    } else {
        // Insert new quote
        payload.created_at = new Date().toISOString();
        ({ data, error } = await _supabase
            .from('quotes')
            .insert(payload)
            .select());
    }

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

// Save an invoice for cross-device sharing (stored in quotes table)
async function saveInvoiceForSharing(invoiceData) {
    const user = await getCurrentUser();
    const { data, error } = await _supabase
        .from('quotes')
        .upsert({
            id: invoiceData.supabaseId || undefined,
            user_id: user ? user.id : null,
            data: { ...invoiceData, _type: 'invoice' },
            status: 'invoiced',
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' })
        .select()
        .single();
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
    const { data, error } = await _supabase
        .from('quotes')
        .upsert({
            id: quoteData.supabaseId || undefined,
            user_id: user ? user.id : null,
            data: quoteData,
            status: 'sent',
            updated_at: new Date().toISOString()
        }, { onConflict: 'id' })
        .select()
        .single();
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

// Supabase RLS policies needed:
/*
-- Allow anyone to read quotes (for sharing)
CREATE POLICY "Public quote viewing" ON quotes FOR SELECT USING (true);
-- Allow authenticated users to insert/update their own quotes  
CREATE POLICY "Users manage own quotes" ON quotes FOR ALL USING (auth.uid() = user_id);
*/