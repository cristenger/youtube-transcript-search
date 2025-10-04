// This script runs in the page context to bypass CORS restrictions

(function() {
  'use strict';
  
  console.log('✓ Page script loaded and running');
  
  // Signal that the script is loaded
  window.__transcriptPageScriptLoaded = true;
  
  // Listen for data extraction requests
  window.addEventListener('dataExtractRequest', (event) => {
    console.log('Page script received data extraction request');
    const { eventId } = event.detail;
    
    try {
      const data = {
        ytInitialData: typeof ytInitialData !== 'undefined' ? ytInitialData : null,
        ytInitialPlayerResponse: typeof ytInitialPlayerResponse !== 'undefined' ? ytInitialPlayerResponse : null
      };
      
      console.log('Extracted data:', {
        hasYtInitialData: !!data.ytInitialData,
        hasYtInitialPlayerResponse: !!data.ytInitialPlayerResponse
      });
      
      window.dispatchEvent(new CustomEvent('dataExtractResponse', {
        detail: {
          eventId,
          data: data
        }
      }));
    } catch (error) {
      console.error('Error extracting data:', error);
      window.dispatchEvent(new CustomEvent('dataExtractResponse', {
        detail: {
          eventId,
          data: {}
        }
      }));
    }
  });
  
  // Listen for caption extraction requests
  window.addEventListener('captionsExtractRequest', async (event) => {
    console.log('Page script received caption extraction request:', event.detail);
    const { eventId } = event.detail;
    
    try {
      // Try to get captions from YouTube's player
      const captions = extractCaptionsFromYouTubePlayer();
      
      if (captions && captions.length > 0) {
        window.dispatchEvent(new CustomEvent('captionsExtractResponse', {
          detail: {
            eventId,
            success: true,
            data: captions
          }
        }));
      } else {
        window.dispatchEvent(new CustomEvent('captionsExtractResponse', {
          detail: {
            eventId,
            success: false,
            error: 'No captions found in player'
          }
        }));
      }
    } catch (error) {
      console.error('Exception extracting captions:', error);
      window.dispatchEvent(new CustomEvent('captionsExtractResponse', {
        detail: {
          eventId,
          success: false,
          error: error.message
        }
      }));
    }
  });
  
  // Function to extract captions directly from YouTube player
  function extractCaptionsFromYouTubePlayer() {
    try {
      // Try to access the video element
      const video = document.querySelector('video');
      if (!video) {
        console.warn('No video element found');
        return null;
      }
      
      // Try to get text tracks
      const textTracks = video.textTracks;
      if (!textTracks || textTracks.length === 0) {
        console.warn('No text tracks found');
        return null;
      }
      
      console.log('Found', textTracks.length, 'text tracks');
      
      // Find an active track first, or use first available
      let activeTrack = null;
      for (let i = 0; i < textTracks.length; i++) {
        const track = textTracks[i];
        console.log('Track', i, ':', track.kind, track.label, track.language, track.mode);
        
        if (track.kind === 'subtitles' || track.kind === 'captions') {
          // Priority 1: Currently showing track
          if (track.mode === 'showing') {
            activeTrack = track;
            break;
          }
          // Priority 2: First available track (respects YouTube's default order)
          if (!activeTrack) {
            activeTrack = track;
          }
        }
      }
      
      if (!activeTrack) {
        console.warn('No suitable track found');
        return null;
      }
      
      console.log('Using track:', activeTrack.label, activeTrack.language);
      
      // Enable the track if not already
      if (activeTrack.mode !== 'showing') {
        activeTrack.mode = 'showing';
      }
      
      // Extract cues
      const cues = activeTrack.cues || activeTrack.activeCues;
      if (!cues || cues.length === 0) {
        console.warn('No cues found in track');
        return null;
      }
      
      console.log('Found', cues.length, 'cues');
      
      // Convert cues to transcript format
      const transcript = [];
      for (let i = 0; i < cues.length; i++) {
        const cue = cues[i];
        transcript.push({
          start: cue.startTime,
          duration: cue.endTime - cue.startTime,
          text: cue.text
        });
      }
      
      return transcript;
    } catch (error) {
      console.error('Error extracting captions from player:', error);
      return null;
    }
  }
  
  // Listen for fetch requests from content script
  window.addEventListener('transcriptFetchRequest', async (event) => {
    console.log('📥 Page script received fetch request:', event.detail);
    const { url, eventId } = event.detail;
    
    console.log('🌐 Making XHR request to:', url);
    console.log('🆔 Event ID:', eventId);
    
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      
      // Add necessary headers
      xhr.setRequestHeader('Accept', 'application/json, text/plain, */*');
      xhr.responseType = 'text';
      
      xhr.onload = function() {
        console.log('✓ XHR onload triggered');
        console.log('📊 Status:', xhr.status);
        console.log('📊 Status text:', xhr.statusText);
        console.log('📊 Ready state:', xhr.readyState);
        console.log('📊 Response type:', xhr.responseType);
        console.log('📊 Response text length:', xhr.responseText?.length || 0);
        console.log('📊 First 500 chars:', xhr.responseText?.substring(0, 500));
        console.log('📊 All response headers:', xhr.getAllResponseHeaders());
        
        if (xhr.status === 200) {
          if (!xhr.responseText || xhr.responseText.length === 0) {
            console.error('❌ Status 200 but empty response!');
            console.error('⚠️ This usually means the URL is expired or YouTube blocked the request');
            window.dispatchEvent(new CustomEvent('transcriptFetchResponse', {
              detail: {
                eventId,
                success: false,
                error: 'Empty response - URL may be expired or request blocked'
              }
            }));
            return;
          }
          
          window.dispatchEvent(new CustomEvent('transcriptFetchResponse', {
            detail: {
              eventId,
              success: true,
              data: xhr.responseText
            }
          }));
        } else {
          console.error('❌ Non-200 status:', xhr.status);
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
        console.error('❌ XHR onerror triggered');
        console.error('Status:', xhr.status);
        console.error('Ready state:', xhr.readyState);
        window.dispatchEvent(new CustomEvent('transcriptFetchResponse', {
          detail: {
            eventId,
            success: false,
            error: 'Network error'
          }
        }));
      };
      
      xhr.ontimeout = function() {
        console.error('⏱️ XHR timeout');
        window.dispatchEvent(new CustomEvent('transcriptFetchResponse', {
          detail: {
            eventId,
            success: false,
            error: 'Request timeout'
          }
        }));
      };
      
      xhr.onprogress = function(event) {
        if (event.lengthComputable) {
          console.log(`📥 Progress: ${event.loaded} / ${event.total} bytes`);
        } else {
          console.log(`📥 Progress: ${event.loaded} bytes`);
        }
      };
      
      console.log('📤 Sending XHR request...');
      xhr.send();
    } catch (error) {
      console.error('❌ Exception in page script fetch:', error);
      console.error('Stack:', error.stack);
      window.dispatchEvent(new CustomEvent('transcriptFetchResponse', {
        detail: {
          eventId,
          success: false,
          error: error.message
        }
      }));
    }
  });
  
  console.log('Page script event listeners registered');
})();