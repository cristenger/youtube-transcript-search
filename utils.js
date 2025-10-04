// Utility Functions Module
// Shared utility functions used across the extension

const TranscriptUtils = (function() {
  'use strict';

  /**
   * Get video ID from current URL
   * @returns {string|null} Video ID or null if not found
   */
  function getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  /**
   * Format seconds to timestamp (MM:SS or HH:MM:SS)
   * @param {number} seconds - Time in seconds
   * @returns {string} Formatted timestamp
   */
  function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Decode HTML entities and clean up text
   * @param {string} text - Text with HTML entities
   * @returns {string} Decoded text
   */
  function decodeHTMLEntities(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    let decoded = textarea.value;
    
    // Clean up newlines and extra spaces
    decoded = decoded.replace(/\n/g, ' ').replace(/\s+/g, ' ');
    
    return decoded;
  }

  /**
   * Escape special regex characters
   * @param {string} string - String to escape
   * @returns {string} Escaped string
   */
  function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Wait for an element to exist in the DOM
   * @param {string} selector - CSS selector
   * @param {number} timeout - Maximum wait time in milliseconds
   * @returns {Promise<Element>} Promise that resolves with the element
   */
  function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const existingElement = document.querySelector(selector);
      if (existingElement) {
        resolve(existingElement);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const element = document.querySelector(selector);
        if (element) {
          obs.disconnect();
          resolve(element);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Timeout waiting for element: ${selector}`));
      }, timeout);
    });
  }

  /**
   * Get active subtitle language from video player
   * @returns {string|null} Language code or null
   */
  function getActiveSubtitleLanguage() {
    try {
      const video = document.querySelector('video');
      if (!video) return null;
      
      const textTracks = video.textTracks;
      if (!textTracks) return null;
      
      for (let i = 0; i < textTracks.length; i++) {
        const track = textTracks[i];
        if (track.mode === 'showing') {
          return track.language;
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error getting active subtitle language:', error);
      return null;
    }
  }

  /**
   * Get all available languages from caption tracks
   * @param {Array} tracks - Array of caption track objects
   * @returns {Array} Array of language objects
   */
  function getAvailableLanguages(tracks) {
    if (!tracks || !Array.isArray(tracks)) return [];
    
    return tracks.map(track => ({
      code: track.languageCode,
      name: track.name?.simpleText || track.languageCode,
      isTranslatable: track.isTranslatable || false
    }));
  }

  // Public API
  return {
    getVideoId,
    formatTime,
    decodeHTMLEntities,
    escapeRegex,
    waitForElement,
    getActiveSubtitleLanguage,
    getAvailableLanguages
  };
})();
