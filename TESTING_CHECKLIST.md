# Testing Checklist - YouTube Transcript Search Extension

## ✅ Pre-Installation Checks

- [ ] All 7 module files exist in the extension folder
- [ ] manifest.json updated with correct file order
- [ ] No syntax errors in any module files
- [ ] Original content.js backed up as content-old.js

## 🔧 Installation Testing

- [ ] Open Chrome
- [ ] Navigate to `chrome://extensions/`
- [ ] Enable "Developer mode"
- [ ] Click "Load unpacked"
- [ ] Select the extension folder
- [ ] Extension loads without errors
- [ ] Check console for any loading errors

## 📺 Basic Functionality

### Panel Injection
- [ ] Navigate to any YouTube video
- [ ] Transcript panel appears in sidebar
- [ ] Panel has "Load Transcript" button
- [ ] Panel styling matches YouTube theme

### Transcript Loading
- [ ] Click "Load Transcript" button
- [ ] Loading indicator appears
- [ ] Transcript loads successfully
- [ ] Transcript entries display correctly
- [ ] Timestamps are formatted correctly (MM:SS or HH:MM:SS)

### Search Functionality
- [ ] Search box appears after loading
- [ ] Type in search box
- [ ] Results filter correctly
- [ ] Matching text is highlighted
- [ ] "No results found" shows when no matches
- [ ] Clear search restores full transcript

### Video Synchronization
- [ ] Play video
- [ ] Current transcript entry highlights automatically
- [ ] Highlighted entry follows video playback
- [ ] Scroll manually in transcript
- [ ] Auto-scroll resumes after 5 seconds of inactivity
- [ ] Click on timestamp
- [ ] Video seeks to correct position

### Language Selection
- [ ] Language selector appears (if multiple languages available)
- [ ] Dropdown shows available languages
- [ ] Select different language
- [ ] Transcript reloads in selected language
- [ ] Language change works correctly

### UI Controls
- [ ] Minimize button collapses panel
- [ ] Expand button restores panel
- [ ] Refresh button reloads transcript
- [ ] Copy button copies full transcript to clipboard
- [ ] All buttons have proper hover states

## 🔄 Navigation Testing

### Video Changes
- [ ] Navigate to different video (without page reload)
- [ ] Panel resets correctly
- [ ] "Load Transcript" button reappears
- [ ] Previous transcript data is cleared
- [ ] Video sync stops from previous video

### Page Navigation
- [ ] Navigate away from watch page
- [ ] Panel is removed/cleaned up
- [ ] Navigate back to watch page
- [ ] Panel reappears and works correctly

### YouTube Navigation Events
- [ ] Click on recommended video
- [ ] Panel resets properly
- [ ] Use browser back/forward buttons
- [ ] Panel state updates correctly

## 🐛 Error Handling

### No Transcript Available
- [ ] Try video without captions
- [ ] Error message displays
- [ ] Troubleshooting tips show
- [ ] No console errors

### Network Errors
- [ ] Simulate network issue (if possible)
- [ ] Error message displays gracefully
- [ ] Button can be clicked to retry

### Age-Restricted Videos
- [ ] Try age-restricted video (if applicable)
- [ ] Appropriate error message shows

## 🎨 UI/UX Testing

### Dark Mode
- [ ] YouTube in dark mode
- [ ] Panel colors match YouTube theme
- [ ] Text is readable
- [ ] Buttons have correct colors

### Light Mode
- [ ] YouTube in light mode
- [ ] Panel colors match YouTube theme
- [ ] Text is readable
- [ ] Buttons have correct colors

### Responsive Design
- [ ] Resize browser window
- [ ] Panel adapts correctly
- [ ] Scroll works properly
- [ ] No layout issues

## 🔍 Console Checks

### Expected Console Messages
- [ ] "✓ YouTube Transcript Search extension loaded"
- [ ] "✓ Page script loaded and running"
- [ ] "🚀 Initializing YouTube Transcript Search..."
- [ ] "✓ Transcript panel injected successfully"
- [ ] "✓ Navigation watcher started"
- [ ] No error messages in console

### Module Loading
- [ ] No "module not found" errors
- [ ] No undefined function errors
- [ ] All modules load in correct order

## 📊 Performance

- [ ] Page loads quickly
- [ ] No noticeable lag when loading transcript
- [ ] Search is responsive
- [ ] Video sync doesn't cause stuttering
- [ ] Memory usage is reasonable

## 🔐 Security

- [ ] No CSP violations in console
- [ ] No mixed content warnings
- [ ] Extension only runs on YouTube
- [ ] No external data collection

## 🌍 Browser Compatibility

### Chrome
- [ ] Works on latest Chrome
- [ ] Works on Chrome Beta (if available)

### Chromium-based
- [ ] Edge (if available)
- [ ] Brave (if available)
- [ ] Opera (if available)

## 📱 Special Cases

### YouTube Shorts
- [ ] Open a YouTube Short
- [ ] Transcript panel appears
- [ ] Can load transcript
- [ ] URL transformation works

### Embedded Videos
- [ ] Check behavior on embedded videos (if applicable)

### Live Streams
- [ ] Check behavior on live streams
- [ ] Appropriate error/message if no transcript

## 🔄 State Management

- [ ] Reload extension (from chrome://extensions/)
- [ ] Transcript state is properly reset
- [ ] No ghost event listeners
- [ ] No memory leaks visible

## 📝 Final Checks

- [ ] All features from original version work
- [ ] No regressions introduced
- [ ] Code is cleaner and more maintainable
- [ ] Documentation is complete
- [ ] Ready for production use

## 🚨 Critical Issues to Watch

1. **Module Dependencies**: Ensure all modules load in correct order
2. **Memory Leaks**: Check that event listeners are properly removed
3. **Navigation**: Verify panel resets correctly on video changes
4. **Video Sync**: Ensure sync starts/stops properly
5. **Error Handling**: All errors are caught and displayed gracefully

## ✍️ Test Results

**Tested By**: _________________
**Date**: _________________
**Chrome Version**: _________________
**OS**: _________________
**Result**: ☐ PASS  ☐ FAIL

**Notes**:
```
____________________________________________________________
____________________________________________________________
____________________________________________________________
```

## 🐛 Issues Found

| # | Module | Issue | Severity | Status |
|---|--------|-------|----------|--------|
| 1 |        |       |          |        |
| 2 |        |       |          |        |
| 3 |        |       |          |        |

---

**Last Updated**: October 4, 2025
