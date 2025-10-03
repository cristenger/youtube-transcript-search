// This script runs in the page context to bypass CORS restrictions

(function() {
  'use strict';
  
  console.log('✓ Page script loaded and running');
  
  // Signal that the script is loaded
  window.__transcriptPageScriptLoaded = true;
  
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
      
      // Find an active or English track
      let activeTrack = null;
      for (let i = 0; i < textTracks.length; i++) {
        const track = textTracks[i];
        console.log('Track', i, ':', track.kind, track.label, track.language, track.mode);
        
        if (track.kind === 'subtitles' || track.kind === 'captions') {
          if (track.mode === 'showing' || track.language === 'en' || !activeTrack) {
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
  
  console.log('Page script event listeners registered');
})();