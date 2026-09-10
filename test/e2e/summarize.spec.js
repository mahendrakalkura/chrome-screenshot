const { test, expect } = require('@playwright/test');
const { injectScripts } = require('./helpers');

// summarize.js only needs storage.set and runtime.sendMessage.
const installChromeMock = () => {
  window.__captured = {};
  window.chrome = {
    storage: {
      local: {
        set: (obj, cb) => {
          Object.assign(window.__captured, obj);
          cb?.();
        },
      },
    },
    runtime: {
      sendMessage: (msg) => {
        window.__captured.openAIMessage = msg;
      },
    },
  };
};

test('summarize extracts page text and stores a prompt for the AI service', async ({ page }) => {
  await page.setContent(`
    <html>
      <head><title>Article Title</title></head>
      <body>
        <h1>Article Title</h1>
        <p>First paragraph of the article.</p>
        <p>Second paragraph with more detail.</p>
      </body>
    </html>
  `);
  await page.evaluate(installChromeMock);
  await injectScripts(page, ['shared.js', 'summarize.js']);

  await page.waitForFunction(() => window.__captured && window.__captured.summarizeContent);
  const captured = await page.evaluate(() => window.__captured);

  expect(captured.summarizeContent).toContain('First paragraph of the article.');
  expect(captured.summarizeContent).toContain('Second paragraph with more detail.');
  expect(captured.summarizeContent).toContain('Title: Article Title');
  expect(captured.summarizeContent).toContain('Summarize the following page content');
  expect(captured.summarizeService).toBe('claude');
  expect(captured.openAIMessage.action).toBe('openAI');
  expect(captured.openAIMessage.service).toBe('claude');
});

test('summarize extracts a YouTube transcript and marks it as a transcript', async ({ page }) => {
  const transcriptHtml = `
    <ytd-transcript-segment-renderer>
      <yt-formatted-string class="segment-text">First spoken line</yt-formatted-string>
    </ytd-transcript-segment-renderer>
    <ytd-transcript-segment-renderer>
      <yt-formatted-string class="segment-text">Second spoken line</yt-formatted-string>
    </ytd-transcript-segment-renderer>
  `;
  await page.route('https://www.youtube.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: `<html><head><title>Video</title></head><body>${transcriptHtml}</body></html>`,
    })
  );
  await page.goto('https://www.youtube.com/watch?v=test');
  await page.evaluate(installChromeMock);
  await injectScripts(page, ['shared.js', 'summarize.js']);

  await page.waitForFunction(() => window.__captured && window.__captured.summarizeContent);
  const captured = await page.evaluate(() => window.__captured);

  expect(captured.summarizeContent).toContain('First spoken line Second spoken line');
  expect(captured.summarizeContent).toContain('Summarize the following transcript');
  expect(captured.summarizeContent).not.toContain('page content');
});
