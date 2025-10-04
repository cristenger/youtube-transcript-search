// YouTube Transcript Search Extension
(function() {
  'use strict';

  let transcriptData = [];
  let currentSearchTerm = '';
  let observerInstance = null;
  let videoTimeUpdateListener = null;
  let currentActiveIndex = -1;
  let isUserScrolling = false;
  let scrollTimeout = null;

  // Error classes
  class TranscriptError extends Error {
    constructor(videoId, message) {
      super(message);
      this.videoId = videoId;
      this.name = this.constructor.name;
    }
  }

  class TranscriptsDisabled extends TranscriptError {
    constructor(videoId) {
      super(videoId, 'Transcripts are disabled for this video');
    }
  }

  class VideoUnavailable extends TranscriptError {
    constructor(videoId) {
      super(videoId, 'This video is unavailable');
    }
  }

  class AgeRestricted extends TranscriptError {
    constructor(videoId) {
      super(videoId, 'This video is age-restricted');
    }
  }

  class IpBlocked extends TranscriptError {
    constructor(videoId) {
      super(videoId, 'Your IP may be blocked by YouTube');
    }
  }

  // Constantes
  const RE_XML_TRANSCRIPT = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================

  // Get video ID from URL
  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  // Format seconds to timestamp (MM:SS or HH:MM:SS)
  function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  // Decode HTML entities
  function decodeHTMLEntities(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    let decoded = textarea.value;
    
    // Always normalize whitespace
    decoded = decoded.replace(/\n/g, ' ').replace(/\s+/g, ' ');
    
    return decoded;
  }

  // Escape special regex characters
  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Seek video to specific time
  function seekToTime(seconds) {
    const video = document.querySelector('video');
    if (video) {
      video.currentTime = seconds;
      video.play();
    }
  }

  // Detect user scrolling
  function handleUserScroll() {
    isUserScrolling = true;
    
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    
    // Resume auto-scroll after 3 seconds of no user interaction
    scrollTimeout = setTimeout(() => {
      isUserScrolling = false;
    }, 3000);
  }

  // Update active transcript entry based on video time
  function updateActiveTranscript() {
    const video = document.querySelector('video');
    if (!video || !transcriptData || transcriptData.length === 0) {
      return;
    }

    const currentTime = video.currentTime;
    
    // Find the current transcript entry
    let activeIndex = -1;
    for (let i = transcriptData.length - 1; i >= 0; i--) {
      if (currentTime >= transcriptData[i].start) {
        activeIndex = i;
        break;
      }
    }

    // Only update if the active index changed
    if (activeIndex !== currentActiveIndex) {
      currentActiveIndex = activeIndex;
      highlightActiveEntry(activeIndex);
    }
  }

  // Highlight the active entry and scroll to it
  function highlightActiveEntry(index) {
    const container = document.getElementById('transcript-content');
    if (!container) return;

    // Remove previous active class
    const prevActive = container.querySelector('.transcript-entry.active');
    if (prevActive) {
      prevActive.classList.remove('active');
    }

    // Add active class to current entry
    if (index >= 0) {
      const entries = container.querySelectorAll('.transcript-entry');
      if (entries[index]) {
        entries[index].classList.add('active');
        
        // Auto-scroll only if user is not manually scrolling
        if (!isUserScrolling) {
          entries[index].scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      }
    }
  }

  // Start video time sync
  function startVideoSync() {
    const video = document.querySelector('video');
    if (!video) return;

    // Remove previous listener if it exists
    if (videoTimeUpdateListener) {
      video.removeEventListener('timeupdate', videoTimeUpdateListener);
    }

    // Create new listener
    videoTimeUpdateListener = () => updateActiveTranscript();
    video.addEventListener('timeupdate', videoTimeUpdateListener);

    // Add scroll listener to detect user scrolling
    const container = document.getElementById('transcript-content');
    if (container) {
      container.addEventListener('scroll', handleUserScroll, { passive: true });
    }

    console.log('✓ Video sync started');
  }

  // Stop video time sync
  function stopVideoSync() {
    const video = document.querySelector('video');
    if (video && videoTimeUpdateListener) {
      video.removeEventListener('timeupdate', videoTimeUpdateListener);
      videoTimeUpdateListener = null;
    }

    const container = document.getElementById('transcript-content');
    if (container) {
      container.removeEventListener('scroll', handleUserScroll);
    }

    currentActiveIndex = -1;
    isUserScrolling = false;
    
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
      scrollTimeout = null;
    }
  }

  // Wait for element to exist in DOM
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(selector)) {
        return resolve(document.querySelector(selector));
      }

      const observer = new MutationObserver(() => {
        if (document.querySelector(selector)) {
          observer.disconnect();
          resolve(document.querySelector(selector));
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for ${selector}`));
      }, timeout);
    });
  }

  // ============================================================================
  // PAGE SCRIPT INJECTION
  // ============================================================================

  // Inject fetch handler into page context
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

  // ============================================================================
  // DATA EXTRACTION FUNCTIONS
  // ============================================================================

  // Extract data from page context
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

  // Fetch via page context to bypass CORS
  function fetchViaPageContext(url) {
    return new Promise((resolve, reject) => {
      const eventId = 'transcriptFetch_' + Date.now() + '_' + Math.random();
      
      console.log('🔍 Setting up fetch with eventId:', eventId);
      console.log('🔍 Target URL:', url);
      
      const responseHandler = (event) => {
        if (event.detail && event.detail.eventId === eventId) {
          console.log('✓ Received response for eventId:', eventId);
          console.log('📦 Response detail:', event.detail);
          console.log('📦 Success:', event.detail.success);
          console.log('📦 Data type:', typeof event.detail.data);
          console.log('📦 Data length:', event.detail.data?.length || 0);
          console.log('📦 First 500 chars:', event.detail.data?.substring(0, 500));
          
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
        console.error('⏱️ Fetch timeout after 10 seconds for eventId:', eventId);
        reject(new Error('Fetch timeout after 10 seconds'));
      }, 10000);
    });
  }

  // Extract JSON from HTML
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

  // Get transcript from panel (API continuation endpoint)
  async function getTranscriptFromPanel(ytData, languageCode = null) {
    const continuationParams = ytData.engagementPanels?.find(p =>
      p.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint
    )?.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint?.params;
    
    if (!continuationParams) {
      throw new Error("Could not find continuation params");
    }
    
    const hl = ytData.topbar?.desktopTopbarRenderer?.searchbox?.fusionSearchboxRenderer?.config?.webSearchboxConfig?.requestLanguage || "en";
    const clientData = ytData.responseContext?.serviceTrackingParams?.[0]?.params;
    const visitorData = ytData.responseContext?.webResponseContextExtensionData?.ytConfigData?.visitorData;
    
    const body = {
      context: {
        client: {
          hl,
          visitorData,
          clientName: clientData?.[0]?.value,
          clientVersion: clientData?.[1]?.value
        },
        request: { useSsl: true }
      },
      params: continuationParams
    };
    
    const res = await fetch("https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    
    const json = await res.json();
    const segments = json.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer
      ?.content?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments || [];
    
    return segments.map(item => {
      const seg = item?.transcriptSegmentRenderer;
      if (!seg) return null;
      
      const timestamp = seg.startTimeText?.simpleText || "";
      const text = seg.snippet?.runs?.map(r => r.text).join(" ") || "";
      const startMs = seg.startMs || 0;
      
      return {
        start: startMs / 1000,
        duration: 0,
        text: text
      };
    }).filter(item => item !== null);
  }

  // Extract transcript from HTML
  async function extractTranscriptFromHtml(html, languageCode = null) {
    let ytData = extractJsonFromHtml(html, "ytInitialData");
    
    if (ytData) {
      const panels = ytData?.engagementPanels || [];
      const hasTranscriptPanel = panels.some(p =>
        p.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint
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
    
    throw new TranscriptsDisabled(getVideoId());
  }

  // Extract transcript from current page
  async function extractTranscriptFromPage(videoId, languageCode = null) {
    console.log('Attempting to extract transcript from page...');
    
    try {
      const pageData = await extractDataFromPageContext();
      
      if (pageData.ytInitialData) {
        const panels = pageData.ytInitialData?.engagementPanels || [];
        const hasTranscriptPanel = panels.some(p =>
          p.engagementPanelSectionRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint
        );
        
        if (hasTranscriptPanel) {
          console.log('✓ Found transcript panel in page ytInitialData');
          return await getTranscriptFromPanel(pageData.ytInitialData, languageCode);
        }
      }
      
      if (pageData.ytInitialPlayerResponse) {
        const tracks = pageData.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        
        if (tracks && tracks.length > 0) {
          console.log('✓ Found caption tracks from ytInitialPlayerResponse:', tracks.length);
          
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
      }
    } catch (error) {
      console.warn('Could not extract from page context:', error);
    }
    
    console.log('Trying to fetch current page HTML...');
    try {
      const response = await fetch(window.location.href);
      const html = await response.text();
      return await extractTranscriptFromHtml(html, languageCode);
    } catch (error) {
      console.error('Failed to fetch page HTML:', error);
    }
    
    throw new TranscriptsDisabled(videoId);
  }

  // Get transcript URL
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
      
      // First try: Extract from page context (most reliable)
      console.log('🔍 Attempting to extract from page context...');
      const pageData = await extractDataFromPageContext();
      
      // Try transcript panel method first (most reliable)
      if (pageData.ytInitialData) {
        const panels = pageData.ytInitialData?.engagementPanels || [];
        const transcriptPanel = panels.find(p =>
          p.engagementPanelSectionRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint
        );
        
        if (transcriptPanel) {
          console.log('✅ Found transcript panel - using reliable method');
          try {
            const transcriptData = await getTranscriptFromPanel(pageData.ytInitialData, languageCode);
            if (transcriptData && transcriptData.length > 0) {
              console.log(`✓ Got ${transcriptData.length} entries from transcript panel`);
              return transcriptData;
            }
          } catch (panelError) {
            console.warn('⚠️ Transcript panel method failed:', panelError);
          }
        }
      }
      
      // Second try: Use timedtext API (often returns empty)
      if (pageData.ytInitialPlayerResponse) {
        const tracks = pageData.ytInitialPlayerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
        
        if (tracks && tracks.length > 0) {
          console.log('⚠️ Falling back to timedtext API (less reliable)');
          console.log('Found caption tracks:', tracks.length);
          
          let track = null;
          if (languageCode) {
            track = tracks.find(t => t.languageCode === languageCode);
          }
          if (!track) {
            track = tracks.find(t => t.languageCode === 'en' || t.languageCode.startsWith('en')) || tracks[0];
          }
          
          if (track && track.baseUrl) {
            console.log('Selected track:', track.name?.simpleText || track.languageCode);
            
            // Try multiple formats
            const formats = ['json3', 'srv3', 'srv2', 'srv1', 'ttml', 'vtt'];
            
            for (const fmt of formats) {
              try {
                const urlWithFormat = track.baseUrl.includes('?') 
                  ? `${track.baseUrl}&fmt=${fmt}` 
                  : `${track.baseUrl}?fmt=${fmt}`;
                
                console.log(`Trying format: ${fmt}`);
                
                const data = await fetchViaPageContext(urlWithFormat);
                
                if (!data || data.length === 0) {
                  console.warn(`Format ${fmt} returned empty - trying next...`);
                  continue;
                }
                
                console.log(`✓ Format ${fmt} returned ${data.length} bytes`);
                
                // Try to parse
                let parsed = null;
                if (fmt === 'json3' || fmt.startsWith('srv')) {
                  parsed = parseTranscriptJSON(data);
                } else if (fmt === 'vtt') {
                  parsed = parseTranscriptVTT(data);
                } else {
                  parsed = parseTranscriptXML(data);
                }
                
                if (parsed && parsed.length > 0) {
                  console.log(`✓ Successfully parsed ${fmt}: ${parsed.length} entries`);
                  return parsed;
                }
              } catch (formatError) {
                console.warn(`Format ${fmt} failed:`, formatError.message);
              }
            }
            
            console.error('❌ All formats returned empty or failed to parse');
          }
        }
      }
      
      // Third try: Try to extract captions directly from video player
      console.log('🎥 Attempting to extract captions from video player...');
      const captionsFromPlayer = await extractCaptionsFromPlayer();
      if (captionsFromPlayer && captionsFromPlayer.length > 0) {
        console.log(`✓ Extracted ${captionsFromPlayer.length} entries from player`);
        return captionsFromPlayer;
      }
      
      // Last resort: Fetch page HTML
      console.log('⚠️ Last resort: Fetching page HTML...');
      try {
        const response = await fetch(window.location.href);
        const html = await response.text();
        return await extractTranscriptFromHtml(html, languageCode);
      } catch (error) {
        console.error('Failed to fetch page HTML:', error);
      }
      
      throw new TranscriptsDisabled(videoId);
      
    } catch (error) {
      console.error('Error getting transcript URL:', error);
      throw error;
    }
  }

  // Extract captions from video player
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

  // ============================================================================
  // PARSING FUNCTIONS
  // ============================================================================

  // Parse XML transcript format
  function parseTranscriptXML(xmlText) {
    const matches = [...xmlText.matchAll(RE_XML_TRANSCRIPT)];
    return matches.map(match => ({
      start: parseFloat(match[1]),
      duration: parseFloat(match[2]),
      text: decodeHTMLEntities(match[3])
    }));
  }

  // Parse JSON transcript format
  function parseTranscriptJSON(jsonText) {
    try {
      const data = JSON.parse(jsonText);
      if (data.events) {
        return data.events
          .filter(e => e.segs)
          .map(e => ({
            start: e.tStartMs / 1000,
            duration: (e.dDurationMs || 0) / 1000,
            text: e.segs.map(seg => seg.utf8).join(" ").replace(/\n/g, " ")
          }))
          .filter(item => item.text.trim() !== '');
      }
      return [];
    } catch (e) {
      console.error('Error parsing JSON:', e);
      return [];
    }
  }

  // Parse WebVTT format
  function parseTranscriptVTT(vttText) {
    const lines = vttText.split('\n');
    const entries = [];
    let currentEntry = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.includes('-->')) {
        const times = line.split('-->');
        const startTime = parseVTTTime(times[0].trim());
        const endTime = parseVTTTime(times[1].trim().split(' ')[0]);
        
        currentEntry = {
          start: startTime,
          duration: endTime - startTime,
          text: ''
        };
      } else if (currentEntry && line && !line.startsWith('WEBVTT') && !line.match(/^\d+$/)) {
        currentEntry.text += (currentEntry.text ? ' ' : '') + line;
        
        if (i === lines.length - 1 || !lines[i + 1].trim()) {
          if (currentEntry.text) {
            entries.push(currentEntry);
          }
          currentEntry = null;
        }
      }
    }
    
    return entries;
  }

  function parseVTTTime(timeString) {
    const parts = timeString.split(':');
    if (parts.length === 3) {
      return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(timeString);
  }

  // ============================================================================
  // TRANSCRIPT FETCHING
  // ============================================================================

  async function fetchTranscript(languageCode = null) {
    try {
      const videoId = getVideoId();
      if (!videoId) {
        showError('Could not find video ID');
        return false;
      }

      console.log('Fetching transcript for video:', videoId, 'language:', languageCode || 'auto');

      const result = await getTranscriptUrl(videoId, languageCode);
      
      if (Array.isArray(result)) {
        transcriptData = result;
        console.log(`✓ Loaded transcript directly from panel, entries: ${transcriptData.length}`);
        displayTranscript(transcriptData);
        return true;
      }
      
      const transcriptUrl = result;
      if (!transcriptUrl) {
        showError('No transcript available for this video.<br><br>💡 Make sure captions are available for this video.<br><br><strong>Try enabling subtitles manually and retry.</strong>');
        return false;
      }

      console.log('Fetching from URL:', transcriptUrl);
      
      const urlWithFormat = transcriptUrl.includes('?') 
        ? `${transcriptUrl}&fmt=json3` 
        : `${transcriptUrl}?fmt=json3`;
      
      const data = await fetchViaPageContext(urlWithFormat);
      
      if (!data || data.length === 0) {
        console.error('Empty response from transcript URL');
        showError('The transcript API returned empty data.<br><br>💡 <strong>Try these steps:</strong><br>1. Enable subtitles on the video player<br>2. Change subtitle language<br>3. Click "Retry Load Transcript"');
        return false;
      }
      
      console.log('✓ Received data:', data.length, 'bytes');
      
      try {
        const jsonData = JSON.parse(data);
        if (jsonData.events) {
          transcriptData = jsonData.events
            .filter(e => e.segs)
            .map(e => ({
              start: e.tStartMs / 1000,
              duration: (e.dDurationMs || 0) / 1000,
              text: e.segs.map(seg => seg.utf8).join(" ").replace(/\n/g, " ")
            }))
            .filter(item => item.text.trim() !== '');
          
          if (transcriptData.length > 0) {
            console.log(`✓ Parsed as JSON3, entries: ${transcriptData.length}`);
            displayTranscript(transcriptData);
            return true;
          }
        }
      } catch (e) {
        console.log('Not JSON3 format, trying other parsers...');
      }
      
      const parsers = [
        { name: 'XML', fn: parseTranscriptXML },
        { name: 'JSON', fn: parseTranscriptJSON },
        { name: 'VTT', fn: parseTranscriptVTT }
      ];
      
      for (const parser of parsers) {
        try {
          transcriptData = parser.fn(data);
          if (transcriptData.length > 0) {
            console.log(`✓ Successfully parsed with ${parser.name}, entries: ${transcriptData.length}`);
            displayTranscript(transcriptData);
            return true;
          }
        } catch (e) {
          console.warn(`Failed to parse as ${parser.name}:`, e);
        }
      }
      
      showError('Could not parse transcript data.<br><br>💡 <strong>Try:</strong><br>1. Enable subtitles manually<br>2. Change subtitle language<br>3. Click "Retry Load Transcript"');
      return false;
    } catch (error) {
      console.error('Error fetching transcript:', error);
      if (error instanceof TranscriptError) {
        showError(error.message + '<br><br>💡 Try enabling subtitles manually and retry.');
      } else {
        showError('Failed to load transcript: ' + error.message + '<br><br>💡 Try enabling subtitles manually and retry.');
      }
      return false;
    }
  }

  // ============================================================================
  // UI FUNCTIONS
  // ============================================================================

  // Reset the panel when navigating to a new video
  function resetTranscriptPanel() {
    const panel = document.getElementById('yt-transcript-panel');
    if (!panel) return;
    
    console.log('Resetting transcript panel for new video');
    
    // Stop video sync
    stopVideoSync();
    
    // Clear data
    transcriptData = [];
    currentSearchTerm = '';
    
    // Reset UI
    const button = document.getElementById('load-transcript-btn');
    const searchContainer = document.getElementById('search-container');
    const container = document.getElementById('transcript-content');
    
    if (button) {
      button.style.display = 'block';
      button.disabled = false;
      button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 1a5 5 0 110 10A5 5 0 018 3zm-.5 2.5v3h3v1h-4v-4h1z"/>
        </svg>
        Load Transcript
      `;
    }
    
    if (searchContainer) {
      searchContainer.style.display = 'none';
      const searchInput = document.getElementById('transcript-search');
      if (searchInput) searchInput.value = '';
    }
    
    if (container) {
      container.innerHTML = `
        <div class="transcript-instructions">
          <p>📝 Click "Load Transcript" to fetch the video captions</p>
          <p class="transcript-tip">💡 Tip: The transcript will auto-scroll as the video plays</p>
        </div>
      `;
    }
  }

  // Copy transcript to clipboard
  async function copyTranscriptToClipboard() {
    if (!transcriptData || transcriptData.length === 0) {
      return;
    }
    
    try {
      const text = transcriptData.map(entry => {
        const timestamp = formatTime(entry.start);
        return `[${timestamp}] ${entry.text}`;
      }).join('\n\n');
      
      await navigator.clipboard.writeText(text);
      
      // Show feedback
      const copyBtn = document.getElementById('copy-transcript-btn');
      if (copyBtn) {
        const originalHTML = copyBtn.innerHTML;
        copyBtn.innerHTML = `
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.5 2l-7.5 7.5-3.5-3.5-1.5 1.5 5 5 9-9z"/>
          </svg>
          Copied!
        `;
        copyBtn.disabled = true;
        
        setTimeout(() => {
          copyBtn.innerHTML = originalHTML;
          copyBtn.disabled = false;
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to copy transcript:', error);
      showError('Failed to copy transcript to clipboard');
    }
  }

  // Inject the transcript panel
  async function injectTranscriptPanel() {
    if (document.getElementById('yt-transcript-panel')) {
      return;
    }

    try {
      // Wait for the secondary element to exist
      const secondary = await waitForElement('#secondary.style-scope.ytd-watch-flexy', 5000);
      
      const panel = document.createElement('div');
      panel.id = 'yt-transcript-panel';
      panel.innerHTML = `
        <div class="transcript-header">
          <h3>Video Transcript</h3>
          <button id="load-transcript-btn" class="load-transcript-btn">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 1a5 5 0 110 10A5 5 0 018 3zm-.5 2.5v3h3v1h-4v-4h1z"/>
            </svg>
            Load Transcript
          </button>
          <div class="search-container" id="search-container" style="display: none;">
            <input type="text" id="transcript-search" placeholder="Search transcript...">
            <div class="transcript-options">
              <button id="copy-transcript-btn" class="copy-transcript-btn">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M4 2h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V4a2 2 0 012-2zm0 1a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V4a1 1 0 00-1-1H4z"/>
                  <path d="M11 7h3v7a2 2 0 01-2 2H5v-1h7a1 1 0 001-1V7z" opacity="0.6"/>
                </svg>
                Copy All
              </button>
              <select id="subtitle-language" style="display: none; margin-top: 8px; padding: 6px; background: var(--yt-spec-badge-chip-background); color: var(--yt-spec-text-primary); border: 1px solid var(--yt-spec-10-percent-layer); border-radius: 4px; cursor: pointer;">
              </select>
            </div>
          </div>
        </div>
        <div class="transcript-content" id="transcript-content">
          <div class="transcript-instructions">
            <p>📝 Click "Load Transcript" to fetch the video captions</p>
            <p class="transcript-tip">💡 Tip: The transcript will auto-scroll as the video plays</p>
          </div>
        </div>
      `;

      secondary.insertBefore(panel, secondary.firstChild);

      document.getElementById('load-transcript-btn').addEventListener('click', handleLoadTranscript);
      document.getElementById('transcript-search').addEventListener('input', handleSearch);
      document.getElementById('copy-transcript-btn').addEventListener('click', copyTranscriptToClipboard);

      const languageSelect = document.getElementById('subtitle-language');
      languageSelect.addEventListener('change', (e) => {
        const selectedLanguage = e.target.value;
        if (selectedLanguage) {
          handleLoadTranscript(selectedLanguage);
        }
      });
      
      console.log('✓ Transcript panel injected successfully');
    } catch (error) {
      console.error('Failed to inject transcript panel:', error);
    }
  }

  // Handle load transcript button
  async function handleLoadTranscript(languageCode = null) {
    const button = document.getElementById('load-transcript-btn');
    const searchContainer = document.getElementById('search-container');
    
    button.disabled = true;
    button.innerHTML = `
      <svg class="spinning" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0a8 8 0 108 8A8 8 0 008 0zm0 14a6 6 0 110-12 6 6 0 010 12V0z" opacity="0.3"/>
        <path d="M8 0a8 8 0 000 16V14a6 6 0 010-12V0z"/>
      </svg>
      Loading...
    `;
    
    const success = await fetchTranscript(languageCode);
    
    // Only hide button and show search if successful
    if (success) {
      button.style.display = 'none';
      searchContainer.style.display = 'block';
    } else {
      // Re-enable button for retry
      button.disabled = false;
      button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 1a5 5 0 110 10A5 5 0 018 3zm-.5 2.5v3h3v1h-4v-4h1z"/>
        </svg>
        Retry Load Transcript
      `;
    }
  }

  // Display transcript in panel
  function displayTranscript(data) {
    const container = document.getElementById('transcript-content');
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="error">No transcript entries found</div>';
      return;
    }

    container.innerHTML = data.map((entry, index) => `
      <div class="transcript-entry" data-start="${entry.start}" data-index="${index}">
        <span class="timestamp">${formatTime(entry.start)}</span>
        <span class="transcript-text">${entry.text}</span>
      </div>
    `).join('');

    container.querySelectorAll('.transcript-entry').forEach(entry => {
      entry.addEventListener('click', () => {
        const startTime = parseFloat(entry.dataset.start);
        seekToTime(startTime);
        
        // Pause auto-scroll temporarily when user clicks
        isUserScrolling = true;
        if (scrollTimeout) {
          clearTimeout(scrollTimeout);
        }
        scrollTimeout = setTimeout(() => {
          isUserScrolling = false;
        }, 2000);
      });
    });

    // Start video sync after displaying transcript
    startVideoSync();
  }

  // Handle search input
  function handleSearch(e) {
    const searchTerm = e.target.value.toLowerCase().trim();
    currentSearchTerm = searchTerm;

    if (!searchTerm) {
      displayTranscript(transcriptData);
      return;
    }

    const filtered = transcriptData.filter(entry => 
      entry.text.toLowerCase().includes(searchTerm)
    );

    if (filtered.length === 0) {
      const container = document.getElementById('transcript-content');
      container.innerHTML = '<div class="no-results">No results found</div>';
      stopVideoSync(); // Stop sync when no results
      return;
    }

    const container = document.getElementById('transcript-content');
    const escapedSearch = escapeRegex(searchTerm);
    const regex = new RegExp(`(${escapedSearch})`, 'gi');

    container.innerHTML = filtered.map((entry, index) => {
      const highlightedText = entry.text.replace(regex, '<mark>$1</mark>');
      const originalIndex = transcriptData.indexOf(entry);
      return `
        <div class="transcript-entry" data-start="${entry.start}" data-index="${originalIndex}">
          <span class="timestamp">${formatTime(entry.start)}</span>
          <span class="transcript-text">${highlightedText}</span>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.transcript-entry').forEach(entry => {
      entry.addEventListener('click', () => {
        const startTime = parseFloat(entry.dataset.start);
        seekToTime(startTime);
        
        // Pause auto-scroll temporarily when user clicks
        isUserScrolling = true;
        if (scrollTimeout) {
          clearTimeout(scrollTimeout);
        }
        scrollTimeout = setTimeout(() => {
          isUserScrolling = false;
        }, 2000);
      });
    });

    // Restart video sync with filtered results
    startVideoSync();
  }

  // Show error message
  function showError(message) {
    const container = document.getElementById('transcript-content');
    if (container) {
      container.innerHTML = `<div class="error">${message}</div>`;
    }
    
    // Don't reset button here - let handleLoadTranscript manage it
  }

  // ============================================================================
  // NAVIGATION DETECTION
  // ============================================================================

  // Watch for navigation changes (YouTube SPA)
  function watchForNavigation() {
    let lastUrl = location.href;
    
    const checkUrlChange = () => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        console.log('URL changed from', lastUrl, 'to', currentUrl);
        lastUrl = currentUrl;
        
        if (currentUrl.includes('/watch')) {
          console.log('Navigated to watch page');
          setTimeout(() => {
            init();
          }, 1000);
        }
      }
    };
    
    // Use MutationObserver to detect DOM changes (YouTube's SPA navigation)
    const observer = new MutationObserver(checkUrlChange);
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Also check on popstate (browser back/forward)
    window.addEventListener('popstate', checkUrlChange);
    
    return observer;
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  async function init() {
    if (window.location.href.includes('/watch')) {
      injectFetchHandler();
      await injectTranscriptPanel();
      resetTranscriptPanel(); // Reset panel when navigating to new video
    }
  }

  // Run on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      init();
      observerInstance = watchForNavigation();
    });
  } else {
    init();
    observerInstance = watchForNavigation();
  }

  console.log('✓ YouTube Transcript Search extension loaded');
})();
