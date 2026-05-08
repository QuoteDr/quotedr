# Home Depot Price Sync Foundation

Built as a backend-first foundation that does not require approved affiliate feed credentials yet.

## What Is Ready

- Product catalog storage for Home Depot Canada or U.S.
- Feed run logs and price change history.
- User material item to Home Depot product mappings.
- Edge Function actions for feed ingest, material matching, link saving, and price update previews.
- Hidden operator page: `/home-depot-price-sync.html`.

## Why It Maps Saved Materials Instead Of Quote Rows

Mapping a quote line item row number to a Home Depot SKU is fragile because users can reorder rooms, copy quotes, regenerate AI line items, or edit rows manually.

This foundation maps Home Depot products to the user's saved material/pricing items instead:

- `item_category`
- `item_name`
- stable `item_key`
- Home Depot `sku` / `product_id` / `model_number`
- verified product URL and current material price

Quote rows then benefit naturally because most line items start from saved pricing items and carry `materialCost`.

## Hidden Test Page

Open:

`https://quotedr.io/home-depot-price-sync.html`

It is intentionally not linked in navigation.

The page can:

- Paste and ingest sample CSV feed data.
- Load saved `ald_custom_items` from the current browser.
- Ask the catalog for likely Home Depot matches.
- Save a verified Home Depot product link for a material item.
- Preview linked product price updates.
- Apply updates to local items and cloud item backup.

## Edge Function

Endpoint:

`https://axmoffknvblluibuitrq.supabase.co/functions/v1/hd-price-sync`

Actions:

- `ingestFeed`
- `matchMaterials`
- `saveLink`
- `syncMaterials`

## Required Supabase Secrets Before Real Feed Use

- `HD_PRICE_SYNC_ADMIN_TOKEN`
- `HD_PRODUCT_FEED_URL`
- `HD_AFFILIATE_TOKEN` if the feed requires bearer auth
- `HD_AFFILIATE_URL_TEMPLATE` once the affiliate link format is known

`ingestFeed` can also accept pasted `csvText`, so the catalog can be tested before affiliate approval.

## Sample Feed CSV

```csv
SKU,Price,InventoryStatus,ProductName,Category,Brand,Product URL
HD-BEHR-PAINT-5GAL,189.00,in_stock,BEHR Premium Plus Interior Paint 18.9 L,Paint,BEHR,https://www.homedepot.ca/product/sample-paint
HD-DRYWALL-4X8,18.25,in_stock,CGC Sheetrock Drywall Panel 1/2 in. x 4 ft. x 8 ft.,Drywall,CGC,https://www.homedepot.ca/product/sample-drywall
```

## Later UI Work

When the quote builder/manage-items files are quiet, fold the hidden page capabilities into Manage Items:

- Add "Find Home Depot Match" per material row.
- Add "Sync Home Depot Prices" for all saved material items.
- Preview price increases before applying.
- Store `hdSku` and `supplierUrl` on item rows.
- Gate the feature behind Pro when ready.
