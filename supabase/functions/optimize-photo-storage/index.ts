import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PHOTO_BUCKET = "item-full-res-photos";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isEmbeddedImage(value: unknown): value is string {
  return typeof value === "string" && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value);
}

function dataUrlBytes(dataUrl: string) {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const mimeType = header.match(/^data:([^;]+)/i)?.[1] || "image/jpeg";
  const binary = atob(dataUrl.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { bytes, mimeType };
}

async function sha256Hex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function extensionForMime(mimeType: string) {
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("gif")) return "gif";
  return "jpg";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Photo optimization is not configured");
    }

    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: authData, error: authError } = await authClient.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Authentication required" }, 401);

    const body = await req.json().catch(() => ({}));
    const cursor = Math.max(0, Number.parseInt(String(body.cursor ?? 0), 10) || 0);
    const batchSize = Math.max(1, Math.min(3, Number.parseInt(String(body.batchSize ?? 1), 10) || 1));
    const userId = authData.user.id;
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const publicBucket = admin.storage.from(PHOTO_BUCKET);
    const uploadCache = new Map<string, Promise<string>>();
    let migratedImages = 0;
    let bytesRemoved = 0;

    async function uploadEmbeddedPhoto(dataUrl: string) {
      if (!uploadCache.has(dataUrl)) {
        uploadCache.set(dataUrl, (async () => {
          const { bytes, mimeType } = dataUrlBytes(dataUrl);
          const hash = await sha256Hex(bytes);
          const path = `${userId}/thumbnails/${hash}.${extensionForMime(mimeType)}`;
          const { error } = await publicBucket.upload(path, bytes, {
            contentType: mimeType,
            cacheControl: "31536000",
            upsert: false,
          });
          if (error && Number((error as { statusCode?: number }).statusCode || 0) !== 409 && !/already exists|duplicate/i.test(error.message || "")) {
            throw error;
          }
          const publicUrl = publicBucket.getPublicUrl(path).data.publicUrl;
          if (!publicUrl) throw new Error("Photo storage did not return a public URL");
          return publicUrl;
        })());
      }
      const url = await uploadCache.get(dataUrl)!;
      migratedImages += 1;
      bytesRemoved += Math.max(0, dataUrl.length - url.length);
      return url;
    }

    async function migrateNode(node: unknown, parentKey = ""): Promise<void> {
      if (!node || typeof node !== "object") return;
      if (Array.isArray(node)) {
        for (let index = 0; index < node.length; index += 1) {
          if (parentKey.toLowerCase() === "photos" && isEmbeddedImage(node[index])) {
            node[index] = await uploadEmbeddedPhoto(node[index]);
          } else {
            await migrateNode(node[index], parentKey);
          }
        }
        return;
      }

      const record = node as Record<string, unknown>;
      for (const key of Object.keys(record)) {
        const value = record[key];
        if (key.toLowerCase() === "photo" && isEmbeddedImage(value)) {
          record[key] = await uploadEmbeddedPhoto(value);
        } else if (key === "items_snapshot" && typeof value === "string" && value.trim().startsWith("{")) {
          try {
            const parsed = JSON.parse(value);
            await migrateNode(parsed, key);
            record[key] = JSON.stringify(parsed);
          } catch {
            // A malformed backup remains untouched so the rest of the row can migrate.
          }
        } else {
          await migrateNode(value, key);
        }
      }
    }

    const { data: quotes, error: quoteError } = await admin
      .from("quotes")
      .select("id,data,updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(cursor, cursor + batchSize - 1);
    if (quoteError) throw quoteError;

    const failures: Array<{ table: string; id: string; error: string }> = [];
    let firstFailedOffset: number | null = null;
    let updatedRows = 0;
    for (let rowIndex = 0; rowIndex < (quotes || []).length; rowIndex += 1) {
      const row = (quotes || [])[rowIndex];
      try {
        const nextData = structuredClone(row.data || {});
        const before = migratedImages;
        await migrateNode(nextData);
        if (migratedImages > before) {
          const { error } = await admin.from("quotes").update({ data: nextData, updated_at: row.updated_at }).eq("id", row.id).eq("user_id", userId);
          if (error) throw error;
          updatedRows += 1;
        }
      } catch (error) {
        if (firstFailedOffset === null) firstFailedOffset = rowIndex;
        failures.push({ table: "quotes", id: row.id, error: error instanceof Error ? error.message : String(error) });
      }
    }

    if (cursor === 0) {
      const { data: itemRow, error: itemLoadError } = await admin.from("items").select("id,data,updated_at").eq("user_id", userId).maybeSingle();
      if (itemLoadError) {
        firstFailedOffset = 0;
        failures.push({ table: "items", id: userId, error: itemLoadError.message });
      } else if (itemRow) {
        try {
          const nextData = structuredClone(itemRow.data || {});
          const before = migratedImages;
          await migrateNode(nextData);
          if (migratedImages > before) {
            const { error } = await admin.from("items").update({ data: nextData, updated_at: itemRow.updated_at }).eq("id", itemRow.id).eq("user_id", userId);
            if (error) throw error;
            updatedRows += 1;
          }
        } catch (error) {
          firstFailedOffset = 0;
          failures.push({ table: "items", id: itemRow.id, error: error instanceof Error ? error.message : String(error) });
        }
      }
    }

    const processedRows = (quotes || []).length;
    const nextCursor = firstFailedOffset === null ? cursor + processedRows : cursor + firstFailedOffset;
    return json({
      cursor,
      nextCursor,
      batchSize,
      processedRows,
      updatedRows,
      migratedImages,
      bytesRemoved,
      failures,
      done: firstFailedOffset === null && processedRows < batchSize,
    });
  } catch (error) {
    console.error("optimize-photo-storage error:", error);
    return json({ error: error instanceof Error ? error.message : "Photo optimization failed" }, 400);
  }
});
