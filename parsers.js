// Parsers Module
// Functions to parse different transcript formats (XML, JSON, VTT)

const TranscriptParsers = (function() {
  'use strict';

  // Regular expression for XML transcript format
  const RE_XML_TRANSCRIPT = /<text start="([^"]*)" dur="([^"]*)">([^<]*)<\/text>/g;

  /**
   * Parse XML format transcript
   * @param {string} xmlText - XML transcript text
   * @returns {Array} Array of transcript entries
   */
  function parseTranscriptXML(xmlText) {
    const matches = [...xmlText.matchAll(RE_XML_TRANSCRIPT)];
    return matches.map(match => ({
      start: parseFloat(match[1]),
      duration: parseFloat(match[2]),
      text: TranscriptUtils.decodeHTMLEntities(match[3])
    }));
  }

  /**
   * Parse JSON format transcript
   * @param {string} jsonText - JSON transcript text
   * @returns {Array} Array of transcript entries
   */
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
      console.error('Error parsing JSON transcript:', e);
      return [];
    }
  }

  /**
   * Parse VTT (WebVTT) format transcript
   * @param {string} vttText - VTT transcript text
   * @returns {Array} Array of transcript entries
   */
  function parseTranscriptVTT(vttText) {
    const lines = vttText.split('\n');
    const entries = [];
    let currentEntry = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check for timestamp line (e.g., "00:00:00.000 --> 00:00:05.000")
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
        // Add text to current entry
        currentEntry.text += (currentEntry.text ? ' ' : '') + line;
        
        // Check if this is the last line or next line is empty
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

  /**
   * Parse VTT time format to seconds
   * @param {string} timeString - Time string (HH:MM:SS.mmm or MM:SS.mmm)
   * @returns {number} Time in seconds
   */
  function parseVTTTime(timeString) {
    const parts = timeString.split(':');
    if (parts.length === 3) {
      // HH:MM:SS.mmm
      return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseFloat(parts[2]);
    } else if (parts.length === 2) {
      // MM:SS.mmm
      return parseInt(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(timeString);
  }

  /**
   * Auto-detect format and parse transcript
   * @param {string} transcriptText - Raw transcript text
   * @returns {Array} Array of transcript entries
   */
  function parseTranscript(transcriptText) {
    if (!transcriptText || typeof transcriptText !== 'string') {
      return [];
    }

    // Try XML format
    if (transcriptText.includes('<text')) {
      const result = parseTranscriptXML(transcriptText);
      if (result.length > 0) return result;
    }

    // Try VTT format
    if (transcriptText.includes('WEBVTT') || transcriptText.includes('-->')) {
      const result = parseTranscriptVTT(transcriptText);
      if (result.length > 0) return result;
    }

    // Try JSON format
    try {
      const result = parseTranscriptJSON(transcriptText);
      if (result.length > 0) return result;
    } catch (e) {
      // Not JSON, continue
    }

    console.warn('Could not determine transcript format');
    return [];
  }

  // Public API
  return {
    parseTranscriptXML,
    parseTranscriptJSON,
    parseTranscriptVTT,
    parseVTTTime,
    parseTranscript
  };
})();
