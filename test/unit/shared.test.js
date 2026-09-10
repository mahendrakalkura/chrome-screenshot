const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPrompt,
  getAllPageText,
  isYouTube,
  matchesPattern,
  truncate,
} = require('../../shared.js');

const EXPAND_PATTERNS = [/^read more$/i, /^show more$/i, /^view more$/i];

test('isYouTube matches youtube.com and subdomains only', () => {
  assert.equal(isYouTube('youtube.com'), true);
  assert.equal(isYouTube('www.youtube.com'), true);
  assert.equal(isYouTube('music.youtube.com'), true);
  assert.equal(isYouTube('youtu.be'), false);
  assert.equal(isYouTube('notyoutube.com'), false);
  assert.equal(isYouTube('example.com'), false);
});

test('truncate returns short text unchanged', () => {
  const text = 'short text';
  assert.equal(truncate(text), text);
  assert.equal(truncate(text, 100), text);
});

test('truncate cuts long text and leaves a note', () => {
  const text = 'word '.repeat(1000); // 5000 chars
  const out = truncate(text, 100);
  const [body] = out.split('\n\n[Truncated:');
  assert.ok(body.length <= 100, `body is ${body.length} chars`);
  assert.ok(out.includes('[Truncated: 5000 characters total]'));
  assert.ok(out.startsWith('word '));
});

test('truncate does not cut in the middle of a word', () => {
  const text = 'aaaa bbbb cccc dddd eeee ffff gggg hhhh';
  const out = truncate(text, 12);
  assert.ok(!/ \w$/.test(out.split('[Truncated')[0].trimEnd()));
});

test('truncate passes non-strings through unchanged', () => {
  assert.equal(truncate(undefined), undefined);
  assert.equal(truncate(null), null);
  assert.equal(truncate(123), 123);
});

test('buildPrompt produces the page template with title, url, and content', () => {
  const prompt = buildPrompt({
    title: 'My Page',
    url: 'https://example.com/a',
    content: 'hello world',
    isTranscript: false,
  });
  assert.ok(prompt.includes('Summarize the following page content'));
  assert.ok(prompt.includes('Title: My Page'));
  assert.ok(prompt.includes('URL: https://example.com/a'));
  assert.ok(prompt.includes('hello world'));
  assert.ok(!prompt.includes('transcript'));
  assert.ok(prompt.indexOf('Title: My Page') < prompt.indexOf('hello world'));
});

test('buildPrompt uses the transcript template when isTranscript is true', () => {
  const prompt = buildPrompt({
    title: 'Video',
    url: 'https://www.youtube.com/watch?v=x',
    content: 'line one line two',
    isTranscript: true,
  });
  assert.ok(prompt.includes('Summarize the following transcript'));
  assert.ok(!prompt.includes('page content'));
});

test('matchesPattern trims and matches case-insensitively', () => {
  assert.equal(matchesPattern('  Read More  ', EXPAND_PATTERNS), true);
  assert.equal(matchesPattern('Show more', EXPAND_PATTERNS), true);
  assert.equal(matchesPattern('view more', EXPAND_PATTERNS), true);
  assert.equal(matchesPattern('not a match', EXPAND_PATTERNS), false);
  assert.equal(matchesPattern('', EXPAND_PATTERNS), false);
  assert.equal(matchesPattern(null, EXPAND_PATTERNS), false);
  assert.equal(matchesPattern(undefined, EXPAND_PATTERNS), false);
});

test('getAllPageText collects, trims, and de-duplicates text', () => {
  const fakeDoc = {
    querySelectorAll: () => [
      { textContent: '  first  ' },
      { textContent: 'first' },
      { textContent: '' },
      { textContent: null },
      { textContent: 'second' },
    ],
  };
  assert.equal(getAllPageText(fakeDoc), 'first\n\nsecond');
});
