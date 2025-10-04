// YouTube Transcript Search Extension - Main Controller
// This file orchestrates all the modules and manages the extension lifecycle

(function() {
  'use strict';

  // Global state
  let observerInstance = null;
  let lastUrl = location.href;

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================

  /**
   * Handle load transcript button click
   */
  async function handleLoadTranscript(event) {
    const button = event.target.closest('#load-transcript-btn');
    if (!button) return;

    button.disabled = true;
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="spinning">
        <path d="M12 2a10 10 0 1010 10h-2a8 8 0 11-8-8V2z"/>
      </svg>
      Loading...
    `;

    TranscriptUI.showLoading('Fetching transcript...');

    try {
      console.log('🎬 Loading transcript...');
      
      const transcriptData = await TranscriptExtraction.fetchTranscript();
      
      if (!transcriptData || transcriptData.length === 0) {
        throw new Error('No transcript data received');
      }

      console.log(`✓ Got ${transcriptData.length} transcript entries`);
      
      // Update UI state
      TranscriptUI.setTranscriptData(transcriptData);
      
      // Get available languages
      const availableLanguages = TranscriptExtraction.getAvailableLanguages();
      TranscriptUI.setAvailableLanguages(availableLanguages);
      
      // Display transcript
      TranscriptUI.displayTranscript(transcriptData);
      
      // Update UI buttons and show controls
      TranscriptUI.updateUIAfterLoad();
      
      console.log('✓ Transcript loaded successfully');
      
    } catch (error) {
      console.error('❌ Failed to load transcript:', error);
      
      let errorMessage = 'Failed to load transcript';
      if (error.name === 'TranscriptsDisabled') {
        errorMessage = 'Transcripts are disabled for this video';
      } else if (error.name === 'VideoUnavailable') {
        errorMessage = 'This video is unavailable';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      TranscriptUI.showError(errorMessage);
      
      // Reset button on error
      button.disabled = false;
      button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 1a5 5 0 110 10A5 5 0 018 3zm-.5 2.5v3h3v1h-4v-4h1z"/>
        </svg>
        Load Transcript
      `;
    }
  }

  /**
   * Handle refresh transcript button click
   */
  async function handleRefreshTranscript(event) {
    const button = event.target.closest('#refresh-transcript-btn');
    if (!button) return;

    button.disabled = true;
    button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="spinning">
        <path d="M13.65 2.35A8 8 0 1 0 16 8h-2a6 6 0 1 1-1.76-4.24L10 6h6V0l-2.35 2.35z"/>
      </svg>
      Refreshing...
    `;

    TranscriptUI.showLoading('Refreshing transcript...');
    
    // Stop video sync
    VideoSync.stopVideoSync();

    try {
      console.log('🔄 Refreshing transcript...');
      
      const transcriptData = await TranscriptExtraction.fetchTranscript();
      
      if (!transcriptData || transcriptData.length === 0) {
        throw new Error('No transcript data received');
      }

      console.log(`✓ Got ${transcriptData.length} transcript entries`);
      
      // Update UI state
      TranscriptUI.setTranscriptData(transcriptData);
      
      // Get available languages
      const availableLanguages = TranscriptExtraction.getAvailableLanguages();
      TranscriptUI.setAvailableLanguages(availableLanguages);
      
      // Display transcript
      TranscriptUI.displayTranscript(transcriptData);
      
      // Update language selector
      TranscriptUI.populateLanguageSelector();
      
      console.log('✓ Transcript refreshed successfully');
      
    } catch (error) {
      console.error('❌ Failed to refresh transcript:', error);
      TranscriptUI.showError('Failed to refresh transcript: ' + error.message);
    } finally {
      button.disabled = false;
      button.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.65 2.35A8 8 0 1 0 16 8h-2a6 6 0 1 1-1.76-4.24L10 6h6V0l-2.35 2.35z"/>
        </svg>
        Refresh Transcript
      `;
    }
  }

  /**
   * Handle language change from dropdown
   */
  async function handleLanguageChange(event) {
    const selectedIndex = parseInt(event.target.value);
    const availableLanguages = TranscriptExtraction.getAvailableLanguages();
    const selectedLang = availableLanguages[selectedIndex];
    
    if (!selectedLang || !selectedLang.params) {
      console.warn('No valid language selected');
      return;
    }
    
    console.log(`🌐 Changing language to: ${selectedLang.name}`);
    
    // Show loading state
    TranscriptUI.showLoading(`Loading ${selectedLang.name} transcript...`);
    
    // Stop current video sync
    VideoSync.stopVideoSync();
    
    try {
      // Fetch transcript in new language
      // Note: The extraction module will use the selected language's params
      const transcriptData = await TranscriptExtraction.fetchTranscript();
      
      if (!transcriptData || transcriptData.length === 0) {
        throw new Error('No transcript data received for selected language');
      }
      
      console.log(`✓ Got ${transcriptData.length} entries in ${selectedLang.name}`);
      
      // Update UI
      TranscriptUI.setTranscriptData(transcriptData);
      TranscriptUI.displayTranscript(transcriptData);
      
      console.log(`✓ Language changed to: ${selectedLang.name}`);
      
    } catch (error) {
      console.error('❌ Failed to change language:', error);
      TranscriptUI.showError('Failed to load transcript in selected language');
    }
  }

  // ============================================================================
  // NAVIGATION DETECTION
  // ============================================================================

  /**
   * Watch for navigation changes (video changes)
   */
  function watchForNavigation() {
    // Observe URL changes
    const observer = new MutationObserver(() => {
      const currentUrl = location.href;
      
      if (currentUrl !== lastUrl) {
        const wasWatchPage = /youtube\.com\/watch\?v=/.test(lastUrl);
        const isWatchPage = /youtube\.com\/watch\?v=/.test(currentUrl);
        
        console.log('🔄 URL changed:', {
          from: lastUrl,
          to: currentUrl,
          wasWatchPage,
          isWatchPage
        });
        
        lastUrl = currentUrl;
        
        if (isWatchPage) {
          if (wasWatchPage) {
            // Changed between videos
            console.log('📺 Video changed - resetting panel');
            VideoSync.stopVideoSync();
            TranscriptUI.resetTranscriptPanel();
          } else {
            // Navigated to watch page
            console.log('📺 Navigated to watch page - initializing');
            init();
          }
        } else if (wasWatchPage) {
          // Left watch page
          console.log('🚪 Left watch page - cleaning up');
          VideoSync.stopVideoSync();
        }
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    observerInstance = observer;
    
    // Also listen to YouTube's navigation events
    window.addEventListener('yt-navigate-finish', () => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        console.log('🔄 YouTube navigation event detected');
        lastUrl = currentUrl;
        
        const isWatchPage = /youtube\.com\/watch\?v=/.test(currentUrl);
        if (isWatchPage) {
          console.log('📺 Video changed via yt-navigate - resetting panel');
          VideoSync.stopVideoSync();
          TranscriptUI.resetTranscriptPanel();
        }
      }
    });
    
    console.log('✓ Navigation watcher started');
  }

  // ============================================================================
  // INITIALIZATION
  // ============================================================================

  /**
   * Initialize extension
   */
  async function init() {
    console.log('🚀 Initializing YouTube Transcript Search...');
    
    const videoId = TranscriptUtils.getVideoId();
    if (!videoId) {
      console.warn('⚠️ No video ID found');
      return;
    }
    
    console.log('📺 Video ID:', videoId);
    
    // Inject page script for CORS bypass
    TranscriptExtraction.injectFetchHandler();
    
    // Set up event handlers for UI
    TranscriptUI.setEventHandlers({
      onLoadTranscript: handleLoadTranscript,
      onRefreshTranscript: handleRefreshTranscript,
      onLanguageChange: handleLanguageChange
    });
    
    // Inject transcript panel
    await TranscriptUI.injectTranscriptPanel();
    
    // Start watching for navigation changes
    if (!observerInstance) {
      watchForNavigation();
    }
    
    console.log('✓ Initialization complete');
  }

  // ============================================================================
  // ENTRY POINT
  // ============================================================================

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  console.log('✓ YouTube Transcript Search extension loaded');
})();
