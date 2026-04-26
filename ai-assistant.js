// QuoteDr AI Assistant Widget
(function() {
var SUPABASE_URL = 'https://axmoffknvblluibuitrq.supabase.co';
var ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF4bW9mZmtudmJsbHVpYnVpdHJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzI0ODAsImV4cCI6MjA5MTQ0ODQ4MH0.SULFrXCwoABe9w4J_MBNQq6HQfzx2Sns-11uxGZYAso';
var FUNCTION_URL = SUPABASE_URL + '/functions/v1/ai-assistant';
var messages = [];
var isOpen = false;

// Suggested quick questions
var SUGGESTIONS = [
  'How do I add a room?',
  'How do I send a quote to a client?',
  'How do I add my pricing list?',
  'How do I save a quote?',
  'How do I create an invoice?',
  'Tips for pricing a job?'
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
      bottom: 72px;
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
  #qdAiClose {
    background: none;
    border: none;
    color: white;
    font-size: 1.2rem;
    cursor: pointer;
    padding: 0;
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
    <div id="qdAiPanel">
      <div id="qdAiHeader">
        <span>&#129302; QuoteDr Assistant</span>
        <button id="qdAiClose" onclick="window._qdAiToggle()">&#x2715;</button>
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
        <a href="help.html" style="color:#1a56a0; text-decoration:none;">📄 Need more help? View FAQ</a>
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
}

window._qdAiToggle = function() {
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
    var res = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + ANON_KEY
      },
      body: JSON.stringify({
        messages: messages.slice(-6) // last 6 messages for context
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
    .replace(/\n- /g, '\n• ')
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