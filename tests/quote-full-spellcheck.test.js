const assert = require('assert');
const path = require('path');

const spellcheck = require(path.resolve(__dirname, '..', 'quote-spellcheck.js'));

const state = {
  quoteTitle: 'Basement renno',
  clientName: 'Adam Client',
  projectAddress: '123 Main Street',
  changeOrderReason: 'Extra work occured after demo.',
  quoteAdjustment: { name: 'Famly discount' },
  paymentsReceived: { name: 'Depsoit paid' },
  rooms: [
    {
      name: 'Bathrom',
      scopeNotes: 'Complete eletrical instalation.',
      notes: 'Room measurment confirmed.',
      timeline: 'Comming next week',
      items: [
        {
          description: 'Custom Boarder Trim',
          category: 'Carpentry',
          itemDescription: 'Install boarder trim around the ceiling.',
          notes: 'Client will recieve painted samples.',
          jobNote: 'Confirm teh finish before ordering.',
          choiceGroup: {
            name: 'Pick teh finish',
            options: [
              {
                name: 'Painted Boarder',
                itemDescription: 'White boarder around wall edge.',
                upgradeGroups: [
                  {
                    name: 'Extra boarder options',
                    options: [{ name: 'Wide Boarder', description: 'Wider boarder trim.' }]
                  }
                ]
              }
            ],
            enhancementGroups: [
              {
                name: 'Add teh details',
                options: [{ name: 'Corner Boarder', description: 'Boarder at each corner.' }]
              }
            ]
          },
          upgradeGroups: [
            {
              name: 'Trim extention',
              options: [{ name: 'Window Boarder', description: 'Boarder around each window.' }]
            }
          ]
        }
      ]
    }
  ]
};

const fields = spellcheck.collectQuoteTextFields(state);
const fieldIds = new Set(fields.map((field) => field.id));

[
  'quoteTitle',
  'changeOrderReason',
  'quoteAdjustment/name',
  'paymentsReceived/name',
  'rooms/0/name',
  'rooms/0/scopeNotes',
  'rooms/0/notes',
  'rooms/0/timeline',
  'rooms/0/items/0/category',
  'rooms/0/items/0/description',
  'rooms/0/items/0/itemDescription',
  'rooms/0/items/0/notes',
  'rooms/0/items/0/jobNote',
  'rooms/0/items/0/choiceGroup/name',
  'rooms/0/items/0/choiceGroup/options/0/itemDescription',
  'rooms/0/items/0/choiceGroup/options/0/upgradeGroups/0/options/0/description',
  'rooms/0/items/0/choiceGroup/enhancementGroups/0/options/0/description',
  'rooms/0/items/0/upgradeGroups/0/options/0/description'
].forEach((fieldId) => {
  assert(fieldIds.has(fieldId), `full quote scan should include ${fieldId}`);
});

const localSuggestions = spellcheck.findLocalQuoteSuggestions(fields);
assert(
  localSuggestions.some((suggestion) => suggestion.fieldId === 'rooms/0/name' && suggestion.replacement === 'Bathroom'),
  'room-name spelling should be included in the full quote scan'
);
assert(
  localSuggestions.some((suggestion) => suggestion.fieldId === 'rooms/0/items/0/itemDescription' && suggestion.replacement === 'border'),
  'line item descriptions should receive contractor-context spelling corrections'
);
assert(
  localSuggestions.some((suggestion) => suggestion.fieldId === 'rooms/0/items/0/notes' && suggestion.replacement === 'receive'),
  'line item notes should be scanned'
);
assert(
  localSuggestions.some((suggestion) => suggestion.fieldId === 'rooms/0/scopeNotes' && suggestion.replacement === 'electrical'),
  'room scope notes should be scanned'
);

const roomNameSuggestion = localSuggestions.find((suggestion) => suggestion.fieldId === 'rooms/0/name');
assert(spellcheck.applyQuoteSuggestion(state, fields, roomNameSuggestion), 'a reviewed suggestion should apply to its exact field');
assert.strictEqual(state.rooms[0].name, 'Bathroom', 'applying a suggestion should update the current quote object');

const prompt = spellcheck.buildQuoteSpellcheckPrompt(fields.slice(0, 2));
assert(prompt.includes('fieldId'), 'AI prompt should require field-specific corrections');
assert(prompt.includes('Do not rewrite for style'), 'AI prompt should protect quote meaning');

const aiSuggestions = spellcheck.parseAiSuggestions(JSON.stringify({
  suggestions: [
    {
      fieldId: 'rooms/0/items/0/itemDescription',
      original: 'boarder',
      replacement: 'border',
      reason: 'Spelling in construction context.'
    },
    {
      fieldId: 'not/a/real/field',
      original: 'fake',
      replacement: 'real'
    }
  ]
}), fields);
assert.strictEqual(aiSuggestions.length, 1, 'AI results should be limited to supplied fields and exact source text');

const descriptionField = fields.find((field) => field.id === 'rooms/0/items/0/itemDescription');
assert(
  spellcheck.applyQuoteSuggestion(state, fields, {
    fieldId: descriptionField.id,
    original: 'boarder',
    replacement: 'edge detail'
  }),
  'a user-entered replacement should use the same field-specific apply path'
);
assert(
  state.rooms[0].items[0].itemDescription.includes('edge detail trim'),
  'manual wording should replace the suggested text in the current quote'
);

assert(spellcheck.chunkFields(fields, 600).length > 1, 'long quotes should be split into safe AI requests');

console.log('full quote spellcheck behavior checks passed');
