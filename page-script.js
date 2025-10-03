// This script runs in the page context to bypass CORS restrictions

(function() {
  'use strict';
  
  console.log('✓ Page script loaded and running');
  
  // Signal that the script is loaded
  window.__transcriptPageScriptLoaded = true;
  
  // Listen for fetch requests from content script
  window.addEventListener('transcriptFetchRequest', async (event) => {
    console.log('Page script received fetch request:', event.detail);
    const { url, eventId } = event.detail;
    
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      
      xhr.onload = function() {
        console.log('XHR loaded, status:', xhr.status, 'response length:', xhr.responseText.length);
        if (xhr.status === 200) {
          window.dispatchEvent(new CustomEvent('transcriptFetchResponse', {
            detail: {
              eventId,
              success: true,
              data: xhr.responseText
            }
          }));
        } else {
          window.dispatchEvent(new CustomEvent('transcriptFetchResponse', {
            detail: {
              eventId,
              success: false,
              error: `HTTP ${xhr.status}: ${xhr.statusText}`
            }
          }));
        }
      };
      
      xhr.onerror = function() {
        console.error('XHR error');
        window.dispatchEvent(new CustomEvent('transcriptFetchResponse', {
          detail: {
            eventId,
            success: false,
            error: 'Network error'
          }
        }));
      };
      
      console.log('Sending XHR request...');
      xhr.send();
    } catch (error) {
      console.error('Exception in page script:', error);
      window.dispatchEvent(new CustomEvent('transcriptFetchResponse', {
        detail: {
          eventId,
          success: false,
          error: error.message
        }
      }));
    }
  });
  
  console.log('Page script event listener registered');
})();