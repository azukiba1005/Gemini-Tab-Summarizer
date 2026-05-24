/**
 * Main Controller for the Gemini Tab Summarizer Side Panel
 */

// Global State
let allTabs = [];
let selectedTabIds = new Set();
let summarizedTabsData = []; // Cached tab content for chat mode
let chatHistory = []; // Chat history for follow-ups
let currentHistoryItemId = null; // Active summary item ID from history

// Configuration Defaults
let appConfig = {
  apiKey: '',
  model: 'gemini-2.5-flash',
  language: 'auto',
  temperature: 0.2,
  customPrompt: ''
};

// DOM Elements
const mainView = document.getElementById('main-view');
const resultsView = document.getElementById('results-view');
const settingsOverlay = document.getElementById('settings-overlay');
const historyOverlay = document.getElementById('history-overlay');

const historyBtn = document.getElementById('history-btn');
const historyCloseBtn = document.getElementById('history-close-btn');
const clearHistoryBtn = document.getElementById('clear-history-btn');
const historyItemsContainer = document.getElementById('history-items-container');

const tabSearch = document.getElementById('tab-search');
const selectAllBtn = document.getElementById('select-all');
const selectNoneBtn = document.getElementById('select-none');
const selectActiveBtn = document.getElementById('select-active');
const selectDomainBtn = document.getElementById('select-domain');
const refreshTabsBtn = document.getElementById('refresh-tabs-btn');

const tabListElement = document.getElementById('tab-list');
const checkedCountEl = document.getElementById('checked-count');
const totalCountEl = document.getElementById('total-count');

const summarizeStyle = document.getElementById('summarize-style');
const summarizeBtn = document.getElementById('summarize-btn');
const notebooklmBtn = document.getElementById('notebooklm-btn');

const resultsBackBtn = document.getElementById('results-back-btn');
const copySummaryBtn = document.getElementById('copy-summary-btn');
const downloadSummaryBtn = document.getElementById('download-summary-btn');
const summaryContentEl = document.getElementById('summary-content');

const summarizeProgress = document.getElementById('summarize-progress');
const progressStatus = document.getElementById('progress-status');
const progressBarFill = document.getElementById('progress-bar-fill');

const settingsBtn = document.getElementById('settings-btn');
const settingsCloseBtn = document.getElementById('settings-close-btn');
const settingsSaveBtn = document.getElementById('settings-save-btn');
const settingsApiKeyInput = document.getElementById('settings-api-key');
const settingsModelSelect = document.getElementById('settings-model');
const settingsLanguageSelect = document.getElementById('settings-language');
const settingsTemperatureInput = document.getElementById('settings-temperature');
const tempValDisplay = document.getElementById('temp-val-display');
const settingsCustomPromptInput = document.getElementById('settings-custom-prompt');
const toggleKeyVisibilityBtn = document.getElementById('toggle-key-visibility');

const chatSection = document.getElementById('chat-section');
const chatMessagesEl = document.getElementById('chat-messages');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');

// Initialize Extension
document.addEventListener('DOMContentLoaded', async () => {
  // Configure marked.js to render safe markdown
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true
    });
  }

  // Load configuration
  await loadSettings();

  // Populate open tabs list
  await refreshTabList();

  // Attach Event Listeners
  attachEventListeners();

  // Check if API Key is set
  if (!appConfig.apiKey) {
    showSettings(true);
    alert("Please enter your Gemini API Key in Settings to start summarizing tabs.");
  }
});

/**
 * Load settings from storage
 */
async function loadSettings() {
  appConfig = await GeminiAPI.getConfig();
  
  // Populate UI inputs with saved settings
  settingsApiKeyInput.value = appConfig.apiKey || '';
  settingsModelSelect.value = appConfig.model || GeminiAPI.DEFAULT_MODEL;
  settingsLanguageSelect.value = appConfig.language || 'auto';
  settingsTemperatureInput.value = appConfig.temperature !== undefined ? appConfig.temperature : 0.2;
  tempValDisplay.textContent = settingsTemperatureInput.value;
  settingsCustomPromptInput.value = appConfig.customPrompt || '';
}

