(function() {
  'use strict';

  var QUOTE_TIPS_INTERVAL_MS = 60 * 60 * 1000;
  var QUOTE_TIPS_SETTINGS_KEY = 'ald_quote_builder_tip_settings';
  var QUOTE_TIPS_CLOUD_KEY = 'quote_builder_tip_settings';
  var QUOTE_TIPS_YOUTUBE_PLACEHOLDER_URL = 'https://www.youtube.com/@QuoteDrTutorials';

  var DEFAULT_SETTINGS = {
    enabled: true,
    lastShownAt: 0,
    rotationIndex: 0,
    updatedAt: ''
  };

  var TIP_CATALOG = [
    {
      id: 'rooms',
      icon: 'fa-door-open',
      title: 'Add rooms or areas first',
      body: 'Rooms keep the quote easy to read. Use client-friendly sections like Bathroom, Kitchen, Basement, Exterior, Roof, Deck, or Service Call.',
      topicId: 'addRoomModal',
      helpUrl: 'help.html#building-quotes',
      videoUrl: 'videos/tutorials/quote-builder-overview.mp4'
    },
    {
      id: 'line-items',
      icon: 'fa-list-check',
      title: 'Line items are the approved scope',
      body: 'Add one clear line item for each piece of work the client needs to understand and approve. Saved items keep pricing consistent.',
      topicId: 'addLineModal',
      helpUrl: 'help.html#building-quotes',
      videoUrl: 'videos/tutorials/line-items-pricing.mp4'
    },
    {
      id: 'saved-items',
      icon: 'fa-database',
      title: 'Manage Line Items is your price book',
      body: 'Save your common services, rates, units, material costs, supplier links, and labour time once so QuoteDr can reuse them everywhere.',
      topicId: 'manageItemsModal',
      helpUrl: 'help.html#pricing-database',
      videoUrl: 'videos/tutorials/line-items-pricing.mp4'
    },
    {
      id: 'quickbooks-importer',
      icon: 'fa-plug',
      title: 'QuickBooks and importer shortcuts',
      body: 'QuickBooks sync can bring in customers and Products & Services. The Settings importer can also read spreadsheets, old price lists, exports, or messy notes.',
      helpUrl: 'settings.html#integrations',
      videoUrl: 'videos/tutorials/quickbooks-settings.mp4'
    },
    {
      id: 'choice-groups',
      icon: 'fa-layer-group',
      title: 'Choice Groups simplify client selections',
      body: 'Choice Groups let clients pick one finish, material, or option from a saved set. They are ideal for tile choices, fixtures, flooring, and finish levels.',
      topicId: 'manageItemsModal',
      helpUrl: 'help.html#pricing-database',
      videoUrl: 'videos/tutorials/line-items-pricing.mp4'
    },
    {
      id: 'upgrade-wizard',
      icon: 'fa-wand-magic-sparkles',
      title: 'Upgrade Wizard handles complex paths',
      body: 'Upgrade Wizard can build upgrade systems with rules so clients cannot pick conflicting items. Use it for packages, add-ons, and premium paths that need structure.',
      helpUrl: 'help.html#pricing-database',
      videoUrl: 'tutorials.html'
    },
    {
      id: 'ai-quote-builder',
      icon: 'fa-microphone',
      title: 'AI Quote Builder saves serious time',
      body: 'Describe the job naturally and QuoteDr can create rooms, line items, quantities, and notes in seconds. Review the result, then let it learn from corrections.',
      topicId: 'voiceQuoteModal',
      helpUrl: 'help.html#ai-features',
      videoUrl: 'videos/tutorials/ai-voice-quote.mp4'
    },
    {
      id: 'ai-memory',
      icon: 'fa-brain',
      title: 'AI Memory learns how you quote',
      body: 'AI Memory remembers phrase corrections and saved-item matches so repeat wording gets faster and more accurate over time.',
      topicId: 'aiVoiceMemoryModal',
      helpUrl: 'help.html#ai-features',
      videoUrl: 'videos/tutorials/ai-voice-quote.mp4'
    },
    {
      id: 'ai-trade-rules',
      icon: 'fa-hammer',
      title: 'AI Trade Rules understand shorthand',
      body: 'AI Trade Rules turn contractor phrases into reusable math, like casing doors, painting walls, or adding standard quantities from the way you speak.',
      topicId: 'aiVoiceTradeRulesModal',
      helpUrl: 'help.html#ai-features',
      videoUrl: 'videos/tutorials/ai-voice-quote.mp4'
    },
    {
      id: 'voice-templates',
      icon: 'fa-layer-group',
      title: 'Voice Templates add repeat packages',
      body: 'Voice Templates let one spoken phrase add a saved package of work. Use them for standard bedrooms, bathrooms, service calls, decks, or repeat scopes.',
      topicId: 'aiVoiceTemplatesModal',
      helpUrl: 'help.html#ai-features',
      videoUrl: 'videos/tutorials/ai-voice-quote.mp4'
    },
    {
      id: 'satellite-measure',
      icon: 'fa-satellite',
      title: 'Satellite Measure is for exterior quantities',
      body: 'Use Satellite Measure for roofing, fencing, decks, driveways, landscaping, hardscaping, siding, and other outdoor measurements.',
      topicId: 'measureMapModal',
      helpUrl: 'help.html#measurement-tools',
      videoUrl: 'videos/tutorials/satellite-measure.mp4'
    },
    {
      id: 'floor-plan-scanner',
      icon: 'fa-ruler-combined',
      title: 'Floor Plan Scanner works from calibrated plans',
      body: 'Set the scale first, then measure rooms, lines, boxes, or polygons. Calibrated manual measuring keeps quantities accurate from floor plans.',
      topicId: 'floorPlanModal',
      helpUrl: 'help.html#measurement-tools',
      videoUrl: 'videos/tutorials/floor-plan-scanner.mp4'
    },
    {
      id: 'quick-room-quoter',
      icon: 'fa-calculator',
      title: 'Quick Room Quoter converts dimensions',
      body: 'Enter room dimensions once and QuoteDr can calculate common flooring, drywall, paint, trim, and material quantities for review.',
      topicId: 'materialEstimatorModal',
      helpUrl: 'help.html#measurement-tools',
      videoUrl: 'videos/tutorials/material-calculators.mp4'
    },
    {
      id: 'calculators',
      icon: 'fa-square-root-variable',
      title: 'Material calculators reduce guesswork',
      body: 'Use calculators for flooring, paint, drywall, hardwood, and other materials when quantities come from dimensions instead of manual line entry.',
      topicId: 'paintCalcModal',
      helpUrl: 'help.html#calculators',
      videoUrl: 'videos/tutorials/material-calculators.mp4'
    },
    {
      id: 'templates',
      icon: 'fa-folder-open',
      title: 'Templates speed up repeat jobs',
      body: 'Save room setups and reusable scopes as templates. Community templates can be useful starting points, but always review pricing and quantities.',
      topicId: 'manageTemplatesModal',
      helpUrl: 'help.html#building-quotes',
      videoUrl: 'videos/tutorials/quote-builder-overview.mp4'
    },
    {
      id: 'client-portal',
      icon: 'fa-users',
      title: 'Client Portal keeps job documents together',
      body: 'Use the portal to group quotes, invoices, change orders, signatures, and job documents in one client-facing place.',
      topicId: 'portalAssignModal',
      helpUrl: 'help.html#clients-data',
      videoUrl: 'videos/tutorials/send-client-quote.mp4'
    },
    {
      id: 'send-settings',
      icon: 'fa-paper-plane',
      title: 'Send settings control the client view',
      body: 'Before sending, choose the quote style, pricing detail, deposit display, approval type, expiry, and client message.',
      topicId: 'quoteStyleModal',
      helpUrl: 'help.html#sending-quotes',
      videoUrl: 'videos/tutorials/send-client-quote.mp4'
    },
    {
      id: 'deposits-payments',
      icon: 'fa-credit-card',
      title: 'Deposits and payments can be built in',
      body: 'Set payment options in Settings, then choose whether quote or invoice links show deposits, full payment, e-transfer, cash, cheque, or card options.',
      topicId: 'depositModal',
      helpUrl: 'help.html#invoices-payments',
      videoUrl: 'videos/tutorials/invoice-payments.mp4'
    },
    {
      id: 'invoices',
      icon: 'fa-file-invoice-dollar',
      title: 'Invoices build on accepted work',
      body: 'Turn approved quote work into invoices, send them from QuoteDr, and track status from the quote and dashboard.',
      topicId: 'invoiceSettingsModal',
      helpUrl: 'help.html#invoices-payments',
      videoUrl: 'videos/tutorials/invoice-payments.mp4'
    },
    {
      id: 'change-orders',
      icon: 'fa-file-circle-plus',
      title: 'Change Orders preserve the original quote',
      body: 'Use Change Orders to add or credit scope without editing the original signed quote or invoice. The client sees the adjustment clearly.',
      topicId: 'changeOrderModal',
      helpUrl: 'help.html#building-quotes',
      videoUrl: 'videos/tutorials/send-client-quote.mp4'
    },
    {
      id: 'branding',
      icon: 'fa-palette',
      title: 'Branding keeps quotes polished',
      body: 'Set your logo, quote colours, portal theme, and default send style so every client link feels professional and consistent.',
      topicId: 'quoteStyleModal',
      helpUrl: 'help.html#sending-quotes',
      videoUrl: 'videos/tutorials/customize-brand.mp4'
    },
    {
      id: 'terms-warranty',
      icon: 'fa-file-contract',
      title: 'Terms and warranty notes reduce confusion',
      body: 'Use saved terms, warranty certificates, and client-facing notes to explain what is included, what is excluded, and how approval works.',
      topicId: 'warrantyModal',
      helpUrl: 'help.html#invoices-payments',
      videoUrl: 'videos/tutorials/send-client-quote.mp4'
    }
  ];

  function safeJsonParse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function normalizeSettings(value) {
    var merged = Object.assign({}, DEFAULT_SETTINGS, value || {});
    merged.enabled = merged.enabled !== false;
    merged.lastShownAt = Number(merged.lastShownAt || 0);
    merged.rotationIndex = Number(merged.rotationIndex || 0);
    return merged;
  }

  function getSettings() {
    return normalizeSettings(safeJsonParse(localStorage.getItem(QUOTE_TIPS_SETTINGS_KEY), {}));
  }

  function saveLocalSettings(settings) {
    var normalized = normalizeSettings(settings);
    normalized.updatedAt = new Date().toISOString();
    localStorage.setItem(QUOTE_TIPS_SETTINGS_KEY, JSON.stringify(normalized));
    return normalized;
  }

  async function getCurrentUserId() {
    if (!window._supabase || !_supabase.auth || !_supabase.auth.getSession) return '';
    try {
      var sessionResult = await _supabase.auth.getSession();
      return sessionResult && sessionResult.data && sessionResult.data.session && sessionResult.data.session.user
        ? sessionResult.data.session.user.id
        : '';
    } catch (err) {
      return '';
    }
  }

  async function syncSettingsToCloud(settings) {
    var userId = await getCurrentUserId();
    if (!userId || !window._supabase) return settings;
    try {
      // qd-save-audit: dismissed help tips are a noncritical device preference, not business data.
      await _supabase.from('user_data').upsert({
        user_id: userId,
        key: QUOTE_TIPS_CLOUD_KEY,
        value: normalizeSettings(settings),
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,key' });
    } catch (err) {
      console.warn('QuoteDr tips cloud save failed', err);
    }
    return settings;
  }

  async function loadCloudSettings() {
    var local = getSettings();
    var userId = await getCurrentUserId();
    if (!userId || !window._supabase) return local;
    try {
      var result = await _supabase
        .from('user_data')
        .select('value')
        .eq('user_id', userId)
        .eq('key', QUOTE_TIPS_CLOUD_KEY)
        .maybeSingle();
      if (result && result.data && result.data.value) {
        return saveLocalSettings(Object.assign({}, local, result.data.value));
      }
    } catch (err) {
      console.warn('QuoteDr tips cloud load failed', err);
    }
    return local;
  }

  async function saveSettings(settings) {
    var saved = saveLocalSettings(settings);
    await syncSettingsToCloud(saved);
    return saved;
  }

  function resolveTip(rawTip) {
    var tip = Object.assign({}, rawTip || {});
    var topic = null;
    if (tip.topicId && window.QuoteDrHelpContent && typeof QuoteDrHelpContent.getTopic === 'function') {
      topic = QuoteDrHelpContent.getTopic(tip.topicId);
    }
    if (topic) {
      tip.title = tip.title || topic.title;
      tip.body = tip.body || topic.summary;
      tip.helpUrl = tip.helpUrl || topic.helpUrl;
      tip.videoUrl = tip.videoUrl || topic.videoUrl;
    }
    return tip;
  }

  function getNextTip(settings) {
    settings = normalizeSettings(settings);
    var index = Math.abs(settings.rotationIndex || 0) % TIP_CATALOG.length;
    return resolveTip(TIP_CATALOG[index]);
  }

  function hasOpenModal() {
    return !!document.querySelector('.modal.show');
  }

  function isFirstQuoteTutorialCompleteEnough() {
    var completed = safeJsonParse(localStorage.getItem('ald_onboarding_completed_steps'), []);
    if (!Array.isArray(completed)) return false;
    return completed.indexOf('first_quote:review') !== -1
      || completed.indexOf('first_quote:save') !== -1
      || completed.indexOf('first_quote:send') !== -1;
  }

  function isBuilderTutorialCompeting() {
    var guide = document.getElementById('builderGuideCard');
    if (!guide) return false;
    var hidden = localStorage.getItem('ald_builder_guide_hidden') === '1'
      || localStorage.getItem('ald_onboarding_dismissed') === '1'
      || guide.style.display === 'none';
    if (hidden) return false;
    return !isFirstQuoteTutorialCompleteEnough();
  }

  function shouldShowAutomaticTip(settings) {
    settings = normalizeSettings(settings);
    if (!settings.enabled) return false;
    if (hasOpenModal()) return false;
    if (isBuilderTutorialCompeting()) return false;
    return Date.now() - Number(settings.lastShownAt || 0) >= QUOTE_TIPS_INTERVAL_MS;
  }

  function ensureModal() {
    var existing = document.getElementById('quoteDrTipsModal');
    if (existing) return existing;
    var wrapper = document.createElement('div');
    wrapper.innerHTML =
      '<div class="modal fade" id="quoteDrTipsModal" tabindex="-1" aria-labelledby="quoteDrTipsTitle" aria-hidden="true">' +
        '<div class="modal-dialog modal-dialog-centered">' +
          '<div class="modal-content" style="border:0;border-radius:14px;overflow:hidden;box-shadow:0 24px 70px rgba(15,52,96,0.22);">' +
            '<div class="modal-header text-white" style="background:linear-gradient(135deg,#1a56a0,#0f3460);">' +
              '<div>' +
                '<div class="small text-white-50 fw-semibold text-uppercase">QuoteDr Tip</div>' +
                '<h5 class="modal-title mb-0" id="quoteDrTipsTitle"></h5>' +
              '</div>' +
              '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
            '</div>' +
            '<div class="modal-body p-4">' +
              '<div class="d-flex align-items-start gap-3">' +
                '<div id="quoteDrTipsIcon" class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style="width:48px;height:48px;background:#eef4fb;color:#1a56a0;font-size:1.35rem;"></div>' +
                '<div class="flex-grow-1">' +
                  '<div id="quoteDrTipsBody" style="color:#263442;line-height:1.55;"></div>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="modal-footer bg-light flex-wrap gap-2">' +
              '<button type="button" class="btn btn-link text-muted me-auto" id="quoteDrTipsStopBtn">Stop Showing Tips</button>' +
              '<a id="quoteDrTipsLearnMoreBtn" class="btn btn-outline-primary" href="#" target="_blank" rel="noopener">Learn More</a>' +
              '<a id="quoteDrTipsTutorialBtn" class="btn btn-outline-secondary" href="#" target="_blank" rel="noopener">Watch Tutorial</a>' +
              '<button type="button" class="btn btn-primary" id="quoteDrTipsOkBtn" data-bs-dismiss="modal">OK</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrapper.firstElementChild);
    return document.getElementById('quoteDrTipsModal');
  }

  async function recordShown(settings, options) {
    settings = normalizeSettings(settings);
    settings.lastShownAt = Date.now();
    if (!options || !options.keepRotation) {
      settings.rotationIndex = (Number(settings.rotationIndex || 0) + 1) % TIP_CATALOG.length;
    }
    return saveSettings(settings);
  }

  function renderTip(tip, settings, options) {
    tip = resolveTip(tip);
    options = options || {};
    var modalEl = ensureModal();
    var icon = document.getElementById('quoteDrTipsIcon');
    var learn = document.getElementById('quoteDrTipsLearnMoreBtn');
    var tutorial = document.getElementById('quoteDrTipsTutorialBtn');
    var stop = document.getElementById('quoteDrTipsStopBtn');
    var ok = document.getElementById('quoteDrTipsOkBtn');
    var dismissed = false;

    document.getElementById('quoteDrTipsTitle').textContent = tip.title || 'QuoteDr tip';
    document.getElementById('quoteDrTipsBody').textContent = tip.body || '';
    icon.innerHTML = '<i class="fas ' + (tip.icon || 'fa-lightbulb') + '"></i>';

    if (tip.helpUrl) {
      learn.style.display = '';
      learn.href = tip.helpUrl;
    } else {
      learn.style.display = 'none';
      learn.removeAttribute('href');
    }

    var tutorialUrl = tip.videoUrl || QUOTE_TIPS_YOUTUBE_PLACEHOLDER_URL;
    if (tutorialUrl) {
      tutorial.style.display = '';
      tutorial.href = tutorialUrl;
    } else {
      tutorial.style.display = 'none';
      tutorial.removeAttribute('href');
    }

    stop.onclick = async function() {
      dismissed = true;
      var next = Object.assign({}, normalizeSettings(settings), { enabled: false, lastShownAt: Date.now() });
      await saveSettings(next);
      if (window.bootstrap && bootstrap.Modal) {
        bootstrap.Modal.getOrCreateInstance(modalEl).hide();
      } else {
        modalEl.style.display = 'none';
      }
      if (typeof options.onSettingsChanged === 'function') options.onSettingsChanged(next);
    };

    ok.onclick = function() {
      dismissed = true;
      recordShown(settings, options).then(function(saved) {
        if (typeof options.onSettingsChanged === 'function') options.onSettingsChanged(saved);
      });
    };

    if (!window.bootstrap || !bootstrap.Modal) {
      alert((tip.title ? tip.title + '\n\n' : '') + (tip.body || ''));
      recordShown(settings, options);
      return;
    }

    modalEl.addEventListener('hidden.bs.modal', function handleHidden() {
      modalEl.removeEventListener('hidden.bs.modal', handleHidden);
      if (!dismissed) {
        recordShown(settings, options).then(function(saved) {
          if (typeof options.onSettingsChanged === 'function') options.onSettingsChanged(saved);
        });
      }
    });
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }

  async function showAutomaticTip() {
    var settings = await loadCloudSettings();
    if (!shouldShowAutomaticTip(settings)) return false;
    renderTip(getNextTip(settings), settings, {});
    return true;
  }

  async function forceShowNextTip(options) {
    options = options || {};
    var settings = await loadCloudSettings();
    if (options.enableFirst) settings.enabled = true;
    renderTip(getNextTip(settings), settings, { onSettingsChanged: options.onSettingsChanged });
    return true;
  }

  async function setEnabled(enabled) {
    var settings = await loadCloudSettings();
    settings.enabled = !!enabled;
    return saveSettings(settings);
  }

  async function resetRotation() {
    var settings = await loadCloudSettings();
    settings.rotationIndex = 0;
    settings.lastShownAt = 0;
    return saveSettings(settings);
  }

  function initAutoTips() {
    if (!/quote-builder\.html(?:$|[?#])/i.test(window.location.pathname + window.location.search)) return;
    setTimeout(function() {
      showAutomaticTip();
    }, 1400);
  }

  window.QuoteDrTips = {
    QUOTE_TIPS_INTERVAL_MS: QUOTE_TIPS_INTERVAL_MS,
    QUOTE_TIPS_SETTINGS_KEY: QUOTE_TIPS_SETTINGS_KEY,
    QUOTE_TIPS_CLOUD_KEY: QUOTE_TIPS_CLOUD_KEY,
    QUOTE_TIPS_YOUTUBE_PLACEHOLDER_URL: QUOTE_TIPS_YOUTUBE_PLACEHOLDER_URL,
    getCatalog: function() { return TIP_CATALOG.slice(); },
    getSettings: getSettings,
    loadCloudSettings: loadCloudSettings,
    saveSettings: saveSettings,
    setEnabled: setEnabled,
    resetRotation: resetRotation,
    forceShowNextTip: forceShowNextTip,
    showAutomaticTip: showAutomaticTip,
    shouldShowAutomaticTip: shouldShowAutomaticTip,
    isBuilderTutorialCompeting: isBuilderTutorialCompeting
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutoTips);
  } else {
    initAutoTips();
  }
})();
