/* ═══════════════════════════════════════════════════════════════
   HALLUCINATION EXPLORER — App.js
   Handles: Auth, Chat, File Upload, Risk Display, Animations
══════════════════════════════════════════════════════════════ */

/* ── State ─────────────────────────────────────────────────── */
const state = {
  token: null,
  user: null,
  contextLevel: 0,      // 0=NC, 1=PC, 2=FC
  isSpecific: false,
  conversationHistory: [],
  uploadedContext: null,
  uploadedFileName: null,
  sessionStats: { sent: 0, flagged: 0, avgRisk: null },
  isStreaming: false
};

/* ── Init ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Check for stored session
  const savedToken = localStorage.getItem('he_token');
  const savedUser = localStorage.getItem('he_user');

  if (savedToken && savedUser) {
    validateSession(savedToken, JSON.parse(savedUser));
  }

  // Set up toggle listeners
  setupToggles();

  // Set up drag-and-drop for file upload
  setupDragDrop();

  // Auto-focus login input
  setTimeout(() => {
    const nameInput = document.getElementById('name-input');
    if (nameInput && !state.token) nameInput.focus();
  }, 600);
});

/* ── Auth ───────────────────────────────────────────────────── */
async function handleLogin(event) {
  event.preventDefault();

  const name = document.getElementById('name-input').value.trim();
  const pawprint = document.getElementById('pawprint-input').value.trim();
  const btn = document.getElementById('login-btn');

  if (!name || !pawprint) return;

  btn.classList.add('loading');
  btn.querySelector('.btn-label').textContent = 'Logging in…';
  btn.disabled = true;

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, pawprint })
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(data.error || 'Login failed');
      resetLoginBtn(btn);
      return;
    }

    state.token = data.token;
    state.user = data.user;

    localStorage.setItem('he_token', data.token);
    localStorage.setItem('he_user', JSON.stringify(data.user));

    transitionToChat(data.user, data.user.isNew);

  } catch (err) {
    showToast('Connection error. Is the server running?');
    resetLoginBtn(btn);
  }
}

function resetLoginBtn(btn) {
  btn.classList.remove('loading');
  btn.querySelector('.btn-label').textContent = 'Enter the Lab';
  btn.disabled = false;
}

async function validateSession(token, user) {
  try {
    const res = await fetch('/api/auth/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });

    const data = await res.json();

    if (data.valid) {
      state.token = token;
      state.user = data.user;
      transitionToChat(data.user, false);
    } else {
      localStorage.removeItem('he_token');
      localStorage.removeItem('he_user');
    }
  } catch (e) {
    // Session validation failed silently — stay on login screen
  }
}

function transitionToChat(user, isNew) {
  // Update nav
  document.getElementById('nav-user-name').textContent = user.name.split(' ')[0];
  document.getElementById('user-avatar').textContent = user.name.charAt(0).toUpperCase();

  // Switch screens
  document.getElementById('login-screen').classList.remove('active');
  const chatScreen = document.getElementById('chat-screen');
  chatScreen.classList.add('active');

  // Welcome toast
  setTimeout(() => {
    showToast(isNew
      ? `Welcome, ${user.name.split(' ')[0]}! 🎓 New account created.`
      : `Welcome back, ${user.name.split(' ')[0]}! 👋`
    );
  }, 400);

  // Update risk display
  updateRiskDisplay();
}

function handleLogout() {
  localStorage.removeItem('he_token');
  localStorage.removeItem('he_user');
  state.token = null;
  state.user = null;
  state.conversationHistory = [];

  document.getElementById('chat-screen').classList.remove('active');
  document.getElementById('login-screen').classList.add('active');

  // Clear messages
  document.getElementById('messages-container').innerHTML = `
    <div class="welcome-message">
      <div class="welcome-icon">🔬</div>
      <h2>Ready to explore hallucinations?</h2>
      <p>Choose a context level and prompt specificity above, then ask a statistical question. Watch how the risk score changes as you adjust the experimental conditions.</p>
      <div class="welcome-conditions">
        <div class="welcome-cond"><strong>NC</strong> No Context — highest risk</div>
        <div class="welcome-cond"><strong>PC</strong> Partial Context — moderate risk</div>
        <div class="welcome-cond"><strong>FC</strong> Full Context — lowest risk</div>
      </div>
    </div>
  `;

  // Reset stats
  state.sessionStats = { sent: 0, flagged: 0, avgRisk: null };
  updateStatsDisplay();
}

/* ── Toggle Controls ────────────────────────────────────────── */
function setupToggles() {
  // Context level toggle
  document.getElementById('context-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;

    document.querySelectorAll('#context-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.contextLevel = parseInt(btn.dataset.value);
    updateRiskDisplay();
    updateBadge();
  });

  // Specificity toggle
  document.getElementById('specificity-toggle').addEventListener('click', (e) => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn) return;

    document.querySelectorAll('#specificity-toggle .toggle-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.isSpecific = btn.dataset.value === '1';
    updateRiskDisplay();
    updateBadge();
  });
}

