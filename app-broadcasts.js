(function() {
  'use strict';

  var TYPE_META = {
    info: { icon: 'fa-circle-info', accent: '#1a56a0', badge: 'Update' },
    maintenance: { icon: 'fa-screwdriver-wrench', accent: '#f97316', badge: 'Maintenance' },
    promo: { icon: 'fa-gift', accent: '#198754', badge: 'Offer' },
    warning: { icon: 'fa-triangle-exclamation', accent: '#dc3545', badge: 'Important' },
    thank_you: { icon: 'fa-heart', accent: '#6f42c1', badge: 'Thank you' }
  };

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function isEligible(message, receipt) {
    if (!message || message.status !== 'active') return false;
    var now = Date.now();
    if (message.starts_at && new Date(message.starts_at).getTime() > now) return false;
    if (message.ends_at && new Date(message.ends_at).getTime() < now) return false;
    if (!receipt) return true;
    if (receipt.dismissed_at) return false;
    if (message.show_mode === 'once' && Number(receipt.shown_count || 0) > 0) return false;
    return true;
  }

  function sortMessages(a, b) {
    var priority = { maintenance: 1, warning: 2, promo: 3, thank_you: 4, info: 5 };
    var ap = priority[a.message_type] || 9;
    var bp = priority[b.message_type] || 9;
    if (ap !== bp) return ap - bp;
    return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
  }

  async function getCurrentSession() {
    if (!window._supabase || !_supabase.auth || !_supabase.auth.getSession) return null;
    var result = await _supabase.auth.getSession();
    return result && result.data ? result.data.session : null;
  }

  async function recordShown(message, receipt, userId) {
    if (!window._supabase || !message || !userId) return;
    var payload = {
      message_id: message.id,
      user_id: userId,
      shown_count: Number(receipt && receipt.shown_count ? receipt.shown_count : 0) + 1,
      last_shown_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (!receipt) payload.created_at = payload.updated_at;
    try {
      await _supabase
        .from('app_broadcast_receipts')
        .upsert(payload, { onConflict: 'message_id,user_id' });
    } catch (err) {
      console.warn('QuoteDr broadcast shown receipt failed', err);
    }
  }

  async function recordDismissed(message, userId) {
    if (!window._supabase || !message || !userId) return;
    try {
      await _supabase
        .from('app_broadcast_receipts')
        .upsert({
          message_id: message.id,
          user_id: userId,
          dismissed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: 'message_id,user_id' });
    } catch (err) {
      console.warn('QuoteDr broadcast dismissal failed', err);
    }
  }

  function ensureModal() {
    var existing = document.getElementById('quoteDrBroadcastModal');
    if (existing) return existing;
    var wrapper = document.createElement('div');
    wrapper.innerHTML =
      '<div class="modal fade" id="quoteDrBroadcastModal" tabindex="-1" aria-labelledby="quoteDrBroadcastTitle" aria-hidden="true">' +
        '<div class="modal-dialog modal-dialog-centered">' +
          '<div class="modal-content" style="border:0;border-radius:14px;overflow:hidden;box-shadow:0 24px 70px rgba(15,52,96,0.22);">' +
            '<div id="quoteDrBroadcastHeader" class="modal-header text-white" style="background:#1a56a0;">' +
              '<div>' +
                '<div id="quoteDrBroadcastBadge" class="small text-white-50 fw-semibold text-uppercase"></div>' +
                '<h5 class="modal-title mb-0" id="quoteDrBroadcastTitle"></h5>' +
              '</div>' +
              '<button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>' +
            '</div>' +
            '<div class="modal-body p-4">' +
              '<div class="d-flex align-items-start gap-3">' +
                '<div id="quoteDrBroadcastIcon" class="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0" style="width:48px;height:48px;background:#eef4fb;color:#1a56a0;font-size:1.35rem;"></div>' +
                '<div class="flex-grow-1">' +
                  '<div id="quoteDrBroadcastBody" style="white-space:pre-wrap;color:#263442;line-height:1.5;"></div>' +
                '</div>' +
              '</div>' +
            '</div>' +
            '<div class="modal-footer bg-light">' +
              '<a id="quoteDrBroadcastCta" class="btn btn-outline-primary" href="#" target="_self" rel="noopener" style="display:none;"></a>' +
              '<button type="button" class="btn btn-primary" id="quoteDrBroadcastOkBtn" data-bs-dismiss="modal">OK</button>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
    document.body.appendChild(wrapper.firstElementChild);
    return document.getElementById('quoteDrBroadcastModal');
  }

  function renderMessage(message, options) {
    options = options || {};
    var meta = TYPE_META[message.message_type] || TYPE_META.info;
    var modalEl = ensureModal();
    var header = document.getElementById('quoteDrBroadcastHeader');
    var icon = document.getElementById('quoteDrBroadcastIcon');
    var cta = document.getElementById('quoteDrBroadcastCta');
    var ok = document.getElementById('quoteDrBroadcastOkBtn');
    header.style.background = meta.accent;
    icon.style.background = meta.accent + '18';
    icon.style.color = meta.accent;
    icon.innerHTML = '<i class="fas ' + meta.icon + '"></i>';
    document.getElementById('quoteDrBroadcastBadge').textContent = meta.badge;
    document.getElementById('quoteDrBroadcastTitle').textContent = message.title || 'QuoteDr update';
    document.getElementById('quoteDrBroadcastBody').textContent = message.body || '';
    ok.style.background = meta.accent;
    ok.style.borderColor = meta.accent;
    if (message.cta_label && message.cta_url) {
      cta.style.display = '';
      cta.textContent = message.cta_label;
      cta.href = message.cta_url;
      cta.target = /^https?:\/\//i.test(message.cta_url) ? '_blank' : '_self';
    } else {
      cta.style.display = 'none';
      cta.removeAttribute('href');
    }
    if (!window.bootstrap || !bootstrap.Modal) {
      alert((message.title ? message.title + '\n\n' : '') + (message.body || ''));
      if (typeof options.onDismiss === 'function') options.onDismiss();
      return;
    }
    var instance = bootstrap.Modal.getOrCreateInstance(modalEl);
    modalEl.addEventListener('hidden.bs.modal', function handleHidden() {
      modalEl.removeEventListener('hidden.bs.modal', handleHidden);
      if (typeof options.onDismiss === 'function') options.onDismiss();
    });
    instance.show();
  }

  async function loadAndShow() {
    try {
      var session = await getCurrentSession();
      var user = session && session.user;
      if (!user || !user.id || !window._supabase) return;
      var messagesResult = await _supabase
        .from('app_broadcast_messages')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(10);
      if (messagesResult.error || !messagesResult.data || !messagesResult.data.length) return;
      var messages = messagesResult.data;
      var ids = messages.map(function(message) { return message.id; });
      var receiptsResult = await _supabase
        .from('app_broadcast_receipts')
        .select('*')
        .eq('user_id', user.id)
        .in('message_id', ids);
      var receipts = {};
      if (!receiptsResult.error && receiptsResult.data) {
        receiptsResult.data.forEach(function(receipt) { receipts[receipt.message_id] = receipt; });
      }
      var eligible = messages
        .filter(function(message) { return isEligible(message, receipts[message.id]); })
        .sort(sortMessages);
      if (!eligible.length) return;
      var message = eligible[0];
      var receipt = receipts[message.id] || null;
      await recordShown(message, receipt, user.id);
      renderMessage(message, {
        onDismiss: function() { recordDismissed(message, user.id); }
      });
    } catch (err) {
      console.warn('QuoteDr broadcast check failed', err);
    }
  }

  function preview(message) {
    renderMessage(Object.assign({ title: 'QuoteDr update', body: '', message_type: 'info' }, message || {}), {});
  }

  window.QuoteDrBroadcasts = {
    loadAndShow: loadAndShow,
    preview: preview,
    isEligible: isEligible
  };

  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(loadAndShow, 600);
  });
})();
