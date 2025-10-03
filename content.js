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

  // Nueva función: Detectar si hay subtítulos activos en el reproductor
  function areSubtitlesEnabled() {
    const subtitleButton = document.querySelector('.ytp-subtitles-button');
    if (subtitleButton) {
      return subtitleButton.getAttribute('aria-pressed') === 'true';
    }
    return false;
  }

  // Nueva función: Activar subtítulos automáticamente si no están activos
  function enableSubtitles() {
    const subtitleButton = document.querySelector('.ytp-subtitles-button');
    if (subtitleButton && subtitleButton.getAttribute('aria-pressed') !== 'true') {
      console.log('Enabling subtitles automatically...');
      subtitleButton.click();
      return true;
    }
    return false;
  }

  // Nueva función: Obtener idiomas de subtítulos disponibles desde el reproductor
  function getAvailableSubtitleLanguages() {
    try {
      const player = document.getElementById('movie_player');
      if (player && typeof player.getOption === 'function') {
        const tracks = player.getOption('captions', 'tracklist');
        if (tracks && tracks.length > 0) {
          return tracks.map(track => ({
            languageCode: track.languageCode,
            languageName: track.languageName,
            isTranslatable: track.is_translatable || false
          }));
        }
      }
    } catch (error) {
      console.log('Could not get subtitle languages from player:', error);
    }
    return null;
  }

  // Wait for YouTube to load
  function init() {
    if (window.location.href.includes('/watch')) {
      // Esperar a que el reproductor esté completamente cargado
      waitForElement('#movie_player').then(() => {
        setTimeout(() => {
          injectTranscriptPanel();
        }, 1500);
      });
    }
  }

  // Nueva función: Esperar a que un elemento exista en el DOM
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

  // Inject the transcript panel into YouTube's layout
  function injectTranscriptPanel() {
    if (document.getElementById('yt-transcript-panel')) {
      return;
    }

    const secondary = document.querySelector('#secondary.style-scope.ytd-watch-flexy');
    if (!secondary) {
      console.log('Secondary column not found, retrying...');
      setTimeout(injectTranscriptPanel, 1000);
      return;
    }

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
    document.getElementById('preserve-formatting').addEventListener('change', (e) => {
      preserveFormatting = e.target.checked;
      if (transcriptData.length > 0) {
        displayTranscript(transcriptData);
      }
    });

    // Event listener para cambio de idioma
    const languageSelect = document.getElementById('subtitle-language');
    languageSelect.addEventListener('change', (e) => {
      handleLoadTranscript(e.target.value);
    });
  }

  // Handle load transcript button click (mejorado)
  async function handleLoadTranscript(languageCode = null) {
    const button = document.getElementById('load-transcript-btn');
    const searchContainer = document.getElementById('search-container');
    const container = document.getElementById('transcript-content');
    
    button.disabled = true;
    button.innerHTML = `
      <svg class="spinning" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 1a5 5 0 110 10A5 5 0 018 3zm-.5 2.5v3h3v1h-4v-4h1z" opacity="0.3"/>
        <path d="M8 2v2a4 4 0 014 4h2a6 6 0 00-6-6z"/>
      </svg>
      Loading...
    `;
    container.innerHTML = '<div class="loading">Fetching transcript...</div>';
    
    try {
      // Verificar y activar subtítulos si es necesario
      if (!areSubtitlesEnabled()) {
        console.log('Subtitles are not enabled, attempting to enable...');
        enableSubtitles();
        await new Promise(resolve => setTimeout(resolve, 500)); // Esperar a que se activen
      }

      await fetchTranscript(languageCode);
      
      if (transcriptData.length > 0) {
        searchContainer.style.display = 'block';
        button.style.display = 'none';
        
        // Mostrar selector de idiomas si hay múltiples opciones
        const languages = getAvailableSubtitleLanguages();
        if (languages && languages.length > 1) {
          populateLanguageSelector(languages);
        }
      } else {
        throw new Error('No transcript data retrieved');
      }
    } catch (error) {
      console.error('Error loading transcript:', error);
      button.disabled = false;
      button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 1a5 5 0 110 10A5 5 0 018 3zm-.5 2.5v3h3v1h-4v-4h1z"/>
        </svg>
        Try Again
      `;
    }
  }

  // Nueva función: Poblar selector de idiomas
  function populateLanguageSelector(languages) {
    const select = document.getElementById('subtitle-language');
    select.innerHTML = '<option value="">Select language...</option>';
    
    languages.forEach(lang => {
      const option = document.createElement('option');
      option.value = lang.languageCode;
      option.textContent = lang.languageName;
      select.appendChild(option);
    });
    
    select.style.display = 'block';
  }

  // Fetch transcript using YouTube's internal API (mejorado con page context)
  async function fetchTranscript(languageCode = null) {
    try {
      const videoId = getVideoId();
      if (!videoId) {
        showError('Could not find video ID');
        return;
      }

      console.log('Fetching transcript for video:', videoId, 'language:', languageCode || 'auto');

      const transcriptUrl = await getTranscriptUrl(videoId, languageCode);
      if (!transcriptUrl) {
        showError('No transcript available for this video.<br><br>💡 Make sure captions are available for this video.<br>Some videos may not have captions.');
        return;
      }

      console.log('Fetching from URL:', transcriptUrl);
      
      // Try fetching via page context using XMLHttpRequest (bypasses extension CORS)
      try {
        console.log('Trying XMLHttpRequest in page context...');
        const data = await fetchViaPageContext(transcriptUrl);
        
        if (data && data.length > 0) {
          console.log('✓ Received data via page context:', data.length, 'bytes');
          
          // Try parsing with different formats
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
        }
      } catch (error) {
        console.warn('Page context fetch failed:', error);
      }
      
      showError('Unable to fetch transcript data from YouTube.<br><br>The transcript API returned empty data.<br>This video may have restricted captions.');
    } catch (error) {
      console.error('Error fetching transcript:', error);
      if (error instanceof TranscriptError) {
        showError(error.message);
      } else {
        showError('Failed to load transcript: ' + error.message);
      }
    }
  }

  // Nueva función: Fetch via page context to bypass CORS (with better error handling)
  function fetchViaPageContext(url) {
    return new Promise((resolve, reject) => {
      const eventId = 'transcriptFetch_' + Date.now() + '_' + Math.random();
      
      console.log('Setting up fetch with eventId:', eventId);
      
      // Listen for response
      const responseHandler = (event) => {
        if (event.detail && event.detail.eventId === eventId) {
          console.log('Received response for eventId:', eventId, event.detail);
          window.removeEventListener('transcriptFetchResponse', responseHandler);
          if (event.detail.success) {
            resolve(event.detail.data);
          } else {
            reject(new Error(event.detail.error || 'Fetch failed'));
          }
        }
      };
      
      window.addEventListener('transcriptFetchResponse', responseHandler);
      
      // Dispatch request event
      console.log('Dispatching fetch request for URL:', url);
      window.dispatchEvent(new CustomEvent('transcriptFetchRequest', {
        detail: { url, eventId }
      }));
      
      // Check if page script is loaded after a short delay
      setTimeout(() => {
        if (!window.__transcriptPageScriptLoaded) {
          console.error('Page script not loaded! The page-script.js may not have been injected properly.');
        }
      }, 1000);
      
      // Timeout after 10 seconds
      setTimeout(() => {
        window.removeEventListener('transcriptFetchResponse', responseHandler);
        reject(new Error('Fetch timeout - page script may not be responding'));
      }, 10000);
    });
  }

  // Inject fetch handler into page context (with better error handling)
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
        console.error('Make sure page-script.js exists in the extension folder');
      };
      (document.head || document.documentElement).appendChild(script);
    } catch (error) {
      console.error('Error injecting page-script.js:', error);
    }
  }

  // Get video ID from URL
  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  // Constantes mejoradas
  const RE_XML_TRANSCRIPT = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;

  // Get transcript URL from YouTube's player API (VERSIÓN MEJORADA)
  async function getTranscriptUrl(videoId, languageCode = null) {
    try {
      console.log('Looking for caption tracks...');
      
      // Método 1: Intentar obtener directamente del reproductor (NUEVO)
      try {
        const player = document.getElementById('movie_player');
        if (player && typeof player.getOption === 'function') {
          const tracks = player.getOption('captions', 'tracklist');
          if (tracks && tracks.length > 0) {
            console.log('✓ Found caption tracks from player API:', tracks.length);
            
            let selectedTrack = null;
            if (languageCode) {
              selectedTrack = tracks.find(t => t.languageCode === languageCode);
            }
            if (!selectedTrack) {
              selectedTrack = tracks.find(t => t.languageCode === 'en' || t.languageCode.startsWith('en'));
            }
            if (!selectedTrack) {
              selectedTrack = tracks[0];
            }
            
            if (selectedTrack && selectedTrack.baseUrl) {
              console.log('✓ Selected track from player:', selectedTrack.languageName);
              return selectedTrack.baseUrl;
            }
          }
        }
      } catch (error) {
        console.log('Player API method failed:', error);
      }
      
      // Método 2: ytInitialPlayerResponse (más rápido y confiable)
      if (typeof ytInitialPlayerResponse !== 'undefined') {
        const playabilityStatus = ytInitialPlayerResponse.playabilityStatus;
        
        // Verificar estado del video
        if (playabilityStatus && playabilityStatus.status !== 'OK') {
          const reason = playabilityStatus.reason || 'Unknown reason';
          
          if (playabilityStatus.status === 'LOGIN_REQUIRED') {
            if (reason.includes('not a bot')) {
              throw new IpBlocked(videoId);
            }
            if (reason.includes('inappropriate') || reason.includes('age')) {
              throw new AgeRestricted(videoId);
            }
          }
          
          if (playabilityStatus.status === 'ERROR') {
            throw new VideoUnavailable(videoId);
          }
          
          if (playabilityStatus.status === 'UNPLAYABLE') {
            throw new VideoUnavailable(videoId);
          }
        }
        
        // Buscar caption tracks
        if (ytInitialPlayerResponse.captions &&
            ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer &&
            ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks) {
          const captionTracks = ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks;
          console.log('✓ Found caption tracks from ytInitialPlayerResponse:', captionTracks.length);
          
          if (captionTracks.length > 0) {
            let track = null;
            if (languageCode) {
              track = captionTracks.find(t => t.languageCode === languageCode);
            }
            if (!track) {
              track = captionTracks.find(t => t.languageCode === 'en' || t.languageCode.startsWith('en')) || captionTracks[0];
            }
            console.log('✓ Selected track:', track);
            return track.baseUrl;
          }
        }
      }

      // Método 3: Extraer de scripts
      console.log('Trying to extract from script tags...');
      const scripts = document.querySelectorAll('script');
      let captionTracks = null;

      for (let script of scripts) {
        const content = script.textContent;
        if (content.includes('captionTracks')) {
          // Varios métodos de extracción como antes
          const rendererMatch = content.match(/"playerCaptionsTracklistRenderer":\s*({[^}]*"captionTracks"[^}]*})/);
          if (rendererMatch) {
            try {
              const renderer = JSON.parse(rendererMatch[1]);
              if (renderer.captionTracks && renderer.captionTracks.length > 0) {
                captionTracks = renderer.captionTracks;
                console.log('✓ Found caption tracks from full renderer:', captionTracks);
                break;
              }
            } catch (e) {
              console.log('Failed to parse full renderer');
            }
          }
          
          if (!captionTracks) {
            const captionsMatch = content.match(/"captions":([^}]+})/);
            if (captionsMatch) {
              try {
                let captionsText = captionsMatch[0];
                const videoDetailsIndex = content.indexOf(',"videoDetails', captionsMatch.index);
                if (videoDetailsIndex > captionsMatch.index) {
                  captionsText = content.substring(captionsMatch.index, videoDetailsIndex);
                }
                
                const captionsData = JSON.parse('{' + captionsText + '}');
                if (captionsData.captions && captionsData.captions.playerCaptionsTracklistRenderer) {
                  captionTracks = captionsData.captions.playerCaptionsTracklistRenderer.captionTracks;
                  console.log('✓ Found caption tracks from captions split:', captionTracks);
                  break;
                }
              } catch (e) {
                console.log('Failed to parse captions split');
              }
            }
          }
          
          if (!captionTracks) {
            const patterns = [
              /"captionTracks":\s*(\[[^\]]+\])/,
              /"captionTracks":(\[{[^}]+}\])/,
            ];
            
            for (let pattern of patterns) {
              const match = content.match(pattern);
              if (match) {
                try {
                  captionTracks = JSON.parse(match[1]);
                  if (captionTracks && captionTracks.length > 0) {
                    console.log('✓ Found caption tracks with pattern:', captionTracks);
                    break;
                  }
                } catch (e) {
                  console.log('Failed to parse with pattern:', pattern);
                }
              }
            }
          }
          
          if (captionTracks && captionTracks.length > 0) break;
        }
      }

      // Verificar si encontramos captions
      if (!captionTracks || captionTracks.length === 0) {
        console.log('✗ No caption tracks found in any method');
        throw new TranscriptsDisabled(videoId);
      }

      // Seleccionar track preferido
      let track = null;
      if (languageCode) {
        track = captionTracks.find(t => t.languageCode === languageCode);
      }
      if (!track) {
        track = captionTracks.find(t => t.languageCode === 'en' || t.languageCode.startsWith('en')) || captionTracks[0];
      }
      console.log('✓ Selected track:', track);
      return track.baseUrl;
    } catch (error) {
      if (error instanceof TranscriptError) {
        throw error;
      }
      console.error('Error getting transcript URL:', error);
      throw error;
    }
  }

  // Parse JSON transcript format
  function parseTranscriptJSON(jsonText) {
    try {
      const jsonData = JSON.parse(jsonText);
      console.log('Parsing as JSON format');
      
      if (jsonData.events) {
        const transcript = [];
        jsonData.events.forEach(event => {
          if (event.segs) {
            const text = event.segs.map(seg => seg.utf8 || '').join('');
            if (text.trim()) {
              transcript.push({
                start: event.tStartMs / 1000,
                duration: event.dDurationMs / 1000,
                text: decodeHTMLEntities(text.trim())
              });
            }
          }
        });
        return transcript;
      }
      
      return [];
    } catch (error) {
      console.error('JSON parsing failed:', error);
      return [];
    }
  }

  // Nueva función: Parse WebVTT format
  function parseTranscriptVTT(vttText) {
    try {
      console.log('Parsing as WebVTT format');
      const lines = vttText.split('\n');
      const transcript = [];
      let currentEntry = null;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Detectar timestamp (formato: 00:00:00.000 --> 00:00:03.000)
        const timestampMatch = line.match(/^(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
        if (timestampMatch) {
          const startHours = parseInt(timestampMatch[1]);
          const startMinutes = parseInt(timestampMatch[2]);
          const startSeconds = parseInt(timestampMatch[3]);
          const startMs = parseInt(timestampMatch[4]);
          const endHours = parseInt(timestampMatch[5]);
          const endMinutes = parseInt(timestampMatch[6]);
          const endSeconds = parseInt(timestampMatch[7]);
          const endMs = parseInt(timestampMatch[8]);
          
          const start = startHours * 3600 + startMinutes * 60 + startSeconds + startMs / 1000;
          const end = endHours * 3600 + endMinutes * 60 + endSeconds + endMs / 1000;
          
          currentEntry = {
            start: start,
            duration: end - start,
            text: ''
          };
        } else if (currentEntry && line && !line.includes('WEBVTT') && !line.match(/^\d+$/)) {
          // Es texto de subtítulo
          currentEntry.text += (currentEntry.text ? ' ' : '') + decodeHTMLEntities(line);
        } else if (currentEntry && !line) {
          // Línea vacía indica fin de entrada
          if (currentEntry.text.trim()) {
            transcript.push(currentEntry);
          }
          currentEntry = null;
        }
      }
      
      // Agregar última entrada si existe
      if (currentEntry && currentEntry.text.trim()) {
        transcript.push(currentEntry);
      }
      
      console.log('Parsed VTT entries:', transcript.length);
      return transcript;
    } catch (error) {
      console.error('VTT parsing failed:', error);
      return [];
    }
  }

  // Parse XML transcript format (VERSIÓN MEJORADA)
  function parseTranscriptXML(xmlText) {
    try {
      console.log('Parsing as XML format, length:', xmlText.length);
      
      // Método 1: Usar DOMParser
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlText, 'text/xml');
      
      const parserError = xmlDoc.querySelector('parsererror');
      if (!parserError) {
        const textNodes = xmlDoc.querySelectorAll('text');
        console.log('Found text nodes with DOMParser:', textNodes.length);
        
        if (textNodes.length > 0) {
          const transcript = [];
          textNodes.forEach(node => {
            const start = parseFloat(node.getAttribute('start'));
            const duration = parseFloat(node.getAttribute('dur') || node.getAttribute('duration') || '0');
            const text = decodeHTMLEntities(node.textContent);
            
            if (text && text.trim() && !isNaN(start)) {
              transcript.push({
                start: start,
                duration: duration,
                text: text.trim()
              });
            }
          });
          
          if (transcript.length > 0) {
            console.log('✓ Parsed transcript entries with DOMParser:', transcript.length);
            return transcript;
          }
        }
      }
      
      // Método 2: Usar regex como fallback
      console.log('Trying regex parsing as fallback...');
      const results = [...xmlText.matchAll(RE_XML_TRANSCRIPT)];
      
      if (results.length > 0) {
        const transcript = results.map((result) => ({
          start: parseFloat(result[1]),
          duration: parseFloat(result[2]),
          text: decodeHTMLEntities(result[3])
        })).filter(item => item.text && item.text.trim() && !isNaN(item.start));
        
        console.log('✓ Parsed transcript entries with regex:', transcript.length);
        return transcript;
      }
      
      return [];
    } catch (error) {
      console.error('Error in parseTranscriptXML:', error);
      return [];
    }
  }

  // Decode HTML entities with optional formatting preservation
  function decodeHTMLEntities(text) {
    if (!text) return '';
    
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    let decoded = textarea.value;
    
    if (!preserveFormatting) {
      decoded = decoded.replace(/<[^>]*>/g, '');
    } else {
      const allowedTags = ['strong', 'em', 'b', 'i', 'mark', 'small', 'del', 'ins', 'sub', 'sup'];
      const regex = new RegExp(`<\\/?(?!(${allowedTags.join('|')})\\b)[^>]*>`, 'gi');
      decoded = decoded.replace(regex, '');
    }
    
    return decoded;
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

  // Display transcript in the panel
  function displayTranscript(data) {
    const container = document.getElementById('transcript-content');
    container.innerHTML = '';

    const filtered = currentSearchTerm 
      ? data.filter(item => item.text.toLowerCase().includes(currentSearchTerm.toLowerCase()))
      : data;

    if (filtered.length === 0) {
      container.innerHTML = '<div class="no-results">No results found</div>';
      return;
    }

    filtered.forEach(item => {
      const entry = document.createElement('div');
      entry.className = 'transcript-entry';
      
      const timestamp = document.createElement('span');
      timestamp.className = 'timestamp';
      timestamp.textContent = formatTime(item.start);
      timestamp.addEventListener('click', () => seekToTime(item.start));
      
      const text = document.createElement('span');
      text.className = 'transcript-text';
      
      if (currentSearchTerm) {
        const regex = new RegExp(`(${escapeRegex(currentSearchTerm)})`, 'gi');
        text.innerHTML = item.text.replace(regex, '<mark>$1</mark>');
      } else {
        text.innerHTML = item.text; // Usar innerHTML para preservar formato si está habilitado
      }
      
      entry.appendChild(timestamp);
      entry.appendChild(text);
      container.appendChild(entry);
    });
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

  // Handle search input
  function handleSearch(event) {
    currentSearchTerm = event.target.value.trim();
    displayTranscript(transcriptData);
  }

  // Show error message
  function showError(message) {
    const container = document.getElementById('transcript-content');
    if (container) {
      container.innerHTML = `<div class="error">${message}</div>`;
    }
  }

  // Debug helper function (mejorado)
  window.debugTranscript = async function() {
    console.log('=== TRANSCRIPT DEBUG INFO ===');
    console.log('Video ID:', getVideoId());
    console.log('Subtitles enabled:', areSubtitlesEnabled());
    
    // Info del reproductor
    const player = document.getElementById('movie_player');
    if (player) {
      console.log('Player found:', !!player);
      try {
        if (typeof player.getOption === 'function') {
          const tracks = player.getOption('captions', 'tracklist');
          console.log('Player caption tracks:', tracks);
        }
      } catch (e) {
        console.log('Could not get player options:', e);
      }
    }
    
    // Available languages
    const languages = getAvailableSubtitleLanguages();
    console.log('Available subtitle languages:', languages);
    
    if (typeof ytInitialPlayerResponse !== 'undefined') {
      console.log('ytInitialPlayerResponse exists');
      if (ytInitialPlayerResponse.captions) {
        console.log('Captions object:', ytInitialPlayerResponse.captions);
        if (ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer) {
          console.log('Caption tracks:', ytInitialPlayerResponse.captions.playerCaptionsTracklistRenderer.captionTracks);
        }
      } else {
        console.log('No captions in ytInitialPlayerResponse');
      }
    } else {
      console.log('ytInitialPlayerResponse not found');
    }
    
    try {
      const url = await getTranscriptUrl(getVideoId());
      console.log('Transcript URL:', url);
      
      if (url) {
        console.log('Attempting to fetch...');
        const response = await fetch(url + '&fmt=srv3');
        console.log('Response status:', response.status);
        const text = await response.text();
        console.log('Response length:', text.length);
        console.log('Response preview:', text.substring(0, 500));
      }
    } catch (e) {
      console.error('Error in debug:', e);
    }
    
    console.log('=== END DEBUG INFO ===');
  };

  // Listen for YouTube navigation (SPA) - mejorado
  let lastUrl = location.href;
  
  if (observerInstance) {
    observerInstance.disconnect();
  }
  
  observerInstance = new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      if (url.includes('/watch')) {
        transcriptData = [];
        currentSearchTerm = '';
        preserveFormatting = false;
        setTimeout(() => {
          injectTranscriptPanel();
        }, 2000);
      }
    }
  });
  
  observerInstance.observe(document, { subtree: true, childList: true });

  // Initialize
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      injectFetchHandler();
      init();
    });
  } else {
    injectFetchHandler();
    init();
  }
})();