/**
 * Save settings to storage
 */
async function saveSettings() {
  appConfig.apiKey = settingsApiKeyInput.value.trim();
  appConfig.model = settingsModelSelect.value;
  appConfig.language = settingsLanguageSelect.value;
  appConfig.temperature = parseFloat(settingsTemperatureInput.value);
  appConfig.customPrompt = settingsCustomPromptInput.value.trim();

  await GeminiAPI.saveConfig(appConfig);
  showSettings(false);
}

/**
 * Open tabs listing and display in the checklist
 */
async function refreshTabList() {
  try {
    // Query tabs in the current window
    const tabs = await chrome.tabs.query({ currentWindow: true });
    
    // Filter out internal chrome:// pages, extensions pages, devtools etc.
    allTabs = tabs.filter(tab => {
      const url = tab.url || "";
      return url.startsWith('http://') || url.startsWith('https://');
    });

    renderTabList();
  } catch (error) {
    console.error("Error fetching tabs:", error);
    tabListElement.innerHTML = `<div class="list-placeholder error">Failed to load tabs: ${error.message}</div>`;
  }
}

/**
 * Renders the tabs list with search filter applied
 */
function renderTabList() {
  const query = tabSearch.value.toLowerCase().trim();
  
  // Filter tabs
  const filteredTabs = allTabs.filter(tab => {
    const title = (tab.title || "").toLowerCase();
    const url = (tab.url || "").toLowerCase();
    return title.includes(query) || url.includes(query);
  });

  totalCountEl.textContent = allTabs.length;

  if (filteredTabs.length === 0) {
    tabListElement.innerHTML = `<div class="list-placeholder">No matching tabs found</div>`;
    return;
  }

  tabListElement.innerHTML = '';
  
  filteredTabs.forEach(tab => {
    const isChecked = selectedTabIds.has(tab.id);
    const isActive = tab.active;
    
    const tabItem = document.createElement('div');
    tabItem.className = `tab-item ${isChecked ? 'checked' : ''} ${isActive ? 'active-tab' : ''}`;
    tabItem.dataset.tabId = tab.id;

    // Checkbox wrapper
    const checkboxWrapper = document.createElement('div');
    checkboxWrapper.className = 'checkbox-wrapper';
    
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'tab-checkbox';
    checkbox.checked = isChecked;
    checkboxWrapper.appendChild(checkbox);

    // Favicon
    const faviconContainer = document.createElement('div');
    faviconContainer.className = 'tab-favicon';
    
    if (tab.favIconUrl && !tab.favIconUrl.startsWith('chrome:')) {
      const faviconImg = document.createElement('img');
      faviconImg.src = tab.favIconUrl;
      faviconImg.onerror = () => {
        faviconContainer.innerHTML = `<div class="tab-favicon-fallback">${getFallbackChar(tab.title)}</div>`;
      };
      faviconContainer.appendChild(faviconImg);
    } else {
      faviconContainer.innerHTML = `<div class="tab-favicon-fallback">${getFallbackChar(tab.title)}</div>`;
    }

    // Tab details info
    const tabInfo = document.createElement('div');
    tabInfo.className = 'tab-info';
    
    const tabTitle = document.createElement('div');
    tabTitle.className = 'tab-title';
    tabTitle.textContent = tab.title || "Untitled";
    tabTitle.title = tab.title || "";
    
    const tabUrl = document.createElement('div');
    tabUrl.className = 'tab-url';
    tabUrl.textContent = cleanUrlDisplay(tab.url);
    
    tabInfo.appendChild(tabTitle);
    tabInfo.appendChild(tabUrl);

    // Assembly
    tabItem.appendChild(checkboxWrapper);
    tabItem.appendChild(faviconContainer);
    tabItem.appendChild(tabInfo);

    // Click handler to toggle selection
    tabItem.addEventListener('click', (e) => {
      // Avoid double toggling when clicking the checkbox itself
      if (e.target !== checkbox) {
        checkbox.checked = !checkbox.checked;
      }
      toggleTabSelection(tab.id, checkbox.checked, tabItem);
    });

    tabListElement.appendChild(tabItem);
  });

  updateCheckedCount();
}

