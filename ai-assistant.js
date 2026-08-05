// QuoteDr AI Assistant Widget
(function() {
var SUPABASE_URL = 'https://axmoffknvblluibuitrq.supabase.co';
var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso';
var FUNCTION_URL = SUPABASE_URL + '/functions/v1/ai-assistant';
var CHATBOT_FEEDBACK_URL = SUPABASE_URL + '/functions/v1/chatbot-feedback';
var messages = [];
var isOpen = false;

function recordPrivacySafeChatbotTopic(question, answer) {
  if (!window.QuoteDrChatbotFeedbackTopics || typeof getSupabaseFunctionAuthHeaders !== 'function') return;
  var classified = window.QuoteDrChatbotFeedbackTopics.classify(question, answer, getQuoteDrAssistantContext());
  if (!classified) return;
  getSupabaseFunctionAuthHeaders().then(function(headers) {
    return fetch(CHATBOT_FEEDBACK_URL, { method: 'POST', headers: headers, body: JSON.stringify({ action: 'record', topicKey: classified.topicKey, intentKey: classified.intentKey, surfaceKey: classified.surfaceKey }) });
  }).catch(function() {});
}


// Suggested quick questions
var SUGGESTIONS = [
  'How do I add a room?',
  'How do I send a quote to a client?',
  'How do I create a saved group?',
  'How can clients pick one material?',
  'How do I use AI Voice memory?',
  'How do payments work?'
];

function init() {
  // Inject CSS
  var style = document.createElement('style');
  style.textContent = ` #qdAiBtn {
    position: fixed;
    bottom: 80px;
    right: 16px;
    z-index: 9999;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    color: white;
    border: none;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(124,58,237,0.4);
    font-size: 1.4rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s;
  }
  #qdAiBtn:hover {
    transform: scale(1.1);
  }
  #qdAiPanel {
    position: fixed;
    bottom: 145px;
    right: 16px;
    z-index: 9998;
    width: 320px;
    max-width: calc(100vw - 32px);
    background: white;
    border-radius: 16px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.15);
    display: none;
    flex-direction: column;
    max-height: 480px;
    overflow: hidden;
    border: 1px solid #e5e7eb;
  }
  @media (max-width: 600px) {
    #qdAiPanel {
      bottom: 0 !important;
      right: 0 !important;
      left: 0 !important;
      width: 100% !important;
      max-width: 100% !important;
      border-radius: 16px 16px 0 0;
      max-height: 75vh;
    }
    #qdAiBtn {
      bottom: 130px;
    }
  }
  #qdAiPanel.open {
    display: flex;
  }
  #qdAiHeader {
    background: linear-gradient(135deg, #7c3aed, #4f46e5);
    color: white;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-radius: 16px 16px 0 0;
  }
  #qdAiHeader span {
    font-weight: 700;
    font-size: 0.95rem;
  }
  #qdAiHeaderActions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  #qdAiHide {
    background: rgba(255,255,255,0.16);
    border: 1px solid rgba(255,255,255,0.34);
    color: white;
    border-radius: 999px;
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1;
    padding: 6px 10px;
    cursor: pointer;
  }
  #qdAiHide:hover {
    background: rgba(255,255,255,0.25);
  }
  #qdAiClose {
    background: none;
    border: none;
    color: white;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0;
  }
  #qdAiNotice {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 10000;
    max-width: 340px;
    background: #102a43;
    color: white;
    border-radius: 10px;
    box-shadow: 0 10px 28px rgba(15,23,42,0.22);
    padding: 12px 14px;
    font-size: 0.9rem;
    line-height: 1.35;
    display: none;
  }
  #qdAiMessages {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 150px;
  }
  .qdMsg {
    max-width: 85%;
    padding: 8px 12px;
    border-radius: 12px;
    font-size: 0.88rem;
    line-height: 1.4;
  }
  .qdMsg.user {
    background: #7c3aed;
    color: white;
    align-self: flex-end;
    border-radius: 12px 12px 2px 12px;
  }
  .qdMsg.ai {
    background: #f3f4f6;
    color: #111;
    align-self: flex-start;
    border-radius: 12px 12px 12px 2px;
  }
  .qdMsg.ai ul {
    margin: 4px 0 0 0;
    padding-left: 16px;
  }
  .qdMsg.ai li {
    margin-bottom: 2px;
  }
  #qdSuggestions {
    padding: 8px 12px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    border-top: 1px solid #f0f0f0;
  }
  .qdSug {
    background: #f3f4f6;
    border: 1px solid #e5e7eb;
    border-radius: 20px;
    padding: 4px 10px;
    font-size: 0.78rem;
    cursor: pointer;
    color: #4f46e5;
    white-space: nowrap;
  }
  .qdSug:hover {
    background: #ede9fe;
  }
  #qdAiInputRow {
    display: flex;
    gap: 8px;
    padding: 10px 12px;
    border-top: 1px solid #f0f0f0;
  }
  #qdAiInput {
    flex: 1;
    border: 1px solid #d1d5db;
    border-radius: 20px;
    padding: 7px 14px;
    font-size: 0.88rem;
    outline: none;
  }
  #qdAiInput:focus {
    border-color: #7c3aed;
  }
  #qdAiSend {
    background: #7c3aed;
    color: white;
    border: none;
    border-radius: 50%;
    width: 34px;
    height: 34px;
    cursor: pointer;
    font-size: 1rem;
    flex-shrink: 0;
  }
  #qdAiSend:hover {
    background: #6d28d9;
  } `;
  document.head.appendChild(style);

  // Build HTML
  var html = `
    <button id="qdAiBtn" title="Ask AI Assistant" onclick="window._qdAiToggle()">
      <i class="fas fa-robot"></i>
    </button>
    <div id="qdAiNotice" role="status" aria-live="polite"></div>
    <div id="qdAiPanel">
      <div id="qdAiHeader">
        <span>&#129302; QuoteDr Assistant</span>
        <div id="qdAiHeaderActions">
          <button id="qdAiHide" onclick="window._qdAiHideFromPanel()">Hide</button>
          <button id="qdAiClose" onclick="window._qdAiToggle()" aria-label="Close assistant">&#x2715;</button>
        </div>
      </div>
      <div id="qdAiMessages">
        <div class="qdMsg ai">Hey! I'm your QuoteDr assistant. Ask me anything about the app or quoting! &#128293;</div>
      </div>
      <div id="qdSuggestions"></div>
      <div id="qdAiInputRow">
        <input id="qdAiInput" type="text" placeholder="Ask anything..." onkeypress="if(event.key==='Enter') window._qdAiSend()" autocomplete="off" autocorrect="off" spellcheck="false">
        <button id="qdAiSend" onclick="window._qdAiSend()">&#10148;</button>
      </div>
      <div style="text-align:center; padding: 6px 0 2px; font-size: 0.75rem;">
        <a href="help.html" style="color:#1a56a0; text-decoration:none;">ðŸ“„ Need more help? View FAQ</a>
      </div>
    </div>
  `;
  var div = document.createElement('div');
  div.innerHTML = html;
  document.body.appendChild(div);

  // Mobile keyboard: push panel above keyboard when input focused
  var qdInput = document.getElementById('qdAiInput');
  var qdPanel = document.getElementById('qdAiPanel');
  qdInput.addEventListener('focus', function() {
    if (window.innerWidth <= 600) {
      // Let keyboard open, then scroll panel into view
      setTimeout(function() {
        qdInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 300);
    }
  });

  // Render suggestions
  var sugEl = document.getElementById('qdSuggestions');
  SUGGESTIONS.forEach(function(s) {
    var btn = document.createElement('button');
    btn.className = 'qdSug';
    btn.textContent = s;
    btn.onclick = function() {
      window._qdAiAsk(s);
    };
    sugEl.appendChild(btn);
  });

  if (localStorage.getItem('ald_ai_btn_hidden') === '1') {
    window._qdAiSetHidden(true);
  }
}

window._qdAiNotice = function(text) {
  var notice = document.getElementById('qdAiNotice');
  if (!notice) return;
  notice.textContent = text;
  notice.style.display = 'block';
  clearTimeout(window._qdAiNoticeTimer);
  window._qdAiNoticeTimer = setTimeout(function() {
    notice.style.display = 'none';
  }, 5200);
};

window._qdAiSetHidden = function(hidden, options) {
  var btn = document.getElementById('qdAiBtn');
  var panel = document.getElementById('qdAiPanel');
  var menuItem = document.getElementById('aiToggleMenuItem');
  if (btn) btn.style.display = hidden ? 'none' : '';
  if (panel && hidden) panel.classList.remove('open');
  if (hidden) isOpen = false;
  if (menuItem) {
    menuItem.innerHTML = hidden
      ? '<i class="fas fa-robot me-2 text-secondary"></i>Show AI Assistant'
      : '<i class="fas fa-robot me-2 text-secondary"></i>Hide AI Assistant';
  }
  try { localStorage.setItem('ald_ai_btn_hidden', hidden ? '1' : '0'); } catch(e) {}
  if (hidden && options && options.notice) {
    window._qdAiNotice(options.notice);
  }
};

window._qdAiHideFromPanel = function() {
  window._qdAiSetHidden(true, {
    notice: 'AI assistant hidden. You can bring me back from the top-right Account menu.'
  });
};

window._qdAiToggle = async function() {
  if (!isOpen && typeof requireFeature === 'function') {
    var allowed = await requireFeature('ai_assistant', 'AI Assistant');
    if (!allowed) return;
  }
  isOpen = !isOpen;
  var panel = document.getElementById('qdAiPanel');
  if (isOpen) {
    panel.classList.add('open');
    document.getElementById('qdAiInput').focus();
  } else {
    panel.classList.remove('open');
  }
};

window._qdAiAsk = function(text) {
  document.getElementById('qdAiInput').value = text;
  window._qdAiSend();
};

function getQuoteDrAssistantContext() {
  var activeModal = document.querySelector('.modal.show');
  var activeModalTitle = '';
  if (activeModal) {
    var titleEl = activeModal.querySelector('.modal-title, h1, h2, h3, h4, h5');
    activeModalTitle = titleEl ? titleEl.textContent.trim() : '';
  }
  var activeTool = '';
  try {
    var selectedToolbar = document.querySelector('.btn.active, .nav-link.active, [aria-selected="true"]');
    activeTool = selectedToolbar ? selectedToolbar.textContent.trim().replace(/\s+/g, ' ').slice(0, 80) : '';
  } catch(e) {}
  return {
    pagePath: window.location.pathname || '',
    pageTitle: document.title || '',
    activeModalId: activeModal ? activeModal.id || '' : '',
    activeModalTitle: activeModalTitle,
    activeTool: activeTool
  };
}

function normalizeQuoteDrAssistantQuestion(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function quoteDrMissingFeatureReply() {
  return 'From what I can see, QuoteDr does not have that yet. Go to Settings > Feedback and submit the idea so we can consider building it.';
}

function getQuoteDrLocalAssistantReply(text) {
  var q = normalizeQuoteDrAssistantQuestion(text);
  if (!q) return '';

  if ((q.includes('saved group') || q.includes('choice group') || q.includes('option group')) && (q.includes('create') || q.includes('make') || q.includes('saved'))) {
    return '**How to create a saved Choice Group:**\n' +
      '1. Open the quote builder and click **Manage Items**.\n' +
      '2. Use **Manage Items > Choice Group**: click Choice Group, then click New.\n' +
      '3. Search and select the saved items you want in the group.\n' +
      '4. Choose **Pick One** if the client should choose one option, or **Pick Multiple** if they can choose several.\n' +
      '5. For **Pick One**, choose the default/base option.\n' +
      '6. Leave **Always use grouping when any of these items are added to a quote** on if you want QuoteDr to auto-group them later.\n' +
      '7. Save the group.\n\n' +
      'You can add it to a room with **Saved Group**, or add one of its saved items and let auto-grouping place the group on the quote.';
  }

  if ((q.includes('client') || q.includes('customer')) && (q.includes('pick') || q.includes('choose') || q.includes('select')) && (q.includes('material') || q.includes('option') || q.includes('few'))) {
    return '**To let a client pick one of a few materials:**\n' +
      '1. Open **Manage Items**.\n' +
      '2. Click **Choice Group**, then **New**.\n' +
      '3. Select the saved material items, such as vinyl, laminate, and hardwood.\n' +
      '4. Choose **Pick One**.\n' +
      '5. Choose the default/base option and save the group.\n' +
      '6. Add the group to a room with **Saved Group**, or add one matching item and let auto-grouping use the saved group.\n\n' +
      'In the quote builder, click the **Pick One** badge if you want to switch which option is selected or shown first. Use **Turn Off Grouping** if this quote should keep only one normal line item.';
  }

  if (q.includes('turn off grouping') || q.includes('disable grouping') || q.includes('ungroup')) {
    return '**To turn off grouping:**\n' +
      '1. On the grouped quote row, click **Turn Off Grouping**.\n' +
      '2. Choose which option should remain on the quote.\n' +
      '3. QuoteDr converts that grouped row into a normal line item for this quote only.\n\n' +
      'To stop automatic grouping for a room and future new rooms, click **Disable Grouping** in the room toolbar.';
  }

  if (q.includes('ai voice') && (q.includes('memory') || q.includes('learn'))) {
    return '**AI Voice Memory:**\n' +
      '1. Open the AI Voice tool.\n' +
      '2. Record the job and generate the review step.\n' +
      '3. In **AI Voice Review**, match what QuoteDr heard to the correct saved item.\n' +
      '4. Keep **Remember this** checked when you want QuoteDr to learn that phrase for next time.\n' +
      '5. Use **AI Memory** from the voice modal to edit or delete learned mappings later.\n\n' +
      'For repeat rules like â€œcase a door means 35 LF of trim,â€ use **AI Trade Rules**. For packages like â€œstandard bedroom package,â€ use **Voice Templates**.';
  }

  if (q.includes('payment') || q.includes('stripe') || q.includes('deposit')) {
    return '**How payments work in QuoteDr:**\n' +
      '1. Go to **Settings > Payments**.\n' +
      '2. Enable Stripe Payments when you are ready to accept card payments.\n' +
      '3. Set the default deposit percent.\n' +
      '4. Turn on the **deposit payment button on quote links** if clients should pay deposits from quotes.\n' +
      '5. Turn on the **pay-in-full button on invoice links** if clients should pay full invoice balances.\n\n' +
      'You can also keep manual payment instructions for e-transfer, cash, cheque, or other offline methods.';
  }

  if (q.includes('add') && q.includes('room')) {
    return '**To add a room or area:**\n' +
      '1. In the quote builder, click **Add Room**.\n' +
      '2. Enter the room or area name, like Bedroom, Kitchen, Exterior, or Basement.\n' +
      '3. Add line items inside that room so the quote stays organized for the client.';
  }

  if (q.includes('send') && q.includes('quote')) {
    return '**To send a quote:**\n' +
      '1. Review the client information, rooms, line items, totals, and terms.\n' +
      '2. Click **Quote** or open **Send Quote Settings**.\n' +
      '3. Choose style, pricing detail, approval type, expiry, deposit display, and message.\n' +
      '4. Generate the client link, preview it, then copy or email it to the client.';
  }

  if ((q.includes('schedule') && (q.includes('crew') || q.includes('job'))) || q.includes('dispatch') || q.includes('calendar crew')) {
    return quoteDrMissingFeatureReply();
  }

  return '';
}

window._qdAiSend = async function() {
  var input = document.getElementById('qdAiInput');
  var text = input.value.trim();
  if (!text) return;
  input.value = '';

  // Add user message
  messages.push({
    role: 'user',
    content: text
  });
  _addMsg(text, 'user');

  // Hide suggestions after first message
  document.getElementById('qdSuggestions').style.display = 'none';

  // Add loading indicator
  var loadingId = 'qdLoading_' + Date.now();
  var msgEl = document.getElementById('qdAiMessages');
  var loadDiv = document.createElement('div');
  loadDiv.className = 'qdMsg ai';
  loadDiv.id = loadingId;
  loadDiv.textContent = '...';
  msgEl.appendChild(loadDiv);
  msgEl.scrollTop = msgEl.scrollHeight;

  try {
    var localReply = getQuoteDrLocalAssistantReply(text);
    if (localReply) {
      messages.push({
        role: 'assistant',
        content: localReply
      });
      var localLoadingEl = document.getElementById(loadingId);
      if (localLoadingEl) {
        localLoadingEl.remove();
      }
      _addMsg(localReply, 'ai');
      recordPrivacySafeChatbotTopic(text, localReply);
      return;
    }

    if (typeof getSupabaseFunctionAuthHeaders !== 'function') {
      throw new Error('Please sign in before using the AI assistant.');
    }
    var res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: await getSupabaseFunctionAuthHeaders(),
      body: JSON.stringify({
        messages: messages.slice(-6), // last 6 messages for context
        context: getQuoteDrAssistantContext()
      })
    });
    var data = await res.json();
    var reply = data.reply || data.error || 'Sorry, something went wrong.';
    messages.push({
      role: 'assistant',
      content: reply
    });
    var loadingEl = document.getElementById(loadingId);
    if (loadingEl) {
      loadingEl.remove();
    }
    _addMsg(reply, 'ai');
    recordPrivacySafeChatbotTopic(text, reply);
  } catch(e) {
    var loadingEl = document.getElementById(loadingId);
    if (loadingEl) {
      loadingEl.textContent = 'Error: ' + e.message;
    }
  }
};

function _addMsg(text, role) {
  var msgEl = document.getElementById('qdAiMessages');
  var div = document.createElement('div');
  div.className = 'qdMsg ' + role;

  // Simple markdown: convert **bold** and bullet points
  div.innerHTML = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n- /g, '\nâ€¢ ')
    .replace(/\n/g, '<br>');

  msgEl.appendChild(div);
  msgEl.scrollTop = msgEl.scrollHeight;
}

// Init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
})();
