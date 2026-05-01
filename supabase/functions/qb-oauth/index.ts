import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// QuickBooks configuration — secrets stored in Supabase vault, never hardcoded
const QB_CLIENT_ID = Deno.env.get("QB_CLIENT_ID") ?? "";
const QB_CLIENT_SECRET = Deno.env.get("QB_CLIENT_SECRET") ?? "";
const QB_REDIRECT_URI = "https://quotedr.io/qb-callback.html";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Supabase configuration
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://axmoffknvblluibuitrq.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Use anon client for auth validation only; service role client for DB writes (bypasses RLS correctly)
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface QBToken {
  access_token: string;
  refresh_token: string;
  realm_id: string;
  expires_at: number;
}

interface UserTokenData {
  user_id: string;
  key: string;
  value: QBToken;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get the Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing or invalid authorization header" }, 401);
    }

    const jwtToken = authHeader.substring(7);
    
    // Verify the JWT token and extract user info
    const { data: authData, error: authError } = await supabase
      .auth
      .getUser(jwtToken);
      
    if (authError || !authData?.user) {
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    const userId = authData.user.id;
    
    // Parse request body
    const body = await req.json();
    const action = body.action;

    switch (action) {
      case "get_auth_url":
        return await handleGetAuthUrl(userId);
      case "exchange":
        return await handleExchange(userId, body.code, body.realmId, body.state);
      case "refresh":
        return await handleRefresh(userId);
      case "status":
        return await handleStatus(userId);
      case "disconnect":
        return await handleDisconnect(userId);
      default:
        return jsonResponse({ error: "Invalid action" }, 400);
    }
  } catch (error) {
    console.error("Error in qb-oauth function:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

async function handleGetAuthUrl(userId: string) {
  const state = crypto.randomUUID();
  const { error } = await supabaseAdmin
    .from('user_data')
    .upsert({ user_id: userId, key: 'qb_oauth_state', value: { state, created_at: new Date().toISOString() } }, { onConflict: 'user_id,key' });
  if (error) return jsonResponse({ error: 'Failed to save state' }, 500);
  const authUrl = QB_AUTH_URL +
    "?client_id=" + QB_CLIENT_ID +
    "&redirect_uri=" + encodeURIComponent(QB_REDIRECT_URI) +
    "&response_type=code" +
    "&scope=com.intuit.quickbooks.accounting" +
    "&state=" + state;
  return jsonResponse({ auth_url: authUrl, url: authUrl });
}

async function handleExchange(userId: string, code: string, realmId: string, state: string) {
  // Validate CSRF state
  const { data: storedStateData, error: stateErr } = await supabaseAdmin
    .from('user_data').select('value').eq('user_id', userId).eq('key', 'qb_oauth_state').single();
  if (stateErr || !storedStateData || storedStateData.value.state !== state) {
    return jsonResponse({ error: 'Invalid state parameter - possible CSRF attack' }, 403);
  }
  // Delete used state (one-time use)
  await supabaseAdmin.from('user_data').delete().eq('user_id', userId).eq('key', 'qb_oauth_state');
  try {
    // Exchange authorization code for tokens
    const tokenResponse = await fetch(QB_TOKEN_URL, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: QB_REDIRECT_URI
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Token exchange failed: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    
    // Create token object with expiration timestamp
    const expiresAt = Date.now() + (tokenData.expires_in * 1000);
    
    const qbToken: QBToken = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      realm_id: realmId,
      expires_at: expiresAt
    };

    // Save tokens to Supabase
    const { error } = await supabaseAdmin
      .from("user_data")
      .upsert({
        user_id: userId,
        key: "qb_tokens",
        value: qbToken
      }, {
        onConflict: "user_id,key"
      });

    if (error) {
      throw new Error(`Failed to save tokens: ${error.message}`);
    }

    return jsonResponse({ success: true, message: "QuickBooks connected successfully" });
  } catch (error) {
    console.error("Error in handleExchange:", error);
    return jsonResponse({ error: error.message || "Failed to connect to QuickBooks" }, 500);
  }
}

async function handleRefresh(userId: string) {
  try {
    // Get current tokens from Supabase
    const { data: tokensData, error: fetchError } = await supabaseAdmin
      .from("user_data")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "qb_tokens")
      .single();

    if (fetchError || !tokensData) {
      throw new Error("No QuickBooks tokens found for user");
    }

    const currentTokens: QBToken = tokensData.value;

    // Check if token is expired
    if (Date.now() < currentTokens.expires_at) {
      return jsonResponse({
        success: true,
        message: "Token is still valid",
        realm_id: currentTokens.realm_id
      });
    }

    // Refresh the token
    const refreshResponse = await fetch(QB_TOKEN_URL, {
      method: "POST",
      headers: {
        "Authorization": "Basic " + btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`),
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: currentTokens.refresh_token
      })
    });

    if (!refreshResponse.ok) {
      const errorText = await refreshResponse.text();
      throw new Error(`Token refresh failed: ${errorText}`);
    }

    const tokenData = await refreshResponse.json();

    // Create updated token object with new expiration timestamp
    const expiresAt = Date.now() + (tokenData.expires_in * 1000);

    const updatedTokens: QBToken = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      realm_id: currentTokens.realm_id,
      expires_at: expiresAt
    };

    // Save updated tokens to Supabase
    const { error } = await supabaseAdmin
      .from("user_data")
      .upsert({
        user_id: userId,
        key: "qb_tokens",
        value: updatedTokens
      }, {
        onConflict: "user_id,key"
      });

    if (error) {
      throw new Error(`Failed to update tokens: ${error.message}`);
    }

    return jsonResponse({
      success: true,
      message: "Token refreshed successfully",
      realm_id: updatedTokens.realm_id
    });
  } catch (error) {
    console.error("Error in handleRefresh:", error);
    return jsonResponse({ error: error.message || "Failed to refresh token" }, 500);
  }
}

async function handleStatus(userId: string) {
  try {
    // Get tokens from Supabase
    const { data: tokensData, error: fetchError } = await supabaseAdmin
      .from("user_data")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "qb_tokens")
      .single();

    if (fetchError || !tokensData) {
      return jsonResponse({ connected: false });
    }

    const tokens: QBToken = tokensData.value;

    // Check if token is expired
    const isConnected = Date.now() < tokens.expires_at;

    return jsonResponse({
      connected: isConnected,
      realm_id: tokens.realm_id
    });
  } catch (error) {
    console.error("Error in handleStatus:", error);
    return jsonResponse({ error: error.message || "Failed to check connection status" }, 500);
  }
}

async function handleDisconnect(userId: string) {
  try {
    // Delete tokens from Supabase
    const { error } = await supabaseAdmin
      .from("user_data")
      .delete()
      .eq("user_id", userId)
      .eq("key", "qb_tokens");

    if (error) {
      throw new Error(`Failed to disconnect: ${error.message}`);
    }

    return jsonResponse({ success: true, message: "QuickBooks disconnected successfully" });
  } catch (error) {
    console.error("Error in handleDisconnect:", error);
    return jsonResponse({ error: error.message || "Failed to disconnect from QuickBooks" }, 500);
  }
}
