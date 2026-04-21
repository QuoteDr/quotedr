import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import { EdgeRuntime } from "jsr:@supabase/functions-js/edge-runtime.d.ts";

interface Quote {
  id: string;
  user_id: string;
  client_name: string;
  data: {
    clientEmail: string;
    quoteNumber: string;
    total: number;
    quoteUrl: string;
    followUpSent?: boolean;
  };
  status: string;
  created_at: string;
}

interface EmailData {
  to: string;
  subject: string;
  html: string;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function sendEmail(emailData: EmailData): Promise<Response> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "noreply@quotedr.app",
      to: emailData.to,
      subject: emailData.subject,
      html: emailData.html,
    }),
  });

  return response;
}

async function sendFollowUpEmail(quote: Quote): Promise<boolean> {
  const emailData: EmailData = {
    to: quote.data.clientEmail,
    subject: "Following up on your quote",
    html: `
      <html>
        <body>
          <p>Hello ${quote.client_name || "there"},</p>
          <p>I wanted to follow up on the quote I sent you for ${quote.data.quoteNumber}.</p>
          <p>You can view and sign your quote here:</p>
          <p><a href="${quote.data.quoteUrl}">View Quote</a></p>
          <p>Best regards,<br>The QuoteDr Team</p>
        </body>
      </html>
    `,
  };

  try {
    const response = await sendEmail(emailData);
    return response.ok;
  } catch (error) {
    console.error("Failed to send email:", error);
    return false;
  }
}

async function handleCheckAndSend(): Promise<{ sent: number; errors: string[] }> {
  const daysOld = 3;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysOld);

  const { data: quotes, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("status", "sent")
    .lt("created_at", cutoffDate.toISOString())
    .is("data->>followUpSent", null);

  if (error) {
    throw new Error(`Failed to fetch quotes: ${error.message}`);
  }

  let sent = 0;
  const errors: string[] = [];

  for (const quote of quotes) {
    try {
      const emailSent = await sendFollowUpEmail(quote);
      if (emailSent) {
        const { error } = await supabase
          .from("quotes")
          .update({
            data: {
              ...quote.data,
              followUpSent: true,
            },
          })
          .eq("id", quote.id);

        if (error) {
          errors.push(`Failed to update quote ${quote.id}: ${error.message}`);
        } else {
          sent++;
        }
      } else {
        errors.push(`Failed to send email for quote ${quote.id}`);
      }
    } catch (err) {
      errors.push(`Error processing quote ${quote.id}: ${err}`);
    }
  }

  return { sent, errors };
}

async function handleSendSingle(quoteId: string): Promise<{ sent: number; errors: string[] }> {
  const { data: quote, error } = await supabase
    .from("quotes")
    .select("*")
    .eq("id", quoteId)
    .single();

  if (error) {
    throw new Error(`Failed to fetch quote: ${error.message}`);
  }

  if (!quote || quote.data.followUpSent) {
    return { sent: 0, errors: [] };
  }

  try {
    const emailSent = await sendFollowUpEmail(quote);
    if (emailSent) {
      const { error } = await supabase
        .from("quotes")
        .update({
          data: {
            ...quote.data,
            followUpSent: true,
          },
        })
        .eq("id", quote.id);

      if (error) {
        return { sent: 0, errors: [`Failed to update quote ${quoteId}: ${error.message}`] };
      }

      return { sent: 1, errors: [] };
    } else {
      return { sent: 0, errors: [`Failed to send email for quote ${quoteId}`] };
    }
  } catch (err) {
    return { sent: 0, errors: [`Error processing quote ${quoteId}: ${err}`] };
  }
}

async function handleRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  const quoteId = url.searchParams.get("quoteId");

  if (action === "check_and_send") {
    try {
      const result = await handleCheckAndSend();
      return new Response(JSON.stringify(result), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }
  } else if (action === "send_single" && quoteId) {
    try {
      const result = await handleSendSingle(quoteId);
      return new Response(JSON.stringify(result), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }
  } else {
    return new Response(
      JSON.stringify({ error: "Invalid action or missing quoteId" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      }
    );
  }
}

serve(async (request: Request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  return handleRequest(request);
});