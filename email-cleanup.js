(() => {
  // Ensure script runs only once per compose iframe
  if (window.__emailCleanupInjected) return;
  window.__emailCleanupInjected = true;

  const { notify } = window.ExtLib;

  const createProgressOverlay = () => {
    ensureSpinKeyframes();
    const overlay = document.createElement('div');
    overlay.id = 'email-cleanup-progress';
    overlay.innerHTML = '<div style="text-align:center"><div style="width:36px;height:36px;border:3px solid #e0e0e0;border-top:3px solid #4285f4;border-radius:50%;margin:0 auto 12px;animation:ec-spin 0.8s linear infinite"></div><span style="color:#5f6368;font-size:14px">Cleaning draft…</span></div>';
    overlay.style.cssText = `position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,0.85);z-index:2147483647;border-radius:8px;`;
    return overlay;
  };

  let spinKeyframesInjected = false;
  const ensureSpinKeyframes = () => {
    if (spinKeyframesInjected) return;
    spinKeyframesInjected = true;
    const style = document.createElement('style');
    style.textContent = '@keyframes ec-spin { to { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  };

  const setButtonLoading = (btn, loading) => {
    ensureSpinKeyframes();
    btn.innerHTML = loading ? '🧹 Clean <span style="display:inline-block;width:12px;height:12px;border:2px solid #4285f4;border-top:2px solid transparent;border-radius:50%;animation:ec-spin 0.6s linear infinite;vertical-align:middle;margin-left:2px"></span>' : '🧹 Clean';
    btn.style.pointerEvents = loading ? 'none' : '';
    btn.style.opacity = loading ? '0.7' : '';
  };

  // Insert button into Gmail compose toolbar
  const insertButton = (toolbar) => {
    if (toolbar.querySelector('.cleanup-btn')) return;
    const btn = document.createElement('div');
    btn.className = 'cleanup-btn';
    btn.role = 'button';
    btn.title = 'Clean up draft with LLM';
    btn.textContent = '🧹 Clean';
    btn.style.cssText = `cursor:pointer;margin-left:8px;padding:4px 8px;background:#e8f0fe;border-radius:4px;color:#202124;font-size:13px;`;
    btn.addEventListener('click', () => {
      const dialog = btn.closest('div[role="dialog"]') || document;
      const editable = dialog.querySelector('div[contenteditable="true"][aria-label="Message Body"]') || dialog.querySelector('div[aria-label="Message Body"]');
      if (!editable) { notify('Unable to locate draft area', { color: '#d32f2f' }); return; }
      const originalDraft = editable.innerText;
      setButtonLoading(btn, true);
      window.__emailCleanupBtn = btn;
      window.__emailCleanupEl = editable;
      window.__emailCleanupOriginal = originalDraft;
      chrome.runtime.sendMessage({ action: 'cleanDraft', draft: originalDraft });
    });
    toolbar.appendChild(btn);
  };

  // Observe DOM for compose windows (Gmail creates a div[role="dialog"] with a toolbar inside)
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        // Only target the compose formatting toolbar (aria-label="Formatting options"),
        // not the inbox search/filter toolbar (aria-label="search refinement")
        const toolbar = node.matches('div[role="toolbar"][aria-label="Formatting options"]')
          ? node
          : node.querySelector('div[role="toolbar"][aria-label="Formatting options"]');
        if (toolbar) {
          insertButton(toolbar);
        }
      }
    }
  });

  // Start observing body for changes (Gmail injects compose dialogs dynamically)
  observer.observe(document.body, { childList: true, subtree: true });

  // Listen for messages from background script
  chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
    if (msg.action === 'showProgress') {
      // Find compose container (the nearest positioned ancestor of the toolbar)
      const container = document.querySelector('div[role="dialog"]');
      if (!container) return;
      // Ensure container is relatively positioned so absolute bar works
      const prevPos = container.style.position;
      if (prevPos !== 'relative' && prevPos !== 'absolute') container.style.position = 'relative';
      let overlay = document.getElementById('email-cleanup-progress');
      if (!overlay) {
        overlay = createProgressOverlay();
        container.appendChild(overlay);
      }
    } else if (msg.action === 'hideProgress') {
      const overlay = document.getElementById('email-cleanup-progress');
      if (overlay) overlay.remove();
      if (window.__emailCleanupBtn) { setButtonLoading(window.__emailCleanupBtn, false); window.__emailCleanupBtn = null; }
    } else if (msg.action === 'draftCleaned') {
      const editable = window.__emailCleanupEl;
      if (!editable) { notify('Unable to locate draft area', { color: '#d32f2f' }); return; }
      editable.focus();
      document.execCommand('selectAll');
      document.execCommand('insertText', false, msg.markdown);
      editable.dispatchEvent(new Event('input', { bubbles: true }));
      notify('Draft cleaned and rendered');
    } else if (msg.action === 'draftError') {
      const editable = window.__emailCleanupEl;
      if (editable && window.__emailCleanupOriginal) {
        editable.focus();
        document.execCommand('selectAll');
        document.execCommand('insertText', false, window.__emailCleanupOriginal);
      }
      if (window.__emailCleanupBtn) { setButtonLoading(window.__emailCleanupBtn, false); window.__emailCleanupBtn = null; }
      notify('LLM request failed – original draft restored', { color: '#d32f2f' });
    }
    return true;
  });
})();