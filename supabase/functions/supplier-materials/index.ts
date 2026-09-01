import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  ACCOUNT_PERMISSION,
  AccountAccessError,
  requireAccountPermissionWithDefault,
  serviceClient,
} from "../_shared/account-authorization.ts";
import {
  AiGuardError,
  aiGuardErrorResponse,
  assertWithinAiInputLimit,
  startAiUsage,
} from "../_shared/ai-guard.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type CatalogRow = {
  supplierSku: string;
  manufacturerPartNumber: string;
  name: string;
  brand: string;
  category: string;
  purchaseUnit: string;
  packageQuantity: number;
  price: number | null;
  currency: string;
  taxIncluded: boolean | null;
  productUrl: string;
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function text(value: unknown, limit = 500) {
  return String(value ?? "").trim().slice(0, limit);
}

function finite(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalPrice(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = finite(String(value).replace(/[$,\s]/g, ""), Number.NaN);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 10000) / 10000 : null;
}

function supplierKey(value: unknown) {
  return text(value, 120).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "supplier";
}

function currency(value: unknown) {
  const normalized = text(value || "CAD", 3).toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? normalized : "CAD";
}

function nullableBoolean(value: unknown): boolean | null {
  if (value === true || String(value).toLowerCase() === "true" || String(value).toLowerCase() === "yes") return true;
  if (value === false || String(value).toLowerCase() === "false" || String(value).toLowerCase() === "no") return false;
  return null;
}

function normalizeRow(input: Record<string, unknown>): CatalogRow | null {
  const row: CatalogRow = {
    supplierSku: text(input.supplierSku ?? input.supplier_sku ?? input.sku ?? input.itemNumber ?? input.item_number, 180),
    manufacturerPartNumber: text(input.manufacturerPartNumber ?? input.manufacturer_part_number ?? input.mpn ?? input.partNumber ?? input.part_number, 180),
    name: text(input.name ?? input.productName ?? input.product_name ?? input.description, 500),
    brand: text(input.brand ?? input.manufacturer, 180),
    category: text(input.category || "General", 180) || "General",
    purchaseUnit: text(input.purchaseUnit ?? input.purchase_unit ?? input.unit ?? input.uom ?? "each", 80) || "each",
    packageQuantity: Math.max(0.0001, finite(input.packageQuantity ?? input.package_quantity ?? input.packSize ?? input.pack_size, 1)),
    price: optionalPrice(input.price ?? input.unitPrice ?? input.unit_price ?? input.accountPrice ?? input.account_price ?? input.cost),
    currency: currency(input.currency),
    taxIncluded: nullableBoolean(input.taxIncluded ?? input.tax_included),
    productUrl: text(input.productUrl ?? input.product_url ?? input.url, 1200),
  };
  if (!row.name || (!row.supplierSku && !row.manufacturerPartNumber)) return null;
  return row;
}

function normalizeRows(value: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.map((row) => normalizeRow((row || {}) as Record<string, unknown>)).filter((row): row is CatalogRow => {
    if (!row) return false;
    const key = (row.supplierSku || row.manufacturerPartNumber).toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5000);
}

function normalizeSourceImages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 4).map((image) => String(image ?? "").trim()).filter((image) => image.length <= 2_000_000).filter((image) =>
    /^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(image)
  );
}

