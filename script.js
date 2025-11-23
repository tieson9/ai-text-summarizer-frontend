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
  const API_ENDPOINT = 'https://ai-text-summarizer-21o2.onrender.com'; // Replace with your actual Render URL

  // AbortController for cancellable requests
  let currentController = null;
  let debounceTimer = null;
  const DEBOUNCE_MS = 800;
  const MIN_CHARS = 5;
  let lastRequestedText = '';

  // ------------------------------
  // DOM References
  // ------------------------------
  const el = {
    form: document.getElementById('summarizer-form'),
    input: document.getElementById('input-text'),
    charCount: document.getElementById('char-count'),
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
    const payload = { text };
    const res = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal
    });

    if (!res.ok) {
      const message = `API error: ${res.status} ${res.statusText}`;
      throw new Error(message);
    }
    return res.json();
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
    sentences.forEach((s) => {
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
    if (!text || text.length < MIN_CHARS) {
      showError('Please enter at least 5 characters to summarize.');
      return;
    }
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
    modal.openBtn.addEventListener('click', openModal);
    modal.closeBtn.addEventListener('click', closeModal);
    modal.overlay.addEventListener('click', closeModal);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
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