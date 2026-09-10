(() => {
  'use strict';

  const { matchesPattern, notify } = window.ExtLib;

  // Re-injection while already active toggles the feature off.
  if (window.__autoExpandActive) {
    window.__autoExpandObserver?.disconnect();
    window.__autoExpandObserver = null;
    window.__autoExpandActive = false;
    notify('Auto-expand stopped', { color: '#f44336' });
    return;
  }

  const patterns = [
    /^read more$/i, /^show more$/i, /^see more$/i, /^view more$/i,
    /^expand$/i, /^load more$/i, /^show full/i, /^see full/i,
    /^continue reading$/i, /^read full/i, /^\.\.\.\s*more$/i,
    /^more$/i, /^show all$/i, /^view all$/i
  ];

  const selectors = [
    'button', 'a[href="#"]', 'a[role="button"]', '[role="button"]', '[onclick]',
    '[class*="expand"]', '[class*="show-more"]', '[class*="read-more"]',
    '[aria-expanded="false"]', 'details:not([open]) summary'
  ];

  const expanded = new WeakSet();

  const isVisible = (el) => {
    if (!el?.offsetParent) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0';
  };

  const isExpandButton = (el) => {
    if (expanded.has(el)) return false;
    const text = el.textContent || el.innerText || el.value || el.title || el.getAttribute('aria-label');
    if (matchesPattern(text, patterns)) return true;
    if (el.getAttribute('aria-expanded') === 'false') return true;
    const cls = el.className || '';
    return typeof cls === 'string' && /expand|show-more|read-more|collapsed/i.test(cls);
  };

  const expandAll = () => {
    let count = 0;
    document.querySelectorAll(selectors.join(', ')).forEach((el) => {
      if (isVisible(el) && isExpandButton(el)) {
        try {
          expanded.add(el);
          el.click();
          count++;
        } catch {}
      }
    });
    document.querySelectorAll('details:not([open])').forEach((el) => {
      if (!expanded.has(el) && isVisible(el)) {
        expanded.add(el);
        el.open = true;
        count++;
      }
    });
    return count;
  };

  const expandMultiple = (cb) => {
    let total = 0, prev = 0, iter = 0;
    const interval = setInterval(() => {
      const count = expandAll();
      total += count;
      iter++;
      if ((count === 0 && prev === 0) || iter >= 5) {
        clearInterval(interval);
        cb?.(total);
      }
      prev = count;
    }, 500);
  };

  const showIndicator = () => {
    document.getElementById('auto-expand-indicator')?.remove();
    const div = document.createElement('div');
    div.id = 'auto-expand-indicator';
    div.textContent = '🔄 Auto-expand active';
    div.title = 'Click context menu "Expand all content" again to stop';
    div.style.cssText = `position:fixed;bottom:20px;right:20px;background:rgba(33,150,243,0.95);color:white;padding:10px 16px;border-radius:20px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:12px;font-weight:500;box-shadow:0 2px 8px rgba(0,0,0,0.2);z-index:2147483647;cursor:help;user-select:none`;
    document.body.appendChild(div);
    const check = setInterval(() => {
      if (!window.__autoExpandActive) {
        div.remove();
        clearInterval(check);
      }
    }, 1000);
  };

  window.__autoExpandActive = true;
  expandMultiple((count) => notify(`Continuous auto-expand enabled (${count} expanded)`, { color: '#2196F3' }));

  const observer = new MutationObserver(() => {
    clearTimeout(window.__autoExpandTimeout);
    window.__autoExpandTimeout = setTimeout(() => {
      const count = expandAll();
      if (count > 0) console.debug(`Auto-expanded ${count} new element(s)`);
    }, 300);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['aria-expanded', 'class']
  });

  window.__autoExpandObserver = observer;
  showIndicator();
})();