/**
 * Handle individual tab checkbox toggle
 */
function toggleTabSelection(tabId, isChecked, tabItemElement) {
  if (isChecked) {
    selectedTabIds.add(tabId);
    if (tabItemElement) tabItemElement.classList.add('checked');
  } else {
    selectedTabIds.delete(tabId);
    if (tabItemElement) tabItemElement.classList.remove('checked');
  }
  updateCheckedCount();
}

/**
 * Update the UI count for selected tabs and enable/disable buttons
 */
function updateCheckedCount() {
  const count = selectedTabIds.size;
  checkedCountEl.textContent = count;
  summarizeBtn.disabled = count === 0;
  notebooklmBtn.disabled = count === 0;
}

/**
 * Helper to get the first letter of tab title for fallback favicon
 */
function getFallbackChar(title) {
  if (!title) return "?";
  return title.trim().charAt(0).toUpperCase();
}

/**
 * Helper to display clean URLs
 */
function cleanUrlDisplay(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname + (parsed.pathname !== '/' ? parsed.pathname : '');
  } catch (e) {
    return url;
  }
}

/**
 * Toggle visibility of Settings Panel Overlay
 */
function showSettings(show) {
  if (show) {
    settingsOverlay.classList.add('active');
  } else {
    settingsOverlay.classList.remove('active');
  }
}

/**
 * Core text extraction logic. This function is serialized and executed in the target tab context.
 */
function extractPageContent() {
  try {
    if (!document || !document.body) {
      return {
        title: document ? document.title : "Untitled",
        url: window.location.href,
        content: "No body content found.",
        metaDescription: ""
      };
    }

    const title = document.title || "Untitled";
    const url = window.location.href;
    
    let metaDescription = "";
    const metaDescEl = document.querySelector('meta[name="description"]') || 
                       document.querySelector('meta[property="og:description"]');
    if (metaDescEl) {
      metaDescription = metaDescEl.getAttribute('content') || "";
    }

    // Clone body to manipulate safely
    const bodyClone = document.body.cloneNode(true);

    // List of typical noise elements
    const clutterSelectors = [
      'script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 'picture',
      'nav', 'footer', 'header', 'aside',
      '.footer', '.header', '.nav', '.navigation', '.menu', '.sidebar',
      '#footer', '#header', '#nav', '#navigation', '#menu', '#sidebar',
      '.cookie-consent', '.cookie-banner', '.cookie-notice', '#cookie-consent',
      '.ads', '.advertisement', '.promo', '.social-share', '.share-buttons',
      '.modal', '.popup', '.overlay', '.login-modal'
    ];

    clutterSelectors.forEach(selector => {
      try {
        const elements = bodyClone.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      } catch (e) {}
    });

    let contentText = bodyClone.innerText || bodyClone.textContent || "";
    contentText = contentText
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n/g, '\n\n')
      .trim();

    // Context limit check
    const MAX_CHARS = 35000;
    let isTruncated = false;
    if (contentText.length > MAX_CHARS) {
      contentText = contentText.substring(0, MAX_CHARS);
      isTruncated = true;
    }

    return {
      title: title,
      url: url,
      content: contentText,
      metaDescription: metaDescription,
      isTruncated: isTruncated
    };
  } catch (error) {
    return {
      title: document ? document.title : "Error",
      url: window.location.href,
      content: `Failed to extract content: ${error.message}`,
      metaDescription: "",
      error: true
    };
  }
}

