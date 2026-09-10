(() => {
  'use strict';

  if (window.divScreenshotActive) return;
  window.divScreenshotActive = true;

  const { notify } = window.ExtLib;

  let current = null;

  const removeHint = () => {
    document.getElementById('div-screenshot-hint')?.remove();
  };

  const onMouseOver = (e) => {
    removeHint();
    current?.classList.remove('div-screenshot-highlight');
    current = e.target;
    current.classList.add('div-screenshot-highlight');
    e.stopPropagation();
  };

  // Firefox fallback: captureVisibleTab only gets the viewport, so crop the
  // returned image to the element and hand it to the background to open.
  const cropAndOpen = (dataUrl, viewport) => {
    const img = new Image();
    img.onload = () => {
      const scale = img.naturalWidth / window.innerWidth;

      const left = Math.max(0, viewport.left);
      const top = Math.max(0, viewport.top);
      const right = Math.min(window.innerWidth, viewport.left + viewport.width);
      const bottom = Math.min(window.innerHeight, viewport.top + viewport.height);
      const width = right - left;
      const height = bottom - top;

      if (width <= 0 || height <= 0) {
        notify('The selected element is not visible', { color: '#f44336' });
        cleanup();
        return;
      }

      const sx = Math.round(left * scale);
      const sy = Math.round(top * scale);
      const sw = Math.round(width * scale);
      const sh = Math.round(height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = sw;
      canvas.height = sh;
      canvas.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

      canvas.toBlob((blob) => {
        if (!blob) {
          notify('Failed to encode the screenshot', { color: '#f44336' });
          cleanup();
          return;
        }
        const reader = new FileReader();
        reader.onload = () => chrome.runtime.sendMessage({ action: 'openImage', url: reader.result });
        reader.readAsDataURL(blob);
        cleanup();
      }, 'image/png');
    };
    img.onerror = () => {
      notify('Failed to load the captured image', { color: '#f44336' });
      cleanup();
    };
    img.src = dataUrl;
  };

  const onClick = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const el = e.target;

    // Remove all extension UI before capturing so none of it can appear in
    // the screenshot.
    removeHint();
    el.classList.remove('div-screenshot-highlight');
    document.querySelectorAll('.div-screenshot-highlight').forEach((node) => {
      node.classList.remove('div-screenshot-highlight');
    });

    // Scroll the element into view so lazily-rendered content exists, then
    // wait two frames for the scroll and the UI removal to paint.
    el.scrollIntoView({ behavior: 'instant', block: 'nearest', inline: 'nearest' });
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));

    const rect = el.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;

    // The debugger clips in page coordinates (relative to the document), while
    // the Firefox fallback crops in viewport coordinates.
    const clip = {
      x: Math.round(rect.left + window.scrollX),
      y: Math.round(rect.top + window.scrollY),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      scale,
    };
    const viewport = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };

    if (clip.width <= 0 || clip.height <= 0) {
      notify('The selected element is not visible', { color: '#f44336' });
      cleanup();
      return;
    }

    // Guard against a dropped response: restore the page after a timeout
    // instead of leaving selection mode stuck.
    let responded = false;
    const timeout = setTimeout(() => {
      if (responded) return;
      responded = true;
      notify('Screenshot timed out', { color: '#f44336' });
      cleanup();
    }, 10000);

    chrome.runtime.sendMessage({ action: 'captureElement', clip, viewport }, (res) => {
      if (responded) return;
      responded = true;
      clearTimeout(timeout);

      if (chrome.runtime.lastError || !res?.success) {
        const reason = res?.error || chrome.runtime.lastError?.message || 'Unknown error';
        notify(`Screenshot failed: ${reason}`, { color: '#f44336' });
        cleanup();
        return;
      }

      // Chrome path: the background captured the full element and opened the
      // tab already. Firefox path: it returned a viewport image to crop.
      if (res.dataUrl) {
        cropAndOpen(res.dataUrl, viewport);
      } else {
        cleanup();
      }
    });
  };

  const cleanup = () => {
    removeHint();
    document.removeEventListener('mouseover', onMouseOver, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    current?.classList.remove('div-screenshot-highlight');
    document.querySelectorAll('.div-screenshot-highlight').forEach((node) => {
      node.classList.remove('div-screenshot-highlight');
    });
    window.divScreenshotActive = false;
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') cleanup();
  };

  document.addEventListener('mouseover', onMouseOver, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeyDown, true);

  // A small, unobtrusive hint that disappears on the first hover. It is always
  // removed before capture, so it can never appear in the screenshot.
  const hint = document.createElement('div');
  hint.id = 'div-screenshot-hint';
  hint.textContent = 'Click an element to capture it (ESC to cancel)';
  hint.style.cssText = `position:fixed;bottom:16px;left:50%;transform:translateX(-50%);background:rgba(32,33,36,0.9);color:#e8eaed;padding:8px 16px;border-radius:16px;font-family:Arial,sans-serif;font-size:13px;z-index:2147483647;pointer-events:none;box-shadow:0 2px 6px rgba(0,0,0,0.3)`;
  document.body.appendChild(hint);
})();
