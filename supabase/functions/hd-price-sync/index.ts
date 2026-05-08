import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hd-admin-token",
};

type HDProductInput = {
  country: "CA" | "US";
  sku: string | null;
  product_id: string | null;
  model_number: string | null;
  product_name: string;
  brand: string | null;
  category: string | null;
  current_price: number | null;
  currency: string;
  inventory_status: string | null;
  product_url: string | null;
  affiliate_url: string | null;
  image_url: string | null;
  raw: Record<string, unknown>;
};

type MaterialItem = {
  category?: string;
  name?: string;
  description?: string;
  unitType?: string;
  materialCost?: number;
  supplierUrl?: string;
  hdSku?: string;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    if (req.method === "GET") return json({ ok: true, feature: "hd-price-sync" });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "ingestFeed") return await ingestFeed(req, body);
    if (action === "matchMaterials") return await matchMaterials(req, body);
    if (action === "saveLink") return await saveLink(req, body);
    if (action === "syncMaterials") return await syncMaterials(req, body);

    return json({ error: "Unsupported action" }, 400);
  } catch (err) {
    console.error("hd-price-sync error", err);
    return json({ error: (err as Error).message || "Home Depot price sync failed" }, 500);
  }
});

async function ingestFeed(req: Request, body: any) {
  requireAdminToken(req);
  const supabase = adminClient();
  const country = normalizeCountry(body.country);
  const run = await supabase.from("home_depot_price_feed_runs").insert({
    country,
    source: body.source || "affiliate_feed",
    status: "started",
    metadata: { feedUrlConfigured: Boolean(body.feedUrl || Deno.env.get("HD_PRODUCT_FEED_URL")) },
  }).select("id").single();
  if (run.error) throw run.error;

  try {
    const csvText = await getFeedCsv(body);
    const products = parseProductFeed(csvText, country, body.affiliateUrlTemplate || Deno.env.get("HD_AFFILIATE_URL_TEMPLATE") || "");
    let upserted = 0;
    let priceChanges = 0;

    for (const product of products) {
      const existing = await findExistingProduct(supabase, product);
      if (existing && pricesDiffer(existing.current_price, product.current_price)) {
        priceChanges++;
        await supabase.from("home_depot_price_changes").insert({
          product_id: existing.id,
          old_price: existing.current_price,
          new_price: product.current_price,
          currency: product.currency,
          feed_run_id: run.data.id,
        });
      }

      const payload = {
        ...product,
        previous_price: existing && pricesDiffer(existing.current_price, product.current_price) ? existing.current_price : existing?.previous_price || null,
        first_seen_at: existing?.first_seen_at || new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const result = existing
        ? await supabase.from("home_depot_products").update(payload).eq("id", existing.id)
        : await supabase.from("home_depot_products").insert(payload);
      if (result.error) throw result.error;
      upserted++;
    }

    await supabase.from("home_depot_price_feed_runs").update({
      status: "success",
      finished_at: new Date().toISOString(),
      products_seen: products.length,
      products_upserted: upserted,
      price_changes_detected: priceChanges,
      file_size_bytes: csvText.length,
    }).eq("id", run.data.id);

    return json({ success: true, products: products.length, upserted, priceChanges, runId: run.data.id });
  } catch (err) {
    await supabase.from("home_depot_price_feed_runs").update({
      status: "failed",
      finished_at: new Date().toISOString(),
      error_message: (err as Error).message,
    }).eq("id", run.data.id);
    throw err;
  }
}

async function matchMaterials(req: Request, body: any) {
  await requireUser(req);
  const supabase = adminClient();
  const country = normalizeCountry(body.country);
  const items = normalizeItems(body.items || body.customItems || {});
  const catalog = await loadCatalog(supabase, country, items);
  const matches = items.map((item) => bestMatchForItem(item, catalog)).filter(Boolean);
  return json({ matches });
}

async function saveLink(req: Request, body: any) {
  const user = await requireUser(req);
  const supabase = adminClient();
  const productId = String(body.homeDepotProductId || body.home_depot_product_id || "");
  const item = normalizeItems([body.item || body]).at(0);
  if (!item || !item.name || !item.category || !productId) return json({ error: "Missing item or product" }, 400);

  const product = await supabase.from("home_depot_products").select("*").eq("id", productId).single();
  if (product.error) throw product.error;

  const link = {
    user_id: user.id,
    supplier: "home_depot",
    item_key: itemKey(item),
    item_category: item.category,
    item_name: item.name,
    home_depot_product_id: productId,
    sku: product.data.sku,
    product_id: product.data.product_id,
    product_url: product.data.product_url,
    affiliate_url: product.data.affiliate_url,
    match_confidence: Number(body.matchConfidence || body.match_confidence || 100),
    match_type: body.matchType || body.match_type || "manual",
    manually_verified: true,
    auto_update_enabled: body.autoUpdateEnabled !== false,
    last_synced_price: product.data.current_price,
    last_synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const saved = await supabase
    .from("user_material_supplier_links")
    .upsert(link, { onConflict: "user_id,supplier,item_key" })
    .select()
    .single();
  if (saved.error) throw saved.error;
  return json({ success: true, link: saved.data });
}

async function syncMaterials(req: Request, body: any) {
  const user = await requireUser(req);
  const supabase = adminClient();
  const items = normalizeItems(body.items || body.customItems || {});
  const keys = items.map(itemKey);
  if (!keys.length) return json({ updates: [] });

  const links = await supabase
    .from("user_material_supplier_links")
    .select("*, home_depot_products(*)")
    .eq("user_id", user.id)
    .eq("supplier", "home_depot")
    .eq("auto_update_enabled", true)
    .in("item_key", keys);
  if (links.error) throw links.error;

  const updates = (links.data || []).map((link: any) => ({
    itemKey: link.item_key,
    category: link.item_category,
    name: link.item_name,
    oldMaterialCost: items.find((item) => itemKey(item) === link.item_key)?.materialCost || 0,
    newMaterialCost: Number(link.home_depot_products?.current_price || 0),
    sku: link.sku,
    productId: link.product_id,
    productName: link.home_depot_products?.product_name || "",
    productUrl: link.product_url,
    affiliateUrl: link.affiliate_url,
    inventoryStatus: link.home_depot_products?.inventory_status || "",
    lastSeenAt: link.home_depot_products?.last_seen_at || "",
  })).filter((update: any) => update.newMaterialCost > 0);

  return json({ updates });
}

async function getFeedCsv(body: any): Promise<string> {
  if (body.csvText) return String(body.csvText);
  const feedUrl = String(body.feedUrl || Deno.env.get("HD_PRODUCT_FEED_URL") || "");
  if (!feedUrl) throw new Error("No Home Depot feed URL or csvText configured yet.");
  const headers: Record<string, string> = {};
  const token = Deno.env.get("HD_AFFILIATE_TOKEN");
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(feedUrl, { headers });
  if (!response.ok) throw new Error(`Feed download failed: ${response.status} ${await response.text()}`);
  return await response.text();
}

function parseProductFeed(csvText: string, country: "CA" | "US", affiliateTemplate: string): HDProductInput[] {
  const rows = parseCsv(csvText);
  return rows.map((row) => {
    const product: HDProductInput = {
      country,
      sku: firstValue(row, ["sku", "SKU", "item_id", "Item ID", "program_sku"]),
      product_id: firstValue(row, ["product_id", "Product ID", "ProductID", "id"]),
      model_number: firstValue(row, ["model_number", "Model Number", "model", "MPN", "mpn"]),
      product_name: firstValue(row, ["product_name", "Product Name", "ProductName", "name", "Name", "Title", "title"]) || "",
      brand: firstValue(row, ["brand", "Brand", "manufacturer", "Manufacturer"]),
      category: firstValue(row, ["category", "Category", "merchant_category", "Product Category"]),
      current_price: parsePrice(firstValue(row, ["price", "Price", "current_price", "Sale Price", "sale_price", "retail_price"])),
      currency: firstValue(row, ["currency", "Currency"]) || (country === "CA" ? "CAD" : "USD"),
      inventory_status: normalizeInventory(firstValue(row, ["inventory_status", "InventoryStatus", "availability", "Availability", "stock_status"])),
      product_url: firstValue(row, ["product_url", "Product URL", "ProductURL", "link", "Link", "url", "DirectURL"]),
      affiliate_url: firstValue(row, ["affiliate_url", "Affiliate URL", "AffiliateURL", "tracking_url", "Tracking URL", "TrackingURL"]),
      image_url: firstValue(row, ["image_url", "Image URL", "ImageURL", "image"]),
      raw: row,
    };
    if (!product.affiliate_url && affiliateTemplate) product.affiliate_url = formatAffiliateUrl(affiliateTemplate, product);
    return product;
  }).filter((product) => product.product_name && (product.sku || product.product_id || product.model_number || product.product_url));
}

function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === '"' && quoted && next === '"') {
      cell += '"';
      i++;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  const headers = (rows.shift() || []).map((header) => header.trim());
  return rows.map((values) => {
    const obj: Record<string, string> = {};
    headers.forEach((header, index) => obj[header] = String(values[index] || "").trim());
    return obj;
  });
}

async function loadCatalog(supabase: any, country: "CA" | "US", items: MaterialItem[]) {
  const { data, error } = await supabase
    .from("home_depot_products")
    .select("id, country, sku, product_id, model_number, product_name, brand, category, current_price, currency, inventory_status, product_url, affiliate_url, last_seen_at")
    .eq("country", country)
    .order("last_seen_at", { ascending: false })
    .limit(Math.max(500, Math.min(5000, items.length * 250)));
  if (error) throw error;
  return data || [];
}

function bestMatchForItem(item: MaterialItem, catalog: any[]) {
  if (!item.name) return null;
  const directSku = String(item.hdSku || extractHomeDepotSku(item.supplierUrl || "") || "").toLowerCase();
  const scored = catalog.map((product) => {
    let score = scoreText(`${item.category || ""} ${item.name || ""} ${item.description || ""}`, `${product.category || ""} ${product.brand || ""} ${product.product_name || ""} ${product.model_number || ""}`);
    if (directSku && [product.sku, product.product_id, product.model_number].map((v) => String(v || "").toLowerCase()).includes(directSku)) score = 100;
    return { product, score };
  }).filter((match) => match.score >= 35).sort((a, b) => b.score - a.score).slice(0, 5);

  return {
    itemKey: itemKey(item),
    category: item.category || "",
    name: item.name,
    currentMaterialCost: Number(item.materialCost || 0),
    matches: scored.map((match) => ({
      homeDepotProductId: match.product.id,
      sku: match.product.sku,
      productId: match.product.product_id,
      modelNumber: match.product.model_number,
      productName: match.product.product_name,
      brand: match.product.brand,
      category: match.product.category,
      currentPrice: Number(match.product.current_price || 0),
      currency: match.product.currency,
      inventoryStatus: match.product.inventory_status,
      productUrl: match.product.product_url,
      affiliateUrl: match.product.affiliate_url,
      confidence: match.score,
    })),
  };
}

function normalizeItems(input: any): MaterialItem[] {
  if (Array.isArray(input)) return input.map(normalizeItem).filter((item) => item.name);
  const items: MaterialItem[] = [];
  Object.entries(input || {}).forEach(([category, categoryItems]) => {
    if (!Array.isArray(categoryItems)) return;
    categoryItems.forEach((item: any) => items.push(normalizeItem({ ...item, category: item.category || category })));
  });
  return items.filter((item) => item.name);
}

function normalizeItem(item: any): MaterialItem {
  return {
    category: String(item.category || "General").trim(),
    name: String(item.name || item.serviceName || item.description || "").trim(),
    description: String(item.itemDescription || item.description || "").trim(),
    unitType: String(item.unitType || item.unit || "").trim(),
    materialCost: Number(item.materialCost || 0),
    supplierUrl: String(item.supplierUrl || "").trim(),
    hdSku: item.hdSku || item.homeDepotSku || extractHomeDepotSku(String(item.supplierUrl || "")),
  };
}

function itemKey(item: MaterialItem): string {
  return `${slug(item.category || "general")}::${slug(item.name || "")}`;
}

function scoreText(a: string, b: string): number {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);
  if (!aTokens.length || !bTokens.length) return 0;
  const bSet = new Set(bTokens);
  const overlap = aTokens.filter((token) => bSet.has(token)).length;
  const coverage = overlap / aTokens.length;
  const extra = Math.min(20, overlap * 4);
  return Math.min(100, Math.round(coverage * 80 + extra));
}