function updateBadge() {
  const ctxLabels = ['No Context', 'Partial Context', 'Full Context'];
  const ctxShort  = ['NC', 'PC', 'FC'];

  document.getElementById('badge-context').textContent = ctxLabels[state.contextLevel];
  document.getElementById('badge-specificity').textContent = state.isSpecific ? 'Specific' : 'General';
  document.getElementById('risk-condition-display').textContent =
    `${ctxShort[state.contextLevel]} + ${state.isSpecific ? 'Specific' : 'General'}`;
}

/* ── Risk Display ───────────────────────────────────────────── */
function computeRisk(contextLevel, isSpecific) {
  const b0 = 1.4, b1 = -0.9, b2 = -0.7;
  const c = contextLevel, s = isSpecific ? 1 : 0;
  return Math.round((1 / (1 + Math.exp(-(b0 + b1 * c + b2 * s)))) * 100);
}

function updateRiskDisplay() {
  const risk = computeRisk(state.contextLevel, state.isSpecific);

  // Update number
  const riskNumber = document.getElementById('risk-number');
  animateCounter(riskNumber, parseInt(riskNumber.textContent) || 78, risk, '%');

  // Update gauge arc
  // Arc total length ≈ π × r = π × 50 ≈ 157
  const arcLength = 157;
  const offset = arcLength - (risk / 100) * arcLength;
  const gaugeArc = document.getElementById('gauge-arc');

  let color, labelText;
  if (risk >= 65) { color = '#CF4500'; labelText = 'High Risk'; }
  else if (risk >= 35) { color = '#F37338'; labelText = 'Moderate Risk'; }
  else { color = '#3A7D44'; labelText = 'Low Risk'; }

  gaugeArc.style.strokeDashoffset = offset;
  gaugeArc.style.stroke = color;

  document.getElementById('risk-label').textContent = labelText;
  document.getElementById('risk-label').style.color = color;
  document.getElementById('risk-number').style.color = color;

  updateBadge();
}

function animateCounter(el, from, to, suffix) {
  const duration = 600;
  const start = performance.now();
  const update = (now) => {
    const elapsed = Math.min((now - start) / duration, 1);
    const ease = 1 - Math.pow(1 - elapsed, 3);
    el.textContent = Math.round(from + (to - from) * ease) + suffix;
    if (elapsed < 1) requestAnimationFrame(update);
  };
  requestAnimationFrame(update);
}

/* ── Chat ───────────────────────────────────────────────────── */
async function sendMessage() {
  const input = document.getElementById('chat-input');
  const message = input.value.trim();

  if (!message || state.isStreaming) return;

  state.isStreaming = true;

  // Clear input
  input.value = '';
  input.style.height = 'auto';
  document.getElementById('send-btn').disabled = true;

  // Remove welcome message if present
  const welcome = document.querySelector('.welcome-message');
  if (welcome) welcome.remove();

  // Append user message
  appendMessage('user', message);

  // Add typing indicator
  const typingEl = appendTypingIndicator();

  // Compute risk for this request
  const risk = computeRisk(state.contextLevel, state.isSpecific);

  try {
    const res = await fetch('/api/chat/message', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({
        message,
        contextLevel: state.contextLevel,
        isSpecific: state.isSpecific,
        conversationHistory: state.conversationHistory,
        uploadedContext: state.uploadedContext
      })
    });

    const data = await res.json();

    typingEl.remove();

    if (!res.ok) {
      appendMessage('assistant', `⚠️ Error: ${data.error || 'Something went wrong.'}`, null);
    } else {
      appendMessage('assistant', data.reply, {
        risk: data.hallucinationRisk,
        label: data.riskLabel,
        color: data.riskColor,
        contextLevel: data.condition?.contextLevel,
        isSpecific: data.condition?.isSpecific
      });

      // Update conversation history
      state.conversationHistory.push({ role: 'user', content: message });
      state.conversationHistory.push({ role: 'assistant', content: data.reply });

      // Update session stats
      state.sessionStats.sent++;
      if (data.hallucinationRisk >= 65) state.sessionStats.flagged++;
      const allRisks = state.conversationHistory
        .filter((_, i) => i % 2 === 1)
        .map(() => data.hallucinationRisk);
      state.sessionStats.avgRisk = data.hallucinationRisk;
      updateStatsDisplay();
    }

  } catch (err) {
    typingEl.remove();
    appendMessage('assistant', `⚠️ Network error: ${err.message}. Check your connection.`, null);
  } finally {
    state.isStreaming = false;
    document.getElementById('send-btn').disabled = false;
    input.focus();
  }
}

