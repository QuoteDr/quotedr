const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(source.includes('placeholder="Describe the scope of work for this room..."'), 'room scope placeholder should be clean');
assert(!source.includes('Sometimes this comes up easy'), 'room scope placeholder should not include joke/example text');
assert(source.includes('generateRoomScopeNotes('), 'room render should expose an AI Scope button');
assert(source.includes('async function generateRoomScopeNotes'), 'AI scope generator function should exist');
assert(source.includes("feature: 'ai_assistant'"), 'AI scope should use the larger AI assistant request bucket');
assert(source.includes('buildRoomScopeAiPayload'), 'AI scope should build a controlled room-only payload');
assert(source.includes('compactRoomScopeText'), 'AI scope should compact rich item descriptions before sending');
assert(source.includes('MAX_ROOM_SCOPE_PROMPT_CHARS'), 'AI scope should have a prompt size budget');
const payloadBuilder = source.slice(source.indexOf('function buildRoomScopeAiPayload'), source.indexOf('function normalizeRoomScopeAiReply'));
assert(!payloadBuilder.includes('supplierUrl'), 'AI scope payload should not send supplier URLs');
assert(payloadBuilder.includes('itemDescription: itemDescription'), 'AI scope should send compacted item description context only');
assert(payloadBuilder.includes('compactRoomScopeText'), 'AI scope payload builder should compact text fields');
assert(source.includes('room.scopeNotes = combined'), 'AI scope should append only to room scope notes');
assert(source.includes('id="aiScopeAutoBtn_'), 'room render should expose an AUTO control beside AI Scope');
assert(source.includes('toggleRoomAiScopeAutomatic'), 'AUTO should require an explicit per-room toggle');
assert(source.includes('scheduleAutomaticRoomScopes'), 'saved room changes should schedule automatic scope refreshes');
assert(source.includes('room.aiScopeAutoFingerprint === fingerprint'), 'automatic scope should skip unchanged room payloads');
assert(source.includes("room.aiScopeAutomatic === true"), 'automatic AI Scope should be durable per room and default off unless enabled');
assert(source.includes('may replace manual edits'), 'AUTO confirmation should explain its effect on manual scope wording');
assert(source.includes("secondaryText: enabling ? 'Turn AUTO On for All Rooms' : 'Turn Off for All Rooms'"), 'AUTO prompt should support current and future rooms');
assert(source.includes("ROOM_AI_SCOPE_PREFERENCE_KEY = 'ald_room_ai_scope_preferences'"), 'account-wide AUTO should have a durable local preference');
assert(source.includes("saveUserDataValue('room_ai_scope_preferences'"), 'account-wide AUTO should sync through user data');
assert(source.includes("room.aiScopeAutomaticSource = 'account'"), 'account-owned room settings should follow later account preference changes');
assert(source.includes('restoreRoomAiScopePreferences().catch'), 'account-wide AUTO preference should restore at startup');

const storage = fs.readFileSync(path.join(__dirname, '..', 'quote-storage.js'), 'utf8');
assert(storage.includes("typeof scheduleAutomaticRoomScopes === 'function'"), 'quote edits should notify automatic room scopes');
assert(storage.includes("room.aiScopeAutomaticSource === 'account'"), 'loaded account-owned rooms should follow the cross-browser default');
