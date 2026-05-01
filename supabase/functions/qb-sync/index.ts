import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// QuickBooks configuration
const QB_CLIENT_ID = Deno.env.get("QB_CLIENT_ID") ?? "";
const QB_CLIENT_SECRET = Deno.env.get("QB_CLIENT_SECRET") ?? "";
const QB_ENVIRONMENT = Deno.env.get("QB_ENVIRONMENT") ?? "sandbox";
const QB_BASE_URL = QB_ENVIRONMENT === "production"
  ? "https://quickbooks.api.intuit.com/v3/company"
  : "https://sandbox-quickbooks.api.intuit.com/v3/company";

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

// Log intuit_tid from every QB API response (helps Intuit debug issues)
function logQBResponse(action: string, response: Response) {
  const tid = response.headers.get('intuit_tid') || 'none';
  if (!response.ok) {
    console.error(`[QB ERROR] ${action} | intuit_tid: ${tid} | status: ${response.status}`);
  } else {
    console.log(`[QB] ${action} | intuit_tid: ${tid} | status: ${response.status}`);
  }
}

// Supabase configuration
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "https://axmoffknvblluibuitrq.supabase.co";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

interface QBToken {
  access_token: string;
  refresh_token: string;
  realm_id: string;
  expires_at: number;
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
      case "push_invoice":
        return await handlePushInvoice(userId, body.invoice);
      case "get_customers":
        return await handleGetCustomers(userId);
      case "get_items":
        return await handleGetItems(userId);
      case "get_invoice_status":
        return await handleGetInvoiceStatus(userId, body.invoiceId);
      default:
        return jsonResponse({ error: "Invalid action" }, 400);
    }
  } catch (error) {
    console.error("Error in qb-sync function:", error);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});

