// QuoteDr private supplier catalogues, material recipes, and job takeoffs.
(function(global) {
    'use strict';

    var state = {
        loaded: false,
        suppliers: [],
        products: [],
        components: [],
        imports: [],
        preview: null,
        previewMeta: null,
        activeTab: 'catalog',
        activeSavedItemId: '',
        recipeDraft: []
    };

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function number(value, fallback) {
        var parsed = parseFloat(value);
        return Number.isFinite(parsed) ? parsed : (fallback || 0);
    }

    function money(value, currency) {
        try {
            return new Intl.NumberFormat('en-CA', { style: 'currency', currency: currency || 'CAD' }).format(number(value, 0));
        } catch (_) {
            return '$' + number(value, 0).toFixed(2);
        }
    }

    function uuid() {
        if (global.crypto && typeof global.crypto.randomUUID === 'function') return global.crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 3 | 8)).toString(16);
        });
    }

    function itemDatabase() {
        try {
            var parsed = JSON.parse(localStorage.getItem('ald_custom_items') || '{}');
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    function itemEntries() {
        var entries = [];
        var db = itemDatabase();
        Object.keys(db).forEach(function(category) {
            if (category.indexOf('__') === 0 || !Array.isArray(db[category])) return;
            db[category].forEach(function(item) {
                if (item && item.name) entries.push({ category: category, item: item });
            });
        });
        return entries;
    }

    async function persistItemDatabase(db) {
        localStorage.setItem('ald_custom_items', JSON.stringify(db));
        localStorage.setItem('ald_custom_items_updated_at', new Date().toISOString());
        if (typeof global.loadCustomItems === 'function') global.loadCustomItems();
        if (typeof global.updatePricingOptions === 'function') global.updatePricingOptions();
        var save = global._doBackupItemsToCloud || global.backupItemsToCloud;
        if (typeof save === 'function') {
            var result = await save(db);
            if (result && result.error) throw result.error;
        }
    }

    async function ensureStableItemIds() {
        var db = itemDatabase();
        var changed = false;
        Object.keys(db).forEach(function(category) {
            if (!Array.isArray(db[category])) return;
            db[category].forEach(function(item) {
                if (!item || !item.name) return;
                if (!/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(item.savedItemId || ''))) {
                    item.savedItemId = uuid();
                    changed = true;
                }
            });
        });
        if (changed) await persistItemDatabase(db);
        return db;
    }

    function activeAccountId() {
        var account = global.QuoteDrAccount && global.QuoteDrAccount.active && global.QuoteDrAccount.active();
        return account && account.accountId || '';
    }

    async function api(action, payload) {
        if (global.QuoteDrAccount && typeof global.QuoteDrAccount.init === 'function') await global.QuoteDrAccount.init();
        var accountId = activeAccountId();
        if (!accountId) throw new Error('Account access is not ready. Please sign in again.');
        var client = global._supabaseClient || global._supabase;
        if (!client || !client.functions) throw new Error('Supplier sync is unavailable until QuoteDr connects to the cloud.');
        var result = await client.functions.invoke('supplier-materials', {
            body: Object.assign({}, payload || {}, { action: action, accountId: accountId })
        });
        if (result.error) {
            var detail = result.error.message || 'Supplier materials request failed';
            try {
                if (result.error.context && typeof result.error.context.json === 'function') {
                    var body = await result.error.context.json();
                    detail = body && (body.detail || body.error) || detail;
                }
            } catch (_) {}
            throw new Error(detail);
        }
        if (result.data && result.data.error) throw new Error(result.data.detail || result.data.error);
        return result.data || {};
    }

    async function loadCatalog(force) {
        if (state.loaded && !force) return state;
        var data = await api('listCatalog');
        state.suppliers = data.suppliers || [];
        state.products = data.products || [];
        state.components = data.components || [];
        state.imports = data.imports || [];
        state.loaded = true;
        return state;
    }

    function supplierForProduct(product) {
        return state.suppliers.find(function(supplier) { return supplier.id === product.supplier_account_id; }) || {};
    }

    function productById(id) {
        return state.products.find(function(product) { return product.id === id; }) || null;
    }

    function componentsForItem(savedItemId) {
        return state.components.filter(function(component) { return component.saved_item_id === savedItemId && component.active !== false; });
    }

    function findSavedItem(savedItemId) {
        var found = null;
        itemEntries().some(function(entry) {
            if (entry.item.savedItemId === savedItemId) {
                found = entry;
                return true;
            }
            return false;
        });
        return found;
    }

    function ensureStyles() {
        if (document.getElementById('supplierMaterialsStyles')) return;
        var style = document.createElement('style');
        style.id = 'supplierMaterialsStyles';
        style.textContent = [
            '#supplierMaterialsModal .modal-dialog{max-width:96vw;width:1500px}',
            '#supplierMaterialsModal .modal-body{min-height:68vh}',
            '.sm-tab-pane{display:none}.sm-tab-pane.active{display:block}',
            '.sm-stat{border:1px solid #d9e3f0;border-radius:10px;padding:12px;background:#f8fbff}',
            '.sm-catalog-table td,.sm-catalog-table th{vertical-align:middle;font-size:.86rem}',
            '.sm-recipe-row{border:1px solid #d8e2ef;border-radius:10px;padding:10px;margin-bottom:8px;background:#fff}',
            '.sm-takeoff-group{border:1px solid #d8e2ef;border-radius:10px;margin-bottom:12px;overflow:hidden}',
            '.sm-takeoff-heading{background:#eef4fb;padding:9px 12px;font-weight:700;color:#174d86}',
            '.sm-price-up{color:#b42318}.sm-price-down{color:#087443}',
            '.sm-private-banner{background:#fff8e1;border:1px solid #f0cd6c;border-radius:8px;padding:9px 12px}',
            '@media(max-width:768px){#supplierMaterialsModal .modal-dialog{max-width:100vw;width:100%;margin:0}#supplierMaterialsModal .modal-content{min-height:100vh;border-radius:0}.sm-wide-table{min-width:920px}}'
        ].join('');
        document.head.appendChild(style);
    }

    function ensureModal() {
        ensureStyles();
        var modal = document.getElementById('supplierMaterialsModal');
        if (modal) return modal;
        modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'supplierMaterialsModal';
        modal.tabIndex = -1;
        modal.innerHTML = '<div class="modal-dialog modal-dialog-scrollable"><div class="modal-content">' +
            '<div class="modal-header bg-primary text-white"><div><h4 class="modal-title mb-0"><i class="fas fa-boxes-stacked me-2"></i>Materials & Supplier Pricing <span class="badge bg-warning text-dark ms-2">Beta</span></h4><div class="small opacity-75">Private catalogues, reusable recipes, and job takeoffs</div></div><button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button></div>' +
            '<div class="modal-body"><div class="sm-private-banner mb-3"><i class="fas fa-lock me-2"></i><strong>Contractor-only information.</strong> Supplier prices, recipes, links, and takeoffs are removed from every client document.</div>' +
            '<ul class="nav nav-tabs mb-3" id="supplierMaterialsTabs">' +
            '<li class="nav-item"><button class="nav-link active" data-sm-tab="catalog"><i class="fas fa-database me-1"></i>Catalogue</button></li>' +
            '<li class="nav-item"><button class="nav-link" data-sm-tab="import"><i class="fas fa-file-import me-1"></i>Import Prices</button></li>' +
            '<li class="nav-item"><button class="nav-link" data-sm-tab="recipes"><i class="fas fa-layer-group me-1"></i>Task Recipes</button></li>' +
            '<li class="nav-item"><button class="nav-link" data-sm-tab="takeoff"><i class="fas fa-clipboard-list me-1"></i>This Quote Takeoff</button></li>' +
            '</ul>' +
            '<div id="smCatalogPane" class="sm-tab-pane active"></div><div id="smImportPane" class="sm-tab-pane"></div><div id="smRecipesPane" class="sm-tab-pane"></div><div id="smTakeoffPane" class="sm-tab-pane"></div></div>' +
            '<div class="modal-footer"><span class="me-auto small text-muted" id="smFooterStatus"></span><button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button></div></div></div>';
        document.body.appendChild(modal);
        modal.querySelectorAll('[data-sm-tab]').forEach(function(button) {
            button.addEventListener('click', function() { switchTab(button.dataset.smTab); });
        });
        return modal;
    }

    function setStatus(message, type) {
        var el = document.getElementById('smFooterStatus');
        if (!el) return;
        el.className = 'me-auto small ' + (type === 'error' ? 'text-danger' : type === 'success' ? 'text-success' : 'text-muted');
        el.textContent = message || '';
    }

    function renderCatalog() {
        var pane = document.getElementById('smCatalogPane');
        if (!pane) return;
        var priced = state.products.filter(function(product) { return number(product.last_price) > 0; }).length;
        var html = '<div class="row g-2 mb-3"><div class="col-md-3"><div class="sm-stat"><div class="small text-muted">Suppliers</div><strong class="fs-4">' + state.suppliers.length + '</strong></div></div>' +
            '<div class="col-md-3"><div class="sm-stat"><div class="small text-muted">Products</div><strong class="fs-4">' + state.products.length + '</strong></div></div>' +
            '<div class="col-md-3"><div class="sm-stat"><div class="small text-muted">Current prices</div><strong class="fs-4">' + priced + '</strong></div></div>' +
            '<div class="col-md-3"><div class="sm-stat"><div class="small text-muted">Task recipes</div><strong class="fs-4">' + new Set(state.components.map(function(c) { return c.saved_item_id; })).size + '</strong></div></div></div>' +
            '<div class="d-flex gap-2 flex-wrap mb-3"><input id="smCatalogSearch" class="form-control" style="max-width:440px" placeholder="Search product, SKU, brand, category, or supplier..."><button class="btn btn-outline-primary" onclick="QuoteDrSupplierMaterials.reviewPriceChanges()"><i class="fas fa-arrows-rotate me-1"></i>Review Price Changes</button><button class="btn btn-primary" onclick="QuoteDrSupplierMaterials.switchTab(\'import\')"><i class="fas fa-file-import me-1"></i>Import Supplier List</button></div>' +
            '<div class="table-responsive"><table class="table table-hover sm-catalog-table sm-wide-table"><thead><tr><th>Supplier</th><th>SKU / Part #</th><th>Product</th><th>Purchase unit</th><th>Account price</th><th>Updated</th></tr></thead><tbody id="smCatalogRows"></tbody></table></div>' +
            '<div class="small text-muted">Prices are private to this QuoteDr account. A product name match alone never overwrites a price.</div>';
        pane.innerHTML = html;
        var search = document.getElementById('smCatalogSearch');
        if (search) search.addEventListener('input', renderCatalogRows);
        renderCatalogRows();
    }

    function renderCatalogRows() {
        var body = document.getElementById('smCatalogRows');
        if (!body) return;
        var query = String(document.getElementById('smCatalogSearch')?.value || '').trim().toLowerCase();
        var products = state.products.filter(function(product) {
            var supplier = supplierForProduct(product);
            return !query || [supplier.display_name, supplier.branch_label, product.supplier_sku, product.manufacturer_part_number, product.name, product.brand, product.category].join(' ').toLowerCase().includes(query);
        }).slice(0, 500);
        body.innerHTML = products.length ? products.map(function(product) {
            var supplier = supplierForProduct(product);
            var code = product.supplier_sku || product.manufacturer_part_number;
            var updated = product.last_price_at ? new Date(product.last_price_at).toLocaleDateString() : 'No price';
            return '<tr><td><strong>' + escapeHtml(supplier.display_name || 'Supplier') + '</strong><div class="small text-muted">' + escapeHtml(supplier.branch_label || '') + '</div></td>' +
                '<td><code>' + escapeHtml(code) + '</code></td><td><strong>' + escapeHtml(product.name) + '</strong><div class="small text-muted">' + escapeHtml([product.brand, product.category].filter(Boolean).join(' · ')) + '</div></td>' +
                '<td>' + escapeHtml(product.purchase_unit || 'each') + '<div class="small text-muted">Pack: ' + number(product.package_quantity, 1) + '</div></td>' +
                '<td><strong>' + (product.last_price == null ? 'Missing' : money(product.last_price, product.currency)) + '</strong>' + (product.tax_included == null ? '<div class="small text-warning">Tax treatment unknown</div>' : '') + '</td><td>' + escapeHtml(updated) + '</td></tr>';
        }).join('') : '<tr><td colspan="6" class="text-center text-muted py-4">No supplier products found. Import a CSV, Excel file, PDF price list, quote, or invoice.</td></tr>';
    }

    function renderImport() {
        var pane = document.getElementById('smImportPane');
        if (!pane) return;
        pane.innerHTML = '<div class="row g-3"><div class="col-lg-4"><div class="card h-100"><div class="card-body">' +
            '<h5>1. Choose the supplier</h5><label class="form-label">Supplier name</label><input id="smSupplierName" class="form-control mb-2" placeholder="e.g., City Electric Supply">' +
            '<label class="form-label">Account / branch label <span class="text-muted">(optional)</span></label><input id="smSupplierBranch" class="form-control mb-3" placeholder="e.g., Hamilton branch">' +
            '<h5>2. Upload their list</h5><input id="smSupplierFile" type="file" class="form-control mb-2" accept=".csv,.tsv,.xlsx,.xls,.pdf,.txt">' +
            '<div class="small text-muted mb-2">CSV and Excel give the cleanest results. Selectable PDFs, supplier quotes, and invoices can also be mapped. Passwords and browser sessions are never collected.</div>' +
            '<div class="alert alert-info small py-2">Structured tables are mapped directly. Irregular or scanned documents use QuoteDr\'s AI mapping service. Remove payment details and unrelated customer information before uploading.</div>' +
            '<button class="btn btn-primary w-100" onclick="QuoteDrSupplierMaterials.previewImport()"><i class="fas fa-wand-magic-sparkles me-1"></i>Map & Preview</button></div></div></div>' +
            '<div class="col-lg-8"><div id="smImportPreview"><div class="alert alert-light border">Nothing is saved until you review the mapped products and click <strong>Import Selected Prices</strong>.</div></div></div></div>';
        if (state.preview) renderImportPreview();
    }

    function splitDelimitedLine(line, delimiter) {
        var out = [], current = '', quoted = false;
        for (var i = 0; i < line.length; i++) {
            var ch = line[i];
            if (ch === '"') {
                if (quoted && line[i + 1] === '"') { current += '"'; i++; }
                else quoted = !quoted;
            } else if (ch === delimiter && !quoted) { out.push(current.trim()); current = ''; }
            else current += ch;
        }
        out.push(current.trim());
        return out;
    }

    function normalizedHeader(value) {
        return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
    }

    function parseStructuredRows(sourceText) {
        var lines = String(sourceText || '').split(/\r?\n/).map(function(line) { return line.trim(); }).filter(function(line) { return line && !/^---\s*SHEET:/i.test(line); });
        if (lines.length < 2) return [];
        var sample = lines.slice(0, 6).join('\n');
        var delimiters = ['\t', ',', ';', '|'];
        var delimiter = delimiters.map(function(value) { return { value: value, count: sample.split(value).length - 1 }; }).sort(function(a, b) { return b.count - a.count; })[0];
        if (!delimiter || delimiter.count < 2) return [];
        var rows = lines.map(function(line) { return splitDelimitedLine(line, delimiter.value); });
        var aliases = {
            supplierSku: ['sku','itemnumber','itemno','productcode','cataloguenumber','catalognumber','cesnumber'],
            manufacturerPartNumber: ['manufacturerpartnumber','manufacturerpart','mpn','partnumber','partno'],
            name: ['name','product','productname','item','itemname','description'],
            brand: ['brand','manufacturer','make'], category: ['category','department','group'],
            purchaseUnit: ['unit','uom','purchaseunit','unitofmeasure'], packageQuantity: ['packagequantity','packquantity','packsize','caseqty','qtyperpack'],
            price: ['price','unitprice','accountprice','tradeprice','netprice','cost','yourprice'], currency: ['currency'], taxIncluded: ['taxincluded','includestax'], productUrl: ['url','producturl','link']
        };
        var headerIndex = -1, map = {};
        rows.slice(0, 12).some(function(row, rowIndex) {
            var candidate = {};
            row.forEach(function(cell, colIndex) {
                var normalized = normalizedHeader(cell);
                Object.keys(aliases).forEach(function(key) {
                    if (aliases[key].includes(normalized) && candidate[key] == null) candidate[key] = colIndex;
                });
            });
            if (candidate.name != null && (candidate.supplierSku != null || candidate.manufacturerPartNumber != null)) {
                headerIndex = rowIndex; map = candidate; return true;
            }
            return false;
        });
        if (headerIndex < 0) return [];
        return rows.slice(headerIndex + 1).map(function(row) {
            var product = {};
            Object.keys(map).forEach(function(key) { product[key] = row[map[key]] || ''; });
            product.packageQuantity = number(product.packageQuantity, 1);
            product.price = String(product.price || '').replace(/[$,\s]/g, '');
            product.currency = product.currency || 'CAD';
            return product;
        }).filter(function(row) { return row.name && (row.supplierSku || row.manufacturerPartNumber); });
    }

    async function sha256(value) {
        if (!global.crypto || !global.crypto.subtle) return '';
        var bytes = new TextEncoder().encode(String(value || ''));
        var hash = await global.crypto.subtle.digest('SHA-256', bytes);
        return Array.from(new Uint8Array(hash)).map(function(byte) { return byte.toString(16).padStart(2, '0'); }).join('');
    }

    async function sha256File(file) {
        if (file && global.crypto && global.crypto.subtle && typeof file.arrayBuffer === 'function') {
            var hash = await global.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
            return Array.from(new Uint8Array(hash)).map(function(byte) { return byte.toString(16).padStart(2, '0'); }).join('');
        }
        return sha256((file && file.name || '') + ':' + (file && file.size || 0));
    }

    async function previewImport() {
        var supplierName = String(document.getElementById('smSupplierName')?.value || '').trim();
        var branchLabel = String(document.getElementById('smSupplierBranch')?.value || '').trim();
        var file = document.getElementById('smSupplierFile')?.files?.[0];
        if (!supplierName || !file) {
            setStatus('Choose a supplier name and file first.', 'error');
            return;
        }
        setStatus('Reading and mapping ' + file.name + '...');
        var previewEl = document.getElementById('smImportPreview');
        if (previewEl) previewEl.innerHTML = '<div class="text-center py-5"><span class="spinner-border text-primary"></span><div class="mt-2">Mapping products and account prices...</div></div>';
        try {
            var extracted = global.QuoteDrQuoteImport && global.QuoteDrQuoteImport.extractFileText
                ? await global.QuoteDrQuoteImport.extractFileText(file)
                : { text: await file.text(), images: [], type: file.name.split('.').pop().toLowerCase() };
            var rows = parseStructuredRows(extracted.text || '');
            var payload = {
                supplierName: supplierName,
                supplierKey: supplierName,
                branchLabel: branchLabel,
                rows: rows,
                sourceText: rows.length ? '' : String(extracted.text || '').slice(0, 100000),
                sourceImages: rows.length ? [] : (extracted.images || []).slice(0, 4)
            };
            var result = await api('previewImport', payload);
            state.preview = result;
            state.previewMeta = {
                supplierName: supplierName, branchLabel: branchLabel, sourceFilename: file.name,
                sourceType: extracted.type || file.name.split('.').pop().toLowerCase(),
                sourceSha256: await sha256File(file)
            };
            renderImportPreview();
            setStatus('Preview ready. Nothing has been saved yet.', 'success');
        } catch (error) {
            if (previewEl) previewEl.innerHTML = '<div class="alert alert-danger"><strong>Could not map this file.</strong><div>' + escapeHtml(error.message || error) + '</div><div class="small mt-2">For the cleanest import, ask the supplier for CSV or Excel with SKU, description, unit, package size, and account price columns.</div></div>';
            setStatus(error.message || String(error), 'error');
        }
    }

    function renderImportPreview() {
        var container = document.getElementById('smImportPreview');
        if (!container || !state.preview) return;
        var rows = state.preview.rows || [];
        var summary = state.preview.summary || {};
        container.innerHTML = '<div class="row g-2 mb-2"><div class="col-4"><div class="sm-stat"><strong>' + (summary.received || rows.length) + '</strong><div class="small text-muted">Mapped</div></div></div><div class="col-4"><div class="sm-stat"><strong>' + (summary.creates || 0) + '</strong><div class="small text-muted">New</div></div></div><div class="col-4"><div class="sm-stat"><strong>' + (summary.priceChanges || 0) + '</strong><div class="small text-muted">Price changes</div></div></div></div>' +
            '<div class="table-responsive" style="max-height:52vh"><table class="table table-sm sm-wide-table"><thead class="sticky-top bg-white"><tr><th><input id="smPreviewSelectAll" type="checkbox" checked></th><th>SKU / Part #</th><th>Product</th><th>Unit / Pack</th><th>Old price</th><th>Imported price</th><th>Action</th></tr></thead><tbody>' +
            rows.map(function(row, index) {
                var changeClass = row.priceChanged ? (number(row.price) > number(row.oldPrice) ? 'sm-price-up' : 'sm-price-down') : '';
                return '<tr><td><input class="sm-preview-row" type="checkbox" data-index="' + index + '" checked></td><td><code>' + escapeHtml(row.supplierSku || row.manufacturerPartNumber) + '</code></td><td><strong>' + escapeHtml(row.name) + '</strong><div class="small text-muted">' + escapeHtml([row.brand, row.category].filter(Boolean).join(' · ')) + '</div></td><td>' + escapeHtml(row.purchaseUnit) + ' / ' + number(row.packageQuantity, 1) + '</td><td>' + (row.oldPrice == null ? '—' : money(row.oldPrice, row.currency)) + '</td><td class="' + changeClass + '"><strong>' + (row.price == null ? 'Missing' : money(row.price, row.currency)) + '</strong></td><td><span class="badge ' + (row.status === 'create' ? 'bg-success' : 'bg-primary') + '">' + escapeHtml(row.status) + '</span></td></tr>';
            }).join('') + '</tbody></table></div>' +
            '<div class="alert alert-warning small"><i class="fas fa-triangle-exclamation me-1"></i>Importing updates the private master catalogue only. Existing quotes will not change until you review and apply price updates.</div>' +
            '<button class="btn btn-success" onclick="QuoteDrSupplierMaterials.commitImport()"><i class="fas fa-check me-1"></i>Import Selected Prices</button>';
        document.getElementById('smPreviewSelectAll')?.addEventListener('change', function(event) {
            document.querySelectorAll('.sm-preview-row').forEach(function(input) { input.checked = event.target.checked; });
        });
    }

    async function commitImport() {
        if (!state.preview || !state.previewMeta) return;
        var selected = Array.from(document.querySelectorAll('.sm-preview-row:checked')).map(function(input) {
            return state.preview.rows[number(input.dataset.index, -1)];
        }).filter(Boolean);
        if (!selected.length) { setStatus('Select at least one product to import.', 'error'); return; }
        setStatus('Saving ' + selected.length + ' private supplier prices...');
        try {
            var result = await api('commitImport', Object.assign({}, state.previewMeta, { rows: selected }));
            state.preview = null;
            state.previewMeta = null;
            await loadCatalog(true);
            renderAll();
            switchTab('catalog');
            setStatus(result.duplicate ? 'This exact file was already imported. No duplicate prices were created.' : 'Imported ' + result.created + ' new and updated ' + result.updated + ' products.', 'success');
        } catch (error) {
            setStatus(error.message || String(error), 'error');
        }
    }

    function savedItemOptions() {
        return itemEntries().map(function(entry) {
            return '<option value="' + escapeHtml(entry.item.savedItemId || '') + '">' + escapeHtml(entry.category + ' — ' + entry.item.name) + '</option>';
        }).join('');
    }

    function renderRecipes() {
        var pane = document.getElementById('smRecipesPane');
        if (!pane) return;
        var entries = itemEntries();
        if (!entries.length) {
            pane.innerHTML = '<div class="alert alert-info">Create a saved task in Manage Line Items first. A material recipe lives behind that task.</div>';
            return;
        }
        if (!state.activeSavedItemId || !findSavedItem(state.activeSavedItemId)) state.activeSavedItemId = entries[0].item.savedItemId;
        state.recipeDraft = componentsForItem(state.activeSavedItemId).map(function(component) {
            return {
                supplierProductId: component.supplier_product_id || '', materialName: component.material_name || '', unit: component.unit || 'each',
                fixedQuantity: number(component.fixed_quantity), perItemQuantity: number(component.per_item_quantity), wastePercent: number(component.waste_percent),
                minimumQuantity: number(component.minimum_quantity), packageQuantity: number(component.package_quantity, 1), roundingMode: component.rounding_mode || 'ceil_packages',
                manualUnitCost: component.manual_unit_cost == null ? '' : number(component.manual_unit_cost)
            };
        });
        pane.innerHTML = '<div class="row g-3"><div class="col-lg-3"><div class="card"><div class="card-body"><label class="form-label fw-bold">Saved task</label><select id="smRecipeItem" class="form-select mb-3">' + savedItemOptions() + '</select>' +
            '<div class="small text-muted">Example: one “Install receptacle” task can use one receptacle, one box, cable per receptacle, connectors, waste, and package rounding.</div></div></div></div>' +
            '<div class="col-lg-9"><div class="d-flex justify-content-between align-items-center gap-2 mb-2"><div><h5 class="mb-0">Material recipe</h5><div class="small text-muted">Fixed + per task unit, then waste, minimum, and package rounding.</div></div><button class="btn btn-outline-primary" onclick="QuoteDrSupplierMaterials.addRecipeRow()"><i class="fas fa-plus me-1"></i>Add Material</button></div><div id="smRecipeRows"></div><div class="d-flex justify-content-between align-items-center border-top pt-3"><div id="smRecipeEstimate" class="fw-bold"></div><button class="btn btn-success" onclick="QuoteDrSupplierMaterials.saveRecipe()"><i class="fas fa-save me-1"></i>Save Recipe</button></div></div></div>';
        var select = document.getElementById('smRecipeItem');
        select.value = state.activeSavedItemId;
        select.addEventListener('change', function() { state.activeSavedItemId = select.value; renderRecipes(); });
        renderRecipeRows();
    }

    function productOptions(selected) {
        return '<option value="">Manual / unlinked material</option>' + state.products.map(function(product) {
            var supplier = supplierForProduct(product);
            return '<option value="' + product.id + '" ' + (product.id === selected ? 'selected' : '') + '>' + escapeHtml((supplier.display_name || 'Supplier') + ' — ' + (product.supplier_sku || product.manufacturer_part_number) + ' — ' + product.name + ' — ' + (product.last_price == null ? 'No price' : money(product.last_price, product.currency))) + '</option>';
        }).join('');
    }

    function renderRecipeRows() {
        var container = document.getElementById('smRecipeRows');
        if (!container) return;
        container.innerHTML = state.recipeDraft.length ? state.recipeDraft.map(function(component, index) {
            return '<div class="sm-recipe-row" data-index="' + index + '"><div class="row g-2 align-items-end"><div class="col-lg-7"><label class="form-label small fw-bold">Supplier product</label><select class="form-select form-select-sm" data-field="supplierProductId">' + productOptions(component.supplierProductId) + '</select></div>' +
                '<div class="col-lg-4"><label class="form-label small fw-bold">Manual material name</label><input class="form-control form-control-sm" data-field="materialName" value="' + escapeHtml(component.materialName) + '" placeholder="Used when product is unlinked"></div><div class="col-lg-1 text-end"><button class="btn btn-sm btn-outline-danger" onclick="QuoteDrSupplierMaterials.removeRecipeRow(' + index + ')"><i class="fas fa-trash"></i></button></div>' +
                '<div class="col-md-2"><label class="form-label small">Unit</label><input class="form-control form-control-sm" data-field="unit" value="' + escapeHtml(component.unit) + '"></div><div class="col-md-2"><label class="form-label small">Fixed qty</label><input type="number" min="0" step="0.01" class="form-control form-control-sm" data-field="fixedQuantity" value="' + component.fixedQuantity + '"></div>' +
                '<div class="col-md-2"><label class="form-label small">Per task unit</label><input type="number" min="0" step="0.01" class="form-control form-control-sm" data-field="perItemQuantity" value="' + component.perItemQuantity + '"></div><div class="col-md-2"><label class="form-label small">Waste %</label><input type="number" min="0" step="0.1" class="form-control form-control-sm" data-field="wastePercent" value="' + component.wastePercent + '"></div>' +
                '<div class="col-md-2"><label class="form-label small">Minimum</label><input type="number" min="0" step="0.01" class="form-control form-control-sm" data-field="minimumQuantity" value="' + component.minimumQuantity + '"></div><div class="col-md-2"><label class="form-label small">Package qty</label><input type="number" min="0.0001" step="0.01" class="form-control form-control-sm" data-field="packageQuantity" value="' + component.packageQuantity + '"></div>' +
                '<div class="col-md-3"><label class="form-label small">Rounding</label><select class="form-select form-select-sm" data-field="roundingMode"><option value="ceil_packages" ' + (component.roundingMode !== 'none' ? 'selected' : '') + '>Round up to packages</option><option value="none" ' + (component.roundingMode === 'none' ? 'selected' : '') + '>No package rounding</option></select></div><div class="col-md-3"><label class="form-label small">Manual package cost</label><input type="number" min="0" step="0.01" class="form-control form-control-sm" data-field="manualUnitCost" value="' + escapeHtml(component.manualUnitCost) + '" placeholder="Only for unlinked material"></div></div></div>';
        }).join('') : '<div class="alert alert-light border">No recipe yet. Add the first material used by this task.</div>';
        container.querySelectorAll('input,select').forEach(function(control) {
            control.addEventListener('change', function() { readRecipeRows(); renderRecipeEstimate(); });
            control.addEventListener('input', function() { readRecipeRows(); renderRecipeEstimate(); });
        });
        renderRecipeEstimate();
    }

    function readRecipeRows() {
        document.querySelectorAll('#smRecipeRows .sm-recipe-row').forEach(function(row) {
            var component = state.recipeDraft[number(row.dataset.index, -1)];
            if (!component) return;
            row.querySelectorAll('[data-field]').forEach(function(input) {
                var field = input.dataset.field;
                component[field] = ['fixedQuantity','perItemQuantity','wastePercent','minimumQuantity','packageQuantity','manualUnitCost'].includes(field) ? (input.value === '' ? '' : number(input.value)) : input.value;
                if (field === 'supplierProductId' && input.value) {
                    var product = productById(input.value);
                    if (product) {
                        component.materialName = product.name;
                        component.unit = product.purchase_unit || component.unit;
                        component.packageQuantity = number(product.package_quantity, component.packageQuantity || 1);
                    }
                }
            });
        });
    }

    function calculateDraftComponent(component, itemQuantity, product, existingUnitPrice) {
        var raw = Math.max(0, number(component.fixedQuantity)) + Math.max(0, number(component.perItemQuantity)) * Math.max(0, number(itemQuantity));
        var required = Math.max(raw * (1 + Math.max(0, number(component.wastePercent)) / 100), Math.max(0, number(component.minimumQuantity)));
        var packageQty = Math.max(0.0001, number(component.packageQuantity, product && product.package_quantity || 1));
        var purchased = component.roundingMode === 'none' ? required : Math.ceil(required / packageQty) * packageQty;
        var unitPrice = existingUnitPrice == null ? number(product && product.last_price, number(component.manualUnitCost)) : number(existingUnitPrice);
        var priceBasis = Math.max(0.0001, number(product && product.package_quantity, packageQty));
        return { requiredQuantity: required, purchasedQuantity: purchased, packageQuantity: packageQty, packageCount: Math.ceil(purchased / packageQty), unitPrice: unitPrice, extendedCost: Math.round((purchased / priceBasis) * unitPrice * 100) / 100 };
    }

    function renderRecipeEstimate() {
        var el = document.getElementById('smRecipeEstimate');
        if (!el) return;
        var total = state.recipeDraft.reduce(function(sum, component) {
            return sum + calculateDraftComponent(component, 1, productById(component.supplierProductId)).extendedCost;
        }, 0);
        el.textContent = 'Estimated material cost for quantity 1: ' + money(total, 'CAD');
    }

    function addRecipeRow() {
        readRecipeRows();
        state.recipeDraft.push({ supplierProductId: '', materialName: '', unit: 'each', fixedQuantity: 0, perItemQuantity: 1, wastePercent: 0, minimumQuantity: 0, packageQuantity: 1, roundingMode: 'ceil_packages', manualUnitCost: '' });
        renderRecipeRows();
    }

    function removeRecipeRow(index) {
        readRecipeRows();
        state.recipeDraft.splice(index, 1);
        renderRecipeRows();
    }

    async function saveRecipe() {
        readRecipeRows();
        var invalid = state.recipeDraft.find(function(component) { return !component.supplierProductId && !String(component.materialName || '').trim(); });
        if (invalid) { setStatus('Every recipe row needs a supplier product or manual material name.', 'error'); return; }
        setStatus('Saving material recipe...');
        try {
            await api('saveRecipe', { savedItemId: state.activeSavedItemId, components: state.recipeDraft });
            await loadCatalog(true);
            var calculation = await api('calculateRecipe', { savedItemId: state.activeSavedItemId, itemQuantity: 1 });
            await updateSavedItemRecipeCache(state.activeSavedItemId, calculation);
            renderAll();
            switchTab('recipes');
            setStatus('Recipe saved. New quote lines will snapshot current supplier prices.', 'success');
        } catch (error) {
            setStatus(error.message || String(error), 'error');
        }
    }

    async function updateSavedItemRecipeCache(savedItemId, calculation) {
        var db = itemDatabase();
        var changed = false;
        Object.keys(db).forEach(function(category) {
            if (!Array.isArray(db[category])) return;
            db[category].forEach(function(item) {
                if (item.savedItemId !== savedItemId) return;
                item.materialRecipe = { version: 1, componentCount: (calculation.lines || []).length, updatedAt: calculation.calculatedAt || new Date().toISOString() };
                item.materialCost = number(calculation.totalCost);
                var links = (calculation.lines || []).map(function(line) { return line.productUrl; }).filter(Boolean);
                if (links.length === 1) item.supplierUrl = links[0];
                changed = true;
            });
        });
        if (changed) await persistItemDatabase(db);
    }

    function recalculateFrozenSnapshot(snapshot, itemQuantity) {
        var lines = (snapshot.lines || []).map(function(line) {
            var calculated = calculateDraftComponent({
                fixedQuantity: line.fixedQuantity, perItemQuantity: line.perItemQuantity, wastePercent: line.wastePercent,
                minimumQuantity: line.minimumQuantity, packageQuantity: line.packageQuantity, roundingMode: line.roundingMode
            }, itemQuantity, { package_quantity: line.packageQuantity }, line.unitPrice);
            return Object.assign({}, line, calculated);
        });
        return Object.assign({}, snapshot, { itemQuantity: itemQuantity, lines: lines, totalCost: Math.round(lines.reduce(function(sum, line) { return sum + number(line.extendedCost); }, 0) * 100) / 100, recalculatedAt: new Date().toISOString() });
    }

    function resolveSavedItemIdForQuoteItem(item) {
        var direct = item && (item.savedItemId || item.savedItemSource && item.savedItemSource.savedItemId);
        if (direct) return direct;
        var category = String(item && item.category || '').trim().toLowerCase();
        var name = String(item && (item.serviceName || item.description || item.name) || '').trim().toLowerCase();
        var match = itemEntries().find(function(entry) { return entry.category.toLowerCase() === category && String(entry.item.name || '').trim().toLowerCase() === name; });
        if (match && item) {
            if (!item.savedItemSource) item.savedItemSource = {};
            item.savedItemSource.savedItemId = match.item.savedItemId;
            return match.item.savedItemId;
        }
        return '';
    }

    async function attachSnapshotToItem(item, options) {
        options = options || {};
        var savedItemId = resolveSavedItemIdForQuoteItem(item);
        if (!savedItemId) return item;
        if (!state.loaded) {
            try { await loadCatalog(); }
            catch (error) {
                console.warn('QuoteDr supplier materials could not load while adding a line item:', error);
                return item;
            }
        }
        if (!componentsForItem(savedItemId).length) return item;
        var quantity = Math.max(0, number(item.quantity, 1));
        var snapshot = item.materialTakeoffSnapshot;
        if (snapshot && snapshot.savedItemId === savedItemId && options.refreshPrices !== true) {
            snapshot = recalculateFrozenSnapshot(snapshot, quantity);
        } else {
            var calculation = await api(options.refreshPrices ? 'applyPriceRefresh' : 'calculateRecipe', { savedItemId: savedItemId, itemQuantity: quantity });
            snapshot = {
                version: 1, savedItemId: savedItemId, itemQuantity: quantity,
                lines: calculation.lines || [], totalCost: number(calculation.totalCost),
                calculatedAt: calculation.calculatedAt || new Date().toISOString(), priceMode: 'frozen'
            };
        }
        item.materialTakeoffSnapshot = snapshot;
        item.materialCost = quantity > 0 ? Math.round((snapshot.totalCost / quantity) * 10000) / 10000 : snapshot.totalCost;
        return item;
    }

    async function ensureQuoteSnapshots(options) {
        if (!Array.isArray(global.rooms)) return [];
        var changed = false;
        for (var r = 0; r < global.rooms.length; r++) {
            var room = global.rooms[r];
            for (var i = 0; i < (room.items || []).length; i++) {
                var item = room.items[i];
                var before = JSON.stringify(item.materialTakeoffSnapshot || null);
                await attachSnapshotToItem(item, options || {});
                if (before !== JSON.stringify(item.materialTakeoffSnapshot || null)) changed = true;
            }
        }
        if (changed) {
            if (typeof global.renderRooms === 'function') global.renderRooms();
            if (typeof global.calculateTotals === 'function') global.calculateTotals();
            if (typeof global.markUnsaved === 'function') global.markUnsaved();
        }
        return collectTakeoffRows();
    }

    function collectTakeoffRows() {
        var rows = [];
        (global.rooms || []).forEach(function(room) {
            (room.items || []).forEach(function(item) {
                var snapshot = item.materialTakeoffSnapshot;
                (snapshot && snapshot.lines || []).forEach(function(line) {
                    var product = productById(line.supplierProductId) || {};
                    var supplier = supplierForProduct(product);
                    rows.push(Object.assign({}, line, {
                        roomName: room.name || 'Room', taskName: item.description || item.serviceName || 'Task',
                        supplierName: supplier.display_name || 'Manual / unlinked', branchLabel: supplier.branch_label || '',
                        category: product.category || item.category || 'General'
                    }));
                });
            });
        });
        return rows;
    }

    async function renderTakeoff() {
        var pane = document.getElementById('smTakeoffPane');
        if (!pane) return;
        pane.innerHTML = '<div class="text-center py-5"><span class="spinner-border text-primary"></span><div class="mt-2">Building the frozen takeoff...</div></div>';
        try {
            var rows = await ensureQuoteSnapshots();
            var total = rows.reduce(function(sum, row) { return sum + number(row.extendedCost); }, 0);
            var byRoom = {};
            rows.forEach(function(row) { (byRoom[row.roomName] || (byRoom[row.roomName] = [])).push(row); });
            pane.innerHTML = '<div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-3"><div><h5 class="mb-0">This quote’s private material takeoff</h5><div class="small text-muted">Prices are frozen until you explicitly apply reviewed updates.</div></div><div class="d-flex gap-2"><button class="btn btn-outline-primary" onclick="QuoteDrSupplierMaterials.reviewPriceChanges()"><i class="fas fa-arrows-rotate me-1"></i>Review Price Changes</button><button class="btn btn-outline-secondary" onclick="QuoteDrSupplierMaterials.exportTakeoffCsv()"><i class="fas fa-file-csv me-1"></i>CSV</button><button class="btn btn-outline-secondary" onclick="QuoteDrSupplierMaterials.printTakeoff()"><i class="fas fa-print me-1"></i>Print</button></div></div>' +
                (rows.length ? Object.keys(byRoom).map(function(roomName) {
                    return '<div class="sm-takeoff-group"><div class="sm-takeoff-heading">' + escapeHtml(roomName) + '</div><div class="table-responsive"><table class="table table-sm mb-0 sm-wide-table"><thead><tr><th>Supplier</th><th>Task</th><th>Material</th><th>SKU</th><th>Required</th><th>Buy</th><th>Packages</th><th>Price</th><th>Cost</th></tr></thead><tbody>' + byRoom[roomName].map(function(row) {
                        return '<tr><td>' + escapeHtml(row.supplierName) + '</td><td>' + escapeHtml(row.taskName) + '</td><td><strong>' + escapeHtml(row.materialName) + '</strong>' + (row.missingPrice ? '<div class="small text-danger">Price missing</div>' : '') + '</td><td><code>' + escapeHtml(row.supplierSku || '') + '</code></td><td>' + number(row.requiredQuantity).toFixed(2) + ' ' + escapeHtml(row.unit) + '</td><td>' + number(row.purchasedQuantity).toFixed(2) + '</td><td>' + number(row.packageCount) + '</td><td>' + money(row.unitPrice, row.currency) + '</td><td><strong>' + money(row.extendedCost, row.currency) + '</strong></td></tr>';
                    }).join('') + '</tbody></table></div></div>';
                }).join('') : '<div class="alert alert-light border">No quote line currently uses a material recipe. Add a recipe to a saved task, then add or update that task on this quote.</div>') +
                '<div class="text-end fs-5"><strong>Total estimated materials: ' + money(total, 'CAD') + '</strong></div>';
        } catch (error) {
            pane.innerHTML = '<div class="alert alert-danger">Could not build the takeoff: ' + escapeHtml(error.message || error) + '</div>';
        }
    }

    async function reviewPriceChanges() {
        var snapshots = [];
        (global.rooms || []).forEach(function(room) { (room.items || []).forEach(function(item) { (item.materialTakeoffSnapshot?.lines || []).forEach(function(line) { snapshots.push({ supplierProductId: line.supplierProductId, unitPrice: line.unitPrice }); }); }); });
        if (!snapshots.length) { setStatus('This quote has no frozen supplier prices yet.', 'error'); switchTab('takeoff'); return; }
        try {
            var result = await api('reviewPriceChanges', { snapshots: snapshots });
            showPriceChanges(result.changes || []);
        } catch (error) { setStatus(error.message || String(error), 'error'); }
    }

    function showPriceChanges(changes) {
        var modal = document.getElementById('smPriceChangesModal');
        if (!modal) {
            modal = document.createElement('div'); modal.className = 'modal fade'; modal.id = 'smPriceChangesModal'; modal.tabIndex = -1;
            modal.innerHTML = '<div class="modal-dialog modal-lg modal-dialog-scrollable"><div class="modal-content"><div class="modal-header"><h5 class="modal-title"><i class="fas fa-arrows-rotate me-2"></i>Review Material Price Changes</h5><button class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body" id="smPriceChangesBody"></div><div class="modal-footer"><button class="btn btn-secondary" data-bs-dismiss="modal">Keep Frozen Prices</button><button class="btn btn-primary" id="smApplyPriceChangesBtn" onclick="QuoteDrSupplierMaterials.applySelectedPriceChanges()">Apply Selected to Recipes & Draft</button></div></div></div>';
            document.body.appendChild(modal);
        }
        var body = document.getElementById('smPriceChangesBody');
        body.innerHTML = changes.length ? '<div class="alert alert-info small">Accepted and sent documents are never updated. This applies selected prices to saved recipe cost caches and this open draft only.</div>' + changes.map(function(change, index) {
            return '<label class="d-flex align-items-center gap-3 border rounded p-2 mb-2"><input class="form-check-input sm-price-change" type="checkbox" data-index="' + index + '" checked><span class="flex-grow-1"><strong>' + escapeHtml(change.name) + '</strong><span class="d-block small text-muted">' + money(change.oldPrice, change.currency) + ' → ' + money(change.newPrice, change.currency) + '</span></span><span class="' + (number(change.newPrice) > number(change.oldPrice) ? 'sm-price-up' : 'sm-price-down') + '"><strong>' + money(number(change.newPrice) - number(change.oldPrice), change.currency) + '</strong></span></label>';
        }).join('') : '<div class="alert alert-success mb-0"><i class="fas fa-check-circle me-1"></i>This draft already uses the latest imported supplier prices.</div>';
        modal._changes = changes;
        document.getElementById('smApplyPriceChangesBtn').disabled = !changes.length;
        bootstrap.Modal.getOrCreateInstance(modal).show();
    }

    async function applySelectedPriceChanges() {
        var quoteStatus = String(document.getElementById('quoteStatus')?.value || global._loadedQuoteData?.status || '').toLowerCase();
        if (global._loadedQuoteData?.portal_visible === true || ['accepted', 'approved', 'sent', 'declined', 'invoiced'].includes(quoteStatus)) {
            setStatus('Accepted or sent documents stay frozen. Create a revision or change order before applying new supplier prices.', 'error');
            return;
        }
        var modal = document.getElementById('smPriceChangesModal');
        var changes = modal && modal._changes || [];
        var selectedIds = new Set(Array.from(document.querySelectorAll('.sm-price-change:checked')).map(function(input) { return changes[number(input.dataset.index, -1)]?.supplierProductId; }).filter(Boolean));
        if (!selectedIds.size) return;
        setStatus('Applying reviewed prices...');
        try {
            var affectedItemIds = new Set(state.components.filter(function(component) { return selectedIds.has(component.supplier_product_id); }).map(function(component) { return component.saved_item_id; }));
            for (var savedItemId of affectedItemIds) {
                var calc = await api('applyPriceRefresh', { savedItemId: savedItemId, itemQuantity: 1 });
                await updateSavedItemRecipeCache(savedItemId, calc);
            }
            for (var room of (global.rooms || [])) {
                for (var item of (room.items || [])) {
                    if ((item.materialTakeoffSnapshot?.lines || []).some(function(line) { return selectedIds.has(line.supplierProductId); })) await attachSnapshotToItem(item, { refreshPrices: true });
                }
            }
            bootstrap.Modal.getInstance(modal)?.hide();
            if (typeof global.renderRooms === 'function') global.renderRooms();
            if (typeof global.calculateTotals === 'function') global.calculateTotals();
            if (typeof global.markUnsaved === 'function') global.markUnsaved();
            await loadCatalog(true); renderAll(); switchTab('takeoff');
            setStatus('Selected prices applied to recipes and this open draft.', 'success');
        } catch (error) { setStatus(error.message || String(error), 'error'); }
    }

    function csvCell(value) { return '"' + String(value == null ? '' : value).replace(/"/g, '""') + '"'; }

    function takeoffCsv() {
        var rows = [['Room','Supplier','Branch','Task','Category','SKU','Material','Required Qty','Buy Qty','Unit','Packages','Unit Price','Extended Cost','Currency','Price Date']];
        collectTakeoffRows().forEach(function(row) {
            rows.push([row.roomName,row.supplierName,row.branchLabel,row.taskName,row.category,row.supplierSku,row.materialName,row.requiredQuantity,row.purchasedQuantity,row.unit,row.packageCount,row.unitPrice,row.extendedCost,row.currency,row.priceCapturedAt || '']);
        });
        return rows.map(function(row) { return row.map(csvCell).join(','); }).join('\r\n');
    }

    function exportTakeoffCsv() {
        var blob = new Blob([takeoffCsv()], { type: 'text/csv;charset=utf-8' });
        var link = document.createElement('a'); link.href = URL.createObjectURL(blob);
        var quoteNumber = document.getElementById('quoteNumber')?.value || 'quote';
        link.download = String(quoteNumber).replace(/[^a-z0-9_-]+/gi, '-') + '-material-takeoff.csv'; link.click();
        setTimeout(function() { URL.revokeObjectURL(link.href); }, 1000);
    }

    function printTakeoff() {
        var rows = collectTakeoffRows();
        var win = global.open('', '_blank', 'noopener');
        if (!win) return;
        var quoteNumber = document.getElementById('quoteNumber')?.value || 'Quote';
        win.document.write('<!doctype html><html><head><title>' + escapeHtml(quoteNumber) + ' Material Takeoff</title><style>body{font:14px Arial;padding:24px;color:#15243a}table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccd6e3;padding:7px;text-align:left}th{background:#eef4fb}h1{color:#174d86}.private{color:#8a5a00}</style></head><body><h1>' + escapeHtml(quoteNumber) + ' Material Takeoff</h1><p class="private">Contractor-only estimate. Prices and quantities are not part of the client document.</p><table><thead><tr><th>Room</th><th>Supplier</th><th>Task</th><th>SKU</th><th>Material</th><th>Buy</th><th>Packages</th><th>Cost</th></tr></thead><tbody>' + rows.map(function(row) { return '<tr><td>' + escapeHtml(row.roomName) + '</td><td>' + escapeHtml(row.supplierName) + '</td><td>' + escapeHtml(row.taskName) + '</td><td>' + escapeHtml(row.supplierSku) + '</td><td>' + escapeHtml(row.materialName) + '</td><td>' + number(row.purchasedQuantity).toFixed(2) + ' ' + escapeHtml(row.unit) + '</td><td>' + number(row.packageCount) + '</td><td>' + money(row.extendedCost,row.currency) + '</td></tr>'; }).join('') + '</tbody></table></body></html>');
        win.document.close(); win.focus(); setTimeout(function() { win.print(); }, 200);
    }

    function switchTab(tab) {
        state.activeTab = tab || 'catalog';
        document.querySelectorAll('#supplierMaterialsTabs [data-sm-tab]').forEach(function(button) { button.classList.toggle('active', button.dataset.smTab === state.activeTab); });
        document.querySelectorAll('#supplierMaterialsModal .sm-tab-pane').forEach(function(pane) { pane.classList.remove('active'); });
        var target = document.getElementById('sm' + state.activeTab.charAt(0).toUpperCase() + state.activeTab.slice(1) + 'Pane');
        if (target) target.classList.add('active');
        if (state.activeTab === 'takeoff') renderTakeoff();
    }

    function renderAll() {
        renderCatalog(); renderImport(); renderRecipes();
        if (state.activeTab === 'takeoff') renderTakeoff();
        switchTab(state.activeTab);
    }

    async function open(options) {
        options = options || {};
        var manageModal = document.getElementById('manageItemsModal');
        if (manageModal && manageModal.classList.contains('show')) bootstrap.Modal.getInstance(manageModal)?.hide();
        ensureModal(); setStatus('Loading private supplier catalogue...');
        bootstrap.Modal.getOrCreateInstance(document.getElementById('supplierMaterialsModal')).show();
        try {
            await ensureStableItemIds();
            await loadCatalog(true);
            state.activeTab = options.tab || state.activeTab || 'catalog';
            if (options.savedItemId) { state.activeSavedItemId = options.savedItemId; state.activeTab = 'recipes'; }
            renderAll(); setStatus('Supplier catalogue loaded.', 'success');
        } catch (error) {
            setStatus(error.message || String(error), 'error');
            var pane = document.getElementById('smCatalogPane');
            if (pane) pane.innerHTML = '<div class="alert alert-warning"><strong>Supplier Materials Beta is not connected yet.</strong><div>' + escapeHtml(error.message || error) + '</div></div>';
        }
    }

    function installButtons() {
        var desktopManage = document.querySelector('.room-toolbar .btn-manage');
        if (desktopManage && !document.getElementById('supplierMaterialsToolbarBtn')) {
            var button = document.createElement('a'); button.id = 'supplierMaterialsToolbarBtn'; button.href = 'javascript:void(0)'; button.className = 'btn btn-sm btn-manage';
            button.setAttribute('data-account-permission', 'items.manage items.pricing.read'); button.title = 'Supplier catalogues, material recipes, and takeoffs';
            button.innerHTML = '<i class="fas fa-boxes-stacked"></i> Materials'; button.addEventListener('click', function() { open(); });
            desktopManage.insertAdjacentElement('afterend', button);
        }
        var manageToolbar = document.querySelector('#manageItemsModal .manage-items-toolbar .d-flex.align-items-center');
        if (manageToolbar && !document.getElementById('manageMaterialsBtn')) {
            var manageButton = document.createElement('button'); manageButton.id = 'manageMaterialsBtn'; manageButton.type = 'button'; manageButton.className = 'btn btn-sm btn-outline-primary';
            manageButton.setAttribute('data-account-permission', 'items.manage items.pricing.read');
            manageButton.innerHTML = '<i class="fas fa-boxes-stacked"></i> Materials'; manageButton.addEventListener('click', function() { open(); });
            manageToolbar.insertBefore(manageButton, manageToolbar.firstChild);
        }
        if (global.QuoteDrAccount && typeof global.QuoteDrAccount.applyDocumentAccess === 'function') global.QuoteDrAccount.applyDocumentAccess();
    }

    function init() {
        installButtons();
        global.addEventListener('quotedr-account-ready', installButtons);
        global.addEventListener('quotedr-account-changed', function() { state.loaded = false; installButtons(); });
    }

    global.QuoteDrSupplierMaterials = Object.freeze({
        open: open, switchTab: switchTab, previewImport: previewImport, commitImport: commitImport,
        addRecipeRow: addRecipeRow, removeRecipeRow: removeRecipeRow, saveRecipe: saveRecipe,
        attachSnapshotToItem: attachSnapshotToItem, ensureQuoteSnapshots: ensureQuoteSnapshots,
        reviewPriceChanges: reviewPriceChanges, applySelectedPriceChanges: applySelectedPriceChanges,
        exportTakeoffCsv: exportTakeoffCsv, printTakeoff: printTakeoff,
        ensureStableItemIds: ensureStableItemIds,
        _test: { parseStructuredRows: parseStructuredRows, calculateDraftComponent: calculateDraftComponent, recalculateFrozenSnapshot: recalculateFrozenSnapshot }
    });

    if (typeof document !== 'undefined') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
        else init();
    }
})(typeof window !== 'undefined' ? window : globalThis);
