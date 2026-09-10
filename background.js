// Load shared helpers. The Chrome service worker lists only background.js in
// the manifest, so import shared.js directly; on Firefox it is already loaded
// via the "background.scripts" array.
if (typeof importScripts === 'function' && typeof ExtLib === 'undefined') {
  importScripts('shared.js');
}

const { requestDraftRewrite } = ExtLib;

// Read from chrome.storage.local on startup. If missing, logs a one-time
// message with the setter command.  chrome.storage.local persists across
// browser restarts — you set the key once and it stays forever.
let OPENROUTER_KEY = "";

// AI service URLs, keyed by the service id used in the menu item ids.
const SERVICE_URLS = {
  claude: "https://claude.ai/new",
  deepseek: "https://chat.deepseek.com/",
  gemini: "https://gemini.google.com/u/3/app",
  kimi: "https://www.kimi.com/?chat_enter_method=new_chat",
  openai: "https://chat.openai.com/",
  qwen: "https://chat.qwen.ai/",
  "z.ai": "https://chat.z.ai/",
};

// Hosts ai-handler.js may be auto-injected into. The summarize flow opens one
// of these in a new tab; ai-handler is injected once it loads and there is
// still pending content in storage.
const AI_HOSTS = new Set([
  "claude.ai",
  "chat.deepseek.com",
  "gemini.google.com",
  "www.kimi.com",
  "kimi.com",
  "chat.openai.com",
  "chatgpt.com",
  "chat.qwen.ai",
  "chat.z.ai",
]);

chrome.storage.local.get("openrouterKey", (result) => {
  if (result.openrouterKey) {
    OPENROUTER_KEY = result.openrouterKey;
  } else {
    console.warn(
      "OpenRouter key not set. Run this in the extension service worker console:\n\n" +
      '  chrome.storage.local.set({openrouterKey: "sk-or-v1-..."})\n'
    );
  }
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.openrouterKey) OPENROUTER_KEY = changes.openrouterKey.newValue;
});

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    contexts: ["all"],
    id: "screenshot-element",
    title: "Take screenshot",
  });
  chrome.contextMenus.create({
    contexts: ["page"],
    id: "auto-expand",
    title: "Expand all content",
  });
  chrome.contextMenus.create({
    contexts: ["page"],
    id: "summarize-claude",
    title: "Summarize with Claude",
  });
  chrome.contextMenus.create({
    contexts: ["page"],
    id: "summarize-deepseek",
    title: "Summarize with DeepSeek",
  });
  chrome.contextMenus.create({
    contexts: ["page"],
    id: "summarize-gemini",
    title: "Summarize with Gemini",
  });
  chrome.contextMenus.create({
    contexts: ["page"],
    id: "summarize-kimi",
    title: "Summarize with Kimi",
  });
  chrome.contextMenus.create({
    contexts: ["page"],
    id: "summarize-openai",
    title: "Summarize with OpenAI",
  });
  chrome.contextMenus.create({
    contexts: ["page"],
    id: "summarize-qwen",
    title: "Summarize with Qwen",
  });
  chrome.contextMenus.create({
    contexts: ["page"],
    id: "summarize-z.ai",
    title: "Summarize with z.ai",
  });
});

const activateScreenshot = (tabId) => {
  chrome.scripting.executeScript({ files: ["shared.js", "content.js"], target: { tabId } });
  chrome.scripting.insertCSS({ files: ["content.css"], target: { tabId } });
};

chrome.action.onClicked.addListener((tab) => activateScreenshot(tab.id));

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "screenshot-element") {
    activateScreenshot(tab.id);
  } else if (info.menuItemId === "auto-expand") {
    chrome.scripting.executeScript({ files: ["shared.js", "auto-expand.js"], target: { tabId: tab.id } });
  } else if (info.menuItemId.startsWith("summarize-")) {
    const service = info.menuItemId.replace("summarize-", "");
    chrome.scripting
      .executeScript({
        args: [service],
        func: (aiService) => {
          window.__summarizeAIService = aiService;
        },
        target: { tabId: tab.id },
      })
      .then(() => {
        chrome.scripting.executeScript({ files: ["shared.js", "summarize.js"], target: { tabId: tab.id } });
      });
  }
});

// Inject ai-handler.js into a newly-opened AI service tab once it has loaded
// and there is still pending summarize content. Registered at top level so it
// survives service-worker/event-page restarts (required on Firefox, where the
// background page is unloaded between events).
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.url) return;

  let hostname;
  try {
    hostname = new URL(tab.url).hostname;
  } catch {
    return;
  }
  if (!AI_HOSTS.has(hostname)) return;

  chrome.storage.local.get("summarizeContent", (result) => {
    if (!result.summarizeContent) return;
    chrome.scripting.executeScript({ files: ["shared.js", "ai-handler.js"], target: { tabId } });
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "captureElement") {
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId == null) {
      sendResponse({ success: false, error: "No tab" });
      return true;
    }

    // Full-element capture via the debugger, which can shoot content outside
    // the viewport. Firefox has no debugger API, so fall back to a
    // viewport-only capture the content script crops itself.
    if (!chrome.debugger) {
      chrome.tabs.captureVisibleTab(null, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
          return;
        }
        sendResponse({ success: true, dataUrl });
      });
      return true;
    }

    chrome.debugger.attach({ tabId }, "1.3", () => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
        return;
      }
      chrome.debugger.sendCommand(
        { tabId },
        "Page.captureScreenshot",
        {
          format: "png",
          captureBeyondViewport: true,
          clip: request.clip,
        },
        (result) => {
          const error = chrome.runtime.lastError;
          chrome.debugger.detach({ tabId });
          if (error || !result?.data) {
            sendResponse({ success: false, error: error?.message || "Capture failed" });
            return;
          }
          // Open the screenshot in a new tab. Data URLs opened via the tabs
          // API are not subject to popup blocking.
          chrome.tabs.create({ url: `data:image/png;base64,${result.data}` });
          sendResponse({ success: true });
        }
      );
    });
    return true;
  } else if (request.action === "openImage") {
    chrome.tabs.create({ url: request.url });
    sendResponse({ success: true });
  } else if (request.action === "openAI") {
    // Open the AI service in a new tab. The top-level onUpdated listener above
    // injects ai-handler.js once the tab loads and content is still pending.
    const url = SERVICE_URLS[request.service] || SERVICE_URLS.claude;
    chrome.tabs.create({ url });
  } else if (request.action === "cleanDraft") {
    if (!OPENROUTER_KEY) {
      console.warn("OpenRouter key not set. Run: chrome.storage.local.set({openrouterKey: \"sk-or-v1-...\"})");
      return;
    }
    const tabId = sender.tab ? sender.tab.id : null;
    if (tabId) chrome.tabs.sendMessage(tabId, { action: "showProgress" });

    requestDraftRewrite(fetch, OPENROUTER_KEY, request.draft)
      .then((markdown) => {
        if (tabId) chrome.tabs.sendMessage(tabId, { action: "draftCleaned", markdown });
      })
      .catch((error) => {
        console.error("[email-cleanup] rewrite failed:", error.message);
        if (tabId) chrome.tabs.sendMessage(tabId, { action: "draftError" });
      })
      .finally(() => {
        if (tabId) chrome.tabs.sendMessage(tabId, { action: "hideProgress" });
      });
    return true;
  }
});