async function parseSupplierText(req: Request, sourceText: string, sourceImages: string[]) {
  const inputChars = sourceText.length + sourceImages.reduce((sum, image) => sum + image.length, 0);
  const usage = await startAiUsage(req, {
    feature: "supplier_import",
    endpoint: "supplier-materials",
    inputChars,
  });
  assertWithinAiInputLimit(usage.policy, { sourceText, sourceImages }, "Supplier catalogue");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiKey) throw new AccountAccessError("AI import is unavailable", 503, "ai_unavailable");
  try {
    const userContent: Array<Record<string, unknown>> = [];
    if (sourceText) userContent.push({ type: "text", text: sourceText });
    for (const imageUrl of sourceImages) {
      userContent.push({ type: "image_url", image_url: { url: imageUrl, detail: "high" } });
    }
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.1,
        max_tokens: usage.policy.maxOutputTokens,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: "Parse a contractor supplier price list. Return JSON with a rows array. Every row must contain supplierSku, manufacturerPartNumber, name, brand, category, purchaseUnit, packageQuantity, price, currency, taxIncluded, and productUrl. Keep account-specific prices exact. Do not invent missing identifiers or prices. Skip totals, payments, and customer details. Include every valid product row.",
          },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!response.ok) throw new Error(`OpenAI import failed (${response.status})`);
    const data = await response.json();
    const parsed = JSON.parse(String(data?.choices?.[0]?.message?.content || "{}"));
    await usage.recordSuccess({ model: "gpt-4o-mini", usage: data.usage || {}, metadata: { importType: "supplier_catalog" } });
    return normalizeRows(parsed.rows);
  } catch (error) {
    await usage.recordFailure(error);
    throw error;
  }
}

async function previewImport(req: Request, body: Record<string, unknown>) {
  const auth = await requireAccountPermissionWithDefault(req, body.accountId, ACCOUNT_PERMISSION.ITEMS_MANAGE);
  await requireAccountPermissionWithDefault(req, auth.accountId, ACCOUNT_PERMISSION.ITEMS_PRICING_READ);
  let rows = normalizeRows(body.rows);
  const sourceText = text(body.sourceText, 100000);
  const sourceImages = normalizeSourceImages(body.sourceImages);
  if (!rows.length && (sourceText || sourceImages.length)) rows = await parseSupplierText(req, sourceText, sourceImages);
  if (!rows.length) return json({ error: "No supplier products with an SKU or part number were found", code: "no_rows" }, 422);

  const key = supplierKey(body.supplierKey || body.supplierName);
  const branch = text(body.branchLabel, 180);
  const admin = serviceClient();
  const supplier = await admin.from("supplier_accounts").select("id")
    .eq("account_id", auth.accountId).eq("supplier_key", key).eq("branch_label", branch).maybeSingle();
  let existing: Record<string, unknown>[] = [];
  if (supplier.data?.id) {
    const result = await admin.from("supplier_products")
      .select("id,supplier_sku,manufacturer_part_number,name,last_price,last_price_at,currency")
      .eq("account_id", auth.accountId).eq("supplier_account_id", supplier.data.id);
    if (result.error) throw result.error;
    existing = result.data || [];
  }
  const bySku = new Map(existing.filter((row) => row.supplier_sku).map((row) => [String(row.supplier_sku).toLowerCase(), row]));
  const byMpn = new Map(existing.filter((row) => row.manufacturer_part_number).map((row) => [String(row.manufacturer_part_number).toLowerCase(), row]));
  const preview = rows.map((row) => {
    const matched = bySku.get(row.supplierSku.toLowerCase()) || byMpn.get(row.manufacturerPartNumber.toLowerCase()) || null;
    const oldPrice = matched?.last_price === null || matched?.last_price === undefined ? null : finite(matched.last_price);
    return {
      ...row,
      matchId: matched?.id || null,
      status: matched ? "update" : "create",
      oldPrice,
      priceChanged: matched ? row.price !== null && oldPrice !== row.price : false,
    };
  });
  return json({ rows: preview, summary: {
    received: preview.length,
    creates: preview.filter((row) => row.status === "create").length,
    updates: preview.filter((row) => row.status === "update").length,
    priceChanges: preview.filter((row) => row.priceChanged).length,
  } });
}

