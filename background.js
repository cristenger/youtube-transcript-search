chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "fetchTransformedUrl") {
    fetch(message.url)
      .then(response => response.text())
      .then(html => {
        sendResponse({ success: true, html: html });
      })
      .catch(error => {
        console.error("Error fetching transformed URL:", error);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Keep the message channel open for async response
  }
});