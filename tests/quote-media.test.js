const assert = require('assert');

const QuoteDrMedia = require('../quote-media.js');

const embeddedPhoto = 'data:image/jpeg;base64,' + Buffer.from('quotedr-photo').toString('base64');
const signature = 'data:image/png;base64,' + Buffer.from('signature').toString('base64');

async function run() {
  const source = {
    rooms: [{
      photos: [embeddedPhoto],
      items: [{
        photo: embeddedPhoto,
        photos: [embeddedPhoto, 'https://example.com/already-stored.webp'],
        photoFull: { url: 'https://example.com/full.jpg', path: 'full.jpg' },
        upgradeGroups: [{ options: [{ photo: embeddedPhoto, photos: [embeddedPhoto] }] }]
      }]
    }],
    clientSignature: signature,
    companyLogo: signature,
    items_snapshot: JSON.stringify({ Decks: [{ name: 'Rail', photo: embeddedPhoto }] })
  };
  const originalJson = JSON.stringify(source);
  const uploadCalls = [];

  const result = await QuoteDrMedia.prepareQuoteForCloud(source, {
    mutate: false,
    uploadDataUrl: async function(dataUrl) {
      uploadCalls.push(dataUrl);
      return 'https://storage.example/thumb.webp';
    }
  });

  assert.strictEqual(JSON.stringify(source), originalJson, 'non-mutating preparation should leave the source untouched');
  assert.strictEqual(uploadCalls.length, 1, 'repeated embedded thumbnails should upload once');
  assert.strictEqual(result.data.rooms[0].photos[0], 'https://storage.example/thumb.webp');
  assert.strictEqual(result.data.rooms[0].items[0].photo, 'https://storage.example/thumb.webp');
  assert.strictEqual(result.data.rooms[0].items[0].photos[1], 'https://example.com/already-stored.webp');
  assert.strictEqual(result.data.rooms[0].items[0].photoFull.url, 'https://example.com/full.jpg', 'full-resolution metadata must remain unchanged');
  assert.strictEqual(result.data.clientSignature, signature, 'signature data must not be treated as a line-item photo');
  assert.strictEqual(result.data.companyLogo, signature, 'company logos must not be treated as line-item photos');
  assert.strictEqual(JSON.parse(result.data.items_snapshot).Decks[0].photo, 'https://storage.example/thumb.webp');
  assert.strictEqual(result.replacements.length, 1);
  assert(result.bytesRemoved > 0, 'migration should report removed embedded bytes');
  assert.strictEqual(QuoteDrMedia.countEmbeddedPhotos(result.data), 0);

  const mutable = { rooms: [{ items: [{ photo: embeddedPhoto }] }] };
  await QuoteDrMedia.prepareQuoteForCloud(mutable, {
    uploadDataUrl: async function() { return 'https://storage.example/mutated.webp'; }
  });
  assert.strictEqual(mutable.rooms[0].items[0].photo, 'https://storage.example/mutated.webp', 'default preparation should update the caller after successful uploads');

  const failed = { rooms: [{ items: [{ photo: embeddedPhoto }] }] };
  await assert.rejects(function() {
    return QuoteDrMedia.prepareQuoteForCloud(failed, {
      uploadDataUrl: async function() { throw new Error('storage unavailable'); }
    });
  }, /storage unavailable/);
  assert.strictEqual(failed.rooms[0].items[0].photo, embeddedPhoto, 'failed uploads must leave the source payload untouched');

  console.log('quote media checks passed');
}

run().catch(function(error) {
  console.error(error);
  process.exitCode = 1;
});
