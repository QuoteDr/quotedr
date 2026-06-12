const fs = require('fs');
const assert = require('assert');

const dashboard = fs.readFileSync('dashboard.html', 'utf8');
const settings = fs.readFileSync('settings.html', 'utf8');

assert(
  settings.includes('googleReviewLink'),
  'Settings should include a Google review link field'
);

assert(
  settings.includes('reviewRequestMessage'),
  'Settings should include a review request message template'
);

assert(
  settings.includes('reviewNudgeEnabled'),
  'Settings should include a review nudge preference'
);

assert(
  dashboard.includes('function dashboardIsPaidForReviewRequest(q)'),
  'Dashboard should detect paid/completed documents for review requests'
);

assert(
  dashboard.includes('function sendGoogleReviewRequest(quoteId, clientName, savedEmail)'),
  'Dashboard should expose a manual Google review request sender'
);

assert(
  dashboard.includes('Request Review'),
  'Paid dashboard cards should show a Request Review action'
);

assert(
  dashboard.includes('function shouldShowReviewNudge(q)'),
  'Dashboard should decide when to nudge for unsent review requests'
);

assert(
  dashboard.includes('never show again') || dashboard.includes('Never show again'),
  'Review nudges should offer a never-show-again option'
);

assert(
  dashboard.includes('review_request_sent_at'),
  'Dashboard should track when a review request was sent'
);

assert(
  dashboard.includes('googleReviewLink'),
  'Dashboard should read the configured Google review link'
);