/**
 * Triggers extraction of text from selected tabs and coordinates with Gemini API
 */
async function startSummarization() {
  if (selectedTabIds.size === 0) return;

  // Clear previous summaries and chat
  summaryContentEl.innerHTML = '';
  chatMessagesEl.innerHTML = '';
  chatHistory = [];
  summarizedTabsData = [];

  // Switch View
  mainView.classList.remove('active');
  resultsView.classList.add('active');

  // Show Progress
  summarizeProgress.classList.remove('hidden');
  chatSection.classList.add('hidden');
  progressBarFill.style.width = '5%';
  progressStatus.textContent = 'Extracting tab contents...';

  const tabIdsArray = Array.from(selectedTabIds);
  const totalTabs = tabIdsArray.length;
  let successfulExtractions = 0;

  // Step 1: Extract Text Content from Selected Tabs
  for (let i = 0; i < totalTabs; i++) {
    const tabId = tabIdsArray[i];
    const tabMeta = allTabs.find(t => t.id === tabId);
    
    progressStatus.textContent = `Reading tab: ${tabMeta ? tabMeta.title : 'Selected Tab'} (${i + 1}/${totalTabs})`;
    
    try {
      // Execute scripting to run extraction
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: extractPageContent
      });

      if (results && results[0] && results[0].result) {
        const extractedData = results[0].result;
        
        // Handle script execution errors returned as payload
        if (extractedData.error) {
          console.warn(`Extraction error in tab ${tabId}:`, extractedData.content);
          summarizedTabsData.push({
            title: tabMeta.title || "Untitled Tab",
            url: tabMeta.url,
            content: `[Failed to extract body content: ${extractedData.content}]`
          });
        } else {
          summarizedTabsData.push(extractedData);
          successfulExtractions++;
        }
      } else {
        throw new Error("No data returned from scripting.");
      }
    } catch (err) {
      console.error(`Failed to execute script on tab ${tabId}:`, err);
      // Create a fallback content descriptor
      summarizedTabsData.push({
        title: tabMeta ? tabMeta.title : "Restricted Tab",
        url: tabMeta ? tabMeta.url : "",
        content: `[Unable to access tab page contents. Restricted URL or script block. Error: ${err.message}]`
      });
    }

    // Update progress bar
    const progressPercent = Math.min(5 + Math.round(((i + 1) / totalTabs) * 45), 50);
    progressBarFill.style.width = `${progressPercent}%`;
  }

  // Step 2: Formulate prompt & call Gemini
  progressStatus.textContent = 'Connecting to Gemini API...';
  progressBarFill.style.width = '60%';

  const style = summarizeStyle.value;
  const prompt = GeminiAPI.buildSummaryPrompt(summarizedTabsData, appConfig, style);

  progressBarFill.style.width = '75%';
  progressStatus.textContent = 'Generating summary...';

  let bufferText = '';

  try {
    await GeminiAPI.generateContentStream(
      prompt,
      // On chunk callback
      (chunk) => {
        // First chunk loaded
        if (summarizeProgress && !summarizeProgress.classList.contains('hidden')) {
          summarizeProgress.classList.add('hidden');
          chatSection.classList.remove('hidden');
        }
        
        bufferText += chunk;
        if (typeof marked !== 'undefined') {
          summaryContentEl.innerHTML = marked.parse(bufferText);
        } else {
          summaryContentEl.innerText = bufferText;
        }
        // Auto scroll to make stream readable
        resultsView.querySelector('.results-body').scrollTop = resultsView.querySelector('.results-body').scrollHeight;
      },
      // On error callback
      (err) => {
        throw err;
      }
    );

    // Successfully completed summary
    // Store in history
    chatHistory.push({ role: 'model', content: bufferText });
    await saveToHistory(bufferText, summarizedTabsData, chatHistory);

  } catch (apiError) {
    console.error("Gemini API Summarize failed:", apiError);
    summarizeProgress.classList.add('hidden');
    
    let errorDetailHtml = `
      <div style="color: var(--danger); border: 1px solid var(--danger); background: rgba(239, 68, 68, 0.05); padding: 16px; border-radius: var(--radius-md); margin-top: 10px;">
        <h3 style="margin-top:0; color: var(--danger); font-weight:600;">Summarization Failed</h3>
        <p style="margin-bottom:12px; font-size:13px;">${apiError.message}</p>
        <button id="retry-summarize-btn" class="btn btn-primary" style="padding: 8px 16px; font-size:12px; width:auto; border-radius:var(--radius-sm);">
          Retry Summarization
        </button>
      </div>
    `;
    summaryContentEl.innerHTML = errorDetailHtml;
    
    // Bind retry button
    const retryBtn = document.getElementById('retry-summarize-btn');
    if (retryBtn) {
      retryBtn.addEventListener('click', startSummarization);
    }
  }
}

