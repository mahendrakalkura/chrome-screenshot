(() => {
  'use strict';

  // Guard against double-injection into the same document (the background
  // script re-injects on every load completion).
  if (window.__aiHandlerActive) {
    console.log('[ai-handler] already running, skipping');
    return;
  }
  window.__aiHandlerActive = true;

  const { sleep, notify } = window.ExtLib;

  // Poll fn() every `interval` ms until it returns a truthy value or `timeout` ms elapse.
  const pollFor = async (fn, timeout, interval = 250) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const result = fn();
      if (result) return result;
      await sleep(interval);
    }
    return fn() || null;
  };

  // Different selectors for different AI services
  const inputSelectors = {
    claude: [
      'div[contenteditable="true"]',
      '[role="textbox"]',
      '.ProseMirror',
      'textarea'
    ],
    deepseek: [
      'textarea[placeholder*="消息"]',
      'textarea',
      'div[contenteditable="true"]',
      '[role="textbox"]'
    ],
    gemini: [
      'div[contenteditable="true"]',
      '[role="textbox"]',
      '.ql-editor',
      'textarea'
    ],
    kimi: [
      'div[contenteditable="true"]',
      '[role="textbox"]',
      'textarea'
    ],
    openai: [
      '#prompt-textarea',
      'textarea[placeholder*="Message"]',
      'textarea',
      'div[contenteditable="true"]'
    ],
    qwen: [
      'textarea[placeholder*="向"]',
      'textarea',
      'div[contenteditable="true"]',
      '[role="textbox"]'
    ],
    'z.ai': [
      '#chat-input',
      'textarea',
      'div[contenteditable="true"]',
      '[role="textbox"]',
      'input[type="text"]'
    ]
  };

  const buttonSelectors = {
    claude: [
      'button[aria-label*="Send"]',
      'button[type="submit"]'
    ],
    deepseek: [
      'div[role="button"][class*="ds-button--primary"]:not([class*="--disabled"])',
      'div[role="button"]:has(svg):not([class*="--disabled"])'
    ],
    gemini: [
      'button[aria-label*="Send"]',
      'button[type="submit"]'
    ],
    kimi: [
      '.send-button-container',
      'div[class*="send-button-container"]'
    ],
    openai: [
      'button[data-testid="send-button"]',
      'button[aria-label*="Send"]'
    ],
    qwen: [
      'button svg',
      'button:has(svg)',
      'button[class*="send"]'
    ],
    'z.ai': [
      '#send-message-button',
      'button[type="submit"][aria-label="Submit"]',
      'button[aria-label="Submit"]',
      'button[type="submit"]',
      'button:has(svg)'
    ]
  };

  const findInput = (selectors) => {
    for (const selector of selectors) {
      const inputField = document.querySelector(selector);
      if (inputField) return inputField;
    }
    return null;
  };

  const getInputText = (inputField) => {
    if (typeof inputField.value === 'string' && inputField.value) {
      return inputField.value;
    }
    return inputField.textContent || '';
  };

  const setInputValue = (inputField, content) => {
    // Focus on the input field
    inputField.focus();
    inputField.click();

    if (inputField.contentEditable === 'true') {
      // For contenteditable divs.
      // Clear any leftover text from a previous attempt before inserting.
      document.execCommand('selectAll', false, null);

      // Try execCommand first as it works best with rich text editors (Lexical, Draft.js, etc.)
      const pasted = document.execCommand('insertText', false, content);

      if (!pasted) {
        // Fallback: dispatch a paste event (works for Vue-based editors like Kimi)
        const dt = new DataTransfer();
        dt.setData('text/plain', content);
        const pasteEvent = new ClipboardEvent('paste', {
          clipboardData: dt,
          bubbles: true,
          cancelable: true
        });
        const handled = !inputField.dispatchEvent(pasteEvent);

        if (!handled) {
          inputField.textContent = content;
        }
      }

      // Trigger input event to make sure the UI updates
      inputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      inputField.dispatchEvent(new Event('change', { bubbles: true }));
      inputField.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: content }));
    } else {
      // For textarea/input elements
      // Use native setter to bypass React/Vue value tracking
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      nativeInputValueSetter.call(inputField, content);

      // Trigger input event to make sure the UI updates. Enter is dispatched
      // later, in the submit phase, so pasting can never submit prematurely.
      inputField.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      inputField.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  const dispatchEnter = (inputField) => {
    inputField.focus();
    inputField.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code: 'Enter', key: 'Enter' }));
    inputField.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, code: 'Enter', key: 'Enter' }));
  };

  // Find a visible, enabled submit button. The last-resort tier matches any
  // icon button on the page, so it only runs when explicitly allowed -
  // otherwise polling for the send button to enable would return a wrong
  // button on the first check.
  const findSubmitButton = (inputField, btnSelectors, allowLastResort) => {
    // First try service-specific selectors
    for (const selector of btnSelectors) {
      try {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          // Check if it's a button or has a button parent, or if it's Kimi's div button
          const button = el.tagName === 'BUTTON' ? el : (el.closest('button') || el);
          if (button) {
            const rect = button.getBoundingClientRect();
            const isVisible = rect.width > 0 && rect.height > 0 && button.offsetParent !== null;
            // For Kimi, check that it doesn't have the 'disabled' class
            const isKimiDisabled = button.classList && button.classList.contains('disabled');
            const isEnabled = !button.disabled && !button.hasAttribute('disabled') && !isKimiDisabled && button.getAttribute('aria-disabled') !== 'true';

            if (isVisible && isEnabled) {
              return button;
            }
          }
        }
      } catch (e) {
        console.log('[ai-handler] selector failed:', selector, e);
      }
    }

    // If still not found, look for buttons near the input field
    const inputParent = inputField.closest('form') || inputField.parentElement?.parentElement;
    if (inputParent) {
      const nearbyButtons = inputParent.querySelectorAll('button');
      for (const button of nearbyButtons) {
        const rect = button.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        const isEnabled = !button.disabled && button.getAttribute('aria-disabled') !== 'true';
        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';
        const buttonText = button.textContent?.toLowerCase() || '';

        if (isVisible && isEnabled && (
          ariaLabel.includes('send') ||
          buttonText.includes('send') ||
          ariaLabel.includes('submit') ||
          button.type === 'submit' ||
          button.querySelector('svg')  // Has icon
        )) {
          return button;
        }
      }
    }

    if (!allowLastResort) return null;

    // Last resort: find any visible enabled button with an SVG icon
    const allButtons = document.querySelectorAll('button');
    for (const button of allButtons) {
      const rect = button.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0 && !button.disabled) {
        const hasSvg = button.querySelector('svg') !== null;
        const ariaLabel = button.getAttribute('aria-label')?.toLowerCase() || '';

        if (hasSvg || ariaLabel.includes('send')) {
          return button;
        }
      }
    }

    return null;
  };

  const trySend = async (selectors, btnSelectors, content, marker, aiService) => {
    // Wait for the chat input to render (slow on cold SPA loads).
    let inputField = await pollFor(() => findInput(selectors), 15000);
    if (!inputField) {
      console.error('[ai-handler] input field not found');
      return false;
    }

    // Paste, then confirm the text actually stuck. On a cold load the SPA can
    // replace the input node during hydration, wiping text set on the old
    // node, so re-query a fresh node and re-paste until the live input holds it.
    let stuck = false;
    for (let i = 0; i < 6 && !stuck; i++) {
      inputField = findInput(selectors) || inputField;
      setInputValue(inputField, content);
      await sleep(500);
      inputField = findInput(selectors) || inputField;
      stuck = getInputText(inputField).includes(marker);
    }
    if (!stuck) {
      console.error('[ai-handler] pasted text did not stick');
      return false;
    }
    console.log('[ai-handler] text pasted and confirmed in input');

    // Wait for a real send button to enable before allowing the loosest
    // selectors, which can match unrelated icon buttons.
    let submitButton = await pollFor(() => findSubmitButton(inputField, btnSelectors, false), 1000, 50);
    if (!submitButton) {
      console.log('[ai-handler] no strict button match, allowing last resort');
      submitButton = findSubmitButton(inputField, btnSelectors, true);
    }

    // The message left the input once the marker text is gone from it.
    const hasSent = () => {
      const field = findInput(selectors);
      if (!field) return null;
      return getInputText(field).includes(marker) ? null : true;
    };

    // Click, confirm the message was actually sent, escalate if it was not:
    // strict button -> loose button -> Enter key.
    for (let i = 0; i < 3; i++) {
      if (submitButton) {
        if (aiService === 'z.ai') {
          await sleep(300);
        }
        console.log('[ai-handler] clicking submit button:', submitButton);
        submitButton.click();
      } else {
        console.log('[ai-handler] no submit button, pressing Enter');
        dispatchEnter(findInput(selectors) || inputField);
      }

      const sent = await pollFor(hasSent, 3000, 300);
      if (sent) return true;

      console.log('[ai-handler] input still holds the text, escalating');
      submitButton = i < 1 ? findSubmitButton(inputField, btnSelectors, true) : null;
    }

    console.error('[ai-handler] message did not send');
    return false;
  };

  const MAX_ATTEMPTS = 3;

  const run = async () => {
    let aiService = 'claude';
    try {
      // Read the content and target service written by summarize.js.
      const stored = await new Promise(resolve => {
        chrome.storage.local.get(['summarizeContent', 'summarizeService'], (result) => resolve(result));
      });

      const content = stored.summarizeContent;
      if (!content) {
        console.log('[ai-handler] no content in storage, nothing to do');
        window.__aiHandlerActive = false;
        return;
      }

      aiService = stored.summarizeService || 'claude';

      const marker = content.slice(0, 30);
      const selectors = inputSelectors[aiService] || inputSelectors.claude;
      const btnSelectors = buttonSelectors[aiService] || buttonSelectors.claude;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        console.log(`[ai-handler] attempt ${attempt}/${MAX_ATTEMPTS} for ${aiService}`);
        const sent = await trySend(selectors, btnSelectors, content, marker, aiService);
        if (sent) {
          console.log('[ai-handler] submitted successfully');
          // Clear the stored content only after a verified send
          chrome.storage.local.remove(['summarizeContent', 'summarizeService']);
          window.__aiHandlerActive = false;
          return;
        }
        await sleep(1000);
      }

      console.error('[ai-handler] giving up after', MAX_ATTEMPTS, 'attempts');
      notify(`Could not send to ${aiService}. Check the tab and try again.`, { color: '#f44336' });
      window.__aiHandlerActive = false;
    } catch (error) {
      console.error('[ai-handler] error:', error);
      notify(`Could not send to ${aiService}. Check the tab and try again.`, { color: '#f44336' });
      window.__aiHandlerActive = false;
    }
  };

  // Run when the page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => run());
  } else {
    run();
  }
})();
