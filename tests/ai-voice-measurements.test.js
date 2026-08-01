const assert = require('assert');
const fs = require('fs');
const path = require('path');

function sourceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert(start >= 0 && end > start, `Could not extract ${startMarker}`);
  return source.slice(start, end);
}

(async function run() {
  const helperPath = path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'voice-quote-measurements.mjs');
  const measurements = await import('file:///' + helperPath.replace(/\\/g, '/'));
  const transcript = [
    'Master Bedroom 10 x 11 paint the walls.',
    'Hallway 8 by 9 paint the walls.',
    'Kitchen 12 x 14 paint the walls.',
    'Living Room 15 x 16 paint the walls.',
    'Office 9 x 10 with 9 foot ceilings paint the walls.',
    'Laundry Room paint the walls.'
  ].join(' Next room. ');

  const sections = measurements.splitVoiceRoomSections(transcript);
  assert.strictEqual(sections.length, 6, 'every Next room marker should create a hard room section');
  assert(sections[3].startsWith('Living Room'), 'room sections should retain spoken order');
  const formatted = measurements.formatVoiceRoomTranscript(transcript);
  assert(formatted.includes('exactly 6 room objects'), 'the AI input should state the exact section count');
  assert(formatted.includes('[ROOM SECTION 6 OF 6]'), 'the AI input should label every room without a display cap');

  function wallRoom(name, sourceOrder) {
    return {
      name,
      sourceOrder,
      items: [{ category: 'Painting', description: 'Paint walls', spokenPhrase: 'paint the walls', unit: 'sqft', rate: 2 }]
    };
  }

  const parsed = {
    rooms: [
      wallRoom('Laundry Room', 6),
      wallRoom('Kitchen', 3),
      wallRoom('Master Bedroom', 1),
      wallRoom('Office', 5),
      wallRoom('Hallway', 2),
      wallRoom('Living Room', 4)
    ]
  };
  measurements.normalizePaintQuantities(parsed, transcript);
  assert.deepStrictEqual(
    parsed.rooms.map((room) => room.name),
    ['Master Bedroom', 'Hallway', 'Kitchen', 'Living Room', 'Office', 'Laundry Room'],
    'normalized rooms should follow source order even if the AI response was reordered'
  );
  assert.deepStrictEqual(
    parsed.rooms.slice(0, 4).map((room) => [room.dimensions.length, room.dimensions.width]),
    [[10, 11], [8, 9], [12, 14], [15, 16]],
    'each room should use dimensions from its own spoken section'
  );
  assert.strictEqual(parsed.rooms[0].items[0].needsMeasurement, 'ceiling_height');
  assert.strictEqual(parsed.rooms[4].dimensions.heightProvided, true, 'spoken ceiling height should not be requested again');
  assert.strictEqual(parsed.rooms[4].items[0].needsMeasurement, undefined);
  assert.strictEqual(parsed.rooms[5].items[0].needsMeasurement, 'room_dimensions', 'missing length and width should reach measurement review');

  const unsegmentedTranscript = 'Master Bedroom 10 x 11 paint the walls. Hallway 8 x 9 paint the walls. Kitchen 12 x 14 paint the walls.';
  const unsegmented = { rooms: [
    wallRoom('Kitchen', 3),
    wallRoom('Master Bedroom', 1),
    wallRoom('Hallway', 2)
  ] };
  measurements.normalizePaintQuantities(unsegmented, unsegmentedTranscript);
  assert.deepStrictEqual(
    unsegmented.rooms.map((room) => [room.name, room.dimensions.length, room.dimensions.width]),
    [['Master Bedroom', 10, 11], ['Hallway', 8, 9], ['Kitchen', 12, 14]],
    'named rooms without Next room markers should still keep their own dimensions and spoken order'
  );

  const builder = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');
  const helperSource = [
    sourceBetween(builder, 'function _isWallPaintVoiceItem', 'function _isCeilingPaintVoiceItem'),
    sourceBetween(builder, 'function _isCeilingPaintVoiceItem', 'function _voiceRoundQuantity'),
    sourceBetween(builder, 'function _voiceRoundQuantity', 'function _voiceRuleTextKey'),
    sourceBetween(builder, 'function _findVoiceMissingMeasurements', 'function _recalculateVoiceRoomMeasurements'),
    sourceBetween(builder, 'function _recalculateVoiceRoomMeasurements', 'function _recalculateVoiceRoomWallPaint')
  ].join('\n');
  const browserHelpers = new Function(
    '_voiceIsGenericFallbackUnit',
    helperSource + '\nreturn { _findVoiceMissingMeasurements, _recalculateVoiceRoomMeasurements };'
  )(function(unit) { return !unit || String(unit).toLowerCase() === 'ls'; });

  const reviewResult = { rooms: parsed.rooms.concat([
    {
      name: 'Complete Room',
      dimensions: { length: 10, width: 10, height: 8, heightProvided: true },
      items: [{ category: 'Painting', description: 'Paint walls' }]
    }
  ]) };
  const missing = browserHelpers._findVoiceMissingMeasurements(reviewResult);
  assert.deepStrictEqual(
    missing.map((entry) => entry.room.name),
    ['Master Bedroom', 'Hallway', 'Kitchen', 'Living Room', 'Laundry Room'],
    'review should include every incomplete room in source order, not only three'
  );
  assert.deepStrictEqual(missing[4].requiredFields, ['length', 'width', 'height'], 'review should request every required room measurement');

  const sevenRooms = { rooms: Array.from({ length: 7 }, (_, index) => ({
    name: `Room ${index + 1}`,
    dimensions: { length: 10, width: 11, height: 8, heightProvided: false },
    items: [{ category: 'Painting', description: 'Paint walls' }]
  })) };
  assert.strictEqual(browserHelpers._findVoiceMissingMeasurements(sevenRooms).length, 7, 'missing-measurement collection must not have a three-room cap');

  browserHelpers._recalculateVoiceRoomMeasurements(parsed.rooms[5], { length: 7, width: 8, height: 9 });
  assert.strictEqual(parsed.rooms[5].dimensions.wallArea, 270);
  assert.strictEqual(parsed.rooms[5].items[0].quantity, 270);
  assert.strictEqual(parsed.rooms[5].items[0].needsMeasurement, undefined);

  const modal = sourceBetween(builder, '<div class="modal fade" id="aiVoiceMeasurementModal"', '<!-- AI Voice Review Modal -->');
  assert(modal.includes('modal-dialog-scrollable'), 'measurement review should scroll for any number of rooms');
  assert(modal.includes('modal-xl'), 'measurement review should provide room for multiple measurement fields');
  assert(modal.includes('aiVoiceMeasurementSummary'), 'measurement review should announce the complete room count');
  const renderSource = sourceBetween(builder, 'function showAiVoiceMeasurementModal', 'function confirmAiVoiceMeasurements');
  assert(!renderSource.includes('.slice('), 'measurement cards must render the complete missing-room collection');

  const edge = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'parse-quote', 'index.ts'), 'utf8');
  assert(edge.includes('There is no three-room limit'), 'AI prompt should explicitly forbid the observed room cap');
  assert(edge.includes('Never combine separately named rooms'), 'AI prompt should preserve distinct rooms');
  assert(edge.includes('exact order the contractor first mentions them'), 'AI prompt should preserve spoken room order');
  assert(edge.includes('roomRepairUsed') && edge.includes('complete replacement JSON object'), 'parse-quote should repair a valid AI response that still omitted or merged a room section');
  assert(edge.includes('AI could not preserve every spoken room'), 'parse-quote must not silently continue with an incomplete room list');

  const fixture = fs.readFileSync(path.join(__dirname, 'ai-voice-measurements-browser-fixture.html'), 'utf8');
  assert(fixture.includes('Room Six'), 'browser fixture should exercise more than three rooms');
  assert.doesNotThrow(() => new Function(Array.from(fixture.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi))[0][1]));

  console.log('ai voice measurement tests passed');
})();
