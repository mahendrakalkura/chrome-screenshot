// Shared helpers for the extension's content scripts.
//
// This file is loaded as a classic script in three places:
//   - injected before summarize.js / ai-handler.js / auto-expand.js
//   - listed first in the manifest content_scripts for email-cleanup.js
//   - required directly by the Node unit tests
//
// In a browser it attaches the API to `window.ExtLib`. In Node it exports the
// API via `module.exports` so the pure functions can be unit-tested without a
// DOM. Everything here that touches `document` takes it as an argument, so the
// DOM helpers stay testable against a fixture.

((global) => {
  'use strict';

  // Content above this many characters is truncated before it is sent to an AI
  // service, so a huge page does not silently overflow the target's token
  // limit or freeze the paste.
  const MAX_CONTENT_CHARS = 100000;

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  // Truncate at a word boundary and leave a note so the model knows content was
  // cut, rather than assuming the page really ended there.
  const truncate = (text, maxChars = MAX_CONTENT_CHARS) => {
    if (typeof text !== 'string' || text.length <= maxChars) return text;
    let cut = text.slice(0, maxChars);
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > maxChars * 0.5) cut = cut.slice(0, lastSpace);
    return `${cut}\n\n[Truncated: ${text.length} characters total]`;
  };

  const isYouTube = (hostname) =>
    hostname === 'youtube.com' || hostname.endsWith('.youtube.com');

  const TRANSCRIPT_PROMPT =
    'Summarize the following transcript in a clear and concise way. Capture all the key insights, arguments, and takeaways while removing filler. Break the summary into well-structured bullet points or sections by theme/topic. The goal is to help me understand everything important without reading the whole transcript. Think like a researcher or note-taker summarizing for someone smart but busy. Keep the summary accurate, complete, and easy to scan.';

  const PAGE_PROMPT =
    'Summarize the following page content in a clear and concise way. Capture all the key insights, main points, and important information. Break the summary into well-structured bullet points or sections by theme/topic. The goal is to help me understand the essential content without reading the entire page. Think like a researcher or note-taker summarizing for someone smart but busy. Keep the summary accurate, complete, and easy to scan.';

  // Build the full prompt string that gets pasted into the AI service.
  const buildPrompt = ({ title, url, content, isTranscript }) => {
    const instruction = isTranscript ? TRANSCRIPT_PROMPT : PAGE_PROMPT;
    return `${instruction}\n\nTitle: ${title}\nURL: ${url}\n\n---\n\n${content}`;
  };

  // True when the element's visible text matches one of the expand patterns.
  const matchesPattern = (text, patterns) =>
    Boolean(text) && patterns.some((pattern) => pattern.test(text.trim()));

  const PAGE_TEXT_SELECTORS = [
    'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'article', 'section', 'main', 'li', 'td', 'th'
  ];

  // Collect all visible paragraph/heading/list text, de-duplicated.
  const getAllPageText = (doc) => {
    const elements = doc.querySelectorAll(PAGE_TEXT_SELECTORS.join(', '));
    const texts = Array.from(elements)
      .map((el) => el.textContent?.trim())
      .filter((text) => text && text.length > 0);
    return [...new Set(texts)].join('\n\n');
  };

  const TRANSCRIPT_TEXT_SELECTORS = [
    'transcript-segment-view-model .ytAttributedStringHost',
    'transcript-segment-view-model .yt-core-attributed-string',
    'ytd-transcript-segment-renderer yt-formatted-string.segment-text'
  ];

  const TRANSCRIPT_PANEL_SELECTORS = [
    'ytd-engagement-panel-section-list-renderer[target-id="PAmodern_transcript_view"][visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]',
    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"][visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"]'
  ];

  const getTranscriptText = (doc) => {
    const texts = Array.from(doc.querySelectorAll(TRANSCRIPT_TEXT_SELECTORS.join(', ')))
      .map((el) => el.textContent?.trim())
      .filter((text) => text && text.length > 0);
    return texts.length > 0 ? texts.join(' ') : null;
  };

  const isTranscriptPanelOpen = (doc) =>
    TRANSCRIPT_PANEL_SELECTORS.some((selector) => doc.querySelector(selector));

  const findTranscriptButton = (doc) =>
    doc.querySelector('button[aria-label="Show transcript"]') ||
    Array.from(doc.querySelectorAll('button, [role="button"]')).find((el) => {
      const text = el.textContent?.trim().toLowerCase() || '';
      const aria = el.getAttribute('aria-label')?.toLowerCase() || '';
      return text.includes('transcript') || aria.includes('transcript');
    });

  // Return the YouTube transcript text, opening the panel and polling for up to
  // 5s if it is not already visible. Returns null when no transcript exists.
  const getYouTubeTranscript = async (doc) => {
    const existing = getTranscriptText(doc);
    if (existing) return existing;

    const transcriptButton = findTranscriptButton(doc);
    if (transcriptButton && !isTranscriptPanelOpen(doc)) {
      transcriptButton.click();
    }

    const maxWait = 5000;
    const start = Date.now();
    while (Date.now() - start < maxWait) {
      const text = getTranscriptText(doc);
      if (text) return text;

      if (!isTranscriptPanelOpen(doc)) {
        const retryButton = findTranscriptButton(doc);
        if (retryButton) retryButton.click();
      }

      await sleep(200);
    }

    return getTranscriptText(doc);
  };

  // Single toast used by every feature. Replaces any previous toast so repeated
  // events never stack.
  const notify = (message, { color = '#4CAF50' } = {}) => {
    if (!global.document) return;
    const doc = global.document;

    doc.getElementById('mx-notification')?.remove();

    if (!doc.getElementById('mx-notification-style')) {
      const style = doc.createElement('style');
      style.id = 'mx-notification-style';
      style.textContent =
        '@keyframes mxSlideIn{from{transform:translateX(400px);opacity:0}to{transform:translateX(0);opacity:1}}' +
        '@keyframes mxSlideOut{from{transform:translateX(0);opacity:1}to{transform:translateX(400px);opacity:0}}';
      doc.head.appendChild(style);
    }

    const div = doc.createElement('div');
    div.id = 'mx-notification';
    div.textContent = message;
    div.style.cssText =
      `position:fixed;top:20px;right:20px;background:${color};color:white;padding:16px 24px;border-radius:8px;` +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:14px;font-weight:500;' +
      'box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:2147483647;animation:mxSlideIn 0.3s ease-out';
    doc.body.appendChild(div);

    setTimeout(() => {
      div.style.animation = 'mxSlideOut 0.3s ease-out';
      setTimeout(() => div.remove(), 300);
    }, 3000);
  };

  const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
  const OPENROUTER_MODEL = 'openai/gpt-oss-120b';

  const DRAFT_SYSTEM_PROMPT =
    'Rewrite the following email draft as polished Markdown. Output ONLY the rewritten email — do NOT wrap your response in a code fence (```). Do not add explanations, greetings, or sign-offs.';

  // Error with a human-readable cause, so the caller can log or surface why a
  // draft rewrite failed instead of showing the same generic message.
  class DraftRewriteError extends Error {
    constructor(message, cause) {
      super(message);
      this.name = 'DraftRewriteError';
      this.cause = cause;
    }
  }

  // Ask OpenRouter to rewrite a draft. `fetchImpl` is injectable so this can be
  // unit-tested without a network. Resolves to the rewritten markdown, or
  // rejects with a DraftRewriteError describing the failure.
  const requestDraftRewrite = async (fetchImpl, apiKey, draft) => {
    let response;
    try {
      response = await fetchImpl(OPENROUTER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: [
            { role: 'system', content: DRAFT_SYSTEM_PROMPT },
            { role: 'user', content: draft },
          ],
        }),
      });
    } catch (error) {
      throw new DraftRewriteError(`Network error: ${error.message}`, error);
    }

    if (!response.ok) {
      throw new DraftRewriteError(`OpenRouter returned HTTP ${response.status}`, { status: response.status });
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      throw new DraftRewriteError('OpenRouter returned invalid JSON', error);
    }

    const markdown = data?.choices?.[0]?.message?.content;
    if (!markdown) {
      throw new DraftRewriteError('OpenRouter response had no content');
    }

    return markdown;
  };

  const api = {
    buildPrompt,
    getAllPageText,
    getYouTubeTranscript,
    isYouTube,
    matchesPattern,
    notify,
    requestDraftRewrite,
    sleep,
    truncate,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.ExtLib = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
