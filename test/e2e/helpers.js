const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../..');

const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

// Inject shared.js followed by a feature script into the page's main world,
// preserving order. Used by the fixture tests to run the real content-script
// logic against a realistic DOM without the extension's isolated world.
const injectScripts = async (page, files) => {
  for (const file of files) {
    await page.addScriptTag({ content: read(file) });
  }
};

// Wait for the extension's MV3 background service worker to register after the
// persistent context launches.
const waitForBackgroundWorker = async (context) => {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const worker = context.serviceWorkers().find((w) => w.url().includes('background.js'));
    if (worker) return worker;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('background service worker did not register');
};

module.exports = { injectScripts, ROOT, waitForBackgroundWorker };
