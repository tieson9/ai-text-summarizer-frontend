/* =====================================================================
   PrimeSummarizer Frontend Script
   - Modular functions for API integration and UI interaction
   - POST JSON: { text: "USER_INPUT_TEXT" } to https://YOUR_RENDER_URL/summarize
   - Handles loading state, cancellation, errors, and copy actions
   ===================================================================== */

(function () {
  // ------------------------------
  // Configuration
  // ------------------------------
  const API_ENDPOINT ="https://https://ai-text-summarizer-21o2.onrender.com/summarize"; // Universal API endpoint

  // AbortController for cancellable requests
  let currentController = null;
  const MIN_CHARS = 5;
  let lastRequestedText = '';

  // ------------------------------
  // DOM References
  // ------------------------------
  const el = {
    form: document.getElementById('summarizer-form'),
    input: document.getElementById('input-text'),
    charCount: document.getElementById('char-count'),
    apiKey: document.getElementById('api-key'),
    provider: document.getElementById('provider-select'),
    model: document.getElementById('model-select'),
    optTrim: document.getElementById('opt-trim'),
    optNormalize: document.getElementById('opt-normalize'),
    optUnbreak: document.getElementById('opt-unbreak'),
    btnCancel: document.getElementById('btn-cancel'),
    loading: document.getElementById('loading'),
    summary: document.getElementById('summary'),
    sentences: document.getElementById('sentences'),
    copySummary: document.getElementById('copy-summary'),
    copySentences: document.getElementById('copy-sentences'),
    error: document.getElementById('error')
  };
  const modal = {
    overlay: document.getElementById('modal-overlay'),
    dialog: document.getElementById('modal-about'),
    openBtn: document.getElementById('open-about'),
    closeBtn: document.getElementById('modal-close')
  };

  function debug(msg) {
    const box = document.getElementById('debug-log');
    if (!box) return;
    const time = new Date().toLocaleTimeString();
    box.innerHTML += `[${time}] ${msg}<br>`;
    box.scrollTop = box.scrollHeight;
  }

  const MODEL_MAP = {
    openai: ['gpt-4o-mini','gpt-4o','o3-mini'],
    google: ['gemini-1.5-flash','gemini-1.5-pro']
  };

  function populateModels(provider) {
    const options = MODEL_MAP[provider] || [];
    el.model.innerHTML = '<option value="">Select a model</option>';
    options.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m; opt.textContent = m; el.model.appendChild(opt);
    });
  }

  function saveApiKey() {
    const key = el.apiKey?.value?.trim() || '';
    try { localStorage.setItem('ps_api_key', key); } catch (_) {}
  }

  function loadApiKey() {
    try {
      const key = localStorage.getItem('ps_api_key');
      if (key && el.apiKey) el.apiKey.value = key;
    } catch (_) {}
  }

  function validateForm(text) {
    const errors = [];
    if (!text || text.length < MIN_CHARS) errors.push('Please enter at least 5 characters.');
    if (!el.apiKey.value.trim()) errors.push('API key is required.');
    if (!el.provider.value) errors.push('Provider is required.');
    if (!el.model.value) errors.push('Model is required.');
    return errors;
  }

  // ------------------------------
  // Utilities: formatting and copying
  // ------------------------------
  function updateCharCount() {
    const count = el.input.value.length;
    el.charCount.textContent = `${count} characters`;
  }

  function applyFormatting(text) {
    let t = text;
    if (el.optTrim.checked) t = t.trim();
    if (el.optUnbreak.checked) t = t.replace(/\s*\n+\s*/g, ' ');
    if (el.optNormalize.checked) t = t.replace(/ {2,}/g, ' ');
    return t;
  }

  async function copyToClipboard(content) {
    try {
      await navigator.clipboard.writeText(content);
    } catch (err) {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = content;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand('copy'); } catch (_) {}
      document.body.removeChild(ta);
    }
  }

  // ------------------------------
  // API: call and parse response
  // ------------------------------
  async function callSummarizeAPI(text, signal) {
    const payload = {
      text,
      provider: el.provider.value,
      model: el.model.value,
      api_key: el.apiKey.value.trim()
    };
    console.log('[DEBUG] Fetching…');
    debug('Fetching…');
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal
    });
    console.log('[DEBUG] Response status:', res.status);
    debug(`Response status: ${res.status}`);
    if (!res.ok) {
      const message = `API error: ${res.status} ${res.statusText}`;
      throw new Error(message);
    }
    const data = await res.json();
    console.log('[DEBUG] Response JSON:', data);
    debug(`Response JSON: ${JSON.stringify(data)}`);
    return data;
  }

  function parseResponse(json) {
    // Expected: { summary: string, important_sentences: string[] }
    // Be tolerant of variations in field names
    const summary = json.summary || json.result || '';
    const sentences = json.important_sentences || json.sentences || json.highlights || [];
    const normalizedSentences = Array.isArray(sentences) ? sentences : (typeof sentences === 'string' ? sentences.split(/\n+/) : []);
    return { summary, sentences: normalizedSentences };
  }

  // ------------------------------
  // UI: loading state, errors, and results
  // ------------------------------
  function setLoading(isLoading) {
    el.loading.hidden = !isLoading;
    el.btnCancel.hidden = !isLoading;
    el.btnCancel.setAttribute('aria-hidden', String(!isLoading));
  }

  function showError(message) {
    el.error.textContent = message;
    el.error.hidden = false;
  }

  function clearError() {
    el.error.hidden = true;
    el.error.textContent = '';
  }

  function renderResults({ summary, sentences }) {
    el.summary.textContent = summary || '';
    el.sentences.innerHTML = '';
    (sentences || []).slice(0,3).forEach((s) => {
      const li = document.createElement('li');
      li.textContent = s;
      el.sentences.appendChild(li);
    });
  }

  // ------------------------------
  // Event Handlers
  // ------------------------------
  async function handleSummarize() {
    clearError();
    updateCharCount();
    const raw = el.input.value;
    const text = applyFormatting(raw);
    console.log('[DEBUG] Raw input:', raw);
    console.log('[DEBUG] Formatted text:', text);
    console.log('[DEBUG] Sending text to API:', text);
    console.log('[DEBUG] API endpoint:', API_ENDPOINT);
    debug(`Sending text to API: ${text}`);
    debug(`API endpoint: ${API_ENDPOINT}`);
    const errors = validateForm(text);
    if (errors.length) { showError(errors.join(' ')); return; }
    if (text === lastRequestedText) {
      return;
    }

    // Prepare cancellable request
    currentController = new AbortController();
    const { signal } = currentController;
    setLoading(true);

    try {
      const json = await callSummarizeAPI(text, signal);
      const parsed = parseResponse(json);
      renderResults(parsed);
      lastRequestedText = text;
    } catch (err) {
      console.error('[ERROR] Fetch failed:', err);
      debug(`Error: ${err}`);
      if (err.name === 'AbortError') {
        showError('Request cancelled.');
      } else {
        showError(err.message || 'Unexpected error while summarizing.');
      }
    } finally {
      setLoading(false);
      currentController = null;
    }
  }

  function handleCancel() {
    if (currentController) {
      currentController.abort();
      currentController = null;
      setLoading(false);
    }
  }

  function handleCopySummary() {
    copyToClipboard(el.summary.textContent || '');
  }

  function handleCopySentences() {
    const text = Array.from(el.sentences.querySelectorAll('li')).map(li => li.textContent || '').join('\n');
    copyToClipboard(text);
  }

  function openModal() {
    modal.overlay.hidden = false;
    modal.dialog.hidden = false;
    requestAnimationFrame(() => {
      modal.overlay.classList.add('open');
      modal.dialog.classList.add('open');
      modal.closeBtn.focus();
    });
  }

  function closeModal() {
    modal.overlay.classList.remove('open');
    modal.dialog.classList.remove('open');
    setTimeout(() => {
      modal.overlay.hidden = true;
      modal.dialog.hidden = true;
      modal.openBtn.focus();
    }, 240);
  }

  function setup() {
    el.input.addEventListener('input', updateCharCount);
    updateCharCount();
    const summarizeBtn = document.getElementById('btn-summarize');
    summarizeBtn.addEventListener('click', handleSummarize);
    el.btnCancel.addEventListener('click', handleCancel);
    el.copySummary.addEventListener('click', handleCopySummary);
    el.copySentences.addEventListener('click', handleCopySentences);
    el.apiKey.addEventListener('input', saveApiKey);
    el.provider.addEventListener('change', (e) => populateModels(e.target.value));
    loadApiKey();
    populateModels(el.provider.value);
    modal.openBtn.addEventListener('click', openModal);
    modal.closeBtn.addEventListener('click', closeModal);
    modal.overlay.addEventListener('click', closeModal);
    function handleEscClose(e) { if (e.key === 'Escape') closeModal(); }
    window.addEventListener('keydown', handleEscClose);
    // Store handler for cleanup
    window._ps_handleEscClose = handleEscClose;
  }

  function cleanup() {
    el.input.removeEventListener('input', updateCharCount);
    const summarizeBtn = document.getElementById('btn-summarize');
    summarizeBtn.removeEventListener('click', handleSummarize);
    el.btnCancel.removeEventListener('click', handleCancel);
    el.copySummary.removeEventListener('click', handleCopySummary);
    el.copySentences.removeEventListener('click', handleCopySentences);
    modal.openBtn.removeEventListener('click', openModal);
    modal.closeBtn.removeEventListener('click', closeModal);
    modal.overlay.removeEventListener('click', closeModal);
    if (window._ps_handleEscClose) {
      window.removeEventListener('keydown', window._ps_handleEscClose);
      delete window._ps_handleEscClose;
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup, { once: true });
  } else {
    setup();
  }

  // Cleanup on unload
  window.addEventListener('beforeunload', cleanup, { once: true });
})();