function appendMessage(role, content, riskData) {
  const container = document.getElementById('messages-container');

  const avatarContent = role === 'user'
    ? (state.user?.name?.charAt(0)?.toUpperCase() || 'U')
    : '🤖';

  const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const ctxLabels = ['NC', 'PC', 'FC'];

  let riskHTML = '';
  if (role === 'assistant' && riskData) {
    const barColor = riskData.color || '#CF4500';
    const conditionStr = riskData.contextLevel !== undefined
      ? `${ctxLabels[riskData.contextLevel]} + ${riskData.isSpecific ? 'Specific' : 'General'}`
      : '';
    riskHTML = `
      <div class="msg-risk">
        <div class="risk-bar-track">
          <div class="risk-bar-fill" style="width: ${riskData.risk}%; background: ${barColor};"></div>
        </div>
        <span class="risk-badge" style="background: ${barColor};">
          ${riskData.risk}% · ${riskData.label}
        </span>
      </div>
    `;
  }

  const metaHTML = `<div class="msg-meta">${timeStr}${role === 'user' ? '' : ''}</div>`;

  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `
    <div class="msg-avatar">${avatarContent}</div>
    <div class="msg-content">
      <div class="msg-bubble">${escapeHtml(content)}</div>
      ${riskHTML}
      ${metaHTML}
    </div>
  `;

  container.appendChild(div);
  container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });

  return div;
}

function appendTypingIndicator() {
  const container = document.getElementById('messages-container');
  const div = document.createElement('div');
  div.className = 'typing-indicator';
  div.innerHTML = `
    <div class="msg-avatar" style="background: linear-gradient(135deg, #CF4500, #F37338); font-size:18px;">🤖</div>
    <div class="typing-dots">
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
      <div class="typing-dot"></div>
    </div>
  `;
  container.appendChild(div);
  container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  return div;
}

/* ── Stats ──────────────────────────────────────────────────── */
function updateStatsDisplay() {
  document.getElementById('stat-sent').textContent = state.sessionStats.sent;
  document.getElementById('stat-flagged').textContent = state.sessionStats.flagged;
  document.getElementById('stat-avg').textContent =
    state.sessionStats.avgRisk !== null ? state.sessionStats.avgRisk + '%' : '—';
}

/* ── File Upload ────────────────────────────────────────────── */
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  await uploadFile(file);
}

async function uploadFile(file) {
  const formData = new FormData();
  formData.append('file', file);

  showToast('Uploading file…');

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.token}` },
      body: formData
    });

    const data = await res.json();

    if (!res.ok) {
      showToast(`Upload failed: ${data.error}`);
      return;
    }

    state.uploadedContext = data.fullText;
    state.uploadedFileName = data.filename;

    // Show status
    document.getElementById('upload-status').style.display = 'flex';
    document.getElementById('upload-file-name').textContent = `📄 ${data.filename} (${data.fileType})`;
    document.getElementById('upload-zone').style.display = 'none';

    showToast(`✅ ${data.filename} loaded — ${data.textLength} chars extracted`);

  } catch (err) {
    showToast(`Upload error: ${err.message}`);
  }
}

function clearUpload() {
  state.uploadedContext = null;
  state.uploadedFileName = null;
  document.getElementById('upload-status').style.display = 'none';
  document.getElementById('upload-zone').style.display = 'flex';
  document.getElementById('file-input').value = '';
  showToast('File removed');
}

function setupDragDrop() {
  const zone = document.getElementById('upload-zone');
  if (!zone) return;

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.style.borderColor = 'var(--ink)';
    zone.style.background = 'var(--canvas)';
  });

  zone.addEventListener('dragleave', () => {
    zone.style.borderColor = '';
    zone.style.background = '';
  });

  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    zone.style.borderColor = '';
    zone.style.background = '';

    const file = e.dataTransfer.files[0];
    if (file) await uploadFile(file);
  });
}

/* ── Input Helpers ──────────────────────────────────────────── */
function handleKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function autoResize(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
}

function injectPrompt(text) {
  const input = document.getElementById('chat-input');
  input.value = text;
  autoResize(input);
  input.focus();
  input.setSelectionRange(text.length, text.length);
}

/* ── Toast ──────────────────────────────────────────────────── */
let toastTimeout;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');

  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 3500);
}

/* ── Utils ──────────────────────────────────────────────────── */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(text));
  return div.innerHTML;
}