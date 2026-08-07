const assert = require('assert');
const fs = require('fs');
const path = require('path');
const matcher = require('../ai-voice-rule-matcher.js');

function tradeRule(id, phrase) {
  return {
    id,
    trigger_phrase: phrase,
    active: true,
    quantity_mode: 'per_count',
    quantity_value: 35,
    count_unit_label: 'door',
  };
}

(async function run() {
  const helperPath = path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'voice-quote-audit.mjs');
  const audit = await import('file:///' + helperPath.replace(/\\/g, '/'));

  const genericSelection = matcher.selectRuleMatches(
    [tradeRule('regular-door', 'trim up a door')],
    'Trim up five exterior doors.',
  )[0];
  assert(genericSelection, 'the generic rule should remain available as a review candidate');
  assert.strictEqual(genericSelection.spokenPhrase, 'Trim up five exterior doors');
  assert.strictEqual(genericSelection.requiresConfirmation, true, 'extra spoken count and exterior qualifier must stop automatic rule replacement');
  assert.strictEqual(genericSelection.ambiguous, true, 'unsafe generic matches must require an explicit review choice');
  assert(genericSelection.confirmationReason.includes('number, dimension, material, or qualifier'));
  assert.strictEqual(matcher.extractCount(genericSelection.spokenPhrase, 'door'), 5, 'rule math should read the count from the matched phrase');
  assert.strictEqual(matcher.extractCount('Trim up a five-foot exterior door', 'door'), null, 'a five-foot dimension is not a count of five doors');
  assert.strictEqual(matcher.extractCount('Trim a 5 by 7 exterior door', 'door'), null, 'door dimensions separated by by are not item counts');

  const exactSelection = matcher.selectRuleMatches(
    [tradeRule('exterior-door', 'trim up five exterior doors')],
    'Trim up five exterior doors.',
  )[0];
  assert(exactSelection && !exactSelection.ambiguous, 'an exact specific rule should still apply automatically');

  const transcript = 'Trim five exterior doors.';
  const undercounted = {
    rooms: [{
      name: 'Exterior',
      items: [{
        category: 'Trim & Millwork',
        description: 'Regular door trim',
        quantity: 1,
        unit: 'ea',
        spokenPhrase: 'Trim five exterior doors',
      }],
    }],
  };
  assert(
    audit.criticalVoiceQuoteAuditIssues(undercounted, transcript).some((issue) => issue.code === 'spoken_count_not_applied'),
    'the deterministic audit must reject five spoken doors priced as one',
  );

  const counted = JSON.parse(JSON.stringify(undercounted));
  counted.rooms[0].items[0].description = 'Exterior door trim';
  counted.rooms[0].items[0].quantity = 5;
  assert.deepStrictEqual(audit.criticalVoiceQuoteAuditIssues(counted, transcript), [], 'five each should satisfy the spoken count');

  const formula = JSON.parse(JSON.stringify(counted));
  formula.rooms[0].items[0].quantity = 175;
  formula.rooms[0].items[0].unit = 'LF';
  formula.rooms[0].items[0].calculation = '35 LF x 5 doors = 175 LF';
  assert.deepStrictEqual(audit.criticalVoiceQuoteAuditIssues(formula, transcript), [], 'trade-rule formulas may convert five doors into linear feet');

  const dimensionTranscript = 'Trim up a five-foot exterior door.';
  const dimensionQuote = {
    rooms: [{
      name: 'Exterior',
      items: [{
        category: 'Windows & Exterior Doors',
        description: 'Exterior door trim',
        quantity: 35,
        unit: 'LF',
        calculation: '35 LF x 1 door = 35 LF',
        spokenPhrase: 'Trim up a five-foot exterior door',
      }],
    }],
  };
  assert.deepStrictEqual(audit.extractVoiceCountClaims(dimensionTranscript), [], 'five-foot must remain a dimension, not a five-door count');
  assert.deepStrictEqual(audit.criticalVoiceQuoteAuditIssues(dimensionQuote, dimensionTranscript), []);

  const roomDimensionTranscript = 'Master Bedroom 10 x 11 paint the walls.';
  const roomDimensionQuote = {
    rooms: [{
      name: 'Master Bedroom',
      items: [{
        category: 'Painting',
        description: 'Paint walls',
        quantity: 336,
        unit: 'sqft',
        calculation: '(10 + 11) x 2 x 8 = 336 sqft',
        spokenPhrase: 'paint the walls',
      }],
    }],
  };
  assert.deepStrictEqual(audit.extractVoiceCountClaims(roomDimensionTranscript), [], '10 x 11 room dimensions must not become a count of eleven walls');
  assert.deepStrictEqual(audit.criticalVoiceQuoteAuditIssues(roomDimensionQuote, roomDimensionTranscript), []);

  const twoJobsTranscript = 'Trim five exterior doors and paint the hallway walls.';
  assert(
    audit.criticalVoiceQuoteAuditIssues(counted, twoJobsTranscript).some((issue) => issue.code === 'missing_spoken_work'),
    'the audit must detect a separately spoken job that disappeared from the draft',
  );

  const nonVerbatim = JSON.parse(JSON.stringify(counted));
  nonVerbatim.rooms[0].items[0].spokenPhrase = 'Trim a door';
  assert(
    audit.criticalVoiceQuoteAuditIssues(nonVerbatim, transcript).some((issue) => issue.code === 'non_verbatim_spoken_phrase'),
    'a familiar shortened phrase must not be presented as what the contractor said',
  );

  const edgeSource = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', 'parse-quote', 'index.ts'), 'utf8');
  assert(edgeSource.includes('Act as an independent final estimator audit'), 'parse-quote should always run a distinct second lookover');
  assert(edgeSource.includes("response_format: { type: 'json_object' }"), 'both parser passes should request structured JSON output');
  assert(edgeSource.includes('AI could not verify every spoken item and quantity'), 'unresolved critical discrepancies must fail closed');
  assert(edgeSource.includes('voiceAuditPasses'), 'the safety pass should be recorded without storing transcript details');

  const builderSource = fs.readFileSync(path.join(__dirname, '..', 'quote-builder.html'), 'utf8');
  assert(builderSource.includes('_preserveAmbiguousAiRuleItem'), 'ambiguous rules should preserve the parser item until the user chooses');
  assert(builderSource.includes('return !selection.ambiguous'), 'ambiguous rules must not suppress parsed work');
  assert(builderSource.includes('_extractVoiceRuleCount(rule, matchedPhrase)'), 'trade-rule quantity must use the matched phrase instead of the whole transcript');
  assert(builderSource.includes('QuoteDr will not guess here.'), 'review should explain why an explicit choice is required');
  assert(builderSource.includes('Independently cross-checked against the original transcript.'), 'review should disclose the independent safety check');

  const fixture = fs.readFileSync(path.join(__dirname, 'ai-voice-quote-integrity-standalone.html'), 'utf8');
  const fixtureScripts = Array.from(fixture.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)).filter((match) => match[1].trim());
  assert.strictEqual(fixtureScripts.length, 1, 'integrity browser fixture should keep setup isolated');
  assert.doesNotThrow(() => new Function(fixtureScripts[0][1]), 'integrity browser fixture should parse');
  assert(fixture.includes('Trim up five exterior doors.'), 'browser fixture should reproduce the five-door failure case');
  assert(fixture.includes("trigger_phrase: 'trim up a door'"), 'browser fixture should exercise an unsafe familiar generic rule');

  console.log('ai voice quote integrity tests passed');
})();