async function getQuickBooksTokens(userId: string): Promise<QBToken> {
  const { data: tokensData, error: fetchError } = await supabaseAdmin
    .from("user_data")
    .select("value")
    .eq("user_id", userId)
    .eq("key", "qb_tokens")
    .single();

  if (fetchError || !tokensData) {
    throw new Error("No QuickBooks tokens found for user");
  }

  let tokens: QBToken = tokensData.value;
  if (Date.now() < tokens.expires_at) return tokens;

  const refreshResponse = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
    method: "POST",
    headers: {
      "Authorization": "Basic " + btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`),
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token
    })
  });

  if (!refreshResponse.ok) {
    const errorText = await refreshResponse.text();
    throw new Error(`Token refresh failed: ${errorText}`);
  }

  const tokenData = await refreshResponse.json();
  tokens = {
    access_token: tokenData.access_token,
    refresh_token: tokenData.refresh_token || tokens.refresh_token,
    realm_id: tokens.realm_id,
    expires_at: Date.now() + (tokenData.expires_in * 1000)
  };

  const { error } = await supabaseAdmin
    .from("user_data")
    .upsert({ user_id: userId, key: "qb_tokens", value: tokens }, { onConflict: "user_id,key" });

  if (error) throw new Error(`Failed to update tokens: ${error.message}`);
  return tokens;
}

async function queryQuickBooks(tokens: QBToken, query: string) {
  const response = await fetch(
    `${QB_BASE_URL}/${tokens.realm_id}/query?query=${encodeURIComponent(query)}&minorversion=70`,
    {
      headers: {
        "Authorization": `Bearer ${tokens.access_token}`,
        "Accept": "application/json"
      }
    }
  );

  logQBResponse('query', response);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`QuickBooks query failed: ${errorText}`);
  }
  return await response.json();
}

function normalizeQBCustomer(customer: any) {
  const billAddr = customer.BillAddr || {};
  const address = [billAddr.Line1, billAddr.City, billAddr.CountrySubDivisionCode, billAddr.PostalCode]
    .filter(Boolean)
    .join(", ");
  return {
    id: customer.Id || "",
    name: customer.DisplayName || customer.FullyQualifiedName || "",
    company: customer.CompanyName || "",
    phone: customer.PrimaryPhone?.FreeFormNumber || "",
    email: customer.PrimaryEmailAddr?.Address || "",
    address,
    active: customer.Active !== false
  };
}

function normalizeQBItem(item: any) {
  return {
    id: item.Id || "",
    name: item.Name || "",
    description: item.Description || "",
    category: item.Type || "QuickBooks",
    type: item.Type || "",
    unitType: item.Type === "Inventory" ? "each" : "service",
    rate: Number(item.UnitPrice || 0),
    materialCost: Number(item.PurchaseCost || 0),
    active: item.Active !== false
  };
}

async function handlePushInvoice(userId: string, invoiceData: any) {
  try {
    // Get QB tokens
    const { data: tokensData, error: fetchError } = await supabaseAdmin
      .from("user_data")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "qb_tokens")
      .single();

    if (fetchError || !tokensData) {
      throw new Error("No QuickBooks tokens found for user");
    }

    const tokens: QBToken = tokensData.value;
    
    // Check if token is expired and refresh if needed
    if (Date.now() >= tokens.expires_at) {
      // Call the oauth function to refresh token
      const refreshResponse = await fetch("/functions/v1/qb-oauth", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "refresh"
        })
      });

      if (!refreshResponse.ok) {
        throw new Error("Failed to refresh QuickBooks token");
      }

      const refreshResult = await refreshResponse.json();
      if (refreshResult.error) {
        throw new Error(refreshResult.error);
      }
      
      // Get updated tokens
      const { data: updatedTokensData } = await supabaseAdmin
        .from("user_data")
        .select("value")
        .eq("user_id", userId)
        .eq("key", "qb_tokens")
        .single();
        
      if (!updatedTokensData) {
        throw new Error("Failed to retrieve updated tokens");
      }
      
      const updatedTokens: QBToken = updatedTokensData.value;
      tokens.access_token = updatedTokens.access_token;
      tokens.expires_at = updatedTokens.expires_at;
    }

    // Get realm ID
    const realmId = tokens.realm_id;

    // Step 1: Find or create customer
    let customerId = invoiceData.customerId;
    
    if (!customerId) {
      // Try to find existing customer by email
      const customerResponse = await fetch(
        `${QB_BASE_URL}/${realmId}/query?query=SELECT * FROM Customer WHERE PrimaryEmailAddr.Address='${invoiceData.customer.email}'`,
        {
          headers: {
            "Authorization": `Bearer ${tokens.access_token}`,
            "Accept": "application/json"
          }
        }
      );

      if (customerResponse.ok) {
        const customerData = await customerResponse.json();
        if (customerData.QueryResponse && customerData.QueryResponse.Customer.length > 0) {
          customerId = customerData.QueryResponse.Customer[0].Id;
        }
      }

      // If no customer found, create new one
      if (!customerId) {
        const customerPayload = {
          DisplayName: invoiceData.customer.name,
          PrimaryEmailAddr: {
            Address: invoiceData.customer.email
          },
          BillAddr: {
            Line1: invoiceData.customer.address?.line1 || "",
            City: invoiceData.customer.address?.city || "",
            PostalCode: invoiceData.customer.address?.postalCode || ""
          }
        };

        const createCustomerResponse = await fetch(
          `${QB_BASE_URL}/${realmId}/customer`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${tokens.access_token}`,
              "Accept": "application/json",
              "Content-Type": "application/json"
            },
            body: JSON.stringify(customerPayload)
          }
        );

        logQBResponse('createCustomer', createCustomerResponse);
        if (!createCustomerResponse.ok) {
          const errorText = await createCustomerResponse.text();
          throw new Error(`Failed to create customer: ${errorText}`);
        }

        const customerResult = await createCustomerResponse.json();
        customerId = customerResult.Customer.Id;
      }
    }

    // Step 2: Find or create items
    const lineItems = [];
    
    for (const item of invoiceData.items) {
      let itemId = item.itemId;
      
      if (!itemId) {
        // Try to find existing service item by name
        const itemResponse = await fetch(
          `${QB_BASE_URL}/${realmId}/query?query=SELECT * FROM Item WHERE Name='${item.name}' AND Type='Service'`,
          {
            headers: {
              "Authorization": `Bearer ${tokens.access_token}`,
              "Accept": "application/json"
            }
          }
        );

        if (itemResponse.ok) {
          const itemData = await itemResponse.json();
          if (itemData.QueryResponse && itemData.QueryResponse.Item.length > 0) {
            itemId = itemData.QueryResponse.Item[0].Id;
          }
        }

        // If no item found, create new service item
        if (!itemId) {
          const itemPayload = {
            Name: item.name,
            Type: "Service",
            Description: item.description || "",
            SalesOrPurchase: {
              Price: item.price,
              AccountRef: {
                value: "79" // Default income account ID - should be configurable
              }
            }
          };

          const createItemResponse = await fetch(
            `${QB_BASE_URL}/${realmId}/item`,
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${tokens.access_token}`,
                "Accept": "application/json",
                "Content-Type": "application/json"
              },
              body: JSON.stringify(itemPayload)
            }
          );

          if (!createItemResponse.ok) {
            const errorText = await createItemResponse.text();
            throw new Error(`Failed to create item: ${errorText}`);
          }

          const itemResult = await createItemResponse.json();
          itemId = itemResult.Item.Id;
        }
      }

      lineItems.push({
        ItemRef: {
          value: itemId
        },
        Qty: item.quantity || 1,
        Rate: item.price
      });
    }

    // Step 3: Create invoice
    const invoicePayload = {
      CustomerRef: {
        value: customerId
      },
      TxnDate: invoiceData.date || new Date().toISOString().split('T')[0],
      DueDate: invoiceData.dueDate,
      Line: lineItems,
      Memo: {
        value: invoiceData.memo || ""
      }
    };

    const createInvoiceResponse = await fetch(
      `${QB_BASE_URL}/${realmId}/invoice`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokens.access_token}`,
          "Accept": "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(invoicePayload)
      }
    );

    logQBResponse('createInvoice', createInvoiceResponse);
    if (!createInvoiceResponse.ok) {
      const errorText = await createInvoiceResponse.text();
      throw new Error(`Failed to create invoice: ${errorText}`);
    }

    const invoiceResult = await createInvoiceResponse.json();
    
    // Return QB invoice ID and deep link
    const qbInvoiceId = invoiceResult.Invoice.Id;
    const deepLink = `https://app.quickbooks.com/app/invoice?txnId=${qbInvoiceId}&realmId=${realmId}`;
    
    return jsonResponse({
      success: true,
      invoiceId: qbInvoiceId,
      deepLink: deepLink
    });
  } catch (error) {
    console.error("Error in handlePushInvoice:", error);
    return jsonResponse({ error: error.message || "Failed to push invoice to QuickBooks" }, 500);
  }
}

