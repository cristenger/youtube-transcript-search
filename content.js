// YouTube Transcript Search Extension
(function() {
  'use strict';

  let transcriptData = [];
  let currentSearchTerm = '';
  let preserveFormatting = false;
  let observerInstance = null;

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

  // Decode HTML entities with optional formatting preservation
  function decodeHTMLEntities(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    let decoded = textarea.value;
    
    if (!preserveFormatting) {
      decoded = decoded.replace(/\n/g, ' ').replace(/\s+/g, ' ');
    }
    
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
      
      console.log('Setting up fetch with eventId:', eventId);
      
      const responseHandler = (event) => {
        if (event.detail && event.detail.eventId === eventId) {
          console.log('Received response for eventId:', eventId);
          window.removeEventListener('transcriptFetchResponse', responseHandler);
          if (event.detail.success) {
            resolve(event.detail.data);
          } else {
            reject(new Error(event.detail.error || 'Fetch failed'));
          }
        }
      };
      
      window.addEventListener('transcriptFetchResponse', responseHandler);
      
      console.log('Dispatching fetch request for URL:', url);
      window.dispatchEvent(new CustomEvent('transcriptFetchRequest', {
        detail: { url, eventId }
      }));
      
      setTimeout(() => {
        window.removeEventListener('transcriptFetchResponse', responseHandler);
        reject(new Error('Fetch timeout'));
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
      
      return await extractTranscriptFromPage(videoId, languageCode);
      
    } catch (error) {
      console.error('Error getting transcript URL:', error);
      throw error;
    }
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
        return;
      }

      console.log('Fetching transcript for video:', videoId, 'language:', languageCode || 'auto');

      const result = await getTranscriptUrl(videoId, languageCode);
      
      if (Array.isArray(result)) {
        transcriptData = result;
        console.log(`✓ Loaded transcript directly from panel, entries: ${transcriptData.length}`);
        displayTranscript(transcriptData);
        return;
      }
      
      const transcriptUrl = result;
      if (!transcriptUrl) {
        showError('No transcript available for this video.<br><br>💡 Make sure captions are available for this video.');
        return;
      }

      console.log('Fetching from URL:', transcriptUrl);
      
      const urlWithFormat = transcriptUrl.includes('?') 
        ? `${transcriptUrl}&fmt=json3` 
        : `${transcriptUrl}?fmt=json3`;
      
      const data = await fetchViaPageContext(urlWithFormat);
      
      if (!data || data.length === 0) {
        console.error('Empty response from transcript URL');
        showError('The transcript API returned empty data.');
        return;
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
            return;
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
            return;
          }
        } catch (e) {
          console.warn(`Failed to parse as ${parser.name}:`, e);
        }
      }
      
      showError('Could not parse transcript data.');
    } catch (error) {
      console.error('Error fetching transcript:', error);
      if (error instanceof TranscriptError) {
        showError(error.message);
      } else {
        showError('Failed to load transcript: ' + error.message);
      }
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
          <p class="transcript-tip">💡 Tip: Subtitles will be enabled automatically if needed</p>
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
              <label style="display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--yt-spec-text-secondary, #aaa); cursor: pointer;">
                <input type="checkbox" id="preserve-formatting" style="cursor: pointer;">
                Preserve text formatting
              </label>
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
            <p class="transcript-tip">💡 Tip: Subtitles will be enabled automatically if needed</p>
          </div>
        </div>
      `;

      secondary.insertBefore(panel, secondary.firstChild);

      document.getElementById('load-transcript-btn').addEventListener('click', handleLoadTranscript);
      document.getElementById('transcript-search').addEventListener('input', handleSearch);
      document.getElementById('copy-transcript-btn').addEventListener('click', copyTranscriptToClipboard);
      document.getElementById('preserve-formatting').addEventListener('change', (e) => {
        preserveFormatting = e.target.checked;
        if (transcriptData.length > 0) {
          displayTranscript(transcriptData);
          if (currentSearchTerm) {
            handleSearch({ target: { value: currentSearchTerm } });
          }
        }
      });

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
        <path d="M8 0a8 8 0 108 8A8 8 0 008 0zm0 14a6 6 0 110-12 6 6 0 010 12z" opacity="0.3"/>
        <path d="M8 0a8 8 0 000 16V14a6 6 0 010-12V0z"/>
      </svg>
      Loading...
    `;
    
    await fetchTranscript(languageCode);
    
    button.style.display = 'none';
    searchContainer.style.display = 'block';
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
      <div class="transcript-entry" data-start="${entry.start}">
        <span class="timestamp">${formatTime(entry.start)}</span>
        <span class="transcript-text">${entry.text}</span>
      </div>
    `).join('');

    container.querySelectorAll('.transcript-entry').forEach(entry => {
      entry.addEventListener('click', () => {
        const startTime = parseFloat(entry.dataset.start);
        seekToTime(startTime);
      });
    });
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
      return;
    }

    const container = document.getElementById('transcript-content');
    const escapedSearch = escapeRegex(searchTerm);
    const regex = new RegExp(`(${escapedSearch})`, 'gi');

    container.innerHTML = filtered.map(entry => {
      const highlightedText = entry.text.replace(regex, '<mark>$1</mark>');
      return `
        <div class="transcript-entry" data-start="${entry.start}">
          <span class="timestamp">${formatTime(entry.start)}</span>
          <span class="transcript-text">${highlightedText}</span>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.transcript-entry').forEach(entry => {
      entry.addEventListener('click', () => {
        const startTime = parseFloat(entry.dataset.start);
        seekToTime(startTime);
      });
    });
  }

  // Show error message
  function showError(message) {
    const container = document.getElementById('transcript-content');
    if (container) {
      container.innerHTML = `<div class="error">${message}</div>`;
    }
    
    const button = document.getElementById('load-transcript-btn');
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