async function commitImport(req: Request, body: Record<string, unknown>) {
  const auth = await requireAccountPermissionWithDefault(req, body.accountId, ACCOUNT_PERMISSION.ITEMS_MANAGE);
  await requireAccountPermissionWithDefault(req, auth.accountId, ACCOUNT_PERMISSION.ITEMS_PRICING_READ);
  const rows = normalizeRows(body.rows);
  if (!rows.length) return json({ error: "No valid products to import", code: "no_rows" }, 422);
  const admin = serviceClient();
  const key = supplierKey(body.supplierKey || body.supplierName);
  const displayName = text(body.supplierName || body.supplierKey, 180) || "Supplier";
  const branchLabel = text(body.branchLabel, 180);
  const supplierLookup = await admin.from("supplier_accounts").select("id")
    .eq("account_id", auth.accountId).eq("supplier_key", key).eq("branch_label", branchLabel).maybeSingle();
  if (supplierLookup.error) throw supplierLookup.error;
  let supplierId = supplierLookup.data?.id;
  if (!supplierId) {
    const created = await admin.from("supplier_accounts").insert({
      account_id: auth.accountId,
      supplier_key: key,
      display_name: displayName,
      branch_label: branchLabel,
      connection_method: "file_import",
      created_by_user_id: auth.user.id,
    }).select("id").single();
    if (created.error) throw created.error;
    supplierId = created.data.id;
  }

  const sourceHash = text(body.sourceSha256, 128);
  if (sourceHash) {
    const duplicate = await admin.from("supplier_import_runs").select("id,rows_created,rows_updated,rows_skipped")
      .eq("account_id", auth.accountId).eq("supplier_account_id", supplierId)
      .eq("source_sha256", sourceHash).eq("status", "completed").maybeSingle();
    if (duplicate.data) return json({ duplicate: true, importRun: duplicate.data });
  }

  const runResult = await admin.from("supplier_import_runs").insert({
    account_id: auth.accountId,
    supplier_account_id: supplierId,
    source_type: (() => {
      const candidate = text(body.sourceType, 20).toLowerCase().replace("scanned_pdf", "pdf");
      return ["csv", "tsv", "xlsx", "xls", "pdf", "txt", "paste", "manual"].includes(candidate) ? candidate : "csv";
    })(),
    source_filename: text(body.sourceFilename, 300),
    source_sha256: sourceHash,
    status: "pending",
    mapping: body.mapping && typeof body.mapping === "object" ? body.mapping : {},
    rows_received: rows.length,
    created_by_user_id: auth.user.id,
  }).select("id").single();
  if (runResult.error) throw runResult.error;
  const runId = runResult.data.id;
  let createdCount = 0;
  let updatedCount = 0;
  let skippedCount = 0;
  try {
    for (const row of rows) {
      let query = admin.from("supplier_products").select("id,last_price,last_price_at")
        .eq("account_id", auth.accountId).eq("supplier_account_id", supplierId);
      query = row.supplierSku
        ? query.ilike("supplier_sku", row.supplierSku)
        : query.eq("supplier_sku", "").ilike("manufacturer_part_number", row.manufacturerPartNumber);
      const existing = await query.maybeSingle();
      if (existing.error) throw existing.error;
      const productValues: Record<string, unknown> = {
        account_id: auth.accountId,
        supplier_account_id: supplierId,
        supplier_sku: row.supplierSku,
        manufacturer_part_number: row.manufacturerPartNumber,
        name: row.name,
        brand: row.brand,
        category: row.category,
        purchase_unit: row.purchaseUnit,
        package_quantity: row.packageQuantity,
        currency: row.currency,
        tax_included: row.taxIncluded,
        product_url: row.productUrl,
        active: true,
        last_import_run_id: runId,
        updated_at: new Date().toISOString(),
      };
      if (row.price !== null) {
        productValues.last_price = row.price;
        productValues.last_price_at = new Date().toISOString();
      }
      let productId = existing.data?.id;
      if (productId) {
        const updated = await admin.from("supplier_products").update(productValues).eq("id", productId);
        if (updated.error) throw updated.error;
        updatedCount++;
      } else {
        const inserted = await admin.from("supplier_products").insert(productValues).select("id").single();
        if (inserted.error) throw inserted.error;
        productId = inserted.data.id;
        createdCount++;
      }
      if (row.price !== null) {
        const snapshot = await admin.from("supplier_price_snapshots").insert({
          account_id: auth.accountId,
          supplier_product_id: productId,
          import_run_id: runId,
          unit_price: row.price,
          price_basis_quantity: row.packageQuantity,
          currency: row.currency,
          tax_included: row.taxIncluded,
          source_label: text(body.sourceFilename, 300),
        });
        if (snapshot.error) throw snapshot.error;
      }
    }
    await admin.from("supplier_import_runs").update({
      status: "completed",
      rows_created: createdCount,
      rows_updated: updatedCount,
      rows_skipped: skippedCount,
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    return json({ importRunId: runId, supplierAccountId: supplierId, created: createdCount, updated: updatedCount, skipped: skippedCount });
  } catch (error) {
    await admin.from("supplier_import_runs").update({
      status: "failed",
      rows_created: createdCount,
      rows_updated: updatedCount,
      rows_skipped: skippedCount,
      error_message: text(error instanceof Error ? error.message : error, 1000),
      completed_at: new Date().toISOString(),
    }).eq("id", runId);
    throw error;
  }
}

async function listCatalog(req: Request, body: Record<string, unknown>) {
  const auth = await requireAccountPermissionWithDefault(req, body.accountId, ACCOUNT_PERMISSION.ITEMS_PRICING_READ);
  const admin = serviceClient();
  const [suppliers, products, components, imports] = await Promise.all([
    admin.from("supplier_accounts").select("*").eq("account_id", auth.accountId).order("display_name"),
    admin.from("supplier_products").select("*").eq("account_id", auth.accountId).eq("active", true).order("name").limit(5000),
    admin.from("saved_item_material_components").select("*").eq("account_id", auth.accountId).eq("active", true).order("sort_order"),
    admin.from("supplier_import_runs").select("id,supplier_account_id,source_type,source_filename,status,rows_received,rows_created,rows_updated,rows_skipped,created_at,completed_at")
      .eq("account_id", auth.accountId).order("created_at", { ascending: false }).limit(20),
  ]);
  const error = suppliers.error || products.error || components.error || imports.error;
  if (error) throw error;
  return json({ suppliers: suppliers.data || [], products: products.data || [], components: components.data || [], imports: imports.data || [] });
}

function normalizeComponent(input: Record<string, unknown>, sortOrder: number) {
  const productId = text(input.supplierProductId ?? input.supplier_product_id, 36);
  return {
    supplier_product_id: /^[0-9a-f-]{36}$/i.test(productId) ? productId : null,
    material_name: text(input.materialName ?? input.material_name, 500),
    unit: text(input.unit || "each", 80) || "each",
    fixed_quantity: Math.max(0, finite(input.fixedQuantity ?? input.fixed_quantity, 0)),
    per_item_quantity: Math.max(0, finite(input.perItemQuantity ?? input.per_item_quantity, 0)),
    waste_percent: Math.min(1000, Math.max(0, finite(input.wastePercent ?? input.waste_percent, 0))),
    minimum_quantity: Math.max(0, finite(input.minimumQuantity ?? input.minimum_quantity, 0)),
    package_quantity: Math.max(0.0001, finite(input.packageQuantity ?? input.package_quantity, 1)),
    rounding_mode: String(input.roundingMode ?? input.rounding_mode) === "none" ? "none" : "ceil_packages",
    manual_unit_cost: optionalPrice(input.manualUnitCost ?? input.manual_unit_cost),
    sort_order: sortOrder,
    active: true,
    metadata: input.metadata && typeof input.metadata === "object" ? input.metadata : {},
  };
}

async function saveRecipe(req: Request, body: Record<string, unknown>) {
  const auth = await requireAccountPermissionWithDefault(req, body.accountId, ACCOUNT_PERMISSION.ITEMS_MANAGE);
  await requireAccountPermissionWithDefault(req, auth.accountId, ACCOUNT_PERMISSION.ITEMS_PRICING_READ);
  const savedItemId = text(body.savedItemId, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(savedItemId)) {
    return json({ error: "A stable saved item ID is required", code: "invalid_saved_item" }, 400);
  }
  const components = Array.isArray(body.components)
    ? body.components.slice(0, 200).map((component, index) => normalizeComponent((component || {}) as Record<string, unknown>, index))
    : [];
  const productIds = components.map((component) => component.supplier_product_id).filter(Boolean);
  const admin = serviceClient();
  if (productIds.length) {
    const owned = await admin.from("supplier_products").select("id").eq("account_id", auth.accountId).in("id", productIds);
    if (owned.error) throw owned.error;
    if ((owned.data || []).length !== new Set(productIds).size) return json({ error: "One or more supplier products are unavailable", code: "invalid_product" }, 409);
  }
  const existing = await admin.from("saved_item_material_components").select("id")
    .eq("account_id", auth.accountId).eq("saved_item_id", savedItemId);
  if (existing.error) throw existing.error;
  let insertedIds: string[] = [];
  if (components.length) {
    const inserted = await admin.from("saved_item_material_components").insert(components.map((component) => ({
      ...component,
      account_id: auth.accountId,
      saved_item_id: savedItemId,
    }))).select("id");
    if (inserted.error) throw inserted.error;
    insertedIds = (inserted.data || []).map((row) => row.id);
  }
  const existingIds = (existing.data || []).map((row) => row.id);
  if (existingIds.length) {
    const removed = await admin.from("saved_item_material_components").delete()
      .eq("account_id", auth.accountId).in("id", existingIds);
    if (removed.error) {
      if (insertedIds.length) await admin.from("saved_item_material_components").delete().eq("account_id", auth.accountId).in("id", insertedIds);
      throw removed.error;
    }
  }
  return json({ savedItemId, componentCount: components.length });
}

function calculateComponent(component: Record<string, unknown>, itemQuantity: number, product?: Record<string, unknown>) {
  const raw = Math.max(0, finite(component.fixed_quantity)) + Math.max(0, finite(component.per_item_quantity)) * Math.max(0, itemQuantity);
  const withWaste = raw * (1 + Math.max(0, finite(component.waste_percent)) / 100);
  const required = Math.max(withWaste, Math.max(0, finite(component.minimum_quantity)));
  const packageQuantity = Math.max(0.0001, finite(component.package_quantity, finite(product?.package_quantity, 1)));
  const purchased = component.rounding_mode === "none" ? required : Math.ceil(required / packageQuantity) * packageQuantity;
  const unitPrice = optionalPrice(product?.last_price ?? component.manual_unit_cost) ?? 0;
  const priceBasis = Math.max(0.0001, finite(product?.package_quantity, packageQuantity));
  return {
    componentId: component.id,
    supplierProductId: component.supplier_product_id,
    materialName: product?.name || component.material_name || "Material",
    supplierSku: product?.supplier_sku || "",
    unit: product?.purchase_unit || component.unit || "each",
    requiredQuantity: Math.round(required * 10000) / 10000,
    purchasedQuantity: Math.round(purchased * 10000) / 10000,
    packageQuantity,
    packageCount: Math.ceil(purchased / packageQuantity),
    unitPrice,
    extendedCost: Math.round((purchased / priceBasis) * unitPrice * 100) / 100,
    currency: product?.currency || "CAD",
    priceCapturedAt: product?.last_price_at || null,
    productUrl: product?.product_url || "",
    missingPrice: unitPrice <= 0,
    fixedQuantity: Math.max(0, finite(component.fixed_quantity)),
    perItemQuantity: Math.max(0, finite(component.per_item_quantity)),
    wastePercent: Math.max(0, finite(component.waste_percent)),
    minimumQuantity: Math.max(0, finite(component.minimum_quantity)),
    roundingMode: component.rounding_mode === "none" ? "none" : "ceil_packages",
  };
}

async function calculateRecipe(req: Request, body: Record<string, unknown>) {
  const auth = await requireAccountPermissionWithDefault(req, body.accountId, ACCOUNT_PERMISSION.ITEMS_PRICING_READ);
  const savedItemId = text(body.savedItemId, 36);
  const itemQuantity = Math.max(0, finite(body.itemQuantity, 1));
  const admin = serviceClient();
  const components = await admin.from("saved_item_material_components").select("*")
    .eq("account_id", auth.accountId).eq("saved_item_id", savedItemId).eq("active", true).order("sort_order");
  if (components.error) throw components.error;
  const productIds = (components.data || []).map((component) => component.supplier_product_id).filter(Boolean);
  const products = productIds.length
    ? await admin.from("supplier_products").select("*").eq("account_id", auth.accountId).in("id", productIds)
    : { data: [], error: null };
  if (products.error) throw products.error;
  const byId = new Map((products.data || []).map((product) => [product.id, product]));
  const lines = (components.data || []).map((component) => calculateComponent(component, itemQuantity, byId.get(component.supplier_product_id)));
  return json({ savedItemId, itemQuantity, lines, totalCost: Math.round(lines.reduce((sum, line) => sum + line.extendedCost, 0) * 100) / 100, calculatedAt: new Date().toISOString() });
}

async function reviewPriceChanges(req: Request, body: Record<string, unknown>) {
  const auth = await requireAccountPermissionWithDefault(req, body.accountId, ACCOUNT_PERMISSION.ITEMS_PRICING_READ);
  const snapshots = Array.isArray(body.snapshots) ? body.snapshots.slice(0, 5000) : [];
  const ids = snapshots.map((row: any) => text(row?.supplierProductId, 36)).filter(Boolean);
  if (!ids.length) return json({ changes: [] });
  const products = await serviceClient().from("supplier_products").select("id,name,last_price,last_price_at,currency")
    .eq("account_id", auth.accountId).in("id", ids);
  if (products.error) throw products.error;
  const cached = new Map<string, Set<number>>();
  for (const row of snapshots as any[]) {
    const productId = text(row?.supplierProductId, 36);
    const oldPrice = optionalPrice(row?.unitPrice);
    if (!productId || oldPrice === null) continue;
    if (!cached.has(productId)) cached.set(productId, new Set());
    cached.get(productId)?.add(oldPrice);
  }
  const changes = (products.data || []).flatMap((product) => {
    const newPrice = optionalPrice(product.last_price);
    return Array.from(cached.get(product.id) || []).filter((oldPrice) => newPrice !== oldPrice).map((oldPrice) => ({
      supplierProductId: product.id,
      name: product.name,
      oldPrice,
      newPrice,
      priceCapturedAt: product.last_price_at,
      currency: product.currency,
    }));
  });
  return json({ changes });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const body = await req.json() as Record<string, unknown>;
    const action = text(body.action, 60);
    if (action === "previewImport") return await previewImport(req, body);
    if (action === "commitImport") return await commitImport(req, body);
    if (action === "listCatalog") return await listCatalog(req, body);
    if (action === "saveRecipe") return await saveRecipe(req, body);
    if (action === "calculateRecipe" || action === "applyPriceRefresh") return await calculateRecipe(req, body);
    if (action === "reviewPriceChanges") return await reviewPriceChanges(req, body);
    return json({ error: "Unsupported action", code: "unsupported_action" }, 400);
  } catch (error) {
    if (error instanceof AccountAccessError) return json({ error: error.message, code: error.code }, error.status);
    if (error instanceof AiGuardError) {
      return aiGuardErrorResponse(error, corsHeaders);
    }
    console.error("supplier-materials", error);
    return json({ error: "Supplier materials request failed", detail: text((error as Error)?.message, 500) }, 500);
  }
});
