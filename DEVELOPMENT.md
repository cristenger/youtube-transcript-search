# Quick Development Guide

## 🚀 Getting Started

### First Time Setup

1. **Clone/Download** the extension folder
2. **Open Chrome** → Navigate to `chrome://extensions/`
3. **Enable** "Developer mode" (toggle in top right)
4. **Click** "Load unpacked"
5. **Select** the extension folder
6. **Done!** Extension is now active

### After Making Changes

1. **Edit** the relevant module file
2. **Go to** `chrome://extensions/`
3. **Click** the refresh icon on the extension card
4. **Reload** any YouTube pages
5. **Test** your changes

## 📁 Which File to Edit?

| What you want to change | Edit this file |
|-------------------------|----------------|
| Error messages | `errors.js` |
| Time formatting, utilities | `utils.js` |
| Transcript parsing (XML/JSON/VTT) | `parsers.js` |
| API calls, data fetching | `extraction.js` |
| Video playback sync | `video-sync.js` |
| UI appearance, buttons | `ui.js` + `styles.css` |
| Event handlers, initialization | `content-main.js` |
| Extension permissions | `manifest.json` |
| CORS bypass logic | `page-script.js` |

## 🔍 Common Tasks

### Add a New Feature

1. **Identify** which module it belongs to
2. **Add** the function to that module
3. **Export** it in the module's return statement
4. **Use** it from other modules via the namespace (e.g., `TranscriptUtils.newFunction()`)

Example:
```javascript
// In utils.js
const TranscriptUtils = (function() {
  // ... existing code ...
  
  function newUtilityFunction() {
    // Your code here
  }
  
  return {
    // ... existing exports ...
    newUtilityFunction  // Add this
  };
})();

// In another module
TranscriptUtils.newUtilityFunction();
```

### Fix a Bug

1. **Check** browser console for error messages
2. **Note** which module the error is from
3. **Open** that module file
4. **Fix** the issue
5. **Test** thoroughly

### Add a New Module

1. **Create** new file (e.g., `feature.js`)
2. **Use** IIFE pattern:
```javascript
const FeatureName = (function() {
  'use strict';
  
  // Your code here
  
  return {
    publicFunction: function() { }
  };
})();
```
3. **Add** to `manifest.json` content_scripts (in correct order)
4. **Use** from other modules

## 🐛 Debugging Tips

### View Console Messages

1. **Open** YouTube video page
2. **Press** F12 (or Cmd+Option+I on Mac)
3. **Click** Console tab
4. **Look for** messages with ✓, ❌, 🔄, etc.

### Common Issues

**Module Not Found**
- Check file name spelling in `manifest.json`
- Verify file exists in folder

**Function is not defined**
- Check module load order in `manifest.json`
- Verify function is exported in return statement
- Check namespace name (e.g., `TranscriptUtils` not `Utils`)

**Panel Not Appearing**
- Check if video ID exists
- Check console for injection errors
- Verify secondary sidebar element exists

**Video Sync Not Working**
- Verify video element is found
- Check if listeners are attached
- Look for errors in `video-sync.js`

## 📝 Code Style

### Naming Conventions

- **Modules**: PascalCase (e.g., `TranscriptUtils`)
- **Functions**: camelCase (e.g., `formatTime`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `RE_XML_TRANSCRIPT`)
- **Private vars**: camelCase with descriptive names

### Comments

```javascript
/**
 * Function description
 * @param {Type} paramName - Description
 * @returns {Type} Description
 */
function myFunction(paramName) {
  // Implementation
}
```

### Module Structure

```javascript
const ModuleName = (function() {
  'use strict';
  
  // Private variables
  let privateVar = 'value';
  
  /**
   * Private function
   */
  function privateFunction() {
    // ...
  }
  
  /**
   * Public function
   */
  function publicFunction() {
    // Can use private variables
  }
  
  // Public API
  return {
    publicFunction
  };
})();
```

## 🧪 Testing

### Quick Test

1. Load extension
2. Open YouTube video
3. Click "Load Transcript"
4. Search for a word
5. Click on timestamp
6. Navigate to different video

### Full Test

See [`TESTING_CHECKLIST.md`](./TESTING_CHECKLIST.md)

## 📚 Resources

### Documentation Files

- **ARCHITECTURE.md** - Technical architecture details
- **TESTING_CHECKLIST.md** - Complete testing guide
- **REFACTORING_SUMMARY.md** - What changed and why

### External Resources

- [Chrome Extension Docs](https://developer.chrome.com/docs/extensions/mv3/)
- [Content Scripts Guide](https://developer.chrome.com/docs/extensions/mv3/content_scripts/)
- [YouTube API](https://developers.google.com/youtube/v3)

## 🔧 Useful Commands

### Check for Errors
Open browser console and look for red messages

### Reload Extension
```
chrome://extensions/ → Click refresh icon
```

### View Extension Logs
Browser console on any YouTube page

### Backup Before Changes
```bash
cp errors.js errors.js.backup
```

## ⚡ Quick Fixes

### Panel Not Showing
```javascript
// In content-main.js, check:
const videoId = TranscriptUtils.getVideoId();
console.log('Video ID:', videoId);
```

### Transcript Not Loading
```javascript
// In extraction.js, add logging:
console.log('Fetching transcript...');
console.log('Response:', data);
```

### Search Not Working
```javascript
// In ui.js, check:
console.log('Search term:', searchTerm);
console.log('Filtered results:', filtered.length);
```

## 🎯 Best Practices

1. **Always test** after making changes
2. **Check console** for errors
3. **Use console.log** liberally during development
4. **Comment complex logic**
5. **Keep functions small** and focused
6. **Update docs** when adding features
7. **Test on multiple videos**
8. **Check both light and dark themes**

## 🚨 What NOT to Do

- ❌ Don't modify `manifest_version` (must be 3)
- ❌ Don't change module load order without understanding dependencies
- ❌ Don't use `import/export` syntax (not compatible)
- ❌ Don't forget to export public functions
- ❌ Don't assume DOM elements exist (always check)
- ❌ Don't forget to remove event listeners on cleanup

## 💡 Pro Tips

- Use Chrome DevTools to debug
- Test with different video types (regular, Shorts, live)
- Check both English and non-English videos
- Test with videos that don't have transcripts
- Keep browser console open while testing
- Use `debugger;` statement for breakpoints

---

**Happy Coding!** 🎉

For more details, see the other documentation files.
