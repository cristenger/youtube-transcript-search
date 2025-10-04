// Error Classes Module
// Custom error classes for transcript-related errors

const TranscriptErrors = (function() {
  'use strict';

  /**
   * Base error class for transcript-related errors
   */
  class TranscriptError extends Error {
    constructor(videoId, message) {
      super(message);
      this.videoId = videoId;
      this.name = this.constructor.name;
    }
  }

  /**
   * Error when transcripts are disabled for a video
   */
  class TranscriptsDisabled extends TranscriptError {
    constructor(videoId) {
      super(videoId, 'Transcripts are disabled for this video');
    }
  }

  /**
   * Error when video is unavailable
   */
  class VideoUnavailable extends TranscriptError {
    constructor(videoId) {
      super(videoId, 'This video is unavailable');
    }
  }

  /**
   * Error when video is age-restricted
   */
  class AgeRestricted extends TranscriptError {
    constructor(videoId) {
      super(videoId, 'This video is age-restricted');
    }
  }

  /**
   * Error when IP is blocked by YouTube
   */
  class IpBlocked extends TranscriptError {
    constructor(videoId) {
      super(videoId, 'Your IP may be blocked by YouTube');
    }
  }

  // Public API
  return {
    TranscriptError,
    TranscriptsDisabled,
    VideoUnavailable,
    AgeRestricted,
    IpBlocked
  };
})();
