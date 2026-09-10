const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect, chromium } = require('@playwright/test');
const { ROOT, waitForBackgroundWorker } = require('./helpers');

test('debugger captures a page region and opens it in a new tab', async () => {
  const userDataDir = path.join(os.tmpdir(), `mx-capture-${Date.now()}`);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${ROOT}`,
      `--load-extension=${ROOT}`,
    ],
  });

  try {
    const page = context.pages()[0];
    await page.setContent('<h1 style="margin:20px">Capture me</h1><p>Some body text below the heading.</p>');

    const worker = await waitForBackgroundWorker(context);

    const newPagePromise = context.waitForEvent('page');

    const result = await worker.evaluate(async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      const tabId = tabs[0].id;

      await chrome.debugger.attach({ tabId }, '1.3');
      const shot = await chrome.debugger.sendCommand({ tabId }, 'Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: 120, height: 120, scale: 1 },
      });
      await chrome.debugger.detach({ tabId });

      const url = `data:image/png;base64,${shot.data}`;
      await chrome.tabs.create({ url });
      return { dataLength: shot.data.length };
    });

    expect(result.dataLength).toBeGreaterThan(100);

    // The new tab should have opened the captured PNG as a data URL.
    const newPage = await newPagePromise;
    expect(newPage.url()).toContain('data:image/png');
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
