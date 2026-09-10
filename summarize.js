(() => {
  'use strict';

  const { buildPrompt, getAllPageText, getYouTubeTranscript, isYouTube, notify, truncate } = window.ExtLib;

  const extractContent = async () => {
    try {
      // Set by the background script's context-menu handler just before this
      // script is injected.
      const aiService = window.__summarizeAIService || 'claude';

      const pageTitle = document.title;
      const pageUrl = window.location.href;

      let content;
      let isTranscript = false;

      if (isYouTube(window.location.hostname)) {
        content = await getYouTubeTranscript(document);
        if (content) {
          isTranscript = true;
        } else {
          content = getAllPageText(document);
        }
      } else {
        content = getAllPageText(document);
      }

      if (!content || content.length < 10) {
        notify('Nothing to summarize on this page', { color: '#f44336' });
        return;
      }

      content = truncate(content);

      const fullContent = buildPrompt({
        title: pageTitle,
        url: pageUrl,
        content,
        isTranscript,
      });

      chrome.storage.local.set(
        { summarizeContent: fullContent, summarizeService: aiService },
        () => chrome.runtime.sendMessage({ action: 'openAI', service: aiService })
      );
    } catch (error) {
      console.error('[summarize] error extracting content:', error);
      notify('Failed to summarize this page', { color: '#f44336' });
    }
  };

  extractContent();
})();
