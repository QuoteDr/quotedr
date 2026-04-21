import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

// QuickBooks configuration
const QB_CLIENT_ID = "ABzLzJgnopNHJpFlQAASaTKS8T2Jmvy43Vo8V3TwUxFtT3cnG1";
const QB_CLIENT_SECRET = "iTPALtc0nKWJWoip2NHwI2PG9EWFQWitQlxzyIop";
const QB_BASE_URL = "https://quickbooks.api.intuit.com/v3/company";

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
      case "push_invoice":
        return await handlePushInvoice(userId, body.invoice);
      case "get_customers":
        return await handleGetCustomers(userId);
      case "get_invoice_status":
        return await handleGetInvoiceStatus(userId, body.invoiceId);
      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { "Content-Type": "application/json" } }
        );
    }
  } catch (error) {
    console.error("Error in qb-sync function:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function handlePushInvoice(userId: string, invoiceData: any) {
  try {
    // Get QB tokens
    const { data: tokensData, error: fetchError } = await supabase
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
      const { data: updatedTokensData } = await supabase
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

    if (!createInvoiceResponse.ok) {
      const errorText = await createInvoiceResponse.text();
      throw new Error(`Failed to create invoice: ${errorText}`);
    }

    const invoiceResult = await createInvoiceResponse.json();
    
    // Return QB invoice ID and deep link
    const qbInvoiceId = invoiceResult.Invoice.Id;
    const deepLink = `https://app.quickbooks.com/app/invoice?txnId=${qbInvoiceId}&realmId=${realmId}`;
    
    return new Response(
      JSON.stringify({
        success: true,
        invoiceId: qbInvoiceId,
        deepLink: deepLink
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in handlePushInvoice:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to push invoice to QuickBooks" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function handleGetCustomers(userId: string) {
  try {
    // Get QB tokens
    const { data: tokensData, error: fetchError } = await supabase
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
      const { data: updatedTokensData } = await supabase
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

    // Fetch customers from QuickBooks
    const response = await fetch(
      `${QB_BASE_URL}/${realmId}/query?query=SELECT * FROM Customer`,
      {
        headers: {
          "Authorization": `Bearer ${tokens.access_token}`,
          "Accept": "application/json"
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to fetch customers: ${errorText}`);
    }

    const customersData = await response.json();
    
    return new Response(
      JSON.stringify({
        success: true,
        customers: customersData.QueryResponse.Customer || []
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in handleGetCustomers:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to fetch customers from QuickBooks" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

async function handleGetInvoiceStatus(userId: string, invoiceId: string) {
  try {
    // Get QB tokens
    const { data: tokensData, error: fetchError } = await supabase
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
      const { data: updatedTokensData } = await supabase
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
    
    return new Response(
      JSON.stringify({
        success: true,
        status: invoiceData.Invoice.Status,
        balance: invoiceData.Invoice.Balance
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in handleGetInvoiceStatus:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to fetch invoice status from QuickBooks" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}