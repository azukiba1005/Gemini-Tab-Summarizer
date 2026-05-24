/**
 * Extractor script designed to run inside the context of a web page tab.
 * Extracts clean, readable text content, omitting navigation, footers, scripts, and styles.
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

    // Capture basic metadata
    const title = document.title || "Untitled";
    const url = window.location.href;
    
    // Find meta description
    let metaDescription = "";
    const metaDescEl = document.querySelector('meta[name="description"]') || 
                       document.querySelector('meta[property="og:description"]');
    if (metaDescEl) {
      metaDescription = metaDescEl.getAttribute('content') || "";
    }

    // Clone body to manipulate without affecting active page
    const bodyClone = document.body.cloneNode(true);

    // List of selectors representing typical clutter (menus, footers, ads, cookie consent, etc.)
    const clutterSelectors = [
      'script', 'style', 'noscript', 'iframe', 'svg', 'canvas', 'picture', 'noscript',
      'nav', 'footer', 'header', 'aside',
      '.footer', '.header', '.nav', '.navigation', '.menu', '.sidebar',
      '#footer', '#header', '#nav', '#navigation', '#menu', '#sidebar',
      '.cookie-consent', '.cookie-banner', '.cookie-notice', '#cookie-consent',
      '.ads', '.advertisement', '.promo', '.social-share', '.share-buttons',
      '.modal', '.popup', '.overlay', '.login-modal'
    ];

    // Remove clutter elements
    clutterSelectors.forEach(selector => {
      try {
        const elements = bodyClone.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      } catch (e) {
        // Ignore selector errors
      }
    });

    // Extract text
    let contentText = bodyClone.innerText || bodyClone.textContent || "";

    // Clean whitespace and formatting
    contentText = contentText
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')     // Replace multiple spaces/tabs with single space
      .replace(/\n\s*\n/g, '\n\n')  // Collapse multiple blank lines
      .trim();

    // Limit length to avoid running out of token context (approx 30,000 characters)
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
