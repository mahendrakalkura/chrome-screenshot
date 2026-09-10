const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, expect, chromium } = require('@playwright/test');
const { ROOT, waitForBackgroundWorker } = require('./helpers');

test('extension loads and registers its background service worker', async () => {
  const userDataDir = path.join(os.tmpdir(), `mx-ext-${Date.now()}`);

  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: true,
    // New-headless (full Chromium) is required to load extensions; the default
    // headless shell build does not support --load-extension.
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${ROOT}`,
      `--load-extension=${ROOT}`,
    ],
  });

  try {
    const worker = await waitForBackgroundWorker(context);

    expect(worker.url()).toContain('chrome-extension://');

    const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.name).toBe('My Extensions');
    expect(manifest.manifest_version).toBe(3);
  } finally {
    await context.close();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
});
