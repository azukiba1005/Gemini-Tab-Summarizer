/**
 * API client to interact with the Google Gemini API.
 */
class GeminiAPI {
  static DEFAULT_MODEL = 'gemini-2.5-flash';
  static API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

  /**
   * Fetch saved configuration from chrome.storage.local
   * @returns {Promise<{apiKey: string, model: string, language: string, temperature: number, customPrompt: string}>}
   */
  static async getConfig() {
    return new Promise((resolve) => {
      chrome.storage.local.get({
        apiKey: '',
        model: this.DEFAULT_MODEL,
        language: 'auto', // 'auto', 'ja', 'en'
        temperature: 0.2,
        customPrompt: ''
      }, (items) => {
        resolve(items);
      });
    });
  }

  /**
   * Save configuration to chrome.storage.local
   */
  static async saveConfig(config) {
    return new Promise((resolve) => {
      chrome.storage.local.set(config, () => {
        resolve();
      });
    });
  }

  /**
   * Generate combined context text from extracted tabs
   * @param {Array<{title: string, url: string, content: string}>} tabsData 
   * @returns {string}
   */
  static buildContext(tabsData) {
    let context = "";
    tabsData.forEach((tab, index) => {
      context += `\n--- START OF TAB ${index + 1} ---\n`;
      context += `Title: ${tab.title}\n`;
      context += `URL: ${tab.url}\n`;
      context += `Content:\n${tab.content}\n`;
      context += `--- END OF TAB ${index + 1} ---\n`;
    });
    return context;
  }

  /**
   * Build the summarization prompt based on configuration
   */
  static buildSummaryPrompt(tabsData, config, style = 'bullet') {
    const context = this.buildContext(tabsData);
    
    let languageInstruction = "";
    if (config.language === 'ja') {
      languageInstruction = "Please write the summary in Japanese (日本語).";
    } else if (config.language === 'en') {
      languageInstruction = "Please write the summary in English.";
    } else {
      languageInstruction = "Please write the summary in the same language as the primary source content, or in Japanese if there are multiple languages mixed.";
    }

    let styleInstruction = "";
    switch (style) {
      case 'bullet':
        styleInstruction = "Summarize the key points using bullet lists. Organize with clear headers for each main topic or tab.";
        break;
      case 'executive':
        styleInstruction = "Write a high-level executive summary in 2-3 structured paragraphs, highlighting key takeaways, business impact, or main conclusions.";
        break;
      case 'detailed':
        styleInstruction = "Provide a detailed, comprehensive analysis of the materials, structuring it into sections with markdown subheadings (e.g. Introduction, Main Themes, Critical Analysis, Conclusion).";
        break;
      case 'compare':
        styleInstruction = "Synthesize and compare the information across the selected tabs. Highlight similarities, differences, and how they relate or complement each other.";
        break;
      case 'custom':
        styleInstruction = config.customPrompt || "Summarize the contents.";
        break;
    }

    return `You are a highly capable AI assistant specializing in synthesizing and summarizing information from multiple web pages.
Here is the content of the web pages selected by the user:

${context}

Instructions:
1. Read the contents of all the provided tabs carefully.
2. ${styleInstruction}
3. ${languageInstruction}
4. Respond using clean, professional Markdown formatting. Do not output HTML tags. Avoid echoing the instructions. If certain tabs failed to load or are empty, acknowledge it gracefully.`;
  }

  /**
   * Build the prompt for chat mode based on tab content and query
   */
  static buildChatPrompt(tabsData, chatHistory, newQuery, config) {
    const context = this.buildContext(tabsData);
    
    let languageInstruction = "";
    if (config.language === 'ja') {
      languageInstruction = "Please respond in Japanese (日本語).";
    } else if (config.language === 'en') {
      languageInstruction = "Please respond in English.";
    } else {
      languageInstruction = "Please respond in the same language as the user's question.";
    }

    // Format chat history for context
    let historyStr = "";
    if (chatHistory && chatHistory.length > 0) {
      historyStr = "\nPrevious conversation history:\n" + chatHistory.map(msg => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`).join('\n') + "\n";
    }

    return `You are analyzing the contents of the following selected web pages:

${context}
${historyStr}
Based ONLY on the web page contents provided above and the conversation history, answer the user's question.

User's Question: ${newQuery}

Instructions:
- Answer accurately and concisely based on the source text.
- If the answer cannot be found in the provided content, state clearly that the information is not available in the selected tabs.
- ${languageInstruction}
- Respond using clean Markdown.`;
  }

  /**
   * Sends request to Gemini API and yields stream chunks via callback.
   * @param {string} prompt 
   * @param {function(string)} onChunk - Callback for each stream chunk
   * @param {function(Error)} onError - Callback for errors
   * @returns {Promise<string>} - Complete generated response text
   */
  static async generateContentStream(prompt, onChunk, onError) {
    try {
      const config = await this.getConfig();
      if (!config.apiKey) {
        throw new Error("Gemini API key is not set. Please open Settings (gear icon) and enter your API key.");
      }

      const url = `${this.API_BASE_URL}/models/${config.model}:streamGenerateContent?alt=sse&key=${config.apiKey}`;
      
      const payload = {
        contents: [
          {
            parts: [
              { text: prompt }
            ]
          }
        ],
        generationConfig: {
          temperature: parseFloat(config.temperature) || 0.2
        }
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        let errText = "";
        try {
          const errJson = await response.json();
          errText = errJson.error?.message || response.statusText;
        } catch (e) {
          errText = await response.text() || response.statusText;
        }
        throw new Error(`Gemini API Error (${response.status}): ${errText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        
        // SSE responses are separated by double newlines
        let lines = buffer.split('\n');
        // Keep the last line in buffer if it doesn't end with a newline
        buffer = lines.pop();

        for (const line of lines) {
          const cleanLine = line.trim();
          if (!cleanLine) continue;

          if (cleanLine.startsWith('data:')) {
            const dataStr = cleanLine.substring(5).trim();
            if (dataStr === '[DONE]') continue;

            try {
              const parsed = JSON.parse(dataStr);
              const textChunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (textChunk) {
                fullText += textChunk;
                onChunk(textChunk);
              }
            } catch (e) {
              console.warn("Failed to parse JSON stream chunk", e, dataStr);
            }
          }
        }
      }

      // Handle any remaining text in buffer
      if (buffer && buffer.trim().startsWith('data:')) {
        try {
          const dataStr = buffer.trim().substring(5).trim();
          const parsed = JSON.parse(dataStr);
          const textChunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (textChunk) {
            fullText += textChunk;
            onChunk(textChunk);
          }
        } catch (e) {
          // ignore
        }
      }

      return fullText;
    } catch (error) {
      onError(error);
      throw error;
    }
  }
}
