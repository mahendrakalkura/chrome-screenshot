# My Extensions

A cross-browser (Firefox + Chromium) extension bundling four productivity features:

- Element screenshot
- Auto-expand collapsed content
- AI page/transcript summarization
- Gmail draft cleanup

Version 1.5, Manifest V3.

## Features

### Element Screenshot

- Click the toolbar icon, or right-click → "Take screenshot", to enter selection mode.
- Hover over any element to highlight it; click to capture.
- The full element is captured, including parts outside the viewport, and opens in a new tab as a PNG; press Escape to cancel.
- On Chromium this uses the `debugger` permission (attached only for the instant of capture, showing a brief "debugging" infobar). Firefox has no debugger API, so capture there is limited to the visible viewport.

### Auto-Expand Content

- Right-click → "Expand all content" to expand "Read more", "Show more", and similar controls.
- Runs in continuous monitoring mode: new content is expanded as it loads (infinite scroll).
- Toggle it off by choosing the same menu item again; a badge shows while it is active.

### Summarize (AI Services)

- Right-click → "Summarize with …" and pick a service: Claude, DeepSeek, Gemini, Kimi, OpenAI, Qwen, or z.ai.
- The extension extracts the page text (or the YouTube transcript, on YouTube), opens the chosen AI service in a new tab, and pastes the content with a summarization prompt.
- No API key is required: it drives the service's own web UI.

### Email Cleanup (Gmail)

- A "Clean" button appears in the Gmail compose toolbar.
- Clicking it rewrites the draft as polished Markdown via OpenRouter (GPT-OSS-120B).
- A progress overlay shows while processing; the original draft is restored on failure.

**First-time setup:** the extension needs an OpenRouter API key, stored once in extension storage. Open the background script console and run:

```
chrome.storage.local.set({ openrouterKey: "sk-or-v1-YOUR-KEY" })
```

The key persists across browser restarts.

## Install

### Firefox

The manifest includes Firefox settings. To build a signed `.xpi`:

```
web-ext sign --api-key="$API_KEY" --api-secret="$API_SECRET" --channel unlisted
```

Or load it temporarily via `about:debugging` → "Load Temporary Add-on".

### Chromium (Chrome / Edge / Brave)

1. Open `chrome://extensions/`.
2. Enable "Developer mode".
3. "Load unpacked" and select this folder.

## Development

### File Structure

- `manifest.json` - extension config and permissions
- `background.js` - service worker / event page: context menus, message routing, OpenRouter call
- `shared.js` - helpers shared by the content scripts (extraction, prompt building, notifications)
- `content.js` - screenshot selection and capture
- `content.css` - screenshot highlight styling
- `auto-expand.js` - expand-content content script
- `summarize.js` - page/transcript extraction for summarization
- `ai-handler.js` - pastes the extracted content into the AI service's input
- `email-cleanup.js` - Gmail compose toolbar button and draft rewriting
- `atlassian.css` - Atlassian page tweaks
- `imdb.css` - IMDb page tweaks
- `sign.sh` - web-ext signing helper
- `package.json` - test scripts
- `playwright.config.js` - Playwright configuration
- `test/` - unit and end-to-end tests

### Tests

Unit tests use Node's built-in test runner (no dependencies); end-to-end tests use Playwright.

```
npm install
npx playwright install chromium   # once, downloads the test browser
npm run test:unit
npm run test:e2e
npm test
```

The E2E suite loads the real extension in Chromium and verifies the extraction and paste logic against fixture pages. It does not automate the native context menu or real AI-service logins; those remain manual.

## Privacy

- Screenshot and auto-expand run locally and send nothing anywhere.
- Summarize sends the extracted page content to the AI service you choose; that is the feature.
- Email cleanup sends the draft text to OpenRouter for rewriting.

## License

Free to use and modify for personal use.
