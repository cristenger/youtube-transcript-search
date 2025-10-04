// YouTube Transcript Search Extension - MEJORADO
(function() {
  'use strict';

  let transcriptData = [];
  let currentSearchTerm = '';
  let observerInstance = null;
  let videoTimeUpdateListener = null;
  let currentActiveIndex = -1;
  let isUserScrolling = false;
  let scrollTimeout = null;
  let isPanelMinimized = false; // Nuevo: estado del panel
  let availableLanguages = []; // Nuevo: lista de idiomas disponibles
  let currentLanguageParams = null; // Nuevo: params del idioma actual

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

  // 🆕 NUEVO: Detectar idioma de subtítulos activos en el reproductor
  function getActiveSubtitleLanguage() {
    try {
      const video = document.querySelector('video');
      if (!video || !video.textTracks) {
        console.log('No video or textTracks found');
        return null;
      }

      // Buscar el track que está activo (mode === 'showing')
      for (let i = 0; i < video.textTracks.length; i++) {
        const track = video.textTracks[i];
        if (track.mode === 'showing' && (track.kind === 'subtitles' || track.kind === 'captions')) {
          console.log('✓ Found active subtitle track:', {
            language: track.language,
            label: track.label,
            kind: track.kind
          });
          return track.language;
        }
      }

      console.log('No active subtitle track found');
      return null;
    } catch (error) {
      console.error('Error detecting active subtitle language:', error);
      return null;
    }
  }

  // 🆕 NUEVO: Obtener todos los idiomas disponibles
  function getAvailableLanguages(tracks) {
    if (!tracks || !Array.isArray(tracks)) return [];
    
    return tracks.map(track => ({
      code: track.languageCode,
      name: track.name?.simpleText || track.languageCode,
      isTranslatable: track.isTranslatable || false
    }));
  }

  // Detect user scrolling
  function handleUserScroll() {
    isUserScrolling = true;
    
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    
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
    
    let activeIndex = -1;
    for (let i = transcriptData.length - 1; i >= 0; i--) {
      if (currentTime >= transcriptData[i].start) {
        activeIndex = i;
        break;
      }
    }

    if (activeIndex !== currentActiveIndex) {
      currentActiveIndex = activeIndex;
      highlightActiveEntry(activeIndex);
    }
  }

  // Highlight the active entry and scroll to it
  function highlightActiveEntry(index) {
    const container = document.getElementById('transcript-content');
    if (!container) return;

    const prevActive = container.querySelector('.transcript-entry.active');
    if (prevActive) {
      prevActive.classList.remove('active');
    }

    if (index >= 0) {
      const entries = container.querySelectorAll('.transcript-entry');
      if (entries[index]) {
        entries[index].classList.add('active');
        
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

    if (videoTimeUpdateListener) {
      video.removeEventListener('timeupdate', videoTimeUpdateListener);
    }

    videoTimeUpdateListener = () => updateActiveTranscript();
    video.addEventListener('timeupdate', videoTimeUpdateListener);

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

  // 🆕 NUEVO: Poblar el dropdown de idiomas
  function populateLanguageSelector() {
    const languageSelect = document.getElementById('language-selector');
    if (!languageSelect) return;
    
    if (availableLanguages.length === 0) {
      languageSelect.style.display = 'none';
      return;
    }
    
    // Limpiar opciones existentes
    languageSelect.innerHTML = '';
    
    // Agregar opciones
    availableLanguages.forEach((lang, index) => {
      const option = document.createElement('option');
      option.value = index.toString();
      option.textContent = lang.name;
      if (lang.isSelected) {
        option.selected = true;
      }
      languageSelect.appendChild(option);
    });
    
    languageSelect.style.display = 'block';
    console.log(`✓ Language selector populated with ${availableLanguages.length} languages`);
  }

  // 🆕 NUEVO: Manejar cambio de idioma desde el dropdown
  async function handleLanguageChange(event) {
    const selectedIndex = parseInt(event.target.value);
    const selectedLang = availableLanguages[selectedIndex];
    
    if (!selectedLang || !selectedLang.params) {
      console.error('Invalid language selection');
      return;
    }
    
    console.log(`🌐 Changing language to: ${selectedLang.name}`);
    
    // Mostrar estado de carga
    const container = document.getElementById('transcript-content');
    if (container) {
      container.innerHTML = `
        <div class="loading">
          <p>🔄 Loading ${selectedLang.name} transcript...</p>
        </div>
      `;
    }
    
    // Limpiar datos actuales
    stopVideoSync();
    transcriptData = [];
    currentSearchTerm = '';
    
    const searchInput = document.getElementById('transcript-search');
    if (searchInput) searchInput.value = '';
    
    // Obtener transcripción en el nuevo idioma
    try {
      // Necesitamos ytData para hacer la solicitud
      const pageData = await extractDataFromPageContext();
      
      if (!pageData.ytInitialData) {
        throw new Error('Could not get page data');
      }
      
      // Temporalmente guardar los params seleccionados
      currentLanguageParams = selectedLang.params;
      
      // Hacer la solicitud con los nuevos params
      const hl = pageData.ytInitialData.topbar?.desktopTopbarRenderer?.searchbox?.fusionSearchboxRenderer?.config?.webSearchboxConfig?.requestLanguage || "en";
      const clientData = pageData.ytInitialData.responseContext?.serviceTrackingParams?.[0]?.params;
      const visitorData = pageData.ytInitialData.responseContext?.webResponseContextExtensionData?.ytConfigData?.visitorData;
      
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
        params: selectedLang.params
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
        throw new Error(`API request failed: ${res.status}`);
      }
      
      const json = await res.json();
      const segments = json.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer
        ?.content?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments || [];
      
      if (segments.length === 0) {
        throw new Error('No segments found');
      }
      
      transcriptData = segments.map(item => {
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
      
      console.log(`✓ Loaded ${transcriptData.length} entries in ${selectedLang.name}`);
      displayTranscript(transcriptData);
      
    } catch (error) {
      console.error('Error changing language:', error);
      showError(`Failed to load transcript in ${selectedLang.name}<br><br>Please try another language or refresh.`);
    }
  }
  function togglePanelMinimize() {
    const panel = document.getElementById('yt-transcript-panel');
    const content = document.getElementById('transcript-content');
    const searchContainer = document.getElementById('search-container');
    const toggleBtn = document.getElementById('minimize-panel-btn');
    
    if (!panel || !content || !toggleBtn) return;

    isPanelMinimized = !isPanelMinimized;

    if (isPanelMinimized) {
      content.style.display = 'none';
      if (searchContainer) searchContainer.style.display = 'none';
      toggleBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 4l4 4H4l4-4z"/>
        </svg>
      `;
      toggleBtn.title = 'Expand transcript';
      panel.style.maxHeight = '60px';
    } else {
      content.style.display = 'block';
      if (searchContainer && transcriptData.length > 0) {
        searchContainer.style.display = 'block';
      }
      toggleBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 8l4 4 4-4H4z"/>
        </svg>
      `;
      toggleBtn.title = 'Minimize transcript';
      panel.style.maxHeight = '';
    }
  }

  // ============================================================================
  // PAGE SCRIPT INJECTION
  // ============================================================================

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

  async function getTranscriptFromPanel(ytData, languageCode = null) {
    try {
      // Find the transcript panel
      const panels = ytData?.engagementPanels || [];
      const transcriptPanel = panels.find(p =>
        p.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint
      );
      
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
      
      // 🆕 Extraer lista de idiomas disponibles
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
        console.log('⚠️ No language options found');
      }
      
      // Determinar qué params usar
      let targetParams = initialParams;
      
      if (languageCode && availableLanguages.length > 0) {
        // Buscar idioma específico solicitado
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
        // Guardar los params del idioma actual (por defecto)
        currentLanguageParams = targetParams;
      }
      
      // Si cambiamos de idioma, hacer segunda solicitud
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
      
      // Extraer segmentos
      const segments = finalJson.actions?.[0]?.updateEngagementPanelAction?.content?.transcriptRenderer
        ?.content?.transcriptSearchPanelRenderer?.body?.transcriptSegmentListRenderer?.initialSegments || [];
      
      if (segments.length === 0) {
        console.warn('⚠️ API returned empty segments');
        return [];
      }
      
      const transcriptData = segments.map(item => {
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
      
      console.log(`✓ Extracted ${transcriptData.length} transcript entries`);
      return transcriptData;
      
    } catch (error) {
      console.error('❌ Error in getTranscriptFromPanel:', error);
      throw error;
    }
  }

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

  // 🆕 MODIFICADO: Mejorada la lógica de selección de idioma
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
      
      // 🆕 NUEVO: Detectar idioma activo si no se especificó uno
      let targetLanguage = languageCode;
      if (!targetLanguage) {
        const activeLanguage = getActiveSubtitleLanguage();
        if (activeLanguage) {
          console.log('✓ Detected active subtitle language:', activeLanguage);
          targetLanguage = activeLanguage;
        }
      }

      console.log('🔍 Attempting to extract from page context...');
      const pageData = await extractDataFromPageContext();
      
      // 🆕 PRIORIDAD 1: Try transcript panel method first (MOST RELIABLE)
      if (pageData.ytInitialData) {
        const panels = pageData.ytInitialData?.engagementPanels || [];
        const transcriptPanel = panels.find(p =>
          p.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint
        );
        
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
      
      // 🆕 PRIORIDAD 2: Try to get from caption tracks but DON'T use timedtext API
      // Instead, try to extract directly from player or use alternative method
      console.log('🎥 Attempting to extract captions from video player...');
      const captionsFromPlayer = await extractCaptionsFromPlayer();
      if (captionsFromPlayer && captionsFromPlayer.length > 0) {
        console.log(`✓ Extracted ${captionsFromPlayer.length} entries from player`);
        return captionsFromPlayer;
      }
      
      // 🆕 PRIORIDAD 3: Last resort - fetch page HTML and try panel method
      console.log('⚠️ Last resort: Fetching page HTML...');
      try {
        const response = await fetch(window.location.href);
        const html = await response.text();
        
        // Try to extract ytInitialData from HTML
        let ytData = extractJsonFromHtml(html, "ytInitialData");
        
        if (ytData) {
          const panels = ytData?.engagementPanels || [];
          const hasTranscriptPanel = panels.some(p =>
            p.engagementPanelSectionListRenderer?.content?.continuationItemRenderer?.continuationEndpoint?.getTranscriptEndpoint
          );
          
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
      throw new TranscriptsDisabled(videoId);
      
    } catch (error) {
      console.error('Error getting transcript URL:', error);
      throw error;
    }
  }

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

  function parseTranscriptXML(xmlText) {
    const matches = [...xmlText.matchAll(RE_XML_TRANSCRIPT)];
    return matches.map(match => ({
      start: parseFloat(match[1]),
      duration: parseFloat(match[2]),
      text: decodeHTMLEntities(match[3])
    }));
  }

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

      console.log('Fetching transcript for video:', videoId, 'language:', languageCode || 'auto-detect');

      const result = await getTranscriptUrl(videoId, languageCode);
      
      if (Array.isArray(result)) {
        transcriptData = result;
        console.log(`✓ Loaded transcript, entries: ${transcriptData.length}`);
        displayTranscript(transcriptData);
        return true;
      }
      
      const transcriptUrl = result;
      if (!transcriptUrl) {
        showError('No transcript available for this video.<br><br>💡 Make sure captions are available.');
        return false;
      }

      console.log('Fetching from URL:', transcriptUrl);
      
      const urlWithFormat = transcriptUrl.includes('?') 
        ? `${transcriptUrl}&fmt=json3` 
        : `${transcriptUrl}?fmt=json3`;
      
      const data = await fetchViaPageContext(urlWithFormat);
      
      if (!data || data.length === 0) {
        console.error('Empty response from transcript URL');
        showError('The transcript API returned empty data.<br><br>💡 Try enabling subtitles and retry.');
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
      
      showError('Could not parse transcript data.');
      return false;
    } catch (error) {
      console.error('Error fetching transcript:', error);
      if (error instanceof TranscriptError) {
        showError(error.message);
      } else {
        showError('Failed to load transcript: ' + error.message);
      }
      return false;
    }
  }

  // ============================================================================
  // UI FUNCTIONS
  // ============================================================================

  function resetTranscriptPanel() {
    const panel = document.getElementById('yt-transcript-panel');
    if (!panel) return;
    
    console.log('Resetting transcript panel for new video');
    
    stopVideoSync();
    
    transcriptData = [];
    currentSearchTerm = '';
    isPanelMinimized = false;
    availableLanguages = [];
    currentLanguageParams = null;
    
    const button = document.getElementById('load-transcript-btn');
    const refreshBtn = document.getElementById('refresh-transcript-btn');
    const searchContainer = document.getElementById('search-container');
    const languageSelectorContainer = document.getElementById('language-selector-container');
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

    if (refreshBtn) {
      refreshBtn.style.display = 'none';
    }
    
    if (languageSelectorContainer) {
      languageSelectorContainer.style.display = 'none';
    }
    
    if (searchContainer) {
      searchContainer.style.display = 'none';
      const searchInput = document.getElementById('transcript-search');
      if (searchInput) searchInput.value = '';
    }
    
    if (container) {
      container.style.display = 'block';
      container.innerHTML = `
        <div class="transcript-instructions">
          <p>📝 Click "Load Transcript" to fetch the video captions</p>
          <p class="transcript-tip">💡 Tip: You can select different languages after loading</p>
        </div>
      `;
    }
  }

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

  async function injectTranscriptPanel() {
    if (document.getElementById('yt-transcript-panel')) {
      return;
    }

    try {
      const secondary = await waitForElement('#secondary.style-scope.ytd-watch-flexy', 5000);
      
      const panel = document.createElement('div');
      panel.id = 'yt-transcript-panel';
      panel.innerHTML = `
        <div class="transcript-header">
          <div class="transcript-header-top">
            <h3>Video Transcript</h3>
            <button id="minimize-panel-btn" class="minimize-panel-btn" title="Minimize transcript">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 8l4 4 4-4H4z"/>
              </svg>
            </button>
          </div>
          <button id="load-transcript-btn" class="load-transcript-btn">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 1a5 5 0 110 10A5 5 0 018 3zm-.5 2.5v3h3v1h-4v-4h1z"/>
            </svg>
            Load Transcript
          </button>
          <button id="refresh-transcript-btn" class="refresh-transcript-btn" style="display: none;" title="Refresh and reload transcript">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M13.65 2.35A8 8 0 1 0 16 8h-2a6 6 0 1 1-1.76-4.24L10 6h6V0l-2.35 2.35z"/>
            </svg>
            Refresh Transcript
          </button>
          <div class="language-selector-container" id="language-selector-container" style="display: none;">
            <label for="language-selector" class="language-label">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" style="margin-right: 6px;">
                <path d="M8 0a8 8 0 110 16A8 8 0 018 0zM4.5 7.5a.5.5 0 000 1h5.793l-2.147 2.146a.5.5 0 00.708.708l3-3a.5.5 0 000-.708l-3-3a.5.5 0 10-.708.708L10.293 7.5H4.5z"/>
              </svg>
              Language:
            </label>
            <select id="language-selector" class="language-selector"></select>
          </div>
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
            </div>
          </div>
        </div>
        <div class="transcript-content" id="transcript-content">
          <div class="transcript-instructions">
            <p>📝 Click "Load Transcript" to fetch the video captions</p>
            <p class="transcript-tip">💡 Tip: You can select different languages after loading</p>
          </div>
        </div>
      `;

      secondary.insertBefore(panel, secondary.firstChild);

      document.getElementById('load-transcript-btn').addEventListener('click', handleLoadTranscript);
      document.getElementById('refresh-transcript-btn').addEventListener('click', handleRefreshTranscript);
      document.getElementById('minimize-panel-btn').addEventListener('click', togglePanelMinimize);
      document.getElementById('transcript-search').addEventListener('input', handleSearch);
      document.getElementById('copy-transcript-btn').addEventListener('click', copyTranscriptToClipboard);
      document.getElementById('language-selector').addEventListener('change', handleLanguageChange);
      
      console.log('✓ Transcript panel injected successfully');
    } catch (error) {
      console.error('Failed to inject transcript panel:', error);
    }
  }

  async function handleLoadTranscript(event) {
    // 🔧 FIX: Ignorar el evento del navegador, usar languageCode como null por defecto
    const languageCode = (event && typeof event === 'string') ? event : null;
    
    const button = document.getElementById('load-transcript-btn');
    const refreshBtn = document.getElementById('refresh-transcript-btn');
    const searchContainer = document.getElementById('search-container');
    const languageSelectorContainer = document.getElementById('language-selector-container');
    
    button.disabled = true;
    button.innerHTML = `
      <svg class="spinning" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0a8 8 0 108 8A8 8 0 008 0zm0 14a6 6 0 110-12 6 6 0 010 12V0z" opacity="0.3"/>
        <path d="M8 0a8 8 0 000 16V14a6 6 0 010-12V0z"/>
      </svg>
      Loading...
    `;
    
    const success = await fetchTranscript(languageCode);
    
    if (success) {
      button.style.display = 'none';
      if (refreshBtn) refreshBtn.style.display = 'block';
      searchContainer.style.display = 'block';
      
      // 🆕 Mostrar selector de idiomas si hay múltiples idiomas
      if (availableLanguages.length > 1) {
        populateLanguageSelector();
        if (languageSelectorContainer) {
          languageSelectorContainer.style.display = 'flex';
        }
      }
    } else {
      button.disabled = false;
      button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 1a5 5 0 110 10A5 5 0 018 3zm-.5 2.5v3h3v1h-4v-4h1z"/>
        </svg>
        Retry Load Transcript
      `;
    }
  }

  // 🆕 NUEVO: Manejar el botón de refresh
  async function handleRefreshTranscript(event) {
    // 🔧 FIX: Ignorar el evento del navegador
    const refreshBtn = document.getElementById('refresh-transcript-btn');
    const searchContainer = document.getElementById('search-container');
    const languageSelectorContainer = document.getElementById('language-selector-container');
    const container = document.getElementById('transcript-content');
    
    if (!refreshBtn) return;
    
    refreshBtn.disabled = true;
    const originalHTML = refreshBtn.innerHTML;
    refreshBtn.innerHTML = `
      <svg class="spinning" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 0a8 8 0 108 8A8 8 0 008 0zm0 14a6 6 0 110-12 6 6 0 010 12V0z" opacity="0.3"/>
        <path d="M8 0a8 8 0 000 16V14a6 6 0 010-12V0z"/>
      </svg>
      Refreshing...
    `;
    
    // Limpiar datos actuales
    stopVideoSync();
    transcriptData = [];
    currentSearchTerm = '';
    availableLanguages = [];
    currentLanguageParams = null;
    
    if (container) {
      container.innerHTML = `
        <div class="loading">
          <p>🔄 Refreshing transcript...</p>
          <p class="transcript-tip">Detecting active subtitle language...</p>
        </div>
      `;
    }
    
    // Buscar input de búsqueda y limpiar
    const searchInput = document.getElementById('transcript-search');
    if (searchInput) searchInput.value = '';
    
    // Recargar transcripción (auto-detectará el idioma activo)
    const success = await fetchTranscript(null); // Pasar null explícitamente
    
    refreshBtn.disabled = false;
    refreshBtn.innerHTML = originalHTML;
    
    if (success) {
      // Mostrar selector de idiomas si hay múltiples idiomas
      if (availableLanguages.length > 1) {
        populateLanguageSelector();
        if (languageSelectorContainer) {
          languageSelectorContainer.style.display = 'flex';
        }
      }
    } else {
      // Si falla, mostrar el botón de carga nuevamente
      const loadBtn = document.getElementById('load-transcript-btn');
      if (loadBtn) {
        loadBtn.style.display = 'block';
        refreshBtn.style.display = 'none';
        searchContainer.style.display = 'none';
        if (languageSelectorContainer) {
          languageSelectorContainer.style.display = 'none';
        }
      }
    }
  }

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
        
        isUserScrolling = true;
        if (scrollTimeout) {
          clearTimeout(scrollTimeout);
        }
        scrollTimeout = setTimeout(() => {
          isUserScrolling = false;
        }, 2000);
      });
    });

    startVideoSync();
  }

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
      stopVideoSync();
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
        
        isUserScrolling = true;
        if (scrollTimeout) {
          clearTimeout(scrollTimeout);
        }
        scrollTimeout = setTimeout(() => {
          isUserScrolling = false;
        }, 2000);
      });
    });

    startVideoSync();
  }

  function showError(message) {
    const container = document.getElementById('transcript-content');
    if (container) {
      container.innerHTML = `
        <div class="error">
          ${message}
          <br><br>
          <strong>💡 Troubleshooting tips:</strong><br>
          1. Check if the video has captions available<br>
          2. Try opening YouTube's native transcript panel (click ⋯ → Show transcript)<br>
          3. Enable subtitles manually and click "Retry"<br>
          4. Some videos may have transcripts disabled by the uploader
        </div>
      `;
    }
  }

  // ============================================================================
  // NAVIGATION DETECTION
  // ============================================================================

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
    
    const observer = new MutationObserver(checkUrlChange);
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
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
      resetTranscriptPanel();
    }
  }

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