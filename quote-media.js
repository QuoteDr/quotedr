// Shared photo preparation and storage helpers for QuoteDr cloud payloads.
(function(root, factory) {
    var api = factory(root || {});
    if (typeof module === 'object' && module.exports) module.exports = api;
    if (root) root.QuoteDrMedia = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(global) {
    'use strict';

    var PHOTO_BUCKET = 'item-full-res-photos';
    var THUMBNAIL_MAX_DIMENSION = 600;
    var THUMBNAIL_QUALITY = 0.78;
    var uploadPromises = {};

    function isEmbeddedImage(value) {
        return typeof value === 'string' && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value);
    }

    function deepClone(value) {
        if (value === undefined) return undefined;
        return JSON.parse(JSON.stringify(value));
    }

    function commitValue(target, source) {
        if (Array.isArray(target) && Array.isArray(source)) {
            target.splice.apply(target, [0, target.length].concat(source));
            return target;
        }
        if (!target || typeof target !== 'object' || !source || typeof source !== 'object') return source;
        Object.keys(target).forEach(function(key) { delete target[key]; });
        Object.keys(source).forEach(function(key) { target[key] = source[key]; });
        return target;
    }

    function dataUrlToBlob(dataUrl) {
        if (!isEmbeddedImage(dataUrl)) throw new Error('Unsupported embedded photo format.');
        var parts = dataUrl.split(',');
        var mimeType = (parts[0].match(/^data:([^;]+)/i) || [])[1] || 'image/jpeg';
        var binary = global.atob ? global.atob(parts[1]) : Buffer.from(parts[1], 'base64').toString('binary');
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        return new Blob([bytes], { type: mimeType });
    }

    function blobToDataUrl(blob) {
        return new Promise(function(resolve, reject) {
            if (typeof FileReader === 'undefined') {
                reject(new Error('Photo previews are unavailable in this browser.'));
                return;
            }
            var reader = new FileReader();
            reader.onload = function() { resolve(reader.result); };
            reader.onerror = function() { reject(reader.error || new Error('Could not read photo.')); };
            reader.readAsDataURL(blob);
        });
    }

    async function sha256Hex(blob) {
        var cryptoApi = global.crypto;
        if (!cryptoApi || !cryptoApi.subtle) throw new Error('Secure photo hashing is unavailable.');
        var digest = await cryptoApi.subtle.digest('SHA-256', await blob.arrayBuffer());
        return Array.from(new Uint8Array(digest)).map(function(byte) {
            return byte.toString(16).padStart(2, '0');
        }).join('');
    }

    function extensionForMime(mimeType) {
        var clean = String(mimeType || '').toLowerCase();
        if (clean.indexOf('webp') !== -1) return 'webp';
        if (clean.indexOf('png') !== -1) return 'png';
        if (clean.indexOf('gif') !== -1) return 'gif';
        return 'jpg';
    }

    async function getStorageContext(options) {
        options = options || {};
        var client = options.client || global._supabase || global._supabaseClient;
        if (!client || !client.storage || !client.auth) throw new Error('Sign in to store quote photos.');
        var userId = options.userId || '';
        if (!userId) {
            var userResult = await client.auth.getUser();
            userId = userResult && userResult.data && userResult.data.user && userResult.data.user.id;
        }
        if (!userId) throw new Error('Sign in to store quote photos.');
        return { client: client, userId: userId };
    }

    async function uploadThumbnailBlob(blob, context, options) {
        options = Object.assign({}, context || {}, options || {});
        if (!blob) throw new Error('Missing thumbnail data.');
        var storage = await getStorageContext(options);
        var hash = await sha256Hex(blob);
        var extension = extensionForMime(blob.type);
        var path = storage.userId + '/thumbnails/' + hash + '.' + extension;
        if (!uploadPromises[path]) {
            uploadPromises[path] = (async function() {
                var bucket = storage.client.storage.from(options.bucket || PHOTO_BUCKET);
                var upload = await bucket.upload(path, blob, {
                    contentType: blob.type || 'image/jpeg',
                    cacheControl: '31536000',
                    upsert: false
                });
                if (upload && upload.error) {
                    var status = upload.error.statusCode || upload.error.status || 0;
                    var message = String(upload.error.message || upload.error);
                    if (Number(status) !== 409 && !/already exists|duplicate/i.test(message)) throw upload.error;
                }
                var publicResult = bucket.getPublicUrl(path);
                var publicUrl = publicResult && publicResult.data && publicResult.data.publicUrl;
                if (!publicUrl) throw new Error('Photo storage did not return a public URL.');
                return publicUrl;
            })().catch(function(error) {
                delete uploadPromises[path];
                throw error;
            });
        }
        return uploadPromises[path];
    }

    async function uploadDataUrl(dataUrl, context, options) {
        return uploadThumbnailBlob(dataUrlToBlob(dataUrl), context, options);
    }

    async function createThumbnailBlob(file, options) {
        options = options || {};
        if (!file || !String(file.type || '').toLowerCase().startsWith('image/')) {
            throw new Error('Choose an image file.');
        }
        if (typeof document === 'undefined' || typeof Image === 'undefined' || !global.URL) {
            throw new Error('Photo resizing is unavailable in this environment.');
        }
        var imageUrl = global.URL.createObjectURL(file);
        try {
            var image = await new Promise(function(resolve, reject) {
                var img = new Image();
                img.onload = function() { resolve(img); };
                img.onerror = function() { reject(new Error('Could not decode that photo.')); };
                img.src = imageUrl;
            });
            var maxDimension = Math.max(1, parseInt(options.maxDimension || THUMBNAIL_MAX_DIMENSION, 10));
            var width = image.naturalWidth || image.width;
            var height = image.naturalHeight || image.height;
            if (width > maxDimension || height > maxDimension) {
                var scale = Math.min(maxDimension / width, maxDimension / height);
                width = Math.max(1, Math.round(width * scale));
                height = Math.max(1, Math.round(height * scale));
            }
            var canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            var ctx = canvas.getContext('2d');
            if (!ctx) throw new Error('Could not prepare photo thumbnail.');
            ctx.drawImage(image, 0, 0, width, height);
            var quality = Number(options.quality || THUMBNAIL_QUALITY);
            var preferredType = options.mimeType || 'image/webp';
            var blob = await new Promise(function(resolve) { canvas.toBlob(resolve, preferredType, quality); });
            if (!blob) blob = await new Promise(function(resolve) { canvas.toBlob(resolve, 'image/jpeg', quality); });
            if (!blob) throw new Error('Could not encode photo thumbnail.');
            return {
                blob: blob,
                width: width,
                height: height,
                sourceWidth: image.naturalWidth || image.width,
                sourceHeight: image.naturalHeight || image.height,
                mimeType: blob.type || 'image/jpeg'
            };
        } finally {
            global.URL.revokeObjectURL(imageUrl);
        }
    }

    function isPhotoValueKey(key) {
        return String(key || '').toLowerCase() === 'photo';
    }

    function isPhotoArrayKey(key) {
        return String(key || '').toLowerCase() === 'photos';
    }

    async function prepareQuoteForCloud(source, options) {
        options = options || {};
        var working = deepClone(source || {});
        var replacementCache = {};
        var replacements = [];
        var bytesRemoved = 0;
        var upload = options.uploadDataUrl || function(value, context) {
            return uploadDataUrl(value, context, options);
        };

        async function replaceEmbedded(value, context) {
            if (!replacementCache[value]) {
                replacementCache[value] = Promise.resolve(upload(value, context)).then(function(url) {
                    if (!url || isEmbeddedImage(url)) throw new Error('Photo migration did not return a storage URL.');
                    replacements.push({ from: value, to: url });
                    return url;
                });
            }
            var next = await replacementCache[value];
            bytesRemoved += Math.max(0, value.length - next.length);
            return next;
        }

        async function visit(node, parentKey, path) {
            if (!node || typeof node !== 'object') return;
            if (Array.isArray(node)) {
                for (var index = 0; index < node.length; index += 1) {
                    if (isPhotoArrayKey(parentKey) && isEmbeddedImage(node[index])) {
                        node[index] = await replaceEmbedded(node[index], { path: path.concat(index), key: parentKey });
                    } else {
                        await visit(node[index], parentKey, path.concat(index));
                    }
                }
                return;
            }
            var keys = Object.keys(node);
            for (var i = 0; i < keys.length; i += 1) {
                var key = keys[i];
                var value = node[key];
                if (isPhotoValueKey(key) && isEmbeddedImage(value)) {
                    node[key] = await replaceEmbedded(value, { path: path.concat(key), key: key });
                    continue;
                }
                if (key === 'items_snapshot' && typeof value === 'string' && value.trim().charAt(0) === '{') {
                    try {
                        var parsed = JSON.parse(value);
                        await visit(parsed, key, path.concat(key));
                        node[key] = JSON.stringify(parsed);
                    } catch (error) {
                        if (options.strictSnapshot === true) throw error;
                    }
                    continue;
                }
                await visit(value, key, path.concat(key));
            }
        }

        await visit(working, '', []);
        var output = options.mutate === false ? working : commitValue(source, working);
        return {
            data: output,
            replacements: replacements,
            bytesRemoved: bytesRemoved,
            migratedCount: replacements.length
        };
    }

    function countEmbeddedPhotos(source) {
        var count = 0;
        function visit(node, parentKey) {
            if (!node || typeof node !== 'object') return;
            if (Array.isArray(node)) {
                node.forEach(function(value) {
                    if (isPhotoArrayKey(parentKey) && isEmbeddedImage(value)) count += 1;
                    else visit(value, parentKey);
                });
                return;
            }
            Object.keys(node).forEach(function(key) {
                var value = node[key];
                if (isPhotoValueKey(key) && isEmbeddedImage(value)) {
                    count += 1;
                } else if (key === 'items_snapshot' && typeof value === 'string' && value.trim().charAt(0) === '{') {
                    try { visit(JSON.parse(value), key); } catch (error) {}
                } else {
                    visit(value, key);
                }
            });
        }
        visit(source, '');
        return count;
    }

    return {
        PHOTO_BUCKET: PHOTO_BUCKET,
        THUMBNAIL_MAX_DIMENSION: THUMBNAIL_MAX_DIMENSION,
        THUMBNAIL_QUALITY: THUMBNAIL_QUALITY,
        isEmbeddedImage: isEmbeddedImage,
        dataUrlToBlob: dataUrlToBlob,
        blobToDataUrl: blobToDataUrl,
        createThumbnailBlob: createThumbnailBlob,
        uploadThumbnailBlob: uploadThumbnailBlob,
        uploadDataUrl: uploadDataUrl,
        prepareQuoteForCloud: prepareQuoteForCloud,
        countEmbeddedPhotos: countEmbeddedPhotos
    };
});
