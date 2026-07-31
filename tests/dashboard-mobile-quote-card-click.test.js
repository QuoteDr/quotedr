const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');

assert(
  /<div class="quote-card[^>]+onclick="handleDashboardQuoteCardClick\(event, \$\{jsAttr\(q\.id\)\}\)"/.test(dashboard),
  'Quote cards should delegate clicks through the guarded card handler'
);

assert(
  dashboard.includes('<div class="quote-card-open-area">'),
  'The existing desktop quote-opening region should remain explicitly marked'
);

assert(
  dashboard.includes('button, a, input, select, textarea, label, summary') &&
    dashboard.includes('[role="button"]') &&
    dashboard.includes('[role="link"]') &&
    dashboard.includes('[contenteditable="true"]') &&
    dashboard.includes('[onclick]') &&
    dashboard.includes('[onchange]'),
  'Nested card controls should be excluded from quote opening'
);

function dashboardFunctionSource(name) {
  const start = dashboard.indexOf('        function ' + name + '(');
  assert(start >= 0, name + ' should exist in dashboard.html');
  const nextFunction = dashboard.indexOf('\n        function ', start + 1);
  const nextAsyncFunction = dashboard.indexOf('\n        async function ', start + 1);
  const ends = [nextFunction, nextAsyncFunction].filter((index) => index >= 0);
  const end = ends.length ? Math.min(...ends) : dashboard.length;
  return dashboard.slice(start, end);
}

let mobileLayout = false;
let titleEditing = false;
const openedQuoteIds = [];
const card = {};

function quoteCardEvent({ openArea = false, nestedControl = false } = {}) {
  const control = nestedControl ? {} : card;
  return {
    currentTarget: card,
    target: {
      closest(selector) {
        if (selector === '.quote-card-open-area') return openArea ? {} : null;
        return control;
      }
    }
  };
}

const context = {
  window: {
    matchMedia(query) {
      assert.strictEqual(query, '(max-width: 768px)');
      return { matches: mobileLayout };
    }
  },
  isTitleEditing() {
    return titleEditing;
  },
  openQuote(quoteId) {
    openedQuoteIds.push(quoteId);
  }
};

vm.createContext(context);
vm.runInContext(
  dashboardFunctionSource('dashboardQuoteCardClickShouldOpen') + '\n' +
    dashboardFunctionSource('handleDashboardQuoteCardClick'),
  context
);

assert.strictEqual(
  context.dashboardQuoteCardClickShouldOpen(quoteCardEvent({ openArea: true }), 'quote-1'),
  true,
  'The original quote-opening area should still work on desktop'
);

assert.strictEqual(
  context.dashboardQuoteCardClickShouldOpen(quoteCardEvent(), 'quote-1'),
  false,
  'Non-opening desktop card space should preserve its existing behavior'
);

mobileLayout = true;
assert.strictEqual(
  context.dashboardQuoteCardClickShouldOpen(quoteCardEvent(), 'quote-1'),
  true,
  'Non-control card space should open the quote in the mobile layout'
);

assert.strictEqual(
  context.dashboardQuoteCardClickShouldOpen(quoteCardEvent({ nestedControl: true }), 'quote-1'),
  false,
  'Nested buttons, links, inputs, selects, and other controls should not open the quote'
);

titleEditing = true;
assert.strictEqual(
  context.dashboardQuoteCardClickShouldOpen(quoteCardEvent(), 'quote-1'),
  false,
  'No part of the card should open the quote while its title is being edited'
);

titleEditing = false;
context.handleDashboardQuoteCardClick(quoteCardEvent(), 'quote-1');
context.handleDashboardQuoteCardClick(quoteCardEvent({ nestedControl: true }), 'quote-2');
assert.deepStrictEqual(openedQuoteIds, ['quote-1'], 'Only eligible card taps should call openQuote');

console.log('dashboard mobile quote card click test passed');
