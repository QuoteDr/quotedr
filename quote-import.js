// QuoteDr legacy quote import helpers and UI.
(function(global) {
    'use strict';

    var QUOTE_IMPORT_URL = 'https://axmoffknvblluibuitrq.supabase.co/functions/v1/quote-import';
    var QUOTE_IMPORT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
    var QUOTE_IMPORT_MAX_IMAGE_BYTES = 12 * 1024 * 1024;
    var QUOTE_IMPORT_MAX_IMAGE_EDGE = 2400;
    var QUOTE_IMPORT_MAX_PDF_PAGES = 12;
    var _quoteImportState = {
        extractedText: '',
        sourceImages: [],
        fileName: '',
        fileType: 'paste',
        parsed: null,
        requiresReviewAcknowledgement: false,
        debugText: '',
        debugFileName: ''
    };
    var _quoteImportScriptPromises = {};

    function loadQuoteImportScript(globalName, src) {
        if (global[globalName]) return Promise.resolve(global[globalName]);
        if (_quoteImportScriptPromises[globalName]) return _quoteImportScriptPromises[globalName];
        _quoteImportScriptPromises[globalName] = new Promise(function(resolve, reject) {
            var script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = function() {
                if (global[globalName]) resolve(global[globalName]);
                else reject(new Error(globalName + ' did not initialize.'));
            };
            script.onerror = function() { reject(new Error('Could not load the file reader.')); };
            document.head.appendChild(script);
        }).catch(function(error) {
            delete _quoteImportScriptPromises[globalName];
            throw error;
        });
        return _quoteImportScriptPromises[globalName];
    }

    function asArray(value) {
        return Array.isArray(value) ? value : [];
    }

    function deepClone(value) {
        return JSON.parse(JSON.stringify(value || null));
    }

    function escapeHtml(value) {
        return String(value == null ? '' : value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function parseMoney(value) {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'number') return isFinite(value) ? Math.round(value * 100) / 100 : null;
        var text = String(value).trim();
        if (!text || /^(tbd|n\/a|na|--|-|included)$/i.test(text)) return null;
        var negative = /^\(.*\)$/.test(text) || /^-/.test(text);
        var cleaned = text.replace(/[$,\s]/g, '').replace(/[()]/g, '').replace(/[^0-9.\-]/g, '');
        if (!cleaned || cleaned === '-' || cleaned === '.') return null;
        var parsed = parseFloat(cleaned);
        if (!isFinite(parsed)) return null;
        return Math.round((negative ? -Math.abs(parsed) : parsed) * 100) / 100;
    }

    function parseQuantity(value) {
        if (value === null || value === undefined || value === '') return null;
        if (typeof value === 'number') return isFinite(value) ? Math.round(value * 100) / 100 : null;
        var text = String(value).trim();
        if (!text || /^(tbd|n\/a|na|--|-|included)$/i.test(text)) return null;
        var match = text.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
        if (!match) return null;
        var parsed = parseFloat(match[0]);
        return isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
    }

    function parseConfidence(value) {
        if (value === null || value === undefined || value === '') return null;
        var parsed = Number(value);
        if (!isFinite(parsed)) return null;
        if (parsed > 1 && parsed <= 100) parsed = parsed / 100;
        return Math.max(0, Math.min(1, Math.round(parsed * 100) / 100));
    }

    function normalizeUnit(unit) {
        var text = String(unit || '').trim().toLowerCase();
        if (!text) return 'ls';
        text = text.replace(/\./g, '').replace(/\s+/g, ' ');
        if (/^(sq ?ft|sqft|square ?feet|square ?foot|sf)$/.test(text)) return 'sq ft';
        if (/^(lin ?ft|linear ?feet|linear ?foot|lf|ft)$/.test(text)) return 'lf';
        if (/^(cu ?ft|cuft|cubic ?feet|cubic ?foot|cf)$/.test(text)) return 'cu ft';
        if (/^(each|ea|unit|units|piece|pieces|pc|pcs)$/.test(text)) return 'ea';
        if (/^(hour|hours|hr|hrs)$/.test(text)) return 'hr';
        if (/^(lump ?sum|ls|allowance|fixed)$/.test(text)) return 'ls';
        if (/^(sheet|sheets)$/.test(text)) return 'sheet';
        if (/^(box|boxes)$/.test(text)) return 'box';
        if (/^(bag|bags)$/.test(text)) return 'bag';
        return text;
    }

    function normalizeImportedUnit(unit) {
        var text = String(unit || '').trim();
        return text ? normalizeUnit(text) : 'ea';
    }

    function normalizeImportDescriptionKey(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .replace(/[^\w\s]/g, '')
            .trim();
    }

    function mergeImportedDescriptionText(primary, secondary) {
        var first = String(primary || '').trim();
        var second = String(secondary || '').trim();
        if (!first) return second;
        if (!second) return first;
        var firstKey = normalizeImportDescriptionKey(first);
        var secondKey = normalizeImportDescriptionKey(second);
        if (!secondKey || firstKey === secondKey || firstKey.indexOf(secondKey) !== -1) return first;
        if (secondKey.indexOf(firstKey) !== -1) return second;
        return first + '\n' + second;
    }

    function scrubImportedItemForBuilder(item) {
        if (!item || typeof item !== 'object') return item;
        var importedDescription = mergeImportedDescriptionText(
            item.itemDescription || item.displayDescription || '',
            item.notes || ''
        );
        item.itemDescription = importedDescription;
        item.notes = '';
        delete item.confidence;
        delete item.sourceExcerpt;
        delete item.reviewReasons;
        return item;
    }

    function looksLikeSkipRow(item) {
        var description = String(item && (item.description || item.name || item.serviceName || item.actualDescription) || '').trim();
        var category = String(item && item.category || '').trim();
        var combined = (category + ' ' + description).trim().toLowerCase();
        if (!combined) return true;
        if (/^(description qty unit price amount|description|qty|quantity|unit price|amount|invoice|invoice #|bill to|customer id|terms|date|hst|tax|subtotal|total|balance due|deposit)$/i.test(description)) return true;
        if (/\b(to be determined|tbd)\b/i.test(combined)) return true;
        if (/^(hst|tax|subtotal|total)\b/i.test(combined)) return true;
        return false;
    }

    function normalizeImportedItem(item) {
        if (!item || typeof item !== 'object' || looksLikeSkipRow(item)) return null;
        var description = String(item.description || item.name || item.serviceName || item.actualDescription || '').trim();
        var importedDescription = String(item.notes || item.itemDescription || item.displayDescription || '').trim();
        var quantity = parseQuantity(item.quantity);
        var rate = parseMoney(item.rate || item.unitPrice || item.unit_price);
        var total = parseMoney(item.total || item.amount || item.lineTotal || item.line_total);
        var unitType = normalizeImportedUnit(item.unitType || item.unit || item.units);

        if (total === null && quantity !== null && rate !== null) total = Math.round(quantity * rate * 100) / 100;
        if (quantity === null && total !== null && rate !== null && rate !== 0) quantity = Math.round((total / rate) * 100) / 100;
        if (quantity === null) quantity = 1;
        if (rate === null && total !== null) {
            rate = total;
        }
        if (rate === null) rate = 0;
        if (total === null) total = Math.round(quantity * rate * 100) / 100;

        if (!description || (!total && !rate && !importedDescription)) return null;

        return {
            category: String(item.category || 'Imported Quote').trim() || 'Imported Quote',
            description: description,
            serviceName: String(item.serviceName || description).trim(),
            quantity: quantity,
            unit: unitType,
            unitType: unitType,
            rate: rate,
            materialCost: parseMoney(item.materialCost || item.material_cost) || 0,
            total: total,
            itemDescription: importedDescription,
            notes: '',
            displayDescription: String(item.displayDescription || description).trim(),
            confidence: parseConfidence(item.confidence),
            sourceExcerpt: String(item.sourceExcerpt || item.source_excerpt || '').trim().slice(0, 500),
            reviewReasons: asArray(item.reviewReasons || item.review_reasons).map(function(reason) { return String(reason); }).filter(Boolean),
            optional: false,
            upgrade: false
        };
    }

    function normalizeTotals(totals) {
        totals = totals || {};
        return {
            subtotal: parseMoney(totals.subtotal) || 0,
            tax: parseMoney(totals.tax) || 0,
            total: parseMoney(totals.total || totals.grandTotal || totals.grand_total) || 0,
            amountPaid: parseMoney(totals.amountPaid || totals.amount_paid || totals.deposit || totals.payment) || 0,
            balanceDue: parseMoney(totals.balanceDue || totals.balance_due || totals.remainingBalance || totals.remaining_balance) || 0,
            taxLabel: String(totals.taxLabel || totals.tax_label || '').trim().slice(0, 40),
            taxRate: parseQuantity(totals.taxRate || totals.tax_rate)
        };
    }

    function normalizeImportedQuote(payload) {
        payload = payload || {};
        var quote = payload.quote || payload;
        var rooms = asArray(quote.rooms).map(function(room, index) {
            var normalizedItems = asArray(room && room.items).map(normalizeImportedItem).filter(Boolean);
            return {
                id: room && room.id ? room.id : index + 1,
                name: String((room && room.name) || ('Imported Room ' + (index + 1))).trim(),
                markup: parseMoney(room && room.markup) || 0,
                colorIndex: index % 8,
                items: normalizedItems
            };
        }).filter(function(room) {
            return room.items.length > 0;
        });

        var normalizedQuote = {
            quoteTitle: String(quote.quoteTitle || quote.title || quote.projectName || '').trim(),
            clientName: String(quote.clientName || quote.client_name || '').trim(),
            clientPhone: String(quote.clientPhone || quote.phone || '').trim(),
            clientEmail: String(quote.clientEmail || quote.email || '').trim(),
            projectAddress: String(quote.projectAddress || quote.project_address || '').trim(),
            quoteNumber: String(quote.quoteNumber || quote.quote_number || '').trim(),
            rooms: rooms
        };

        return {
            quote: normalizedQuote,
            sourceTotals: normalizeTotals(payload.sourceTotals || payload.source_totals || {}),
            sourceDocument: payload.sourceDocument || payload.source_document || {},
            savedItemCandidates: asArray(payload.savedItemCandidates || payload.saved_item_candidates),
            warnings: asArray(payload.warnings).map(function(warning) { return String(warning); }).filter(Boolean)
        };
    }

    function extractSavedItemCandidates(quote) {
        var seen = {};
        var candidates = [];
        asArray(quote && quote.rooms).forEach(function(room) {
            asArray(room.items).forEach(function(item) {
                if (!item || looksLikeSkipRow(item)) return;
                var name = String(item.serviceName || item.description || '').trim();
                if (!name || /\b(total|subtotal|hst|tax|tbd|to be determined)\b/i.test(name)) return;
                var category = String(item.category || 'Imported Quote').trim() || 'Imported Quote';
                var unitType = normalizeUnit(item.unitType || item.unit);
                var key = (category + '::' + name + '::' + unitType).toLowerCase();
                if (seen[key]) return;
                seen[key] = true;
                var rate = parseMoney(item.rate) || 0;
                var unsuitableReusableItem = /\b(permit|admin(?:istration)? fee|subtotal|total|tax|hst|gst|deposit|balance|payment|labou?r and material included)\b/i.test(name);
                var highEnoughConfidence = item.confidence === null || item.confidence === undefined || item.confidence >= 0.85;
                candidates.push({
                    category: category,
                    name: name,
                    unitType: unitType,
                    rate: rate,
                    materialCost: parseMoney(item.materialCost) || 0,
                    description: String(item.itemDescription || item.notes || item.displayDescription || '').trim(),
                    sourceRoom: room.name || '',
                    confidence: item.confidence,
                    recommended: !unsuitableReusableItem && highEnoughConfidence,
                    defaultSelected: false
                });
            });
        });
        return candidates;
    }

    function inferRecoveredCategory(description) {
        var text = String(description || '').toLowerCase();
        if (/drywall|mud|tape|bulkhead/.test(text)) return 'Drywall';
        if (/paint|primer|colour/.test(text)) return 'Paint';
        if (/floor|vinyl|tile/.test(text)) return 'Flooring';
        if (/trim|casing|baseboard|wainscot/.test(text)) return 'Trim';
        if (/door|jamb|closet/.test(text)) return 'Doors';
        if (/cabinet|pax|ikea/.test(text)) return 'Cabinetry';
        if (/plumb|toilet|vanity|sink|drain|waterline|pump|basin/.test(text)) return 'Plumbing';
        if (/duct|hvac|vent|rangehood|fan/.test(text)) return 'HVAC';
        if (/framing|frame|stair|construction|demo|demolition/.test(text)) return 'Construction';
        if (/insulation|vapor|eps/.test(text)) return 'Insulation';
        return 'Imported Quote';
    }

    function sourceLineLooksLikeTotal(line) {
        var text = String(line || '').trim().toLowerCase();
        if (!text) return false;
        if (/^(hst|gst|tax|total|subtotal)\b/.test(text)) return true;
        if (/\b(subtotal|balance due|amount due|grand total)\b/.test(text)) return true;
        if (/thank you.*\bsubtotal\b/.test(text)) return true;
        return false;
    }

    function parseSourcePricedLine(line, nextLine, roomName) {
        var raw = String(line || '').trim();
        if (!raw || raw.indexOf('$') === -1 || sourceLineLooksLikeTotal(raw)) return null;
        if (/\b(tbd|to be determined|included)\b/i.test(raw)) return null;
        var moneyMatches = raw.match(/\$\s*-?\d[\d,]*(?:\.\d{2})?/g) || [];
        if (!moneyMatches.length) return null;
        var total = parseMoney(moneyMatches[moneyMatches.length - 1]);
        if (!total || total <= 0) return null;

        var parts = raw.split('|').map(function(part) { return part.trim(); }).filter(Boolean);
        if (parts.length < 2) return null;
        var description = parts[0];
        var quantity = null;
        var rate = null;
        var unitType = 'ea';
        if (parts.length >= 5) {
            quantity = parseQuantity(parts[1]);
            unitType = normalizeImportedUnit(parts[2]);
            rate = parseMoney(parts[3]);
        } else if (parts.length >= 4) {
            quantity = parseQuantity(parts[1]);
            rate = parseMoney(parts[2]);
        }

        var suffix = description.match(/^(.*?)\s+(\d+(?:\.\d+)?)\s+(square\s+feet|square\s+foot|linear\s+feet|linear\s+foot|cubic\s+feet|cubic\s+foot|each|sheets?|boxes?|bags?)$/i);
        if (suffix) {
            description = suffix[1].trim();
            if (quantity === null) quantity = parseQuantity(suffix[2]);
            unitType = normalizeImportedUnit(suffix[3]);
        }

        if (quantity === null || rate === null) {
            quantity = 1;
            rate = total;
        }

        if (!description || sourceLineLooksLikeTotal(description)) return null;
        var importedDescription = String(nextLine || '').trim();
        if (importedDescription && (importedDescription.indexOf('$') !== -1 || lineLooksLikeRoomHeading(importedDescription) || /^description\s*\|/i.test(importedDescription))) {
            importedDescription = '';
        }

        return {
            room: roomName || 'Imported Quote',
            item: {
                category: inferRecoveredCategory(description),
                description: description,
                serviceName: description,
                quantity: quantity,
                unit: unitType,
                unitType: unitType,
                rate: Math.round(rate * 100) / 100,
                materialCost: 0,
                total: Math.round(total * 100) / 100,
                itemDescription: importedDescription,
                notes: '',
                displayDescription: description,
                optional: false,
                upgrade: false,
                recoveredFromSource: true
            }
        };
    }

    function extractSourcePricedRows(sourceText) {
        var rows = [];
        var currentRoom = 'Imported Quote';
        var lines = String(sourceText || '').split(/\r?\n/).map(function(line) { return line.trim(); });
        for (var index = 0; index < lines.length; index++) {
            var line = lines[index];
            if (!line || /^---\s*(sheet|page)/i.test(line) || /^description\s*\|/i.test(line)) continue;
            if (lineLooksLikeRoomHeading(line)) {
                currentRoom = line;
                continue;
            }
            var parsed = parseSourcePricedLine(line, lines[index + 1] || '', currentRoom);
            if (parsed) rows.push(parsed);
        }
        return rows;
    }

    function cents(value) {
        return Math.round((parseMoney(value) || 0) * 100);
    }

    function refreshImportTotalWarnings(parsed) {
        parsed.warnings = asArray(parsed.warnings).filter(function(warning) {
            return !/Imported line items total|Imported item subtotal/i.test(String(warning || ''));
        });
        var importedSubtotal = sumQuoteSubtotal(parsed.quote);
        var sourceSubtotal = parseMoney(parsed.sourceTotals && parsed.sourceTotals.subtotal) || 0;
        if (sourceSubtotal && Math.abs(sourceSubtotal - importedSubtotal) > 1) {
            parsed.warnings.push('Imported item subtotal $' + importedSubtotal.toFixed(2) + ' differs from the detected source subtotal $' + sourceSubtotal.toFixed(2) + '. Review the source text and imported rooms before applying.');
        }
        return parsed;
    }

    function recoverMissingSourceRows(parsed, sourceText) {
        parsed = normalizeImportedQuote(parsed);
        var importedCounts = {};
        asArray(parsed.quote.rooms).forEach(function(room) {
            asArray(room.items).forEach(function(item) {
                var key = cents(item.total);
                if (!key) return;
                importedCounts[key] = (importedCounts[key] || 0) + 1;
            });
        });

        var roomMap = {};
        asArray(parsed.quote.rooms).forEach(function(room) {
            roomMap[String(room.name || '').trim().toLowerCase()] = room;
        });

        var recovered = [];
        extractSourcePricedRows(sourceText).forEach(function(row) {
            var key = cents(row.item.total);
            if (!key) return;
            if (importedCounts[key] > 0) {
                importedCounts[key] -= 1;
                return;
            }
            var roomKey = String(row.room || 'Imported Quote').trim().toLowerCase();
            var room = roomMap[roomKey];
            if (!room) {
                room = {
                    id: parsed.quote.rooms.length + 1,
                    name: row.room || 'Imported Quote',
                    markup: 0,
                    colorIndex: parsed.quote.rooms.length % 8,
                    items: []
                };
                roomMap[roomKey] = room;
                parsed.quote.rooms.push(room);
            }
            room.items.push(row.item);
            importedCounts[key] = 0;
            recovered.push(row.item);
        });

        if (recovered.length) {
            parsed.warnings = asArray(parsed.warnings);
            parsed.warnings.push('Recovered ' + recovered.length + ' priced source row' + (recovered.length === 1 ? '' : 's') + ' that the AI missed. Review recovered rows before applying.');
        }
        return refreshImportTotalWarnings(parsed);
    }

    function flattenImportedQuoteItems(quote) {
        var rows = [];
        asArray(quote && quote.rooms).forEach(function(room) {
            asArray(room.items).forEach(function(item) {
                rows.push({
                    room: room.name || '',
                    category: item.category || '',
                    description: item.description || item.serviceName || '',
                    quantity: item.quantity,
                    unit: item.unitType || item.unit || '',
                    rate: parseMoney(item.rate) || 0,
                    total: parseMoney(item.total) || 0,
                    notes: item.notes || item.itemDescription || ''
                });
            });
        });
        return rows;
    }

    function escapeCsvCell(value) {
        var text = value === null || value === undefined ? '' : String(value);
        return '"' + text.replace(/"/g, '""') + '"';
    }

    function buildImportedQuoteCsv(quote) {
        var headers = ['room', 'category', 'description', 'quantity', 'unit', 'rate', 'total', 'notes'];
        var rows = flattenImportedQuoteItems(quote);
        return [headers.map(escapeCsvCell).join(',')].concat(rows.map(function(row) {
            return headers.map(function(key) {
                return escapeCsvCell(row[key]);
            }).join(',');
        })).join('\n');
    }

    function buildQuoteImportDebugPayload(options) {
        options = options || {};
        var parsed = normalizeImportedQuote(options.parsed || {});
        var quote = parsed.quote;
        var rows = flattenImportedQuoteItems(quote);
        var importedSubtotal = sumQuoteSubtotal(quote);
        var sourceSubtotal = parseMoney(parsed.sourceTotals.subtotal) || 0;
        var sourceTax = parseMoney(parsed.sourceTotals.tax) || 0;
        var sourceTotal = parseMoney(parsed.sourceTotals.total) || 0;
        var sourceText = String(options.extractedText || '');
        return {
            exportedAt: new Date().toISOString(),
            format: 'QuoteDr legacy quote import debug v1',
            fileName: options.fileName || '',
            fileType: options.fileType || '',
            sourceCharacterCount: sourceText.length,
            sourceImageCount: Number(options.sourceImageCount || 0),
            roomCount: asArray(quote.rooms).length,
            itemCount: rows.length,
            totals: {
                importedSubtotal: importedSubtotal,
                sourceSubtotal: sourceSubtotal,
                sourceTax: sourceTax,
                sourceTotal: sourceTotal,
                importedTotalWithSourceTax: Math.round((importedSubtotal + sourceTax) * 100) / 100,
                importedTotalWith13PercentTax: Math.round((importedSubtotal * 1.13) * 100) / 100,
                shortfallVsSourceSubtotal: sourceSubtotal ? Math.round((sourceSubtotal - importedSubtotal) * 100) / 100 : 0,
                shortfallVsSourceTotal: sourceTotal ? Math.round((sourceTotal - importedSubtotal) * 100) / 100 : 0
            },
            warnings: parsed.warnings,
            quote: quote,
            flatItems: rows,
            lineItemsCsv: buildImportedQuoteCsv(quote),
            extractedSourceText: sourceText
        };
    }

    function detectFileType(file) {
        var name = String(file && file.name || '').toLowerCase();
        var mime = String(file && file.type || '').toLowerCase();
        if (QUOTE_IMPORT_IMAGE_TYPES.indexOf(mime) !== -1 || /\.(jpe?g|png|webp)$/.test(name)) return 'image';
        if (name.endsWith('.pdf')) return 'pdf';
        if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'xlsx';
        if (name.endsWith('.csv')) return 'csv';
        return 'txt';
    }

    function readFileAsText(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(event) { resolve(String(event.target.result || '')); };
            reader.onerror = function() { reject(reader.error || new Error('Could not read file.')); };
            reader.readAsText(file);
        });
    }

    function readFileAsArrayBuffer(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = function(event) { resolve(event.target.result); };
            reader.onerror = function() { reject(reader.error || new Error('Could not read file.')); };
            reader.readAsArrayBuffer(file);
        });
    }

    function canvasToJpegDataUrl(canvas, quality) {
        return new Promise(function(resolve, reject) {
            canvas.toBlob(function(blob) {
                if (!blob) {
                    reject(new Error('Could not prepare the image for handwriting recognition.'));
                    return;
                }
                var reader = new FileReader();
                reader.onload = function(event) { resolve(String(event.target.result || '')); };
                reader.onerror = function() { reject(reader.error || new Error('Could not read the prepared image.')); };
                reader.readAsDataURL(blob);
            }, 'image/jpeg', quality || 0.9);
        });
    }

    function scaledImageDimensions(width, height) {
        var longest = Math.max(width, height);
        var scale = longest > QUOTE_IMPORT_MAX_IMAGE_EDGE ? QUOTE_IMPORT_MAX_IMAGE_EDGE / longest : 1;
        return {
            width: Math.max(1, Math.round(width * scale)),
            height: Math.max(1, Math.round(height * scale))
        };
    }

    async function prepareQuoteImportImage(file) {
        var mime = String(file && file.type || '').toLowerCase();
        var name = String(file && file.name || 'photo').toLowerCase();
        if (QUOTE_IMPORT_IMAGE_TYPES.indexOf(mime) === -1 && !/\.(jpe?g|png|webp)$/.test(name)) {
            throw new Error('Use a JPEG, PNG, or WebP photo. HEIC photos must be converted to JPEG first.');
        }
        if (Number(file && file.size || 0) > QUOTE_IMPORT_MAX_IMAGE_BYTES) {
            throw new Error('This photo is larger than 12 MB. Crop it or choose a smaller image.');
        }

        var drawable;
        var cleanup = function() {};
        if (typeof global.createImageBitmap === 'function') {
            try {
                drawable = await global.createImageBitmap(file, { imageOrientation: 'from-image' });
            } catch (bitmapError) {
                drawable = await global.createImageBitmap(file);
            }
            cleanup = function() { if (drawable && typeof drawable.close === 'function') drawable.close(); };
        } else {
            drawable = await new Promise(function(resolve, reject) {
                var image = new Image();
                var objectUrl = URL.createObjectURL(file);
                image.onload = function() { URL.revokeObjectURL(objectUrl); resolve(image); };
                image.onerror = function() { URL.revokeObjectURL(objectUrl); reject(new Error('Could not open this image.')); };
                image.src = objectUrl;
            });
        }

        try {
            var width = Number(drawable.width || drawable.naturalWidth || 0);
            var height = Number(drawable.height || drawable.naturalHeight || 0);
            if (!width || !height) throw new Error('The selected image has no readable dimensions.');
            var size = scaledImageDimensions(width, height);
            var canvas = document.createElement('canvas');
            canvas.width = size.width;
            canvas.height = size.height;
            var context = canvas.getContext('2d', { alpha: false });
            context.fillStyle = '#ffffff';
            context.fillRect(0, 0, size.width, size.height);
            context.drawImage(drawable, 0, 0, size.width, size.height);
            return {
                dataUrl: await canvasToJpegDataUrl(canvas, 0.9),
                label: String(file.name || 'Quote photo'),
                width: size.width,
                height: size.height
            };
        } finally {
            cleanup();
        }
    }

    function buildPdfPageTextFromItems(items) {
        var tokens = asArray(items).map(function(item) {
            var transform = item && item.transform;
            var text = String(item && item.str || '').replace(/\s+/g, ' ').trim();
            if (!text || !Array.isArray(transform) || transform.length < 6) return null;
            return {
                text: text,
                x: Number(transform[4]) || 0,
                y: Number(transform[5]) || 0,
                width: Number(item.width) || 0
            };
        }).filter(Boolean);
        tokens.sort(function(a, b) {
            if (Math.abs(b.y - a.y) > 3) return b.y - a.y;
            return a.x - b.x;
        });

        var lines = [];
        tokens.forEach(function(token) {
            var line = lines.length ? lines[lines.length - 1] : null;
            if (!line || Math.abs(line.y - token.y) > 3) {
                line = { y: token.y, tokens: [] };
                lines.push(line);
            }
            line.tokens.push(token);
            line.y = ((line.y * (line.tokens.length - 1)) + token.y) / line.tokens.length;
        });

        return lines.map(function(line) {
            line.tokens.sort(function(a, b) { return a.x - b.x; });
            var parts = [];
            var previousRight = null;
            line.tokens.forEach(function(token) {
                if (previousRight === null) {
                    parts.push(token.text);
                } else {
                    var gap = token.x - previousRight;
                    parts.push((gap > 28 ? '\t' : ' ') + token.text);
                }
                previousRight = token.x + token.width;
            });
            return parts.join('').trim();
        }).filter(Boolean).join('\n');
    }

    async function extractPdfDocument(file) {
        await loadQuoteImportScript('pdfjsLib', 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js');
        if (global.pdfjsLib.GlobalWorkerOptions && !global.pdfjsLib.GlobalWorkerOptions.workerSrc) {
            global.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        }
        var buffer = await readFileAsArrayBuffer(file);
        var pdf = await global.pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
        var pages = [];
        var pdfPages = [];
        var sourceImages = [];
        var needsVision = false;
        for (var pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
            var page = await pdf.getPage(pageNumber);
            pdfPages.push(page);
            var textContent = await page.getTextContent();
            var pageText = buildPdfPageTextFromItems(textContent.items);
            pages.push(pageText);
            if (pageText.replace(/[^A-Za-z0-9]/g, '').length < 80) needsVision = true;
        }
        if (needsVision) {
            if (pdf.numPages > QUOTE_IMPORT_MAX_PDF_PAGES) {
                throw new Error('This scanned PDF has more than 12 image pages. Split it into smaller files and import each section.');
            }
            for (var visualPageIndex = 0; visualPageIndex < pdfPages.length; visualPageIndex++) {
                var page = pdfPages[visualPageIndex];
                var baseViewport = page.getViewport({ scale: 1 });
                var dimensions = scaledImageDimensions(baseViewport.width * 2, baseViewport.height * 2);
                var viewport = page.getViewport({ scale: Math.min(dimensions.width / baseViewport.width, dimensions.height / baseViewport.height) });
                var canvas = document.createElement('canvas');
                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);
                var context = canvas.getContext('2d', { alpha: false });
                context.fillStyle = '#ffffff';
                context.fillRect(0, 0, canvas.width, canvas.height);
                await page.render({ canvasContext: context, viewport: viewport }).promise;
                sourceImages.push({
                    dataUrl: await canvasToJpegDataUrl(canvas, 0.9),
                    label: 'PDF page ' + (visualPageIndex + 1),
                    width: canvas.width,
                    height: canvas.height
                });
            }
        }
        return {
            text: needsVision ? '' : pages.join('\n\n--- PAGE BREAK ---\n\n'),
            images: sourceImages,
            type: sourceImages.length ? 'scanned_pdf' : 'pdf'
        };
    }

    async function extractPdfText(file) {
        var extracted = await extractPdfDocument(file);
        return extracted.text;
    }

    function normalizeSheetCell(value) {
        if (value === null || value === undefined) return '';
        return String(value)
            .replace(/\u0000/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function buildSheetTextFromRows(rows) {
        return asArray(rows).map(function(row) {
            var cells = asArray(row).map(normalizeSheetCell);
            while (cells.length && !cells[cells.length - 1]) cells.pop();
            cells = cells.filter(Boolean);
            return cells.length ? cells.join(' | ') : '';
        }).filter(Boolean).join('\n');
    }

    function lineLooksLikeRoomHeading(line) {
        var trimmed = String(line || '').trim();
        if (!trimmed || trimmed.length > 70 || trimmed.length < 3) return false;
        if (/[0-9]+\s+\$/.test(trimmed)) return false;
        if (/^(subtotal|total|hst|gst|tax|description|qty|quantity|unit|rate|amount|page)\b/i.test(trimmed)) return false;
        var hasRoomWord = /\b(floor|basement|bath|bathroom|kitchen|laundry|bedroom|living|dining|utility|workshop|exterior|interior|garage|main|second|2nd|third|3rd|room)\b/i.test(trimmed);
        var letters = trimmed.replace(/\b\d+(st|nd|rd|th)\b/ig, '').replace(/[^A-Za-z]/g, '');
        var mostlyCaps = letters && letters === letters.toUpperCase();
        return hasRoomWord && mostlyCaps;
    }

    function splitOversizedImportText(text, maxChars) {
        var chunks = [];
        var remaining = String(text || '').trim();
        while (remaining.length > maxChars) {
            var cut = remaining.lastIndexOf('\n', maxChars);
            if (cut < maxChars * 0.6) cut = remaining.lastIndexOf(' ', maxChars);
            if (cut < maxChars * 0.6) cut = maxChars;
            chunks.push(remaining.slice(0, cut).trim());
            remaining = remaining.slice(cut).trim();
        }
        if (remaining) chunks.push(remaining);
        return chunks;
    }

    function splitQuoteImportText(sourceText) {
        var text = String(sourceText || '').replace(/\u0000/g, '').trim();
        if (text.length <= 9000) return [{ label: 'Full quote', text: text }];

        var rawPages = text.indexOf('--- PAGE BREAK ---') !== -1
            ? text.split(/--- PAGE BREAK ---/g).map(function(part) { return part.trim(); }).filter(Boolean)
            : [];
        var baseParts = rawPages.length > 1 ? rawPages : [];

        if (!baseParts.length) {
            var lines = text.split(/\r?\n/);
            var current = [];
            lines.forEach(function(line) {
                if (lineLooksLikeRoomHeading(line) && current.join('\n').length > 1200) {
                    baseParts.push(current.join('\n').trim());
                    current = [line];
                } else {
                    current.push(line);
                }
            });
            if (current.join('\n').trim()) baseParts.push(current.join('\n').trim());
        }

        if (baseParts.length <= 1) baseParts = splitOversizedImportText(text, 7000);

        var grouped = [];
        var currentGroup = '';
        baseParts.forEach(function(part) {
            var cleaned = String(part || '').trim();
            if (!cleaned) return;
            if ((currentGroup + '\n\n' + cleaned).length > 7000 && currentGroup) {
                grouped.push(currentGroup.trim());
                currentGroup = cleaned;
            } else {
                currentGroup = currentGroup ? currentGroup + '\n\n' + cleaned : cleaned;
            }
        });
        if (currentGroup.trim()) grouped.push(currentGroup.trim());

        return grouped.reduce(function(all, part) {
            splitOversizedImportText(part, 7000).forEach(function(chunk) { all.push(chunk); });
            return all;
        }, []).slice(0, 40).map(function(part, index) {
            return { label: 'Part ' + (index + 1), text: part };
        });
    }

    function mergeImportedQuotePayloads(payloads) {
        var merged = {
            quote: {
                quoteTitle: '',
                clientName: '',
                clientPhone: '',
                clientEmail: '',
                projectAddress: '',
                quoteNumber: '',
                rooms: []
            },
            sourceTotals: { subtotal: 0, tax: 0, total: 0, amountPaid: 0, balanceDue: 0, taxLabel: '', taxRate: null },
            sourceDocument: {},
            savedItemCandidates: [],
            warnings: []
        };
        var roomMap = {};
        var candidateKeys = {};

        asArray(payloads).forEach(function(payload) {
            var quote = payload && payload.quote || {};
            ['quoteTitle', 'clientName', 'clientPhone', 'clientEmail', 'projectAddress', 'quoteNumber'].forEach(function(key) {
                if (!merged.quote[key] && quote[key]) merged.quote[key] = String(quote[key]);
            });
            asArray(quote.rooms).forEach(function(room) {
                var name = String(room && room.name || 'Imported Quote').trim() || 'Imported Quote';
                var key = name.toLowerCase();
                if (!roomMap[key]) {
                    roomMap[key] = { name: name, items: [] };
                    merged.quote.rooms.push(roomMap[key]);
                }
                asArray(room && room.items).forEach(function(item) {
                    roomMap[key].items.push(item);
                });
            });
            var totals = payload && payload.sourceTotals || {};
            merged.sourceTotals.subtotal = Math.max(merged.sourceTotals.subtotal, parseMoney(totals.subtotal) || 0);
            merged.sourceTotals.tax = Math.max(merged.sourceTotals.tax, parseMoney(totals.tax) || 0);
            merged.sourceTotals.total = Math.max(merged.sourceTotals.total, parseMoney(totals.total) || 0);
            merged.sourceTotals.amountPaid = Math.max(merged.sourceTotals.amountPaid, parseMoney(totals.amountPaid || totals.amount_paid) || 0);
            merged.sourceTotals.balanceDue = Math.max(merged.sourceTotals.balanceDue, parseMoney(totals.balanceDue || totals.balance_due) || 0);
            if (!merged.sourceTotals.taxLabel && totals.taxLabel) merged.sourceTotals.taxLabel = String(totals.taxLabel);
            if (merged.sourceTotals.taxRate === null && totals.taxRate !== null && totals.taxRate !== undefined) merged.sourceTotals.taxRate = parseQuantity(totals.taxRate);
            if (!Object.keys(merged.sourceDocument).length && payload && (payload.sourceDocument || payload.source_document)) {
                merged.sourceDocument = payload.sourceDocument || payload.source_document;
            }
            asArray(payload && payload.savedItemCandidates).forEach(function(candidate) {
                var name = String(candidate && candidate.name || '').trim();
                if (!name) return;
                var key = String((candidate.category || '') + '::' + name + '::' + (candidate.unitType || candidate.unit || '')).toLowerCase();
                if (candidateKeys[key]) return;
                candidateKeys[key] = true;
                merged.savedItemCandidates.push(Object.assign({}, candidate, { defaultSelected: false }));
            });
            asArray(payload && payload.warnings).forEach(function(warning) {
                if (warning) merged.warnings.push(String(warning));
            });
        });

        if (payloads.length > 1) {
            merged.warnings.unshift('Large quote imported in ' + payloads.length + ' sections so QuoteDr could avoid server timeouts and capture more of the source document.');
        }
        return merged;
    }

    async function extractXlsxText(file) {
        await loadQuoteImportScript('XLSX', 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js');
        var buffer = await readFileAsArrayBuffer(file);
        var workbook = global.XLSX.read(buffer, { type: 'array' });
        return workbook.SheetNames.map(function(sheetName) {
            var rows = global.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
                header: 1,
                raw: false,
                defval: ''
            });
            var text = buildSheetTextFromRows(rows);
            return text ? '--- SHEET: ' + sheetName + ' ---\n' + text : '';
        }).filter(Boolean).join('\n\n');
    }

    async function extractFileText(file) {
        var type = detectFileType(file);
        if (type === 'image') return { text: '', images: [await prepareQuoteImportImage(file)], type: type };
        if (type === 'pdf') return extractPdfDocument(file);
        if (type === 'xlsx') return { text: await extractXlsxText(file), type: type };
        return { text: await readFileAsText(file), images: [], type: type };
    }

    function setImportStatus(html) {
        var el = document.getElementById('quoteImportStatus');
        if (el) el.innerHTML = html || '';
    }

    function setApplyButtonsEnabled(enabled) {
        ['quoteImportApplyBtn', 'quoteImportSaveCandidatesBtn', 'quoteImportExportDebugBtn'].forEach(function(id) {
            var btn = document.getElementById(id);
            if (btn) btn.disabled = !enabled;
        });
    }

    function buildQuoteImportRequests(sourceText, sourceImages) {
        var requests = [];
        var text = String(sourceText || '').trim();
        if (text) {
            splitQuoteImportText(text).forEach(function(chunk) {
                requests.push({ label: chunk.label, text: chunk.text, images: [] });
            });
        }
        var imageList = asArray(sourceImages);
        for (var imageIndex = 0; imageIndex < imageList.length; imageIndex += 4) {
            var imageBatch = imageList.slice(imageIndex, imageIndex + 4);
            requests.push({
                label: imageBatch.length === 1
                    ? (imageBatch[0].label || ('Photo ' + (imageIndex + 1)))
                    : 'Pages ' + (imageIndex + 1) + '-' + (imageIndex + imageBatch.length),
                text: '',
                images: imageBatch
            });
        }
        return requests;
    }

    function collectQuoteImportReviewIssues(parsed) {
        var issues = [];
        var subtotal = sumQuoteSubtotal(parsed && parsed.quote);
        var totals = normalizeTotals(parsed && parsed.sourceTotals);
        asArray(parsed && parsed.quote && parsed.quote.rooms).forEach(function(room) {
            asArray(room.items).forEach(function(item) {
                if (item.confidence !== null && item.confidence !== undefined && item.confidence < 0.85) {
                    issues.push('Low-confidence handwriting: ' + String(item.description || 'line item'));
                }
                asArray(item.reviewReasons).forEach(function(reason) { issues.push(String(reason)); });
            });
        });
        if (totals.subtotal && Math.abs(subtotal - totals.subtotal) > 0.01) {
            issues.push('Imported line items do not equal the source subtotal.');
        }
        if (totals.subtotal && totals.total && Math.abs((totals.subtotal + totals.tax) - totals.total) > 0.01) {
            issues.push('The source subtotal plus tax does not equal the source total.');
        }
        if (totals.total && totals.amountPaid && totals.balanceDue && Math.abs((totals.amountPaid + totals.balanceDue) - totals.total) > 0.01) {
            issues.push('The detected payment plus remaining balance does not equal the source total.');
        }
        return issues.filter(function(issue, index, all) { return all.indexOf(issue) === index; });
    }

    function refreshQuoteImportApplyAvailability() {
        var apply = document.getElementById('quoteImportApplyBtn');
        if (!apply) return;
        var acknowledged = document.getElementById('quoteImportReviewAcknowledged');
        apply.disabled = !_quoteImportState.parsed || (_quoteImportState.requiresReviewAcknowledgement && !(acknowledged && acknowledged.checked));
    }

    function renderImportLoadingStatus(progress) {
        progress = progress || {};
        var total = parseInt(progress.total || 0, 10) || 0;
        var current = parseInt(progress.current || 0, 10) || 0;
        var percent = total > 1 ? Math.max(6, Math.min(100, Math.round((current / total) * 100))) : 100;
        var title = total > 1
            ? 'AI is converting section ' + current + ' of ' + total + '...'
            : 'AI is converting the old quote...';
        var detail = total > 1
            ? 'Large quotes are converted in smaller sections so the server does not time out. This may take a few minutes depending on quote size.'
            : 'This may take a few minutes depending on quote size. Large files are parsed in sections so QuoteDr can capture more line items.';
        return '' +
            '<div class="alert alert-light py-2 small mb-0">' +
                '<div class="d-flex align-items-center gap-2 mb-2">' +
                    '<span class="spinner-border spinner-border-sm"></span>' +
                    '<strong>' + escapeHtml(title) + '</strong>' +
                '</div>' +
                '<div class="text-muted mb-2">' + escapeHtml(detail) + '</div>' +
                '<div class="progress" style="height:8px;">' +
                    '<div class="progress-bar progress-bar-striped progress-bar-animated bg-success" role="progressbar" style="width:' + percent + '%" aria-label="Quote import in progress"></div>' +
                '</div>' +
            '</div>';
    }

    function sumQuoteSubtotal(quote) {
        var sum = 0;
        asArray(quote && quote.rooms).forEach(function(room) {
            asArray(room.items).forEach(function(item) {
                sum += parseMoney(item.total) || 0;
            });
        });
        return Math.round(sum * 100) / 100;
    }

    function getCurrentQuoteDataFallback() {
        if (typeof collectQuoteData === 'function') return collectQuoteData();
        return {
            quoteTitle: document.getElementById('quoteTitle')?.value || '',
            clientName: document.getElementById('clientName')?.value || '',
            quoteNumber: document.getElementById('quoteNumber')?.value || '',
            clientPhone: document.getElementById('clientPhone')?.value || '',
            clientEmail: document.getElementById('clientEmail')?.value || '',
            projectAddress: document.getElementById('projectAddress')?.value || '',
            rooms: typeof rooms !== 'undefined' && Array.isArray(rooms) ? deepClone(rooms) : [],
            roomCounter: typeof roomCounter !== 'undefined' ? roomCounter : 0
        };
    }

    function prepareRoomsForBuilder(importedRooms, startCounter) {
        var nextId = parseInt(startCounter || 0, 10) || 0;
        return asArray(importedRooms).map(function(room) {
            nextId += 1;
            var cloned = deepClone(room);
            cloned.id = nextId;
            cloned.colorIndex = (nextId - 1) % ((global.ROOM_COLORS && global.ROOM_COLORS.length) || 8);
            cloned.markup = parseMoney(cloned.markup) || 0;
            cloned.items = asArray(cloned.items).map(scrubImportedItemForBuilder);
            return cloned;
        });
    }

    function renderQuoteImportPreview() {
        var container = document.getElementById('quoteImportPreview');
        if (!container || !_quoteImportState.parsed) return;
        var parsed = _quoteImportState.parsed;
        var quote = parsed.quote;
        var rooms = asArray(quote.rooms);
        var itemCount = rooms.reduce(function(sum, room) { return sum + asArray(room.items).length; }, 0);
        var subtotal = sumQuoteSubtotal(quote);
        var sourceSubtotal = parseMoney(parsed.sourceTotals && parsed.sourceTotals.subtotal) || 0;
        var sourceTax = parseMoney(parsed.sourceTotals && parsed.sourceTotals.tax) || 0;
        var sourceTotal = parseMoney(parsed.sourceTotals && parsed.sourceTotals.total) || 0;
        var sourceAmountPaid = parseMoney(parsed.sourceTotals && parsed.sourceTotals.amountPaid) || 0;
        var sourceBalanceDue = parseMoney(parsed.sourceTotals && parsed.sourceTotals.balanceDue) || 0;
        var sourceTaxLabel = String(parsed.sourceTotals && parsed.sourceTotals.taxLabel || 'HST/tax').trim() || 'HST/tax';
        var subtotalDifference = sourceSubtotal ? Math.round((subtotal - sourceSubtotal) * 100) / 100 : 0;
        var warnings = asArray(parsed.warnings);
        var reviewIssues = collectQuoteImportReviewIssues(parsed);
        _quoteImportState.requiresReviewAcknowledgement = reviewIssues.length > 0;

        var html = '<div class="alert alert-success py-2"><strong>Import ready.</strong> Found ' + rooms.length + ' room' + (rooms.length === 1 ? '' : 's') + ' and ' + itemCount + ' line item' + (itemCount === 1 ? '' : 's') + '.</div>';
        if (sourceSubtotal || sourceTotal) {
            html += '<div class="small text-muted mb-2">';
            if (sourceSubtotal) {
                html += '<div><strong>Subtotal check:</strong> Imported subtotal: $' + subtotal.toFixed(2) + ' | Source subtotal: $' + sourceSubtotal.toFixed(2) + ' | Difference: $' + Math.abs(subtotalDifference).toFixed(2) + (Math.abs(subtotalDifference) <= 1 ? ' <span class="text-success fw-semibold">(matches before tax)</span>' : '') + '</div>';
            } else {
                html += '<div><strong>Imported subtotal:</strong> $' + subtotal.toFixed(2) + '</div>';
            }
            if (sourceTax || sourceTotal) {
                html += '<div>Source ' + escapeHtml(sourceTaxLabel) + ': $' + sourceTax.toFixed(2) + ' | Source grand total: $' + sourceTotal.toFixed(2) + '</div>';
            }
            if (sourceAmountPaid || sourceBalanceDue) {
                html += '<div><strong>Historical payment:</strong> $' + sourceAmountPaid.toFixed(2) + ' | Remaining balance: $' + sourceBalanceDue.toFixed(2) + '</div>';
                html += '<div class="text-warning-emphasis"><i class="fas fa-shield-halved me-1"></i>Detected payment history is shown for verification only and will not be applied to the new QuoteDr quote.</div>';
            }
            html += '</div>';
        }
        if (warnings.length) {
            html += '<div class="alert alert-warning py-2 small mb-3">' + warnings.map(escapeHtml).join('<br>') + '</div>';
        }
        html += '<div class="table-responsive" style="max-height:320px; overflow:auto;"><table class="table table-sm align-middle">';
        rooms.forEach(function(room) {
            html += '<tr class="table-primary"><th colspan="5">' + escapeHtml(room.name) + '</th></tr>';
            html += '<tr class="small text-muted"><th>Description</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Total</th></tr>';
            room.items.forEach(function(item) {
                var previewDescription = item.itemDescription || item.notes || '';
                var lowConfidence = item.confidence !== null && item.confidence !== undefined && item.confidence < 0.85;
                var confidenceBadge = lowConfidence ? '<span class="badge text-bg-warning ms-1">Check handwriting</span>' : '';
                var sourceExcerpt = item.sourceExcerpt ? '<div class="small text-body-secondary">Read from: “' + escapeHtml(item.sourceExcerpt) + '”</div>' : '';
                html += '<tr' + (lowConfidence ? ' class="table-warning"' : '') + '><td><div class="fw-semibold">' + escapeHtml(item.description) + confidenceBadge + '</div>' + (previewDescription ? '<div class="small text-muted">' + escapeHtml(previewDescription) + '</div>' : '') + sourceExcerpt + '</td><td>' + escapeHtml(item.quantity) + '</td><td>' + escapeHtml(item.unitType) + '</td><td>$' + (parseMoney(item.rate) || 0).toFixed(2) + '</td><td>$' + (parseMoney(item.total) || 0).toFixed(2) + '</td></tr>';
            });
        });
        html += '</table></div>';
        if (reviewIssues.length) {
            html += '<div class="alert alert-warning py-2 small mt-3 mb-0"><strong>Review required before applying.</strong><ul class="mb-2 mt-1">' + reviewIssues.map(function(issue) { return '<li>' + escapeHtml(issue) + '</li>'; }).join('') + '</ul><label class="form-check mb-0"><input class="form-check-input" type="checkbox" id="quoteImportReviewAcknowledged"><span class="form-check-label">I checked the highlighted handwriting and source arithmetic.</span></label></div>';
        }
        container.innerHTML = html;
        var acknowledged = document.getElementById('quoteImportReviewAcknowledged');
        if (acknowledged) acknowledged.addEventListener('change', refreshQuoteImportApplyAvailability);
        renderSavedItemCandidates();
        refreshQuoteImportApplyAvailability();
    }

    function renderSavedItemCandidates() {
        var container = document.getElementById('quoteImportCandidates');
        if (!container || !_quoteImportState.parsed) return;
        var parsed = _quoteImportState.parsed;
        var candidates = asArray(parsed.savedItemCandidates);
        if (!candidates.length) candidates = extractSavedItemCandidates(parsed.quote);
        parsed.savedItemCandidates = candidates;
        if (!candidates.length) {
            container.innerHTML = '<div class="alert alert-light border small mb-0">No reusable saved item candidates were found.</div>';
            return;
        }
        var recommendedCount = candidates.filter(function(item) { return item.recommended !== false; }).length;
        var html = '<div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-2"><div class="fw-semibold">Optional: build your reusable item library</div>';
        if (recommendedCount) html += '<button type="button" class="btn btn-outline-primary btn-sm" onclick="selectRecommendedQuoteImportCandidates()"><i class="fas fa-check-double me-1"></i>Select recommended</button>';
        html += '</div>';
        html += '<div class="small text-muted mb-2">Nothing is saved unless you select it and click Save Selected Items. Permit fees, vague bundled work, and uncertain handwriting should stay unchecked.</div>';
        html += '<div class="quote-import-candidate-list">';
        candidates.forEach(function(item, index) {
            html += '<label class="d-flex gap-2 border rounded p-2 mb-2" for="quoteImportCandidate' + index + '">';
            html += '<input class="form-check-input mt-1 quote-import-candidate" type="checkbox" id="quoteImportCandidate' + index + '" data-index="' + index + '">';
            html += '<span><span class="fw-semibold">' + escapeHtml(item.name) + '</span>' + (item.recommended !== false ? '<span class="badge text-bg-light border ms-1">Recommended</span>' : '<span class="badge text-bg-warning ms-1">Review first</span>') + '<span class="small text-muted"> - ' + escapeHtml(item.category || 'Imported Quote') + ' | ' + escapeHtml(item.unitType || 'ls') + ' | $' + (parseMoney(item.rate) || 0).toFixed(2) + '</span>';
            if (item.description) html += '<span class="d-block small text-muted">' + escapeHtml(item.description) + '</span>';
            html += '</span></label>';
        });
        html += '</div>';
        container.innerHTML = html;
    }

    function selectRecommendedQuoteImportCandidates() {
        if (!_quoteImportState.parsed) return;
        asArray(_quoteImportState.parsed.savedItemCandidates).forEach(function(item, index) {
            var checkbox = document.getElementById('quoteImportCandidate' + index);
            if (checkbox) checkbox.checked = item.recommended !== false;
        });
    }

    async function openQuoteImportModal() {
        var allowed = true;
        if (typeof global.requireProFeature === 'function') {
            allowed = await global.requireProFeature('quote_import', 'Legacy Quote Import', { source: 'tools_menu' });
        } else if (typeof global.requireFeature === 'function') {
            allowed = await global.requireFeature('quote_import', 'Legacy Quote Import');
        }
        if (!allowed) return;
        _quoteImportState = { extractedText: '', sourceImages: [], fileName: '', fileType: 'paste', parsed: null, requiresReviewAcknowledgement: false, debugText: '', debugFileName: '' };
        var file = document.getElementById('quoteImportFile');
        var paste = document.getElementById('quoteImportPaste');
        var preview = document.getElementById('quoteImportPreview');
        var candidates = document.getElementById('quoteImportCandidates');
        var debugOutput = document.getElementById('quoteImportDebugOutput');
        var imagePreview = document.getElementById('quoteImportImagePreview');
        if (file) file.value = '';
        if (paste) paste.value = '';
        if (preview) preview.innerHTML = '';
        if (candidates) candidates.innerHTML = '';
        if (debugOutput) {
            debugOutput.style.display = 'none';
            debugOutput.innerHTML = '';
        }
        if (imagePreview) {
            imagePreview.style.display = 'none';
            imagePreview.innerHTML = '';
        }
        setImportStatus('');
        setApplyButtonsEnabled(false);
        var replaceRadio = document.getElementById('quoteImportModeReplace');
        var appendRadio = document.getElementById('quoteImportModeAppend');
        if (replaceRadio && appendRadio) {
            var currentData = getCurrentQuoteDataFallback();
            var hasRooms = Array.isArray(currentData.rooms) && currentData.rooms.length > 0;
            replaceRadio.checked = !hasRooms;
            appendRadio.checked = hasRooms;
        }
        new bootstrap.Modal(document.getElementById('quoteImportModal')).show();
    }

    async function handleQuoteImportFileChange(input) {
        var file = input && input.files && input.files[0];
        if (!file) return;
        setImportStatus('<div class="alert alert-light py-2 small"><span class="spinner-border spinner-border-sm me-2"></span>Reading ' + escapeHtml(file.name) + '...</div>');
        try {
            var extracted = await extractFileText(file);
            _quoteImportState.extractedText = extracted.text;
            _quoteImportState.sourceImages = asArray(extracted.images);
            _quoteImportState.fileName = file.name;
            _quoteImportState.fileType = extracted.type;
            var paste = document.getElementById('quoteImportPaste');
            if (paste) paste.value = extracted.text;
            var imagePreview = document.getElementById('quoteImportImagePreview');
            if (imagePreview) {
                if (_quoteImportState.sourceImages.length) {
                    imagePreview.style.display = '';
                    imagePreview.innerHTML = '<div class="small fw-semibold mb-2"><i class="fas fa-camera me-1"></i>' + _quoteImportState.sourceImages.length + ' page/photo' + (_quoteImportState.sourceImages.length === 1 ? '' : 's') + ' ready for handwriting recognition</div><img src="' + escapeHtml(_quoteImportState.sourceImages[0].dataUrl) + '" alt="Selected quote preview" class="img-fluid rounded border" style="max-height:240px;object-fit:contain;">';
                } else {
                    imagePreview.style.display = 'none';
                    imagePreview.innerHTML = '';
                }
            }
            var readyMessage = _quoteImportState.sourceImages.length
                ? 'Photo prepared. QuoteDr will read handwriting and flag uncertain lines for review.'
                : 'File text extracted. Review or edit the text, then click Parse Quote.';
            setImportStatus('<div class="alert alert-success py-2 small"><i class="fas fa-check-circle me-1"></i>' + escapeHtml(readyMessage) + '</div>');
        } catch (err) {
            setImportStatus('<div class="alert alert-danger py-2 small">File read failed: ' + escapeHtml(err.message || err) + '</div>');
        }
    }

    async function runQuoteImport() {
        var paste = document.getElementById('quoteImportPaste');
        var parseButton = document.getElementById('quoteImportParseBtn');
        var content = String((paste && paste.value) || _quoteImportState.extractedText || '').trim();
        var sourceImages = asArray(_quoteImportState.sourceImages);
        if (!content && !sourceImages.length) {
            setImportStatus('<div class="alert alert-warning py-2 small">Upload a photo or file, or paste quote text first.</div>');
            return;
        }
        setApplyButtonsEnabled(false);
        if (parseButton) parseButton.disabled = true;
        setImportStatus(renderImportLoadingStatus());
        try {
            if (typeof getSupabaseFunctionAuthHeaders !== 'function') {
                throw new Error('Please sign in before using AI quote import.');
            }
            var headers = await getSupabaseFunctionAuthHeaders();
            var chunks = buildQuoteImportRequests(content, sourceImages);
            var payloads = [];
            for (var index = 0; index < chunks.length; index++) {
                setImportStatus(renderImportLoadingStatus({
                    current: index + 1,
                    total: chunks.length
                }));
                payloads.push(await requestQuoteImportChunk(headers, chunks[index], index, chunks.length));
            }
            var parsed = recoverMissingSourceRows(
                normalizeImportedQuote(payloads.length > 1 ? mergeImportedQuotePayloads(payloads) : payloads[0]),
                content
            );
            if (!parsed.quote.rooms.length) throw new Error('No quote rooms or line items were found.');
            if (!parsed.savedItemCandidates.length) parsed.savedItemCandidates = extractSavedItemCandidates(parsed.quote);
            _quoteImportState.parsed = parsed;
            renderQuoteImportPreview();
            setImportStatus('');
            setApplyButtonsEnabled(true);
            refreshQuoteImportApplyAvailability();
        } catch (err) {
            setImportStatus('<div class="alert alert-danger py-2 small">Import failed: ' + escapeHtml(err.message || err) + '</div>');
        } finally {
            if (parseButton) parseButton.disabled = false;
        }
    }

    async function readQuoteImportResponse(response) {
        var text = await response.text();
        var data = {};
        if (text) {
            try {
                data = JSON.parse(text);
            } catch (err) {
                data = {};
            }
        }
        if (!response.ok || data.error) {
            var message = data.error || ('Server error: ' + response.status);
            if (response.status === 546) {
                message = 'The server timed out while converting this quote section. Try again; if it repeats, remove blank/hidden spreadsheet rows or split the old quote by floor.';
            }
            throw new Error(message);
        }
        return data;
    }

    async function requestQuoteImportChunk(headers, chunk, index, total) {
        var response = await fetch(QUOTE_IMPORT_URL, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                sourceText: chunk.text,
                sourceImages: asArray(chunk.images).map(function(image) {
                    return { dataUrl: image.dataUrl, label: image.label || chunk.label };
                }),
                fileName: _quoteImportState.fileName || 'Pasted quote',
                fileType: _quoteImportState.fileType || 'paste',
                clientChunkIndex: index + 1,
                clientChunkTotal: total,
                clientChunkLabel: chunk.label
            })
        });
        return readQuoteImportResponse(response);
    }

    function safeExportFileName(name) {
        var base = String(name || 'legacy-quote')
            .replace(/\.[^.]+$/, '')
            .replace(/[^a-z0-9]+/gi, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 80) || 'legacy-quote';
        return base.toLowerCase();
    }

    function downloadTextFile(fileName, text, mimeType) {
        var blob = new Blob([text], { type: mimeType || 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(function() { URL.revokeObjectURL(url); }, 1000);
    }

    function getQuoteImportDebugPayload() {
        if (!_quoteImportState.parsed) {
            return null;
        }
        var paste = document.getElementById('quoteImportPaste');
        return buildQuoteImportDebugPayload({
            parsed: _quoteImportState.parsed,
            extractedText: String((paste && paste.value) || _quoteImportState.extractedText || ''),
            fileName: _quoteImportState.fileName || 'legacy-quote',
            fileType: _quoteImportState.fileType || 'paste',
            sourceImageCount: asArray(_quoteImportState.sourceImages).length
        });
    }

    async function copyDebugTextToClipboard(text) {
        if (!global.navigator || !global.navigator.clipboard || typeof global.navigator.clipboard.writeText !== 'function') return false;
        try {
            await global.navigator.clipboard.writeText(text);
            return true;
        } catch (err) {
            return false;
        }
    }

    function copyDebugTextWithTextarea(text) {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', 'readonly');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        var copied = false;
        try {
            copied = document.execCommand && document.execCommand('copy');
        } catch (err) {
            copied = false;
        }
        textarea.remove();
        return !!copied;
    }

    function renderQuoteImportDebugOutput(fileName, jsonText, copied) {
        var container = document.getElementById('quoteImportDebugOutput');
        if (!container) return;
        container.style.display = 'block';
        container.innerHTML = '' +
            '<div class="border rounded p-2 bg-light">' +
                '<div class="d-flex justify-content-between align-items-center gap-2 flex-wrap mb-2">' +
                    '<div class="small fw-semibold"><i class="fas fa-bug me-1"></i>Debug JSON ready</div>' +
                    '<div class="d-flex gap-2 flex-wrap">' +
                        '<button type="button" class="btn btn-outline-primary btn-sm" onclick="copyQuoteImportDebugJson()"><i class="fas fa-copy me-1"></i>Copy JSON</button>' +
                        '<button type="button" class="btn btn-outline-secondary btn-sm" onclick="downloadQuoteImportDebugJson()"><i class="fas fa-download me-1"></i>Download JSON</button>' +
                    '</div>' +
                '</div>' +
                '<div class="small text-muted mb-2">' + escapeHtml(copied ? 'Copied to clipboard too. If the file download goes missing, use Copy JSON and paste it into a .json file.' : 'Use Copy JSON if the browser download goes missing.') + '</div>' +
                '<input class="form-control form-control-sm mb-2" readonly value="' + escapeHtml(fileName) + '">' +
                '<textarea class="form-control font-monospace small" rows="8" readonly>' + escapeHtml(jsonText) + '</textarea>' +
            '</div>';
    }

    async function exportQuoteImportDebug() {
        var payload = getQuoteImportDebugPayload();
        if (!payload) {
            setImportStatus('<div class="alert alert-warning py-2 small">Parse a quote before exporting debug data.</div>');
            return;
        }
        var fileName = 'quote-import-debug-' + safeExportFileName(payload.fileName) + '.json';
        var jsonText = JSON.stringify(payload, null, 2);
        var copied = await copyDebugTextToClipboard(jsonText);
        if (!copied) copied = copyDebugTextWithTextarea(jsonText);
        _quoteImportState.debugText = jsonText;
        _quoteImportState.debugFileName = fileName;
        renderQuoteImportDebugOutput(fileName, jsonText, copied);
        downloadTextFile(fileName, jsonText, 'application/json;charset=utf-8');
        var message = 'Debug JSON is shown below and a browser download was attempted.';
        if (copied) message += ' It was also copied to your clipboard.';
        if (!copied) message += ' Use the Copy JSON button if the download cannot be found.';
        setImportStatus('<div class="alert alert-info py-2 small"><i class="fas fa-bug me-1"></i>' + escapeHtml(message) + ' It includes the extracted source text, imported QuoteDr rooms/items, CSV line items, totals, and warnings.</div>');
    }

    async function copyQuoteImportDebugJson() {
        if (!_quoteImportState.debugText) {
            setImportStatus('<div class="alert alert-warning py-2 small">Export debug data first.</div>');
            return;
        }
        var copied = await copyDebugTextToClipboard(_quoteImportState.debugText);
        if (!copied) copied = copyDebugTextWithTextarea(_quoteImportState.debugText);
        setImportStatus('<div class="alert alert-' + (copied ? 'success' : 'warning') + ' py-2 small">' + (copied ? 'Debug JSON copied to clipboard.' : 'Could not copy automatically. Select the debug textarea and copy manually.') + '</div>');
    }

    function downloadQuoteImportDebugJson() {
        if (!_quoteImportState.debugText) {
            setImportStatus('<div class="alert alert-warning py-2 small">Export debug data first.</div>');
            return;
        }
        downloadTextFile(_quoteImportState.debugFileName || 'quote-import-debug.json', _quoteImportState.debugText, 'application/json;charset=utf-8');
        setImportStatus('<div class="alert alert-info py-2 small">Browser download attempted. If it does not appear, use Copy JSON instead.</div>');
    }

    function applyImportedQuote() {
        var parsed = _quoteImportState.parsed;
        if (!parsed || !parsed.quote || !parsed.quote.rooms.length) return;
        var acknowledged = document.getElementById('quoteImportReviewAcknowledged');
        if (_quoteImportState.requiresReviewAcknowledgement && !(acknowledged && acknowledged.checked)) {
            setImportStatus('<div class="alert alert-warning py-2 small">Check the highlighted handwriting and arithmetic, then confirm the review checkbox before applying.</div>');
            return;
        }
        var mode = document.querySelector('input[name="quoteImportApplyMode"]:checked')?.value || 'replace';
        var quote = deepClone(parsed.quote);
        var currentData = getCurrentQuoteDataFallback();
        var existingRooms = asArray(currentData.rooms);
        var importedRooms = prepareRoomsForBuilder(quote.rooms, mode === 'replace' ? 0 : (currentData.roomCounter || existingRooms.length));
        var nextCounter = (mode === 'replace' ? 0 : (currentData.roomCounter || existingRooms.length)) + importedRooms.length;
        var appliedData = mode === 'replace' ? {
            quoteTitle: quote.quoteTitle || 'Imported Quote',
            clientName: quote.clientName || '',
            quoteNumber: quote.quoteNumber || document.getElementById('quoteNumber')?.value || '',
            clientPhone: quote.clientPhone || '',
            clientEmail: quote.clientEmail || '',
            projectAddress: quote.projectAddress || '',
            status: 'draft',
            rooms: importedRooms,
            roomCounter: nextCounter
        } : {
            ...currentData,
            quoteTitle: currentData.quoteTitle || quote.quoteTitle || 'Imported Quote',
            clientName: currentData.clientName || quote.clientName || '',
            quoteNumber: currentData.quoteNumber || quote.quoteNumber || '',
            clientPhone: currentData.clientPhone || quote.clientPhone || '',
            clientEmail: currentData.clientEmail || quote.clientEmail || '',
            projectAddress: currentData.projectAddress || quote.projectAddress || '',
            rooms: existingRooms.concat(importedRooms),
            roomCounter: nextCounter
        };

        if (typeof applyQuoteData === 'function') {
            applyQuoteData(appliedData);
        } else {
            if (document.getElementById('quoteTitle')) document.getElementById('quoteTitle').value = appliedData.quoteTitle || '';
            if (document.getElementById('clientName')) document.getElementById('clientName').value = appliedData.clientName || '';
            if (document.getElementById('clientPhone')) document.getElementById('clientPhone').value = appliedData.clientPhone || '';
            if (document.getElementById('clientEmail')) document.getElementById('clientEmail').value = appliedData.clientEmail || '';
            if (document.getElementById('projectAddress')) document.getElementById('projectAddress').value = appliedData.projectAddress || '';
            if (document.getElementById('quoteNumber')) document.getElementById('quoteNumber').value = appliedData.quoteNumber || '';
            if (typeof rooms !== 'undefined') rooms = appliedData.rooms;
            if (typeof roomCounter !== 'undefined') roomCounter = appliedData.roomCounter;
            if (typeof global.renderRooms === 'function') global.renderRooms();
        }

        if (typeof global.calculateTotals === 'function') global.calculateTotals();
        if (typeof global.markUnsaved === 'function') global.markUnsaved();
        if (typeof global.updateDraftWarning === 'function') global.updateDraftWarning();

        if (mode === 'replace') {
            window._supabaseQuoteId = null;
            localStorage.removeItem('ald_active_quote_id');
        }

        var sourceTotal = parsed.sourceTotals.total || 0;
        var displayedTotal = parseMoney(document.getElementById('grandTotalDisplay')?.textContent || '0') || 0;
        var message = 'Imported quote added. Review totals before sending.';
        if (sourceTotal && displayedTotal && Math.abs(sourceTotal - displayedTotal) > 1) {
            message += ' Source total was $' + sourceTotal.toFixed(2) + '; QuoteDr now shows $' + displayedTotal.toFixed(2) + '.';
        }
        setImportStatus('<div class="alert alert-success py-2 small"><i class="fas fa-check-circle me-1"></i>' + escapeHtml(message) + '</div>');
        var modal = bootstrap.Modal.getInstance(document.getElementById('quoteImportModal'));
        if (modal) setTimeout(function() { modal.hide(); }, 900);
    }

    async function saveQuoteImportCandidates() {
        var parsed = _quoteImportState.parsed;
        if (!parsed) return;
        var selected = Array.from(document.querySelectorAll('.quote-import-candidate:checked')).map(function(input) {
            return parsed.savedItemCandidates[parseInt(input.dataset.index, 10)];
        }).filter(Boolean);
        if (!selected.length) {
            setImportStatus('<div class="alert alert-warning py-2 small">Choose at least one candidate to save.</div>');
            return;
        }
        var customItems = {};
        try { customItems = JSON.parse(localStorage.getItem('ald_custom_items') || '{}'); } catch(e) { customItems = {}; }
        var savedCount = 0;
        selected.forEach(function(item) {
            var category = item.category || 'Imported Quote';
            if (!Array.isArray(customItems[category])) customItems[category] = [];
            var exists = customItems[category].some(function(existing) {
                return String(existing.name || '').trim().toLowerCase() === String(item.name || '').trim().toLowerCase();
            });
            if (exists) return;
            customItems[category].push({
                name: item.name,
                unitType: normalizeUnit(item.unitType),
                rate: parseMoney(item.rate) || 0,
                materialCost: parseMoney(item.materialCost) || 0,
                supplierUrl: '',
                itemDescription: item.description || ''
            });
            savedCount++;
        });
        localStorage.setItem('ald_custom_items', JSON.stringify(customItems));
        if (typeof global.loadCustomItems === 'function') global.loadCustomItems();
        if (typeof global.saveCustomItems === 'function') global.saveCustomItems(false);
        if (typeof global.updatePricingOptions === 'function') global.updatePricingOptions();
        setImportStatus('<div class="alert alert-success py-2 small"><i class="fas fa-check-circle me-1"></i>Saved ' + savedCount + ' new item' + (savedCount === 1 ? '' : 's') + ' to Manage Items.</div>');
    }

    function initQuoteImport() {
        var file = document.getElementById('quoteImportFile');
        if (file) file.addEventListener('change', function() { handleQuoteImportFileChange(file); });
    }

    if (global.document && typeof global.document.addEventListener === 'function') {
        global.document.addEventListener('DOMContentLoaded', initQuoteImport);
    }

    global.QuoteDrQuoteImport = {
        parseMoney: parseMoney,
        normalizeUnit: normalizeUnit,
        buildPdfPageTextFromItems: buildPdfPageTextFromItems,
        buildSheetTextFromRows: buildSheetTextFromRows,
        splitQuoteImportText: splitQuoteImportText,
        mergeImportedQuotePayloads: mergeImportedQuotePayloads,
        buildImportedQuoteCsv: buildImportedQuoteCsv,
        buildQuoteImportDebugPayload: buildQuoteImportDebugPayload,
        getQuoteImportDebugPayload: getQuoteImportDebugPayload,
        recoverMissingSourceRows: recoverMissingSourceRows,
        prepareRoomsForBuilder: prepareRoomsForBuilder,
        normalizeImportedQuote: normalizeImportedQuote,
        extractSavedItemCandidates: extractSavedItemCandidates,
        extractFileText: extractFileText,
        detectFileType: detectFileType,
        buildQuoteImportRequests: buildQuoteImportRequests,
        collectQuoteImportReviewIssues: collectQuoteImportReviewIssues
    };
    global.openQuoteImportModal = openQuoteImportModal;
    global.handleQuoteImportFileChange = handleQuoteImportFileChange;
    global.runQuoteImport = runQuoteImport;
    global.applyImportedQuote = applyImportedQuote;
    global.saveQuoteImportCandidates = saveQuoteImportCandidates;
    global.selectRecommendedQuoteImportCandidates = selectRecommendedQuoteImportCandidates;
    global.exportQuoteImportDebug = exportQuoteImportDebug;
    global.copyQuoteImportDebugJson = copyQuoteImportDebugJson;
    global.downloadQuoteImportDebugJson = downloadQuoteImportDebugJson;
})(typeof window !== 'undefined' ? window : globalThis);