/**
 * Submits follow up chat questions to Gemini using context from selected tabs
 */
async function submitChatQuestion(e) {
  if (e) e.preventDefault();
  
  const query = chatInput.value.trim();
  if (!query) return;

  // Append user query to chat UI
  appendChatMessage('user', query);
  chatInput.value = '';

  // Store in chat history
  chatHistory.push({ role: 'user', content: query });

  // Add a temporary loading bubble for assistant
  const loadingBubbleId = appendChatMessage('assistant', '<div class="loader-spinner" style="width:16px; height:16px;"></div>');
  const assistantBubble = document.getElementById(loadingBubbleId);

  // Scroll chat messages to bottom
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;

  const prompt = GeminiAPI.buildChatPrompt(summarizedTabsData, chatHistory.slice(0, -1), query, appConfig);
  let assistantBufferText = '';

  try {
    await GeminiAPI.generateContentStream(
      prompt,
      // Stream chunk callback
      (chunk) => {
        assistantBufferText += chunk;
        if (assistantBubble) {
          if (typeof marked !== 'undefined') {
            assistantBubble.innerHTML = marked.parse(assistantBufferText);
          } else {
            assistantBubble.innerText = assistantBufferText;
          }
        }
        chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
      },
      // Error callback
      (err) => {
        throw err;
      }
    );

    // Save final response in history
    chatHistory.push({ role: 'model', content: assistantBufferText });
    await updateHistoryChat();

  } catch (chatError) {
    console.error("Chat question failed:", chatError);
    if (assistantBubble) {
      assistantBubble.innerHTML = `<span style="color:var(--danger)">Error: ${chatError.message}</span>`;
    }
  }
}

/**
 * Appends a message to the Chat View UI
 */
function appendChatMessage(role, content) {
  const bubbleId = 'chat-bubble-' + Date.now();
  const bubble = document.createElement('div');
  bubble.id = bubbleId;
  bubble.className = `chat-bubble ${role}`;
  bubble.innerHTML = content; // Can contain loader html or marked html later
  
  chatMessagesEl.appendChild(bubble);
  chatMessagesEl.scrollTop = chatMessagesEl.scrollHeight;
  return bubbleId;
}

/**
 * Attach UI Event Listeners
 */
