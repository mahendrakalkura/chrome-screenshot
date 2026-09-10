const { test, expect } = require('@playwright/test');
const { injectScripts } = require('./helpers');

test('selection mode highlights on hover and cancels on Escape', async ({ page }) => {
  await page.setContent('<div id="target" style="width:200px;height:100px">hello</div>');
  await page.evaluate(() => {
    window.chrome = { runtime: { sendMessage: () => {} } };
  });
  await injectScripts(page, ['shared.js', 'content.js']);

  await page.hover('#target');
  await expect(page.locator('#target')).toHaveClass(/div-screenshot-highlight/);

  await page.keyboard.press('Escape');
  await expect(page.locator('#target')).not.toHaveClass(/div-screenshot-highlight/);
  expect(await page.evaluate(() => window.divScreenshotActive)).toBe(false);
});

test('clicking an element sends a capture request with page coordinates', async ({ page }) => {
  await page.setContent('<div id="target" style="margin-top:60px;width:150px;height:80px">hello</div>');
  await page.evaluate(() => {
    window.__sent = null;
    window.chrome = {
      runtime: {
        sendMessage: (msg, cb) => {
          window.__sent = msg;
          cb?.({ success: true });
        },
      },
    };
  });
  await injectScripts(page, ['shared.js', 'content.js']);

  await page.click('#target');
  await page.waitForFunction(() => window.__sent !== null);
  const sent = await page.evaluate(() => window.__sent);

  expect(sent.action).toBe('captureElement');
  expect(sent.clip.width).toBeGreaterThan(0);
  expect(sent.clip.height).toBeGreaterThan(0);
  expect(sent.clip.x).toBeGreaterThanOrEqual(0);
  expect(sent.clip.y).toBeGreaterThanOrEqual(0);
  expect(sent.viewport.width).toBe(sent.clip.width);
  expect(sent.viewport.height).toBe(sent.clip.height);
});
