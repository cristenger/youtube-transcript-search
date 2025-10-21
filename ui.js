// UI Module
// Functions to manage the transcript panel interface

const TranscriptUI = (function() {
  'use strict';

  let transcriptData = [];
  let currentSearchTerm = '';
  let isPanelMinimized = false;
  let availableLanguages = [];

  // Event handlers storage
  let eventHandlers = {
    onLoadTranscript: null,
    onRefreshTranscript: null,
    onLanguageChange: null
  };

  /**
   * Set transcript data
   * @param {Array} data - Transcript data array
   */
  function setTranscriptData(data) {
    transcriptData = data || [];
  }

  /**
   * Get transcript data
   * @returns {Array} Transcript data
   */
  function getTranscriptData() {
    return transcriptData;
  }

  /**
   * Clear transcript data
   */
  function clearTranscriptData() {
    transcriptData = [];
    currentSearchTerm = '';
  }

  /**
   * Set available languages
   * @param {Array} languages - Array of language objects
   */
  function setAvailableLanguages(languages) {
    availableLanguages = languages || [];
  }

  /**
   * Set event handlers
   * @param {Object} handlers - Object with handler functions
   */
  function setEventHandlers(handlers) {
    eventHandlers = { ...eventHandlers, ...handlers };
  }

  /**
   * Reset transcript panel to initial state
   */
  function resetTranscriptPanel() {
    const panel = document.getElementById('yt-transcript-panel');
    if (!panel) return;
    
    // Stop video sync
    VideoSync.stopVideoSync();
    
    // Clear state
    transcriptData = [];
    currentSearchTerm = '';
    isPanelMinimized = false;
    availableLanguages = [];
    
    const button = document.getElementById('load-transcript-btn');
    const refreshBtn = document.getElementById('refresh-transcript-btn');
    const searchContainer = document.getElementById('search-container');
    const languageSelectorContainer = document.getElementById('language-selector-container');
    const container = document.getElementById('transcript-content');
    const minimizeBtn = document.getElementById('minimize-panel-btn');
    
    // Restore load button
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

    // Hide refresh button
    if (refreshBtn) {
      refreshBtn.style.display = 'none';
      refreshBtn.disabled = false;
    }
    
    // Hide language selector
    if (languageSelectorContainer) {
      languageSelectorContainer.style.display = 'none';
      const languageSelect = document.getElementById('language-selector');
      if (languageSelect) {
        languageSelect.innerHTML = '';
      }
    }
    
    // Hide and clear search
    if (searchContainer) {
      searchContainer.style.display = 'none';
      const searchInput = document.getElementById('transcript-search');
      if (searchInput) {
        searchInput.value = '';
      }
    }
    
    // Restore panel state (expanded)
    if (minimizeBtn) {
      minimizeBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 8l4 4 4-4H4z"/>
        </svg>
      `;
      minimizeBtn.title = 'Minimize transcript';
    }
    
    if (panel) {
      panel.style.maxHeight = '';
    }
    
    // Clear content and show instructions
    if (container) {
      container.style.display = 'block';
      
      // Force complete cleanup
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      
      container.innerHTML = `
        <div class="transcript-instructions">
          <p>📝 Click "Load Transcript" to fetch the video captions</p>
          <p class="transcript-tip">💡 Tip: You can select different languages after loading</p>
        </div>
      `;
      
      // Remove all scroll listeners by cloning
      const newContainer = container.cloneNode(true);
      container.parentNode.replaceChild(newContainer, container);
    }
  }

  /**
   * Toggle panel minimize/expand
   */
  function togglePanelMinimize() {
    const panel = document.getElementById('yt-transcript-panel');
    const content = document.getElementById('transcript-content');
    const searchContainer = document.getElementById('search-container');
    const toggleBtn = document.getElementById('minimize-panel-btn');
    
    if (!panel || !content || !toggleBtn) return;

    isPanelMinimized = !isPanelMinimized;

    if (isPanelMinimized) {
      // Minimize
      content.style.display = 'none';
      if (searchContainer) searchContainer.style.display = 'none';
      toggleBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M4 8l4-4 4 4H4z"/>
        </svg>
      `;
      toggleBtn.title = 'Expand transcript';
      panel.style.maxHeight = 'auto';
    } else {
      // Expand
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

  /**
   * Populate language selector dropdown
   */
  function populateLanguageSelector() {
    const languageSelect = document.getElementById('language-selector');
    const languageSelectorContainer = document.getElementById('language-selector-container');
    
    if (!languageSelect || !languageSelectorContainer) return;
    
    if (availableLanguages.length === 0) {
      languageSelectorContainer.style.display = 'none';
      return;
    }
    
    // Clear existing options
    languageSelect.innerHTML = '';
    
    // Add options
    availableLanguages.forEach((lang, index) => {
      const option = document.createElement('option');
      option.value = index;
      option.textContent = lang.name;
      if (lang.isSelected) {
        option.selected = true;
      }
      languageSelect.appendChild(option);
    });
    
    languageSelectorContainer.style.display = 'flex';
  }

  /**
   * Display transcript entries
   * @param {Array} data - Transcript data to display
   */
  function displayTranscript(data) {
    const container = document.getElementById('transcript-content');
    if (!container) return;

    if (!data || data.length === 0) {
      container.innerHTML = '<div class="error">No transcript entries found</div>';
      return;
    }

    const currentVideoId = TranscriptUtils.getVideoId();
    if (!currentVideoId) {
      console.warn('⚠️ No video ID found, cannot display transcript');
      return;
    }

    container.innerHTML = data.map((entry, index) => `
      <div class="transcript-entry" data-start="${entry.start}" data-index="${index}">
        <span class="timestamp">${TranscriptUtils.formatTime(entry.start)}</span>
        <span class="transcript-text">${entry.text}</span>
      </div>
    `).join('');

    container.querySelectorAll('.transcript-entry').forEach(entry => {
      entry.addEventListener('click', () => {
        const startTime = parseFloat(entry.dataset.start);
        VideoSync.seekToTime(startTime);
        
        // Mark as manual scrolling for shorter time on click
        VideoSync.handleUserScroll();
      });
    });

    VideoSync.startVideoSync(transcriptData);
  }

  /**
   * Handle search input
   * @param {Event} e - Input event
   */
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
      VideoSync.stopVideoSync();
      return;
    }

    const container = document.getElementById('transcript-content');
    const escapedSearch = TranscriptUtils.escapeRegex(searchTerm);
    const regex = new RegExp(`(${escapedSearch})`, 'gi');

    container.innerHTML = filtered.map((entry, index) => {
      const highlightedText = entry.text.replace(regex, '<mark>$1</mark>');
      const originalIndex = transcriptData.indexOf(entry);
      return `
        <div class="transcript-entry" data-start="${entry.start}" data-index="${originalIndex}">
          <span class="timestamp">${TranscriptUtils.formatTime(entry.start)}</span>
          <span class="transcript-text">${highlightedText}</span>
        </div>
      `;
    }).join('');

    container.querySelectorAll('.transcript-entry').forEach(entry => {
      entry.addEventListener('click', () => {
        const startTime = parseFloat(entry.dataset.start);
        VideoSync.seekToTime(startTime);
        VideoSync.handleUserScroll();
      });
    });

    VideoSync.startVideoSync(transcriptData);
  }

  /**
   * Show error message
   * @param {string} message - Error message to display
   */
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

  /**
   * Show loading state
   * @param {string} message - Loading message
   */
  function showLoading(message = 'Loading transcript...') {
    const container = document.getElementById('transcript-content');
    if (container) {
      container.innerHTML = `
        <div class="loading">
       <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
  <path d="M8 3V1.21c0-.45-.54-.67-.85-.35l-2 2a.5.5 0 0 0 0 .71l2 2c.31.31.85.09.85-.36V3.5A4.5 4.5 0 1 1 3.5 8H2a6 6 0 1 0 6-5z"/>
  <path d="M8 13v1.79c0 .45.54.67.85.35l2-2a.5.5 0 0 0 0-.71l-2-2c-.31-.31-.85-.09-.85.36V13z"/>
</svg>
          <p>${message}</p>
        </div>
      `;
    }
  }

  /**
   * Copy transcript to clipboard
   */
  async function copyTranscriptToClipboard() {
    if (!transcriptData || transcriptData.length === 0) {
      return;
    }
    
    try {
      const text = transcriptData.map(entry => {
        const timestamp = TranscriptUtils.formatTime(entry.start);
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

  /**
   * Inject transcript panel into page with retry logic
   * @param {number} maxRetries - Maximum number of retry attempts
   * @param {number} retryDelay - Delay between retries in milliseconds
   */
  async function injectTranscriptPanel(maxRetries = 2, retryDelay = 1500) {
    if (document.getElementById('yt-transcript-panel')) {
      console.log('✓ Transcript panel already exists');
      return;
    }

    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`🔄 Retry attempt ${attempt}/${maxRetries} to inject transcript panel...`);
          // Wait before retrying
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        } else {
          console.log('🎯 Attempting to inject transcript panel...');
        }

        // Increase timeout for better reliability (8 seconds)
        const secondary = await TranscriptUtils.waitForElement('#secondary.style-scope.ytd-watch-flexy', 8000);

        console.log('✓ Found #secondary element, injecting panel...');

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

        // Attach event listeners
        document.getElementById('load-transcript-btn').addEventListener('click', eventHandlers.onLoadTranscript);
        document.getElementById('refresh-transcript-btn').addEventListener('click', eventHandlers.onRefreshTranscript);
        document.getElementById('minimize-panel-btn').addEventListener('click', togglePanelMinimize);
        document.getElementById('transcript-search').addEventListener('input', handleSearch);
        document.getElementById('copy-transcript-btn').addEventListener('click', copyTranscriptToClipboard);
        document.getElementById('language-selector').addEventListener('change', eventHandlers.onLanguageChange);

        console.log('✓ Transcript panel injected successfully');
        return; // Success - exit function

      } catch (error) {
        lastError = error;
        console.warn(`⚠️ Attempt ${attempt + 1}/${maxRetries + 1} failed:`, error.message);

        // If this was the last attempt, log final error
        if (attempt === maxRetries) {
          console.error('❌ Failed to inject transcript panel after', maxRetries + 1, 'attempts:', error);
        }
      }
    }

    // If we got here, all retries failed
    console.error('❌ Could not inject transcript panel. YouTube sidebar may not have loaded yet.');
  }

  /**
   * Update UI after loading transcript
   */
  function updateUIAfterLoad() {
    const button = document.getElementById('load-transcript-btn');
    const refreshBtn = document.getElementById('refresh-transcript-btn');
    const searchContainer = document.getElementById('search-container');

    if (button) {
      button.style.display = 'none';
    }

    if (refreshBtn) {
      refreshBtn.style.display = 'block';
    }

    if (searchContainer) {
      searchContainer.style.display = 'block';
    }

    populateLanguageSelector();
  }

  // Public API
  return {
    setTranscriptData,
    getTranscriptData,
    clearTranscriptData,
    setAvailableLanguages,
    setEventHandlers,
    resetTranscriptPanel,
    togglePanelMinimize,
    populateLanguageSelector,
    displayTranscript,
    handleSearch,
    showError,
    showLoading,
    copyTranscriptToClipboard,
    injectTranscriptPanel,
    updateUIAfterLoad
  };
})();
