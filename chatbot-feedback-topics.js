// Privacy-safe topic classification for QuoteDr Assistant feedback.
// The classifier returns controlled enum values only. It never returns or stores chat text.
(function(global, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (global) global.QuoteDrChatbotFeedbackTopics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';

  var TOPICS = [
    {
      key: 'ai_voice_to_quote',
      label: 'AI Voice to Quote',
      description: 'Recording, transcription, review, measurements, Voice Memory, Trade Rules, or Voice Templates.',
      rules: [
        [8, /\bai voice(?: to quote)?\b/],
        [8, /\bvoice (?:to )?quote\b/],
        [7, /\b(?:voice|ai) (?:memory|review|template|trade rule)s?\b/],
        [6, /\bwhat quotedr heard\b/],
        [5, /\b(?:record|dictat|speak|transcrib)\w*\b.{0,40}\b(?:scope|quote|job|room|item)s?\b/],
        [4, /\b(?:scope|quote|job|room|item)s?\b.{0,40}\b(?:record|dictat|speak|transcrib)\w*\b/]
      ]
    },
    {
      key: 'choice_groups',
      label: 'Choice Groups',
      description: 'Saved groups, Pick One or Pick Multiple options, auto-grouping, and client selections.',
      rules: [
        [8, /\b(?:saved|choice|option) groups?\b/],
        [7, /\bpick (?:one|multiple)\b/],
        [6, /\b(?:auto[- ]?group|grouped items?|turn off grouping|disable grouping)\b/],
        [4, /\bclient\b.{0,35}\b(?:pick|choose|select)\w*\b.{0,35}\b(?:material|option)s?\b/]
      ]
    },
    {
      key: 'invoices_payments',
      label: 'Invoices & Payments',
      description: 'Invoices, Stripe, deposits, card checkout, balances, and offline payment instructions.',
      rules: [
        [8, /\bstripe(?: connect)?\b/],
        [7, /\b(?:invoice|deposit|payment|checkout|pay in full|card payment|e[- ]?transfer)s?\b/],
        [4, /\b(?:cash|cheque|check)\b.{0,30}\b(?:invoice|payment|paid)\b/]
      ]
    },
    {
      key: 'quotes_approvals',
      label: 'Quotes, Sending & Approvals',
      description: 'Sending, sharing, accepting, signing, expiring, or approving client quotes.',
      rules: [
        [8, /\bsend quote settings\b/],
        [7, /\b(?:send|share|email|accept|approve|sign|expire)\w*\b.{0,30}\bquotes?\b/],
        [7, /\bquotes?\b.{0,30}\b(?:send|share|email|accept|approve|sign|expir)\w*\b/],
        [5, /\bapproval type\b/],
        [4, /\bclient link\b/]
      ]
    },
    {
      key: 'quote_builder',
      label: 'Quote Builder',
      description: 'Rooms, line items, scope notes, totals, markup, and core quote-building workflow.',
      rules: [
        [8, /\bquote builder\b/],
        [7, /\badd (?:a )?(?:room|area|line item)\b/],
        [6, /\b(?:room|area) (?:toolbar|scope note|timeline|markup|template)\b/],
        [5, /\bline items?\b/]
      ]
    },
    {
      key: 'saved_items_pricing',
      label: 'Saved Items & Pricing',
      description: 'Manage Items, saved pricing, rates, material costs, categories, and supplier details.',
      rules: [
        [8, /\bmanage items\b/],
        [7, /\b(?:saved|custom) items?\b/],
        [6, /\bmaterial cost\b/],
        [5, /\b(?:pricing database|saved pricing|unit type|supplier url|rate)\b/]
      ]
    },
    {
      key: 'client_portal',
      label: 'Client Portal',
      description: 'Client links, portal access, client-facing documents, branding, and portal navigation.',
      rules: [
        [8, /\bclient portal\b/],
        [7, /\bportal (?:link|pin|theme|document|folder|access|page)s?\b/],
        [5, /\bclient[- ]facing (?:view|document|link|page)s?\b/]
      ]
    },
    {
      key: 'clients_contacts',
      label: 'Clients & Contacts',
      description: 'Client records, contact details, properties, searching, and client organization.',
      rules: [
        [7, /\b(?:client|customer) (?:database|record|contact|address|property|search|list)s?\b/],
        [6, /\b(?:add|edit|find|import)\w*\b.{0,25}\b(?:client|customer|contact)s?\b/]
      ]
    },
    {
      key: 'dashboard_sync',
      label: 'Dashboard & Sync',
      description: 'Dashboard lists, statuses, device sync, saves, recovery, and missing or duplicate quotes.',
      rules: [
        [8, /\bdashboard\b/],
        [7, /\b(?:sync|save|recovery)\b.{0,30}\b(?:quote|data|device|cloud|failed|missing)\w*\b/],
        [7, /\b(?:missing|duplicate|lost)\w*\b.{0,25}\bquotes?\b/]
      ]
    },
    {
      key: 'templates',
      label: 'Templates',
      description: 'Quote, room, item, and reusable workflow templates outside AI Voice templates.',
      rules: [
        [7, /\b(?:quote|room|item|project) templates?\b/],
        [5, /\b(?:save|reuse|duplicate|copy)\w*\b.{0,30}\btemplates?\b/]
      ]
    },
    {
      key: 'ai_quote_copilot',
      label: 'AI Quote Copilot',
      description: 'Quote completeness review, AI item drafts, scope gaps, and quote suggestions.',
      rules: [
        [8, /\bai quote copilot\b/],
        [7, /\bquote completeness(?: review)?\b/],
        [6, /\b(?:scope gap|possible omission|ai item draft|draft item)\b/]
      ]
    },
    {
      key: 'smart_import',
      label: 'Smart Import',
      description: 'Importing quote or pricing data from files, spreadsheets, or other formats.',
      rules: [
        [8, /\bsmart import\b/],
        [6, /\bimport\w*\b.{0,30}\b(?:csv|spreadsheet|excel|pdf|quote|pricing|items?)\b/]
      ]
    },
    {
      key: 'floor_plan_scanner',
      label: 'Floor Plan Scanner',
      description: 'Floor plan uploads, tracing, measurements, scale, and generated room geometry.',
      rules: [
        [8, /\bfloor ?plan scanner\b/],
        [7, /\b(?:scan|trace|upload|measure)\w*\b.{0,30}\bfloor ?plans?\b/],
        [5, /\bfloor ?plans?\b.{0,30}\b(?:scale|wall|room|measurement)s?\b/]
      ]
    },
    {
      key: 'quickbooks',
      label: 'QuickBooks',
      description: 'QuickBooks connection, customer or item import, and synchronization.',
      rules: [
        [8, /\bquick ?books\b/],
        [6, /\bqb (?:connect|sync|import|customer|item)s?\b/]
      ]
    },
    {
      key: 'job_tracking_expenses',
      label: 'Job Tracking & Expenses',
      description: 'Jobs, crews, schedules, labour, expenses, purchasing, and production tracking.',
      rules: [
        [8, /\bjob tracker\b/],
        [7, /\b(?:crew|job) schedul\w*\b/],
        [7, /\b(?:labou?r|expense|purchase|production) track\w*\b/],
        [6, /\b(?:dispatch|timesheet|geofence|check[- ]?in)s?\b/]
      ]
    },
    {
      key: 'change_orders',
      label: 'Change Orders',
      description: 'Change-order creation, removed scope, approvals, and revised contract totals.',
      rules: [
        [8, /\bchange orders?\b/],
        [6, /\b(?:added|removed|revised) scope\b.{0,30}\b(?:approval|contract|quote)\b/]
      ]
    },
    {
      key: 'photos_media',
      label: 'Photos & Files',
      description: 'Photos, uploads, full-resolution files, attachments, and client-visible media.',
      rules: [
        [7, /\b(?:photo|image|attachment|upload|file)s?\b.{0,30}\b(?:quote|item|room|client|full resolution|storage)\b/],
        [7, /\bfull[- ]resolution photos?\b/]
      ]
    },
    {
      key: 'notifications_followups',
      label: 'Notifications & Follow-ups',
      description: 'Reminders, follow-up emails, alerts, and notification preferences.',
      rules: [
        [7, /\b(?:notification|reminder|follow[- ]?up|alert)s?\b/],
        [5, /\bemail\w*\b.{0,25}\b(?:client|quote|invoice|automatic|remind)\w*\b/]
      ]
    },
    {
      key: 'account_plan',
      label: 'Account & Plan',
      description: 'Sign-in, account access, Basic or Pro plans, trials, upgrades, and billing.',
      rules: [
        [7, /\b(?:sign in|log in|account|subscription|billing|upgrade|trial)\b/],
        [6, /\b(?:basic|pro) plan\b/]
      ]
    },
    {
      key: 'assistant_help',
      label: 'AI Assistant & Help',
      description: 'The in-app assistant, FAQ, contextual help, tutorials, and guidance.',
      rules: [
        [8, /\b(?:ai|quotedr) assistant\b/],
        [6, /\b(?:faq|help page|contextual help|tutorial|guide)\b/]
      ]
    },
    {
      key: 'support_feedback',
      label: 'Feedback & Missing Features',
      description: 'Bug reports, product feedback, and requests for workflows QuoteDr does not yet support.',
      rules: [
        [7, /\bsettings (?:>|andgt;|and) feedback\b/],
        [6, /\b(?:missing feature|feature request|submit the idea|report a bug|send feedback)\b/]
      ]
    }
  ];

  var INTENTS = Object.freeze({
    problem: 'Troubleshooting or unexpected result',
    feature_request: 'Feature or workflow request',
    how_to: 'How-to question',
    clarification: 'Clarification question',
    other: 'General product question'
  });

  var SURFACES = Object.freeze({
    quote_builder: 'Quote Builder',
    dashboard: 'Dashboard',
    settings: 'Settings',
    help: 'Help',
    other: 'Other signed-in page'
  });

  function normalize(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/&gt;/g, ' ')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 4000);
  }

  function classifyIntent(question) {
    var text = normalize(question);
    if (/\b(?:bug|broken|error|fail\w*|issue|problem|wrong|missing|duplicate|stuck|crash\w*|not working|doesn t work|won t|can t|cannot|unable)\b/.test(text)) return 'problem';
    if (/\b(?:feature request|please add|could you add|can you add|wish|would like|need a way|is there a way|does quotedr have|do you support)\b/.test(text)) return 'feature_request';
    if (/^(?:how|where|can i|could i|what steps)\b/.test(text) || /\b(?:how do i|set up|setup|enable|turn on|create|add|use)\b/.test(text)) return 'how_to';
    if (/^(?:what|why|when|which|does|is|are)\b/.test(text) || /\b(?:explain|difference|mean)\b/.test(text)) return 'clarification';
    return 'other';
  }

  function classifySurface(context) {
    var path = normalize(context && context.pagePath);
    if (path.indexOf('quote builder') !== -1) return 'quote_builder';
    if (path.indexOf('dashboard') !== -1) return 'dashboard';
    if (path.indexOf('settings') !== -1) return 'settings';
    if (path.indexOf('help') !== -1) return 'help';
    return 'other';
  }

  function classify(question, answer, context) {
    var questionText = normalize(question);
    var answerText = normalize(answer);
    var best = null;
    TOPICS.forEach(function(topic, topicIndex) {
      var score = 0;
      topic.rules.forEach(function(rule) {
        if (rule[1].test(questionText)) score += rule[0];
        if (rule[1].test(answerText)) score += rule[0] * 0.65;
      });
      if (!best || score > best.score || (score === best.score && topicIndex < best.index)) {
        best = { key: topic.key, score: score, index: topicIndex };
      }
    });
    if (!best || best.score < 2) return null;
    return Object.freeze({
      topicKey: best.key,
      intentKey: classifyIntent(questionText),
      surfaceKey: classifySurface(context)
    });
  }

  function topic(key) {
    for (var i = 0; i < TOPICS.length; i += 1) {
      if (TOPICS[i].key === key) return TOPICS[i];
    }
    return null;
  }

  function safeExampleLabel(intentKey, surfaceKey) {
    return (INTENTS[intentKey] || INTENTS.other) + ' - ' + (SURFACES[surfaceKey] || SURFACES.other);
  }

  return Object.freeze({
    topics: Object.freeze(TOPICS.map(function(item) {
      return Object.freeze({ key: item.key, label: item.label, description: item.description });
    })),
    intents: INTENTS,
    surfaces: SURFACES,
    classify: classify,
    classifyIntent: classifyIntent,
    classifySurface: classifySurface,
    topic: topic,
    safeExampleLabel: safeExampleLabel,
    _test: Object.freeze({ normalize: normalize })
  });
});
