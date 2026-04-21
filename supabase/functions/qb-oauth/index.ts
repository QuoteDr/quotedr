import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// QuickBooks configuration
const QB_CLIENT_ID = "ABzLzJgnopNHJpFlQAASaTKS8T2Jmvy43Vo8V3TwUxFtT3cnG1";
const QB_CLIENT_SECRET = "iTPALtc0nKWJWoip2NHwI2PG9EWFQWitQlxzyIop";
const QB_REDIRECT_URI = "https://quotedr.io/qb-callback.html";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";

// Supabase configuration
const SUPABASE_URL = "https://axmoffknvblluibuitrq.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  try {
    // Get the Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Missing or invalid authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const jwtToken = authHeader.substring(7);
    
    // Verify the JWT token and extract user info
    const { data: authData, error: authError } = await supabase
      .auth
      .getUser(jwtToken);
      
    if (authError || !authData?.user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const userId = authData.user.id;
    
    // Parse request body
    const body = await req.json();
    const action = body.action;

    switch (action) {
      case "exchange":
        return await handleExchange(userId, body.code, body.realmId);
      case "refresh":
        return await handleRefresh(userId);
      case "status":
        return await handleStatus(userId);
      case "disconnect":
        return await handleDisconnect(userId);
      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("Error in qb-oauth function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function handleExchange(userId: string, code: string, realmId: string) {
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
    const { error } = await supabase
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

    return new Response(
      JSON.stringify({ success: true, message: "QuickBooks connected successfully" }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in handleExchange:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to connect to QuickBooks" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function handleRefresh(userId: string) {
  try {
    // Get current tokens from Supabase
    const { data: tokensData, error: fetchError } = await supabase
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
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Token is still valid",
          realm_id: currentTokens.realm_id
        }),
        { headers: { "Content-Type": "application/json" } }
      );
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
    const { error } = await supabase
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

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Token refreshed successfully",
        realm_id: updatedTokens.realm_id
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in handleRefresh:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to refresh token" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function handleStatus(userId: string) {
  try {
    // Get tokens from Supabase
    const { data: tokensData, error: fetchError } = await supabase
      .from("user_data")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "qb_tokens")
      .single();

    if (fetchError || !tokensData) {
      return new Response(
        JSON.stringify({ connected: false }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const tokens: QBToken = tokensData.value;
    
    // Check if token is expired
    const isConnected = Date.now() < tokens.expires_at;

    return new Response(
      JSON.stringify({ 
        connected: isConnected,
        realm_id: tokens.realm_id
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in handleStatus:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to check connection status" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function handleDisconnect(userId: string) {
  try {
    // Delete tokens from Supabase
    const { error } = await supabase
      .from("user_data")
      .delete()
      .eq("user_id", userId)
      .eq("key", "qb_tokens");

    if (error) {
      throw new Error(`Failed to disconnect: ${error.message}`);
    }

    return new Response(
      JSON.stringify({ success: true, message: "QuickBooks disconnected successfully" }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in handleDisconnect:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to disconnect from QuickBooks" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}