async function handleGetCustomers(userId: string) {
  try {
    const tokens = await getQuickBooksTokens(userId);
    const customersData = await queryQuickBooks(tokens, "SELECT * FROM Customer MAXRESULTS 1000");
    const rawCustomers = customersData.QueryResponse?.Customer || [];
    return jsonResponse({
      success: true,
      environment: QB_ENVIRONMENT,
      realm_id: tokens.realm_id,
      customers: rawCustomers.map(normalizeQBCustomer)
    });
  } catch (error) {
    console.error("Error in handleGetCustomers:", error);
    return jsonResponse({ error: error.message || "Failed to fetch customers from QuickBooks" }, 500);
  }
}

async function handleGetItems(userId: string) {
  try {
    const tokens = await getQuickBooksTokens(userId);
    const itemsData = await queryQuickBooks(tokens, "SELECT * FROM Item MAXRESULTS 1000");
    const rawItems = itemsData.QueryResponse?.Item || [];
    return jsonResponse({
      success: true,
      environment: QB_ENVIRONMENT,
      realm_id: tokens.realm_id,
      items: rawItems.map(normalizeQBItem)
    });
  } catch (error) {
    console.error("Error in handleGetItems:", error);
    return jsonResponse({ error: error.message || "Failed to fetch items from QuickBooks" }, 500);
  }
}

async function handleGetInvoiceStatus(userId: string, invoiceId: string) {
  try {
    // Get QB tokens
    const { data: tokensData, error: fetchError } = await supabaseAdmin
      .from("user_data")
      .select("value")
      .eq("user_id", userId)
      .eq("key", "qb_tokens")
      .single();

    if (fetchError || !tokensData) {
      throw new Error("No QuickBooks tokens found for user");
    }

    const tokens: QBToken = tokensData.value;
    
    // Check if token is expired and refresh if needed
    if (Date.now() >= tokens.expires_at) {
      // Call the oauth function to refresh token
      const refreshResponse = await fetch("/functions/v1/qb-oauth", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${tokens.access_token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          action: "refresh"
        })
      });

      if (!refreshResponse.ok) {
        throw new Error("Failed to refresh QuickBooks token");
      }

      const refreshResult = await refreshResponse.json();
      if (refreshResult.error) {
        throw new Error(refreshResult.error);
      }
      
      // Get updated tokens
      const { data: updatedTokensData } = await supabaseAdmin
        .from("user_data")
        .select("value")
        .eq("user_id", userId)
        .eq("key", "qb_tokens")
        .single();
        
      if (!updatedTokensData) {
        throw new Error("Failed to retrieve updated tokens");
      }
      
      const updatedTokens: QBToken = updatedTokensData.value;
      tokens.access_token = updatedTokens.access_token;
      tokens.expires_at = updatedTokens.expires_at;
    }

    // Get realm ID
    const realmId = tokens.realm_id;

    // Fetch invoice status from QuickBooks
    const response = await fetch(
      `${QB_BASE_URL}/${realmId}/invoice/${invoiceId}`,
      {
        headers: {
          "Authorization": `Bearer ${tokens.access_token}`,
          "Accept": "application/json"
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch invoice status: ${errorText}`);
    }

    const invoiceData = await response.json();
    
    return jsonResponse({
      success: true,
      status: invoiceData.Invoice.Status,
      balance: invoiceData.Invoice.Balance
    });
  } catch (error) {
    console.error("Error in handleGetInvoiceStatus:", error);
    return jsonResponse({ error: error.message || "Failed to fetch invoice status from QuickBooks" }, 500);
  }
}
