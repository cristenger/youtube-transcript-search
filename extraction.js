// Data Extraction Module
// Functions to extract and fetch transcript data from YouTube

const TranscriptExtraction = (function() {
  'use strict';

  let availableLanguages = []; // Store available languages
  let currentLanguageParams = null; // Store current language params
  let lastVideoId = null; // Track last video ID to detect changes
  let lastTranscriptParams = null; // Track last params used

  /**
   * Inject page script handler for bypassing CORS
   */
  function injectFetchHandler() {
    if (window.__transcriptFetchHandlerInjected) {
      return;
    }
    window.__transcriptFetchHandlerInjected = true;
    
    const script = document.createElement('script');
    
    try {
      script.src = chrome.runtime.getURL('page-script.js');
      script.onload = function() {
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
      let timeoutId = null;
      let isResolved = false;
      
      const responseHandler = (event) => {
        if (event.detail.eventId === eventId) {
          if (isResolved) return; // Prevent double resolution
          isResolved = true;
          
          window.removeEventListener('dataExtractResponse', responseHandler);
          
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          
          // Validate that the extracted data matches current video
          const currentVideoId = TranscriptUtils.getVideoId();
          const extractedData = event.detail.data;
          
          // Check if ytInitialData contains the current video ID
          // Skip validation if currentVideoId is null (page is transitioning)
          if (extractedData.ytInitialData && currentVideoId) {
            const dataStr = JSON.stringify(extractedData.ytInitialData);
            if (!dataStr.includes(currentVideoId)) {
              console.warn('⚠️ Extracted data does not match current video ID. Data may be stale.');
              // Return empty data to force a retry or alternative method
              resolve({ ytInitialData: null, ytInitialPlayerResponse: null });
              return;
            }
          }
          
          resolve(event.detail.data);
        }
      };
      
      window.addEventListener('dataExtractResponse', responseHandler);
      
      window.dispatchEvent(new CustomEvent('dataExtractRequest', {
        detail: { eventId }
      }));
      
      timeoutId = setTimeout(() => {
        if (isResolved) return; // Already resolved
        isResolved = true;
        
        window.removeEventListener('dataExtractResponse', responseHandler);
        resolve({ ytInitialData: null, ytInitialPlayerResponse: null });
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
      let timeoutId = null;
      let isResolved = false;
      
      const responseHandler = (event) => {
        if (event.detail && event.detail.eventId === eventId) {
          if (isResolved) return; // Prevent double resolution
          isResolved = true;
          
          window.removeEventListener('transcriptFetchResponse', responseHandler);
          
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          
          if (event.detail.success) {
            if (!event.detail.data || event.detail.data.length === 0) {
              console.error('❌ Success but empty data received');
              reject(new Error('Empty response from API'));
            } else {
              resolve(event.detail.data);
            }
          } else {
            console.error('❌ Fetch failed:', event.detail.error);
            reject(new Error(event.detail.error || 'Fetch failed'));
          }
        }
      };
      
      window.addEventListener('transcriptFetchResponse', responseHandler);
      
      window.dispatchEvent(new CustomEvent('transcriptFetchRequest', {
        detail: { url, eventId }
      }));
      
      timeoutId = setTimeout(() => {
        if (isResolved) return; // Already resolved
        isResolved = true;
        
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
      
      console.log('🔧 CODE VERSION: 2024-10-04-STALE-PARAMS-FIX');
      
      // Try to extract available languages from player response
      const playerResponse = ytData?.ytInitialPlayerResponse || window.ytInitialPlayerResponse;
      let captionTracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      
      if (captionTracks.length > 0) {
        console.log(`🌐 Found ${captionTracks.length} available languages`);
      }
      
      // Detect user's language preference from YouTube or browser
      const userLanguage = ytData.topbar?.desktopTopbarRenderer?.searchbox?.fusionSearchboxRenderer?.config?.webSearchboxConfig?.requestLanguage 
        || document.documentElement.lang 
        || navigator.language?.split('-')[0] 
        || "en";
      const hl = userLanguage;
      const clientData = ytData.responseContext?.serviceTrackingParams?.[0]?.params;
      const visitorData = ytData.responseContext?.webResponseContextExtensionData?.ytConfigData?.visitorData;
      
      const initialParams = transcriptPanel.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint?.params;
      
      if (!initialParams) {
        throw new Error("Could not find continuation params");
      }
      
      // IMPORTANT: Store params hash to detect if they're from a different video
      // Params are base64 encoded strings that are unique per video
      const currentVideoId = TranscriptUtils.getVideoId();
      
      // If we have params from a previous request, check if they match
      if (lastTranscriptParams && lastTranscriptParams === initialParams) {
        // Same params as before - check if video changed
        if (lastVideoId && currentVideoId !== lastVideoId) {
          console.warn('⚠️ Detected stale transcript params!');
          console.warn('  Previous video:', lastVideoId);
          console.warn('  Current video:', currentVideoId);
          throw new Error('Transcript params are stale (params match previous video)');
        }
      }
      
      // Update tracking
      lastVideoId = currentVideoId;
      lastTranscriptParams = initialParams;
      
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
      console.log('✓ Transcript data received successfully');
      
      const transcriptRenderer = json.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer;
      
      // Extract available languages from caption tracks (more reliable than footer)
      console.log('🔍 Extracting available languages from caption tracks...');
      
      if (captionTracks.length > 1) {
        // Build language menu from caption tracks
        // Each track can be converted to transcript via API
        availableLanguages = captionTracks.map(track => {
          const languageName = track.name?.simpleText || track.languageCode || 'Unknown';
          const languageCode = track.languageCode || '';
          
          // Generate params for this language by encoding the video ID and language
          // This is a simplified approach - ideally we'd get real params from the API
          const isCurrentLanguage = track.vssId?.includes(hl) || languageCode === hl;
          
          return {
            name: languageName,
            code: languageCode,
            vssId: track.vssId,
            params: null, // We'll need to fetch transcript for each language separately
            isSelected: isCurrentLanguage,
            baseUrl: track.baseUrl
          };
        });
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
        }
      } else {
        currentLanguageParams = targetParams;
      }
      
      // Fetch transcript in selected language if different
      let finalJson = json;
      if (targetParams !== initialParams) {
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
      
      let track = null;
      if (languageCode) {
        // If specific language requested, try to find it
        track = tracks.find(t => t.languageCode === languageCode);
      }
      
      // If no specific language or not found, use first available track (respects YouTube's order)
      if (!track) {
        track = tracks[0];
      }
      
      if (track && track.baseUrl) {
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
    return await getTranscriptUrl(videoId, languageCode);
  }

  /**
   * Extract captions from player (fallback method)
   */
  function extractCaptionsFromPlayer() {
    return new Promise((resolve) => {
      const eventId = 'captionsExtract_' + Date.now() + '_' + Math.random();
      let timeoutId = null;
      let isResolved = false;
      
      const responseHandler = (event) => {
        if (event.detail && event.detail.eventId === eventId) {
          if (isResolved) return; // Prevent double resolution
          isResolved = true;
          
          window.removeEventListener('captionsExtractResponse', responseHandler);
          
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          
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
      
      timeoutId = setTimeout(() => {
        if (isResolved) return; // Already resolved
        isResolved = true;
        
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
        // Priority 1: Check if user has subtitles currently active
        const activeLanguage = TranscriptUtils.getActiveSubtitleLanguage();
        if (activeLanguage) {
          console.log('🌐 Using active subtitle language:', activeLanguage);
          targetLanguage = activeLanguage;
        } else {
          // Priority 2: Use YouTube interface language (respects user's YouTube language setting)
          const ytLanguage = document.documentElement.lang || navigator.language?.split('-')[0];
          if (ytLanguage && ytLanguage !== 'en') {
            console.log('🌐 Using YouTube/browser language:', ytLanguage);
            targetLanguage = ytLanguage;
          }
          // If language is 'en' or not detected, let YouTube API choose the default (usually video's original language)
        }
      }

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
          try {
            const transcriptData = await getTranscriptFromPanel(pageData.ytInitialData, targetLanguage);
            if (transcriptData && transcriptData.length > 0) {
              return transcriptData;
            }
          } catch (panelError) {
            console.warn('⚠️ Transcript panel method failed:', panelError);
            
            // Check if error is due to stale data
            if (panelError.message && panelError.message.includes('stale params')) {
              // Force retry by setting pageData to simulate null condition
              pageData.ytInitialData = null;
            }
          }
        }
      }
      
      // Retry logic for stale or missing data
      if (!pageData.ytInitialData) {
        console.log('⏳ Waiting for YouTube data to update...');
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        const retryPageData = await extractDataFromPageContext();
        
        if (retryPageData.ytInitialData) {
          const panels = retryPageData.ytInitialData?.engagementPanels || [];
          
          const transcriptPanel = panels.find(p => {
            const renderer = p.engagementPanelSectionListRenderer;
            if (!renderer) return false;
            
            const hasEndpoint = renderer.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint;
            const title = renderer.header?.engagementPanelTitleHeaderRenderer?.title?.simpleText?.toLowerCase();
            const hasTitle = title && title.includes('transcript');
            
            return hasEndpoint || hasTitle;
          });
          
          if (transcriptPanel) {
            try {
              const transcriptData = await getTranscriptFromPanel(retryPageData.ytInitialData, targetLanguage);
              if (transcriptData && transcriptData.length > 0) {
                return transcriptData;
              }
            } catch (panelError) {
              console.warn('⚠️ Retry transcript panel method failed:', panelError);
            }
          }
        } else {
          console.log('⚠️ Still no valid data after retry');
        }
      }
      
      // PRIORITY 2: Try to get captions from video player
      const captionsFromPlayer = await extractCaptionsFromPlayer();
      if (captionsFromPlayer && captionsFromPlayer.length > 0) {
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

    try {
      const transcriptData = await getTranscriptUrl(videoId, languageCode);
      
      // Check if we got direct data (from API or player)
      if (Array.isArray(transcriptData)) {
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

  /**
   * Reset language cache when changing videos
   * NOTE: We keep lastVideoId and lastTranscriptParams to detect stale data
   */
  function resetLanguageCache() {
    availableLanguages = [];
    currentLanguageParams = null;
    // DON'T reset lastVideoId and lastTranscriptParams - we need them to detect stale params
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
    getCurrentLanguageParams,
    resetLanguageCache
  };
})();
