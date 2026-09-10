const { test } = require('node:test');
const assert = require('node:assert/strict');

const { requestDraftRewrite } = require('../../shared.js');

const KEY = 'sk-or-test';
const DRAFT = 'Meeting at 3pm, bring the report.';

// A fetch stub that resolves to the given response object.
const stubFetch = (response) => async () => response;

const rejects = (messagePart) => (error) =>
  error.name === 'DraftRewriteError' && error.message.includes(messagePart);

test('requestDraftRewrite resolves the markdown on success', async () => {
  const fetch = stubFetch({
    ok: true,
    status: 200,
    json: async () => ({ choices: [{ message: { content: '## Rewritten draft' } }] }),
  });

  const markdown = await requestDraftRewrite(fetch, KEY, DRAFT);
  assert.equal(markdown, '## Rewritten draft');
});

test('requestDraftRewrite rejects on a non-200 response', async () => {
  const fetch = stubFetch({ ok: false, status: 401 });

  await assert.rejects(() => requestDraftRewrite(fetch, KEY, DRAFT), rejects('HTTP 401'));
});

test('requestDraftRewrite rejects on a rate-limit response', async () => {
  const fetch = stubFetch({ ok: false, status: 429 });

  await assert.rejects(() => requestDraftRewrite(fetch, KEY, DRAFT), rejects('HTTP 429'));
});

test('requestDraftRewrite rejects on invalid JSON', async () => {
  const fetch = stubFetch({
    ok: true,
    status: 200,
    json: async () => {
      throw new Error('unexpected token');
    },
  });

  await assert.rejects(() => requestDraftRewrite(fetch, KEY, DRAFT), rejects('invalid JSON'));
});

test('requestDraftRewrite rejects when the response has no content', async () => {
  const fetch = stubFetch({ ok: true, status: 200, json: async () => ({}) });

  await assert.rejects(() => requestDraftRewrite(fetch, KEY, DRAFT), rejects('no content'));
});

test('requestDraftRewrite rejects on a network error', async () => {
  const fetch = async () => {
    throw new Error('ECONNREFUSED');
  };

  await assert.rejects(() => requestDraftRewrite(fetch, KEY, DRAFT), rejects('Network error'));
});