function attachEventListeners() {
  // Tab search bar
  tabSearch.addEventListener('input', () => {
    renderTabList();
  });

  // Bulk selectors
  selectAllBtn.addEventListener('click', () => {
    // Select all tabs currently visible based on search filter
    const visibleTabElements = tabListElement.querySelectorAll('.tab-item');
    visibleTabElements.forEach(item => {
      const tabId = parseInt(item.dataset.tabId);
      const checkbox = item.querySelector('.tab-checkbox');
      checkbox.checked = true;
      toggleTabSelection(tabId, true, item);
    });
  });

  selectNoneBtn.addEventListener('click', () => {
    selectedTabIds.clear();
    const checkboxes = tabListElement.querySelectorAll('.tab-checkbox');
    checkboxes.forEach(cb => cb.checked = false);
    const items = tabListElement.querySelectorAll('.tab-item');
    items.forEach(item => item.classList.remove('checked'));
    updateCheckedCount();
  });

  selectActiveBtn.addEventListener('click', async () => {
    selectedTabIds.clear();
    try {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTabs.length > 0) {
        const activeTab = activeTabs[0];
        selectedTabIds.add(activeTab.id);
      }
    } catch (e) {
      console.error(e);
    }
    renderTabList();
  });

  selectDomainBtn.addEventListener('click', async () => {
    try {
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTabs.length > 0) {
        const activeTab = activeTabs[0];
        if (activeTab.url) {
          const targetDomain = new URL(activeTab.url).hostname;
          allTabs.forEach(tab => {
            try {
              const tabDomain = new URL(tab.url).hostname;
              if (tabDomain === targetDomain) {
                selectedTabIds.add(tab.id);
              }
            } catch (e) {}
          });
        }
      }
    } catch (e) {
      console.error(e);
    }
    renderTabList();
  });

  // Refresh tab list icon button
  refreshTabsBtn.addEventListener('click', async () => {
    await refreshTabList();
  });

  // Settings Panel triggers
  settingsBtn.addEventListener('click', () => showSettings(true));
  settingsCloseBtn.addEventListener('click', () => showSettings(false));
  settingsSaveBtn.addEventListener('click', saveSettings);
  
  // Close overlay on clicking backdrop
  settingsOverlay.addEventListener('click', (e) => {
    if (e.target === settingsOverlay) {
      showSettings(false);
    }
  });

  // Eye toggle for API key input
  toggleKeyVisibilityBtn.addEventListener('click', () => {
    const isPassword = settingsApiKeyInput.type === 'password';
    settingsApiKeyInput.type = isPassword ? 'text' : 'password';
    
    // Toggle icon visual
    const eyeIcon = toggleKeyVisibilityBtn.querySelector('.eye-icon');
    if (isPassword) {
      eyeIcon.setAttribute('stroke', 'var(--accent-primary)');
    } else {
      eyeIcon.setAttribute('stroke', 'currentColor');
    }
  });

  // Temperature slider display
  settingsTemperatureInput.addEventListener('input', () => {
    tempValDisplay.textContent = settingsTemperatureInput.value;
  });

  // Summarize primary trigger button
  summarizeBtn.addEventListener('click', startSummarization);

  // NotebookLM trigger button
  notebooklmBtn.addEventListener('click', sendToNotebookLM);

  // Return to list view button
  resultsBackBtn.addEventListener('click', () => {
    resultsView.classList.remove('active');
    mainView.classList.add('active');
    refreshTabList(); // refresh list to ensure accuracy
  });

  // Chat form submit
  chatForm.addEventListener('submit', submitChatQuestion);

  // Export buttons
  copySummaryBtn.addEventListener('click', () => {
    const lastMsg = chatHistory.find(msg => msg.role === 'model');
    if (lastMsg && lastMsg.content) {
      navigator.clipboard.writeText(lastMsg.content)
        .then(() => {
          const originalText = copySummaryBtn.innerHTML;
          copySummaryBtn.innerHTML = `
            <svg class="w-4 h-4" fill="none" stroke="var(--success)" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span style="color:var(--success)">Copied!</span>
          `;
          setTimeout(() => {
            copySummaryBtn.innerHTML = originalText;
          }, 2000);
        })
        .catch(err => {
          console.error("Failed to copy text:", err);
        });
    }
  });

  downloadSummaryBtn.addEventListener('click', () => {
    const lastMsg = chatHistory.find(msg => msg.role === 'model');
    if (lastMsg && lastMsg.content) {
      const blob = new Blob([lastMsg.content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      
      // Filename formatting
      const dateStr = new Date().toISOString().slice(0, 10);
      a.download = `gemini-tab-summary-${dateStr}.md`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  });

  // History panel triggers
  historyBtn.addEventListener('click', () => {
    renderHistory();
    showHistory(true);
  });
  historyCloseBtn.addEventListener('click', () => showHistory(false));
  clearHistoryBtn.addEventListener('click', clearAllHistory);
  historyOverlay.addEventListener('click', (e) => {
    if (e.target === historyOverlay) {
      showHistory(false);
    }
  });
}

/**
 * Copies selected tab URLs to clipboard and opens Google NotebookLM
 */
async function sendToNotebookLM() {
  if (selectedTabIds.size === 0) return;

  const selectedUrls = [];
  selectedTabIds.forEach(tabId => {
    const tab = allTabs.find(t => t.id === tabId);
    if (tab && tab.url) {
      selectedUrls.push(tab.url);
    }
  });

  if (selectedUrls.length === 0) return;

  // Join URLs with newlines (NotebookLM URL import takes space or newline separated list)
  const urlsString = selectedUrls.join('\n');

  try {
    // Write URLs to clipboard
    await navigator.clipboard.writeText(urlsString);

    // Provide visual feedback on the button
    const originalContent = notebooklmBtn.innerHTML;
    notebooklmBtn.innerHTML = `
      <span class="btn-text" style="color: var(--success)">URLs Copied! Opening...</span>
      <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2">
        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    `;
    notebooklmBtn.disabled = true;

    // Open NotebookLM in a new tab
    chrome.tabs.create({ url: 'https://notebooklm.google.com/' });

    // Reset button after a short delay
    setTimeout(() => {
      notebooklmBtn.innerHTML = originalContent;
      notebooklmBtn.disabled = selectedTabIds.size === 0;
    }, 2500);

  } catch (error) {
    console.error("Failed to copy URLs to clipboard:", error);
    alert(`Failed to copy URLs to clipboard: ${error.message}`);
  }
}

/**
 * Toggle visibility of History Panel Overlay
 */
function showHistory(show) {
  if (show) {
    historyOverlay.classList.add('active');
  } else {
    historyOverlay.classList.remove('active');
  }
}

/**
 * Saves a new summary item to history
 */
async function saveToHistory(summaryText, tabsData, chat) {
  currentHistoryItemId = Date.now();
  
  // Format tab titles list
  const tabTitles = tabsData.map(t => t.title).join(', ');
  
  const newItem = {
    id: currentHistoryItemId,
    timestamp: currentHistoryItemId,
    title: tabTitles,
    summaryText: summaryText,
    tabsData: tabsData,
    chatHistory: chat
  };

  return new Promise((resolve) => {
    chrome.storage.local.get({ summaryHistory: [] }, (data) => {
      let history = data.summaryHistory;
      
      // Prepend to list
      history.unshift(newItem);
      
      // Limit to 30 items
      if (history.length > 30) {
        history = history.slice(0, 30);
      }
      
      chrome.storage.local.set({ summaryHistory: history }, () => {
        resolve();
      });
    });
  });
}

/**
 * Updates the chat history of the active summary item in history
 */
async function updateHistoryChat() {
  if (!currentHistoryItemId) return;
  
  return new Promise((resolve) => {
    chrome.storage.local.get({ summaryHistory: [] }, (data) => {
      const history = data.summaryHistory;
      const index = history.findIndex(item => item.id === currentHistoryItemId);
      if (index !== -1) {
        history[index].chatHistory = chatHistory;
        chrome.storage.local.set({ summaryHistory: history }, () => {
          resolve();
        });
      } else {
        resolve();
      }
    });
  });
}

/**
 * Renders the list of history items
 */
function renderHistory() {
  chrome.storage.local.get({ summaryHistory: [] }, (data) => {
    const history = data.summaryHistory;

    if (history.length === 0) {
      historyItemsContainer.innerHTML = `<div class="list-placeholder">No history found.</div>`;
      return;
    }

    historyItemsContainer.innerHTML = '';
    
    history.forEach(item => {
      const card = document.createElement('div');
      card.className = 'history-card';
      
      // Format time
      const date = new Date(item.timestamp);
      const timeStr = date.toLocaleString(undefined, { 
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit' 
      });

      // Preview content (strip markdown tags for cleaner display)
      let previewText = item.summaryText
        .replace(/[#*`_~]/g, '') // remove markdown characters
        .replace(/\n+/g, ' ')   // collapse newlines
        .trim();
      if (previewText.length > 70) {
        previewText = previewText.substring(0, 70) + '...';
      }

      const info = document.createElement('div');
      info.className = 'history-card-info';
      
      const time = document.createElement('span');
      time.className = 'history-card-time';
      time.textContent = `${timeStr} (${item.tabsData.length} tabs)`;
      
      const title = document.createElement('div');
      title.className = 'history-card-title';
      title.textContent = item.title || "Untitled Summary";
      title.title = item.title || "";
      
      const preview = document.createElement('span');
      preview.className = 'history-card-subtitle';
      preview.textContent = previewText;
      
      info.appendChild(time);
      info.appendChild(title);
      info.appendChild(preview);

      // Delete action button
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-card-delete';
      deleteBtn.title = "Delete this entry";
      deleteBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px;">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      `;

      // Event listener for loading item
      card.addEventListener('click', () => {
        loadHistoryItem(item);
      });

      // Event listener for deleting item
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // prevent card click
        deleteHistoryItem(item.id);
      });

      card.appendChild(info);
      card.appendChild(deleteBtn);
      
      historyItemsContainer.appendChild(card);
    });
  });
}

/**
 * Loads a history item into the results panel and switches views
 */
function loadHistoryItem(item) {
  // Set global states
  currentHistoryItemId = item.id;
  summarizedTabsData = item.tabsData || [];
  chatHistory = item.chatHistory || [{ role: 'model', content: item.summaryText }];

  // Switch view
  mainView.classList.remove('active');
  resultsView.classList.add('active');
  
  // Ensure loader is hidden and chat section is visible
  summarizeProgress.classList.add('hidden');
  chatSection.classList.remove('hidden');

  // Render summary content
  if (typeof marked !== 'undefined') {
    summaryContentEl.innerHTML = marked.parse(item.summaryText);
  } else {
    summaryContentEl.innerText = item.summaryText;
  }

  // Render chat messages
  chatMessagesEl.innerHTML = '';
  
  // Reconstruct chat UI
  // Note: first chatHistory item is the summary itself (model role), 
  // we only render follow-up messages (beyond index 0)
  if (chatHistory.length > 1) {
    for (let i = 1; i < chatHistory.length; i++) {
      const msg = chatHistory[i];
      appendChatMessage(msg.role === 'model' ? 'assistant' : 'user', msg.content);
    }
  }

  // Close history panel
  showHistory(false);
}

/**
 * Deletes a single history item by ID
 */
function deleteHistoryItem(itemId) {
  chrome.storage.local.get({ summaryHistory: [] }, (data) => {
    let history = data.summaryHistory;
    history = history.filter(item => item.id !== itemId);
    
    chrome.storage.local.set({ summaryHistory: history }, () => {
      // If we just deleted the active item, reset ID
      if (currentHistoryItemId === itemId) {
        currentHistoryItemId = null;
      }
      renderHistory();
    });
  });
}

/**
 * Clears all stored summary history
 */
function clearAllHistory() {
  if (confirm("Are you sure you want to clear all history? This cannot be undone.")) {
    chrome.storage.local.remove('summaryHistory', () => {
      currentHistoryItemId = null;
      renderHistory();
    });
  }
}


