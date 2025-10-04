// Data Extraction Module
// Functions to extract and fetch transcript data from YouTube

const TranscriptExtraction = (function() {
  'use strict';

  let availableLanguages = []; // Store available languages
  let currentLanguageParams = null; // Store current language params

  /**
   * Inject page script handler for bypassing CORS
   */
  function injectFetchHandler() {
    if (window.__transcriptFetchHandlerInjected) {
      console.log('Fetch handler already injected');
      return;
    }
    window.__transcriptFetchHandlerInjected = true;
    
    console.log('Injecting page-script.js...');
    const script = document.createElement('script');
    
    try {
      script.src = chrome.runtime.getURL('page-script.js');
      script.onload = function() {
        console.log('✓ page-script.js loaded successfully');
        this.remove();
      };
      script.onerror = function(error) {
        console.error('✗ Failed to load page-script.js:', error);
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      console.error('Error injecting page-script.js:', error);
    }
  }

  /**
   * Extract data from page context (ytInitialData, ytInitialPlayerResponse)
   * @returns {Promise<Object>} Promise with extracted data
   */
  function extractDataFromPageContext() {
    return new Promise((resolve) => {
      const eventId = 'dataExtract_' + Date.now() + '_' + Math.random();
      
      const responseHandler = (event) => {
        if (event.detail && event.detail.eventId === eventId) {
          window.removeEventListener('dataExtractResponse', responseHandler);
          resolve(event.detail.data || {});
        }
      };
      
      window.addEventListener('dataExtractResponse', responseHandler);
      
      window.dispatchEvent(new CustomEvent('dataExtractRequest', {
        detail: { eventId }
      }));
      
      setTimeout(() => {
        window.removeEventListener('dataExtractResponse', responseHandler);
        resolve({});
      }, 2000);
    });
  }

  /**
   * Fetch URL via page context to bypass CORS
   * @param {string} url - URL to fetch
   * @returns {Promise<string>} Promise with response text
   */
  function fetchViaPageContext(url) {
    return new Promise((resolve, reject) => {
      const eventId = 'transcriptFetch_' + Date.now() + '_' + Math.random();
      
      console.log('🔍 Setting up fetch with eventId:', eventId);
      
      const responseHandler = (event) => {
        if (event.detail && event.detail.eventId === eventId) {
          console.log('✓ Received response for eventId:', eventId);
          
          window.removeEventListener('transcriptFetchResponse', responseHandler);
          
          if (event.detail.success) {
            if (!event.detail.data || event.detail.data.length === 0) {
              console.error('❌ Success but empty data received');
              reject(new Error('Empty response from API'));
            } else {
              console.log('✓ Resolving with data');
              resolve(event.detail.data);
            }
          } else {
            console.error('❌ Fetch failed:', event.detail.error);
            reject(new Error(event.detail.error || 'Fetch failed'));
          }
        }
      };
      
      window.addEventListener('transcriptFetchResponse', responseHandler);
      
      console.log('📤 Dispatching fetch request...');
      window.dispatchEvent(new CustomEvent('transcriptFetchRequest', {
        detail: { url, eventId }
      }));
      
      setTimeout(() => {
        window.removeEventListener('transcriptFetchResponse', responseHandler);
        console.error('⏱️ Fetch timeout after 10 seconds');
        reject(new Error('Fetch timeout'));
      }, 10000);
    });
  }

  /**
   * Extract JSON data from HTML
   * @param {string} html - HTML content
   * @param {string} key - Key to search for (ytInitialData, ytInitialPlayerResponse)
   * @returns {Object} Parsed JSON object
   */
  function extractJsonFromHtml(html, key) {
    const regexes = [
      new RegExp(`window\\["${key}"\\]\\s*=\\s*({[\\s\\S]+?})\\s*;`),
      new RegExp(`var ${key}\\s*=\\s*({[\\s\\S]+?})\\s*;`),
      new RegExp(`${key}\\s*=\\s*({[\\s\\S]+?})\\s*;`)
    ];
    
    for (const regex of regexes) {
      const match = html.match(regex);
      if (match && match[1]) {
        try {
          return JSON.parse(match[1]);
        } catch (err) {
          console.warn(`⚠️ Failed to parse ${key}:`, err.message);
        }
      }
    }
    
    throw new Error(`${key} not found`);
  }

  /**
   * Get transcript from YouTube's engagement panel API
   * @param {Object} ytData - YouTube initial data
   * @param {string} languageCode - Optional language code
   * @returns {Promise<Array>} Promise with transcript data
   */
  async function getTranscriptFromPanel(ytData, languageCode = null) {
    try {
      const panels = ytData?.engagementPanels || [];
      
      // Find transcript panel
      const transcriptPanel = panels.find(p => {
        const renderer = p.engagementPanelSectionListRenderer;
        if (!renderer) return false;
        
        const hasEndpoint = renderer.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint;
        const title = renderer.header?.engagementPanelTitleHeaderRenderer?.title?.simpleText?.toLowerCase();
        const hasTitle = title && title.includes('transcript');
        
        return hasEndpoint || hasTitle;
      });
      
      if (!transcriptPanel) {
        throw new Error("Could not find transcript panel");
      }
      
      const hl = ytData.topbar?.desktopTopbarRenderer?.searchbox?.fusionSearchboxRenderer?.config?.webSearchboxConfig?.requestLanguage || "en";
      const clientData = ytData.responseContext?.serviceTrackingParams?.[0]?.params;
      const visitorData = ytData.responseContext?.webResponseContextExtensionData?.ytConfigData?.visitorData;
      
      const initialParams = transcriptPanel.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint?.params;
      
      if (!initialParams) {
        throw new Error("Could not find continuation params");
      }
      
      const body = {
        context: {
          client: {
            hl: hl,
            visitorData: visitorData,
            clientName: clientData?.[0]?.value || "WEB",
            clientVersion: clientData?.[1]?.value || "2.20231219.01.00"
          },
          request: { useSsl: true }
        },
        params: initialParams
      };
      
      console.log('📤 Getting transcript from panel...');
      
      const res = await fetch("https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-YouTube-Client-Name": "1",
          "X-YouTube-Client-Version": body.context.client.clientVersion
        },
        body: JSON.stringify(body)
      });
      
      if (!res.ok) {
        throw new Error(`API request failed: ${res.status} ${res.statusText}`);
      }
      
      const json = await res.json();
      console.log('📥 API response received');
      
      const transcriptRenderer = json.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer;
      
      // Extract available languages
      const footer = transcriptRenderer?.footer?.transcriptFooterRenderer;
      const languageMenu = footer?.languageMenu?.sortFilterSubMenuRenderer?.subMenuItems;
      
      if (languageMenu && languageMenu.length > 0) {
        availableLanguages = languageMenu.map(item => ({
          name: item.title || 'Unknown',
          params: item.continuation?.getTranscriptEndpoint?.params || null,
          isSelected: item.selected || false
        }));
        console.log('📋 Available languages:', availableLanguages.map(l => l.name));
      } else {
        availableLanguages = [];
      }
      
      // Determine target params
      let targetParams = initialParams;
      
      if (languageCode && availableLanguages.length > 0) {
        const targetLang = availableLanguages.find(lang => {
          const langName = lang.name.toLowerCase();
          const code = languageCode.toLowerCase();
          return langName.includes(code) || 
                 langName.includes(code.split('-')[0]) ||
                 (code === 'es' && (langName.includes('español') || langName.includes('spanish'))) ||
                 (code === 'en' && langName.includes('english')) ||
                 (code === 'pt' && (langName.includes('português') || langName.includes('portuguese'))) ||
                 (code === 'fr' && (langName.includes('français') || langName.includes('french')));
        });
        
        if (targetLang && targetLang.params) {
          targetParams = targetLang.params;
          currentLanguageParams = targetParams;
          console.log(`✓ Using language: ${targetLang.name}`);
        }
      } else {
        currentLanguageParams = targetParams;
      }
      
      // Fetch transcript in selected language if different
      let finalJson = json;
      if (targetParams !== initialParams) {
        console.log('📤 Fetching transcript in selected language...');
        const langRes = await fetch("https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false", {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "X-YouTube-Client-Name": "1",
            "X-YouTube-Client-Version": body.context.client.clientVersion
          },
          body: JSON.stringify({ ...body, params: targetParams })
        });
        
        if (langRes.ok) {
          finalJson = await langRes.json();
        }
      }
      
      // Extract segments
      const segments = finalJson.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer
        ?.content?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments || [];
      
      if (segments.length === 0) {
        console.warn('⚠️ API returned empty segments');
        return [];
      }
      
      const transcriptData = segments.map(item => {
        const seg = item?.transcriptSegmentRenderer;
        if (!seg) return null;
        
        const text = seg.snippet?.runs?.map(r => r.text).join(" ") || "";
        const startMs = seg.startMs || 0;
        
        return {
          start: startMs / 1000,
          duration: 0,
          text: text
        };
      }).filter(item => item !== null);
      
      console.log(`✓ Extracted ${transcriptData.length} transcript entries`);
      return transcriptData;
      
    } catch (error) {
      console.error('❌ Error in getTranscriptFromPanel:', error);
      throw error;
    }
  }

  /**
   * Extract transcript from HTML content
   * @param {string} html - HTML content
   * @param {string} languageCode - Optional language code
   * @returns {Promise<Array|string>} Promise with transcript data or URL
   */
  async function extractTranscriptFromHtml(html, languageCode = null) {
    let ytData = extractJsonFromHtml(html, "ytInitialData");
    
    if (ytData) {
      const panels = ytData?.engagementPanels || [];
      const hasTranscriptPanel = panels.some(p =>
        p.engagementPanelSectionRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint
      );
      
      if (hasTranscriptPanel) {
        console.log('✓ Found transcript panel in ytInitialData');
        return await getTranscriptFromPanel(ytData, languageCode);
      }
    }
    
    const playerData = extractJsonFromHtml(html, "ytInitialPlayerResponse");
    
    if (playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks) {
      const tracks = playerData.captions.playerCaptionsTracklistRenderer.captionTracks;
      console.log('✓ Found caption tracks:', tracks.length);
      
      let track = null;
      if (languageCode) {
        track = tracks.find(t => t.languageCode === languageCode);
      }
      if (!track) {
        track = tracks.find(t => t.languageCode === 'en' || t.languageCode.startsWith('en')) || tracks[0];
      }
      
      if (track && track.baseUrl) {
        console.log('✓ Selected track:', track);
        return track.baseUrl;
      }
    }
    
    throw new TranscriptErrors.TranscriptsDisabled(TranscriptUtils.getVideoId());
  }

  /**
   * Extract transcript from current page (DEPRECATED - Use getTranscriptUrl instead)
   * Kept for compatibility
   */
  async function extractTranscriptFromPage(videoId, languageCode = null) {
    console.log('⚠️ extractTranscriptFromPage is deprecated, redirecting to getTranscriptUrl');
    return await getTranscriptUrl(videoId, languageCode);
  }

  /**
   * Extract captions from player (fallback method)
   */
  function extractCaptionsFromPlayer() {
    return new Promise((resolve) => {
      const eventId = 'captionsExtract_' + Date.now() + '_' + Math.random();
      
      const responseHandler = (event) => {
        if (event.detail && event.detail.eventId === eventId) {
          window.removeEventListener('captionsExtractResponse', responseHandler);
          
          if (event.detail.success && event.detail.data) {
            resolve(event.detail.data);
          } else {
            resolve(null);
          }
        }
      };
      
      window.addEventListener('captionsExtractResponse', responseHandler);
      
      window.dispatchEvent(new CustomEvent('captionsExtractRequest', {
        detail: { eventId }
      }));
      
      setTimeout(() => {
        window.removeEventListener('captionsExtractResponse', responseHandler);
        resolve(null);
      }, 3000);
    });
  }

  /**
   * Get transcript URL or data for video (PRIORITY: Engagement Panel API)
   * @param {string} videoId - Video ID
   * @param {string} languageCode - Optional language code
   * @returns {Promise<Array|string>} Promise with transcript data or URL
   */
  async function getTranscriptUrl(videoId, languageCode = null) {
    console.log('Looking for caption tracks...');
    
    try {
      const videoUrl = window.location.href;
      const isShorts = /youtube\.com\/shorts\//.test(videoUrl);
      
      if (isShorts) {
        const transformedUrl = `https://www.youtube.com/watch?v=${videoId}`;
        console.log("Transforming Shorts URL:", transformedUrl);
        
        const response = await chrome.runtime.sendMessage({
          action: "fetchTransformedUrl",
          url: transformedUrl
        });
        
        if (!response.success) {
          throw new Error("Failed to fetch transformed URL: " + response.error);
        }
        
        return await extractTranscriptFromHtml(response.html, languageCode);
      }

      // Detect active subtitle language if not specified
      let targetLanguage = languageCode;
      if (!targetLanguage) {
        const activeLanguage = TranscriptUtils.getActiveSubtitleLanguage();
        if (activeLanguage) {
          console.log('✓ Detected active subtitle language:', activeLanguage);
          targetLanguage = activeLanguage;
        }
      }

      console.log('🔍 Attempting to extract from page context...');
      const pageData = await extractDataFromPageContext();
      
      // PRIORITY 1: Try transcript panel method first (MOST RELIABLE)
      if (pageData.ytInitialData) {
        const panels = pageData.ytInitialData?.engagementPanels || [];
        
        // Find transcript panel with multiple criteria
        const transcriptPanel = panels.find(p => {
          const renderer = p.engagementPanelSectionListRenderer;
          if (!renderer) return false;
          
          const hasEndpoint = renderer.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint;
          const title = renderer.header?.engagementPanelTitleHeaderRenderer?.title?.simpleText?.toLowerCase();
          const hasTitle = title && title.includes('transcript');
          
          return hasEndpoint || hasTitle;
        });
        
        if (transcriptPanel) {
          console.log('✅ Found transcript panel - using API method (most reliable)');
          try {
            const transcriptData = await getTranscriptFromPanel(pageData.ytInitialData, targetLanguage);
            if (transcriptData && transcriptData.length > 0) {
              console.log(`✓ Got ${transcriptData.length} entries from transcript panel`);
              return transcriptData;
            }
          } catch (panelError) {
            console.warn('⚠️ Transcript panel method failed:', panelError);
          }
        } else {
          console.log('⚠️ No transcript panel found in ytInitialData');
        }
      }
      
      // PRIORITY 2: Try to get captions from video player
      console.log('🎥 Attempting to extract captions from video player...');
      const captionsFromPlayer = await extractCaptionsFromPlayer();
      if (captionsFromPlayer && captionsFromPlayer.length > 0) {
        console.log(`✓ Extracted ${captionsFromPlayer.length} entries from player`);
        return captionsFromPlayer;
      }
      
      // PRIORITY 3: Last resort - fetch page HTML and try panel method
      console.log('⚠️ Last resort: Fetching page HTML...');
      try {
        const response = await fetch(window.location.href);
        const html = await response.text();
        
        // Try to extract ytInitialData from HTML
        let ytData = extractJsonFromHtml(html, "ytInitialData");
        
        if (ytData) {
          const panels = ytData?.engagementPanels || [];
          
          const hasTranscriptPanel = panels.some(p => {
            const renderer = p.engagementPanelSectionListRenderer;
            return renderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint ||
                   renderer?.header?.engagementPanelTitleHeaderRenderer?.title?.simpleText?.toLowerCase().includes('transcript');
          });
          
          if (hasTranscriptPanel) {
            console.log('✓ Found transcript panel in fetched HTML');
            const transcriptData = await getTranscriptFromPanel(ytData, targetLanguage);
            if (transcriptData && transcriptData.length > 0) {
              console.log(`✓ Got ${transcriptData.length} entries from HTML transcript panel`);
              return transcriptData;
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch page HTML:', error);
      }
      
      // If all methods fail, throw error
      throw new TranscriptErrors.TranscriptsDisabled(videoId);
      
    } catch (error) {
      console.error('Error getting transcript URL:', error);
      throw error;
    }
  }

  /**
   * Fetch complete transcript for video
   * @param {string} languageCode - Optional language code
   * @returns {Promise<Array>} Promise with transcript data
   */
  async function fetchTranscript(languageCode = null) {
    const videoId = TranscriptUtils.getVideoId();
    if (!videoId) {
      throw new Error('No video ID found');
    }

    console.log(`🎬 Fetching transcript for video: ${videoId}`, languageCode ? `(language: ${languageCode})` : '');

    try {
      const transcriptData = await getTranscriptUrl(videoId, languageCode);
      
      // Check if we got direct data (from API or player)
      if (Array.isArray(transcriptData)) {
        console.log('✓ Got transcript data directly from API/player');
        console.log(`✓ Total entries: ${transcriptData.length}`);
        return transcriptData;
      }
      
      // If we got here, something went wrong
      console.error('❌ getTranscriptUrl did not return array data');
      throw new Error('Failed to get transcript data');
      
    } catch (error) {
      console.error('❌ Error fetching transcript:', error);
      throw error;
    }
  }

  /**
   * Get available languages
   * @returns {Array} Array of available languages
   */
  function getAvailableLanguages() {
    return availableLanguages;
  }

  /**
   * Get current language params
   * @returns {string|null} Current language params
   */
  function getCurrentLanguageParams() {
    return currentLanguageParams;
  }

  // Public API
  return {
    injectFetchHandler,
    extractDataFromPageContext,
    fetchViaPageContext,
    extractJsonFromHtml,
    getTranscriptFromPanel,
    extractTranscriptFromHtml,
    extractTranscriptFromPage,
    getTranscriptUrl,
    fetchTranscript,
    getAvailableLanguages,
    getCurrentLanguageParams
  };
})();
