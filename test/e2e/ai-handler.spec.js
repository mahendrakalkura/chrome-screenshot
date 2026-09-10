const { test, expect } = require('@playwright/test');
const { injectScripts } = require('./helpers');

const CONTENT =
  'This is the full page content that will be pasted into the AI service. ' +
  'It is long enough to exceed the thirty character marker so the send ' +
  'verification has something real to check against.';

test('ai-handler pastes content into the input and clicks send', async ({ page }) => {
  // A Claude-like page: a contenteditable input and a send button that clears
  // the input when clicked, mimicking what the real service does on submit.
  await page.setContent(`
    <div id="prompt" contenteditable="true"></div>
    <button id="send" aria-label="Send message"
      onclick="document.getElementById('prompt').textContent = ''; window.__sendClicked = true;">
      Send
    </button>
  `);

  await page.evaluate((content) => {
    window.__mockStorage = { summarizeContent: content, summarizeService: 'claude' };
    window.chrome = {
      storage: {
        local: {
          get: (_keys, cb) => cb(window.__mockStorage),
          remove: (keys, cb) => {
            for (const key of keys) delete window.__mockStorage[key];
            cb?.();
          },
        },
      },
    };
  }, CONTENT);

  await injectScripts(page, ['shared.js', 'ai-handler.js']);

  // The handler pastes, confirms the text stuck, clicks send; the button's
  // onclick clears the input, which the handler reads as "message sent".
  await page.waitForFunction(() => window.__sendClicked === true, null, { timeout: 30000 });

  const state = await page.evaluate(() => ({
    sendClicked: window.__sendClicked,
    contentCleared: !window.__mockStorage.summarizeContent,
  }));

  expect(state.sendClicked).toBe(true);
  expect(state.contentCleared).toBe(true);
});