function tokenize(value: string): string[] {
  const stop = new Set(["and", "the", "for", "with", "from", "per", "each", "item", "material", "install", "installation"]);
  return String(value || "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((token) => token.length > 2 && !stop.has(token));
}

function slug(value: string): string {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function firstValue(row: Record<string, string>, keys: string[]): string | null {
  for (const key of keys) {
    const match = Object.keys(row).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    if (match && row[match]) return row[match].trim();
  }
  return null;
}

function parsePrice(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function normalizeInventory(value: string | null): string | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v.includes("out")) return "out_of_stock";
  if (v.includes("limited") || v.includes("low")) return "limited";
  if (v.includes("stock") || v.includes("available")) return "in_stock";
  return value;
}

function normalizeCountry(value: string | undefined): "CA" | "US" {
  return String(value || "CA").toUpperCase() === "US" ? "US" : "CA";
}

function formatAffiliateUrl(template: string, product: HDProductInput): string {
  return template
    .replaceAll("{sku}", encodeURIComponent(product.sku || ""))
    .replaceAll("{product_id}", encodeURIComponent(product.product_id || ""))
    .replaceAll("{model_number}", encodeURIComponent(product.model_number || ""))
    .replaceAll("{product_url}", encodeURIComponent(product.product_url || ""));
}

function extractHomeDepotSku(url: string): string | null {
  const match = String(url || "").match(/(?:sku|productId|product_id|storeSkuNumber)=([A-Za-z0-9_-]+)/i);
  return match ? match[1] : null;
}

function pricesDiffer(a: unknown, b: unknown): boolean {
  if (a == null || b == null) return false;
  return Math.abs(Number(a) - Number(b)) >= 0.01;
}

async function findExistingProduct(supabase: any, product: HDProductInput) {
  const fields = [
    ["sku", product.sku],
    ["product_id", product.product_id],
    ["model_number", product.model_number],
    ["product_url", product.product_url],
  ];
  for (const [field, value] of fields) {
    if (!value) continue;
    const { data, error } = await supabase.from("home_depot_products").select("*").eq("country", product.country).eq(field, value).maybeSingle();
    if (error) throw error;
    if (data) return data;
  }
  return null;
}

async function requireUser(req: Request) {
  const supabase = createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_ANON_KEY") || "", {
    global: { headers: { Authorization: req.headers.get("Authorization") || "" } },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Authentication required");
  return data.user;
}

function requireAdminToken(req: Request) {
  const expected = Deno.env.get("HD_PRICE_SYNC_ADMIN_TOKEN");
  if (!expected) throw new Error("HD_PRICE_SYNC_ADMIN_TOKEN is not configured");
  const actual = req.headers.get("x-hd-admin-token") || "";
  if (actual !== expected) throw new Error("Invalid Home Depot feed admin token");
}

function adminClient() {
  return createClient(Deno.env.get("SUPABASE_URL") || "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "");
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
